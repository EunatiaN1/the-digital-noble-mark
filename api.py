"""Loopback-only, authenticated Testnet API for the shop dashboard."""
from __future__ import annotations

import json
import logging
import secrets
import re
import base64
import ipaddress
import socket
from urllib.parse import urlsplit
from pathlib import Path
from typing import Any

import httpx

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from auth import require_api_key
from config import ROOT, settings
from db import DB_LOCK, connection, init_db, now_iso, read_app_state, save_app_state, today_local
from faucet import faucet_status, request_funding
from fx import get_rate
from intent import make_intent
from policy import evaluate_spend, pending_spend_xrp
from preflight import PreflightError
from reconcile import sweep
from xrpl_agent import create_and_fund_wallet, get_wallet, prepare_payment, sign_persist_submit, wallet_activity, wallet_status

log = logging.getLogger("spaza.api")
app = FastAPI(title="The Digital Mark Spaza Shop", version="2.0.0")
AGENT_BUDGET_XRP = 100.0
SUPPLIER_PAYMENT_CAP_XRP = 50.0
SPENDING_LIMITS_VERSION = "budget-100-supplier-50-v1"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000", "null"],
    allow_methods=["GET", "PUT", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    if settings.api_key:
        try:
            reconcile_pending()
        except Exception:
            log.exception("Startup reconciliation could not reach Testnet; pending rows remain stored.")


def _stored() -> dict[str, Any] | None:
    with DB_LOCK, connection() as db:
        return read_app_state(db)


def _upgrade_spending_limits(state: dict) -> None:
    if state.get("limitsVersion") != SPENDING_LIMITS_VERSION:
        previous_total = float(state.get("initialBudget", 25) or 25)
        previous_remaining = float(state.get("budget", previous_total) or 0)
        spent = max(0.0, previous_total - previous_remaining)
        state["initialBudget"] = AGENT_BUDGET_XRP
        state["budget"] = round(max(0.0, AGENT_BUDGET_XRP - spent), 6)
        state["suppliers"] = [{**supplier, "cap": SUPPLIER_PAYMENT_CAP_XRP} for supplier in state.get("suppliers", [])]
        state["limitsVersion"] = SPENDING_LIMITS_VERSION
    else:
        state["initialBudget"] = AGENT_BUDGET_XRP
        state["budget"] = min(AGENT_BUDGET_XRP, max(0.0, float(state.get("budget", AGENT_BUDGET_XRP))))
        state["suppliers"] = [
            {**supplier, "cap": max(0.01, min(SUPPLIER_PAYMENT_CAP_XRP, float(supplier.get("cap", SUPPLIER_PAYMENT_CAP_XRP))))}
            for supplier in state.get("suppliers", [])
        ]
    state["xrpInvestmentXrp"] = float(state.get("xrpInvestmentXrp", 0) or 0)
    state["xrpInvestmentZar"] = float(state.get("xrpInvestmentZar", 0) or 0)


def _record_wallet_topup(address: str, balance_xrp: float | None, credited_xrp: float | None = None) -> None:
    with DB_LOCK, connection() as db:
        stored = read_app_state(db)
        if not stored:
            return
        detail = f"XRPL Testnet faucet · {float(balance_xrp):.6f} XRP balance" if balance_xrp is not None else "XRPL Testnet faucet request accepted"
        stored["state"].setdefault("transactions", []).insert(0, {
            "title": "Wallet top-up", "detail": f"{detail} · {address[:8]}…", "type": "Wallet top-up",
            "amount": 0, "xrpAmount": float(credited_xrp if credited_xrp is not None else balance_xrp or 0), "time": "Just now", "icon": "↓",
            "status": "Faucet · Testnet",
        })
        stored["state"]["transactions"] = stored["state"]["transactions"][:2000]
        save_app_state(db, stored)


def _ensure_current_day(state: dict) -> None:
    if state.get("dailySpentDate") != today_local():
        state["dailySpent"] = 0.0
        state["dailySpentDate"] = today_local()


def _apply_validated_payment(payment: dict, state: dict) -> None:
    if payment.get("status") != "validated":
        return
    tx = next((tx for tx in state.get("transactions", []) if tx.get("intentId") == payment.get("intent_id")), None)
    if tx and tx.get("accounted"):
        return
    _ensure_current_day(state)
    amount = float(payment["amount_xrp"])
    state["dailySpent"] = round(float(state.get("dailySpent", 0)) + amount, 6)
    is_withdrawal = payment.get("workflow") == "wallet_withdrawal"
    if is_withdrawal:
        transaction = {
            "title": "Wallet withdrawal", "detail": f"To {payment.get('destination', 'Testnet address')} · {amount:.6f} XRP",
            "type": "Wallet withdrawal", "amount": 0, "xrpAmount": -amount,
            "time": payment.get("timestamp_local", "Just now"), "icon": "↗",
            "status": "Validated · Testnet", "intentId": payment["intent_id"],
            "txHash": payment.get("tx_hash"), "memo": payment.get("memo"), "accounted": True,
        }
    else:
        zar_rate = get_rate()["rate_zar_per_xrp"]
        zar_amount = round(amount * zar_rate, 2)
        state["budget"] = round(max(0.0, float(state.get("budget", 0)) - amount), 6)
        state["cashOut"] = round(float(state.get("cashOut", 0)) + zar_amount, 2)
        transaction = {
            "title": payment["supplier"],
            "detail": f"XRPL Testnet payment · {amount:.2f} XRP · {payment.get('engine_result', 'tesSUCCESS')}",
            "type": "Supplier payment", "amount": -zar_amount,
            "time": payment.get("timestamp_local", "Just now"), "icon": "↙",
            "status": "Validated · Testnet", "intentId": payment["intent_id"],
            "txHash": payment.get("tx_hash"), "memo": payment.get("memo"), "accounted": True,
        }
    if tx:
        tx.update(transaction)
    else:
        state.setdefault("transactions", []).insert(0, transaction)
    state["transactions"] = state["transactions"][:2000]


def reconcile_pending() -> list[dict]:
    outcomes = sweep()
    if not outcomes:
        return outcomes
    with DB_LOCK, connection() as db:
        stored = read_app_state(db)
        if not stored:
            return outcomes
        state = stored["state"]
        for outcome in outcomes:
            tx = next((item for item in state.get("transactions", [])
                       if item.get("intentId") == outcome["intent_id"]), None)
            if outcome["state"] == "validated":
                row = db.execute("SELECT payload FROM payment_intents WHERE intent_id=?", (outcome["intent_id"],)).fetchone()
                if row:
                    _apply_validated_payment(json.loads(row["payload"]), state)
            elif tx and outcome["state"] in {"failed", "expired"}:
                tx["status"] = "Failed · Testnet" if outcome["state"] == "failed" else "Expired · Testnet"
                tx["detail"] = f"XRPL Testnet payment · {outcome.get('engine_result') or outcome['state']}"
        save_app_state(db, stored)
    return outcomes


@app.get("/api/health")
def health() -> dict:
    if settings.demo_mode:
        stored = _stored()
        demo_balance = float((stored or {}).get("state", {}).get("simulatedWalletXrp", 250.0))
        wallet = {"configured": True, "connected": True, "network": "demo", "simulated": True,
                  "balance_xrp": round(demo_balance, 6), "address": "DEMO-WALLET-ONLY"}
    else:
        try:
            wallet = wallet_status()
        except Exception as exc:
            wallet = {"configured": bool(settings.seed), "connected": False, "address": None, "error": str(exc)[:400]}
        wallet["pending_outgoing_xrp"] = pending_spend_xrp() if wallet.get("configured") else 0.0
    return {
        "ok": True, "storage": "sqlite", "mode": "demo" if settings.demo_mode else "testnet" if wallet.get("configured") else "testnet-setup",
        "network": "demo" if settings.demo_mode else "testnet", "wallet": wallet, "api_key_configured": bool(settings.api_key),
        "xrpl_connected": bool(wallet.get("connected") and not settings.demo_mode), "ledger_submission_enabled": bool(wallet.get("connected") and not settings.demo_mode),
        "demo_mode": settings.demo_mode,
        "daily_limit_xrp": settings.daily_cap_xrp,
    }


@app.get("/api/wallet/activity")
def wallet_activity_feed() -> dict:
    """Refresh pending outcomes and return recent validated Testnet wallet payments."""
    if settings.demo_mode:
        return {"network": "demo", "activity": []}
    try:
        reconcile_pending()
        return {"network": "testnet", "activity": wallet_activity(50)}
    except Exception as exc:
        raise HTTPException(502, f"XRPL Testnet activity could not be refreshed: {exc}") from exc


@app.get("/api/rates")
def rates(refresh: bool = Query(default=False)) -> dict:
    return get_rate(force_refresh=refresh)


def require_live_mode() -> None:
    if settings.demo_mode:
        raise HTTPException(409, "This app is in demo mode. No XRPL, card or bank transactions are submitted.")


@app.get("/api/state")
def get_state() -> dict:
    init_db()
    with DB_LOCK, connection() as db:
        payload = read_app_state(db)
        if payload:
            _upgrade_spending_limits(payload["state"])
            _ensure_current_day(payload["state"])
            save_app_state(db, payload)
    if not payload:
        return {"state": None, "policy": None}
    return {"state": payload["state"], "policy": payload["policy"]}


@app.put("/api/state", dependencies=[Depends(require_api_key)])
def put_state(payload: dict) -> dict:
    state = payload.get("state")
    policy = payload.get("policy") or {}
    if not isinstance(state, dict):
        raise HTTPException(400, "A shop state object is required.")
    for collection, limit in (("inventory", 1000), ("suppliers", 250), ("transactions", 2000)):
        values = state.get(collection, [])
        if not isinstance(values, list) or len(values) > limit:
            raise HTTPException(400, f"Invalid {collection} list.")
    init_db()
    with DB_LOCK, connection() as db:
        db.execute("BEGIN IMMEDIATE")
        previous = read_app_state(db)
        clean_state = dict(state)
        if previous:
            old_state = previous["state"]
            _upgrade_spending_limits(old_state)
            _ensure_current_day(old_state)
            # Browser edits cannot refill a budget or daily tally reserved by the service.
            for key in ("budget", "initialBudget", "dailySpent", "dailySpentDate"):
                clean_state[key] = old_state.get(key, clean_state.get(key))
            live_records = [tx for tx in old_state.get("transactions", []) if tx.get("txHash")]
            if live_records:
                live_ids = {tx.get("intentId") for tx in live_records}
                clean_state["transactions"] = live_records + [
                    tx for tx in clean_state.get("transactions", []) if tx.get("intentId") not in live_ids
                ]
        else:
            clean_state.setdefault("dailySpentDate", today_local())
        _upgrade_spending_limits(clean_state)
        clean_policy = {
            "killSwitch": bool(policy.get("killSwitch", False)),
            "dailyCap": settings.daily_cap_xrp,
            "policyVersion": settings.policy_version,
        }
        result = {"state": clean_state, "policy": clean_policy}
        save_app_state(db, result)
        db.commit()
    return result


class PaymentRequest(BaseModel):
    supplier: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=100_000)
    intent_id: str = Field(min_length=8, max_length=100)
    approved: bool = False
    x402_endpoint: str | None = Field(default=None, min_length=9, max_length=2048)


class WalletWithdrawalRequest(BaseModel):
    destination: str = Field(min_length=25, max_length=35)
    amount: float = Field(gt=0, le=100_000)
    intent_id: str = Field(min_length=8, max_length=100)
    approved: bool = False


class CardDepositRequest(BaseModel):
    amount_zar: float = Field(gt=0, le=100_000)
    email: str = Field(min_length=5, max_length=254)


class X402OracleRequest(BaseModel):
    url: str = Field(min_length=9, max_length=2048)


def _public_https_url(url: str) -> tuple[str, str]:
    parsed = urlsplit(url)
    try:
        port = parsed.port
    except ValueError:
        raise HTTPException(400, "Enter a valid public HTTPS endpoint on port 443.")
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or port not in (None, 443):
        raise HTTPException(400, "Enter a public HTTPS x402 endpoint (port 443).")
    host = parsed.hostname.rstrip(".").lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith((".localhost", ".local", ".internal")):
        raise HTTPException(400, "Private and local endpoints cannot be checked.")
    try:
        addresses = {ipaddress.ip_address(result[4][0]) for result in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except (OSError, ValueError):
        raise HTTPException(400, "The endpoint hostname could not be resolved.")
    if not addresses or any(not address.is_global for address in addresses):
        raise HTTPException(400, "The endpoint must resolve only to public internet addresses.")
    return host, url


def _x402_requirements(response: httpx.Response, payload: bytes) -> dict | None:
    raw = response.headers.get("PAYMENT-REQUIRED") or response.headers.get("X-PAYMENT-REQUIRED")
    if raw:
        try:
            raw += "=" * (-len(raw) % 4)
            parsed = json.loads(base64.b64decode(raw, validate=True))
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return None
    try:
        body = json.loads(payload)
        return body if isinstance(body, dict) and ("accepts" in body or "paymentRequirements" in body) else None
    except (ValueError, json.JSONDecodeError):
        return None


@app.post("/api/x402/oracle-check", dependencies=[Depends(require_api_key)])
def x402_oracle_check(body: X402OracleRequest) -> dict:
    """Unpaid HTTPS probe: inspect a public endpoint for an XRPL Testnet x402 challenge."""
    host, url = _public_https_url(body.url.strip())
    try:
        with httpx.Client(timeout=httpx.Timeout(8.0), follow_redirects=False, headers={"Accept": "application/json"}) as client:
            with client.stream("GET", url) as response:
                payload = bytearray()
                for chunk in response.iter_bytes(chunk_size=8192):
                    payload.extend(chunk)
                    if len(payload) > 65536:
                        payload = payload[:65536]
                        break
                status = response.status_code
                challenge = _x402_requirements(response, bytes(payload))
    except httpx.HTTPError:
        raise HTTPException(502, "Could not reach that endpoint over HTTPS. No payment was attempted.")
    if status != 402 or not challenge:
        return {"ok": False, "verdict": "No valid x402 challenge found", "endpoint": host,
                "http_status": status, "checks": ["Unpaid HTTPS request completed", "No payment was sent"],
                "message": "This endpoint did not return an HTTP 402 response with readable payment requirements."}
    accepts = challenge.get("accepts", [])
    requirements = challenge.get("paymentRequirements")
    if isinstance(requirements, dict):
        accepts = [requirements]
    elif not isinstance(accepts, list):
        accepts = []
    xrpl = next((item for item in accepts if isinstance(item, dict) and item.get("network") == "xrpl:1"
                 and item.get("scheme") == "exact" and item.get("asset") == "XRP"), None)
    if not xrpl:
        return {"ok": False, "verdict": "x402 found · no XRPL Testnet XRP option", "endpoint": host,
                "http_status": status, "checks": ["HTTP 402 challenge found", "No payment was sent"],
                "message": "The endpoint advertises x402, but not exact XRP on XRPL Testnet (xrpl:1)."}
    amount, pay_to = xrpl.get("amount"), xrpl.get("payTo")
    valid_amount = isinstance(amount, str) and amount.isdigit() and int(amount) > 0
    valid_address = isinstance(pay_to, str) and bool(re.fullmatch(r"r[1-9A-HJ-NP-Za-km-z]{24,34}", pay_to))
    ok = valid_amount and valid_address
    return {"ok": ok, "verdict": "XRPL Testnet x402 challenge looks valid" if ok else "XRPL Testnet challenge needs review",
            "endpoint": host, "http_status": status,
            "checks": ["HTTP 402 challenge found", "Network: xrpl:1", "Asset: XRP",
                       "Amount uses positive integer drops" if valid_amount else "Amount is missing or invalid",
                       "Public destination address is present" if valid_address else "Destination address is missing or invalid",
                       "No payment was sent"],
            "payment": {"network": "xrpl:1", "asset": "XRP", "amount_drops": amount if valid_amount else None,
                        "pay_to": pay_to if valid_address else None}}


class PaystackWithdrawalRequest(BaseModel):
    method: str = Field(pattern="^(refund|bank)$")
    amount_zar: float = Field(gt=0, le=100_000)
    operation_id: str = Field(min_length=12, max_length=100)
    approved: bool = False
    card_reference: str | None = Field(default=None, max_length=120)
    account_name: str | None = Field(default=None, max_length=120)
    account_number: str | None = Field(default=None, min_length=6, max_length=30)
    bank_code: str | None = Field(default=None, min_length=2, max_length=20)


def _paystack_headers() -> dict[str, str]:
    if not settings.paystack_secret_key:
        raise HTTPException(503, "Paystack is not connected. Add PAYSTACK_SECRET_KEY to the local service settings first.")
    return {"Authorization": f"Bearer {settings.paystack_secret_key}", "Content-Type": "application/json"}


@app.post("/api/paystack/deposit/initialize", dependencies=[Depends(require_api_key)])
def initialize_card_deposit(body: CardDepositRequest) -> dict:
    require_live_mode()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", body.email):
        raise HTTPException(400, "Enter a valid email address for the Paystack checkout receipt.")
    amount_minor = int(round(body.amount_zar * 100))
    if amount_minor < 100:
        raise HTTPException(400, "The minimum card deposit is R1.00.")
    reference = f"spaza_{secrets.token_urlsafe(18)}"
    callback = f"http://{settings.host}:{settings.port}/?paystack_reference={reference}"
    payload = {"email": body.email, "amount": amount_minor, "currency": "ZAR", "channels": ["card"],
               "callback_url": callback, "reference": reference,
               "metadata": {"shop": "The Digital Mark Spaza Shop", "purpose": "store_account_deposit"}}
    try:
        response = httpx.post("https://api.paystack.co/transaction/initialize", headers=_paystack_headers(), json=payload, timeout=20)
        data = response.json()
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Paystack checkout initialization failed: %s", exc)
        raise HTTPException(502, "Paystack could not start checkout. Please try again later.") from exc
    if response.status_code >= 400 or not data.get("status") or not data.get("data", {}).get("authorization_url"):
        raise HTTPException(502, data.get("message", "Paystack did not return a checkout link."))
    now = now_iso()
    with DB_LOCK, connection() as db:
        db.execute("INSERT INTO card_payments(reference,amount_minor,email,status,authorization_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                   (reference, amount_minor, body.email, "pending", data["data"]["authorization_url"], now, now))
    return {"reference": reference, "authorization_url": data["data"]["authorization_url"], "amount_zar": amount_minor / 100}


@app.get("/api/paystack/deposit/verify")
def verify_card_deposit(reference: str = Query(min_length=8, max_length=120)) -> dict:
    with DB_LOCK, connection() as db:
        row = db.execute("SELECT * FROM card_payments WHERE reference=?", (reference,)).fetchone()
    if not row:
        raise HTTPException(404, "This Paystack checkout reference is not recognized by this shop.")
    try:
        response = httpx.get(f"https://api.paystack.co/transaction/verify/{reference}", headers=_paystack_headers(), timeout=20)
        data = response.json()
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Paystack verification failed: %s", exc)
        raise HTTPException(502, "Paystack could not verify the checkout yet. Refresh in a moment.") from exc
    payment = data.get("data") or {}
    if response.status_code >= 400 or not data.get("status"):
        raise HTTPException(502, data.get("message", "Paystack could not verify the checkout yet."))
    if payment.get("reference") != reference or payment.get("currency") != "ZAR" or int(payment.get("amount") or 0) != int(row["amount_minor"]):
        raise HTTPException(409, "The verified payment details do not match this checkout. No balance was credited.")
    provider_status = payment.get("status")
    if provider_status != "success":
        return {"status": "pending" if provider_status in {"pending", "ongoing", "processing"} else "not_paid", "reference": reference}
    with DB_LOCK, connection() as db:
        db.execute("BEGIN IMMEDIATE")
        current = db.execute("SELECT * FROM card_payments WHERE reference=?", (reference,)).fetchone()
        if current["credited_at"]:
            stored = read_app_state(db)
            db.commit()
            return {"status": "credited", "reference": reference, "amount_zar": current["amount_minor"] / 100,
                    "balance_zar": stored["state"].get("storeBalance", 0) if stored else 0}
        stored = read_app_state(db)
        if not stored:
            db.rollback()
            raise HTTPException(409, "Shop account data is not ready. Reopen the dashboard and retry verification.")
        state = stored["state"]
        amount_zar = int(current["amount_minor"]) / 100
        state["storeBalance"] = round(float(state.get("storeBalance", 0)) + amount_zar, 2)
        state["settledBalanceZar"] = round(float(state.get("settledBalanceZar", 0)) + amount_zar, 2)
        state["cashIn"] = round(float(state.get("cashIn", 0)) + amount_zar, 2)
        state.setdefault("transactions", []).insert(0, {
            "title": "Card account deposit", "detail": f"Paystack verified · {reference}", "type": "Deposit",
            "amount": amount_zar, "time": "Just now", "icon": "↓", "status": "Verified · Paystack", "providerReference": reference,
        })
        state["transactions"] = state["transactions"][:2000]
        save_app_state(db, stored)
        db.execute("UPDATE card_payments SET status='success', credited_at=?, updated_at=? WHERE reference=?",
                   (now_iso(), now_iso(), reference))
        db.commit()
        return {"status": "credited", "reference": reference, "amount_zar": amount_zar, "balance_zar": state["storeBalance"]}


@app.post("/api/paystack/withdraw", dependencies=[Depends(require_api_key)])
def paystack_withdraw(body: PaystackWithdrawalRequest) -> dict:
    require_live_mode()
    if not body.approved:
        raise HTTPException(400, "Owner approval is required before a Paystack withdrawal.")
    amount_minor = int(round(body.amount_zar * 100))
    if amount_minor < 100:
        raise HTTPException(400, "Enter at least R1.00.")
    with DB_LOCK, connection() as db:
        existing = db.execute("SELECT * FROM paystack_operations WHERE reference=?", (body.operation_id,)).fetchone()
        stored = read_app_state(db)
    if existing:
        return {"status": existing["status"], "operation_id": body.operation_id, "message": "This request was already sent to Paystack. Check the Paystack dashboard for its final status."}
    if not stored:
        raise HTTPException(409, "Shop account data is not ready.")
    settled = float(stored["state"].get("settledBalanceZar", 0))
    if body.amount_zar > settled:
        raise HTTPException(403, f"Only {settled:.2f} ZAR has been verified through Paystack and is available for card or bank withdrawals.")
    headers = _paystack_headers()
    provider_reference = body.card_reference if body.method == "refund" else body.operation_id
    try:
        if body.method == "refund":
            if not body.card_reference:
                raise HTTPException(400, "Choose an original Paystack card payment to refund.")
            with connection() as db:
                original = db.execute("SELECT * FROM card_payments WHERE reference=? AND status='success' AND credited_at IS NOT NULL", (body.card_reference,)).fetchone()
            if not original:
                raise HTTPException(404, "Refunds are limited to card deposits verified by this shop.")
            if amount_minor > int(original["amount_minor"]):
                raise HTTPException(400, "A refund cannot be larger than the original card payment.")
            response = httpx.post("https://api.paystack.co/refund", headers=headers,
                                  json={"transaction": body.card_reference, "amount": amount_minor, "currency": "ZAR"}, timeout=20)
        else:
            if not all((body.account_name, body.account_number, body.bank_code)):
                raise HTTPException(400, "Enter the account holder, account number and bank code.")
            recipient_response = httpx.post("https://api.paystack.co/transferrecipient", headers=headers,
                                            json={"type": "nuban", "name": body.account_name, "account_number": body.account_number,
                                                  "bank_code": body.bank_code, "currency": "ZAR"}, timeout=20)
            recipient = recipient_response.json()
            if recipient_response.status_code >= 400 or not recipient.get("status"):
                raise HTTPException(502, recipient.get("message", "Paystack could not verify that bank account."))
            response = httpx.post("https://api.paystack.co/transfer", headers=headers,
                                  json={"source": "balance", "amount": amount_minor, "currency": "ZAR",
                                        "recipient": recipient["data"]["recipient_code"], "reference": body.operation_id,
                                        "reason": "The Digital Mark Spaza Shop withdrawal"}, timeout=20)
        data = response.json()
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Paystack withdrawal request failed: %s", exc)
        raise HTTPException(502, "Paystack could not process this withdrawal request.") from exc
    if response.status_code >= 400 or not data.get("status"):
        raise HTTPException(502, data.get("message", "Paystack did not accept this request."))
    provider_data = data.get("data") or {}
    operation_status = provider_data.get("status", "pending")
    operation_status = "success" if operation_status in {"success", "processed"} else "pending"
    timestamp = now_iso()
    with DB_LOCK, connection() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT INTO paystack_operations(reference,kind,amount_minor,status,provider_reference,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                   (body.operation_id, body.method, amount_minor, operation_status,
                    str(provider_data.get("id") or provider_data.get("transfer_code") or provider_reference), timestamp, timestamp))
        current = read_app_state(db)
        if operation_status == "success" and current:
            state = current["state"]
            if body.amount_zar > float(state.get("settledBalanceZar", 0)):
                db.rollback()
                raise HTTPException(409, "The balance changed while Paystack was processing this withdrawal. Contact Paystack before repeating it.")
            state["storeBalance"] = round(float(state.get("storeBalance", 0)) - body.amount_zar, 2)
            state["settledBalanceZar"] = round(float(state.get("settledBalanceZar", 0)) - body.amount_zar, 2)
            state["cashOut"] = round(float(state.get("cashOut", 0)) + body.amount_zar, 2)
            label = "Card refund" if body.method == "refund" else "Bank payout"
            state.setdefault("transactions", []).insert(0, {"title": label, "detail": f"Paystack · {body.amount_zar:.2f} ZAR",
                "type": "Withdrawal", "amount": -body.amount_zar, "time": "Just now", "icon": "↑", "status": "Processed · Paystack"})
            state["transactions"] = state["transactions"][:2000]
            save_app_state(db, current)
        db.commit()
    return {"status": operation_status, "operation_id": body.operation_id, "provider_reference": provider_reference,
            "message": "Paystack processed the withdrawal." if operation_status == "success" else "Paystack accepted the request; its final status is pending. Check Paystack before retrying."}


@app.get("/api/paystack/withdraw/status")
def paystack_withdraw_status(operation_id: str = Query(min_length=12, max_length=100)) -> dict:
    with DB_LOCK, connection() as db:
        operation = db.execute("SELECT * FROM paystack_operations WHERE reference=?", (operation_id,)).fetchone()
    if not operation:
        raise HTTPException(404, "Withdrawal request not found.")
    if operation["status"] == "success":
        return {"status": "success", "operation_id": operation_id}
    headers = _paystack_headers()
    try:
        if operation["kind"] == "refund":
            response = httpx.get(f"https://api.paystack.co/refund/{operation['provider_reference']}", headers=headers, timeout=20)
        else:
            response = httpx.get(f"https://api.paystack.co/transfer/verify/{operation_id}", headers=headers, timeout=20)
        data = response.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, "Paystack could not check the withdrawal yet.") from exc
    if response.status_code >= 400 or not data.get("status"):
        raise HTTPException(502, data.get("message", "Paystack could not check the withdrawal yet."))
    status = (data.get("data") or {}).get("status", "pending")
    normalized = "success" if status in {"success", "processed"} else "failed" if status in {"failed", "reversed", "refunded"} else "pending"
    if normalized == "success":
        with DB_LOCK, connection() as db:
            db.execute("BEGIN IMMEDIATE")
            operation = db.execute("SELECT * FROM paystack_operations WHERE reference=?", (operation_id,)).fetchone()
            if operation["status"] != "success":
                stored = read_app_state(db)
                if stored:
                    amount_zar = int(operation["amount_minor"]) / 100
                    state = stored["state"]
                    if amount_zar > float(state.get("settledBalanceZar", 0)):
                        db.rollback()
                        raise HTTPException(409, "Paystack completed this withdrawal after the store balance changed. Review the Paystack transaction and account ledger.")
                    state["storeBalance"] = round(float(state.get("storeBalance", 0)) - amount_zar, 2)
                    state["settledBalanceZar"] = round(float(state.get("settledBalanceZar", 0)) - amount_zar, 2)
                    state["cashOut"] = round(float(state.get("cashOut", 0)) + amount_zar, 2)
                    label = "Card refund" if operation["kind"] == "refund" else "Bank payout"
                    state.setdefault("transactions", []).insert(0, {"title": label, "detail": f"Paystack · {amount_zar:.2f} ZAR",
                        "type": "Withdrawal", "amount": -amount_zar, "time": "Just now", "icon": "↑", "status": "Processed · Paystack"})
                    state["transactions"] = state["transactions"][:2000]
                    save_app_state(db, stored)
                db.execute("UPDATE paystack_operations SET status='success',updated_at=? WHERE reference=?", (now_iso(), operation_id))
            db.commit()
    elif normalized == "failed":
        with connection() as db:
            db.execute("UPDATE paystack_operations SET status='failed',updated_at=? WHERE reference=?", (now_iso(), operation_id))
    return {"status": normalized, "operation_id": operation_id}


def _withdrawal_intent(body: WalletWithdrawalRequest, owner_approved: bool):
    stored = _stored()
    if not stored:
        raise HTTPException(409, "Save shop data before preparing a withdrawal.")
    state, policy = stored["state"], stored["policy"]
    _ensure_current_day(state)
    pending = pending_spend_xrp()
    available_today = max(0.0, settings.daily_cap_xrp - float(state.get("dailySpent", 0)) - pending)
    if policy.get("killSwitch"):
        raise HTTPException(403, "The kill switch is on. Wallet withdrawals are paused.")
    if body.amount > available_today:
        raise HTTPException(403, f"The daily XRP limit leaves {available_today:.6f} XRP available, including pending payments.")
    intent = make_intent(supplier="Owner wallet withdrawal", intent_id=body.intent_id,
                         owner_approved=owner_approved, workflow="wallet_withdrawal")
    return stored, intent


@app.post("/api/wallet/withdraw/preview", dependencies=[Depends(require_api_key)])
def wallet_withdrawal_preview(body: WalletWithdrawalRequest) -> dict:
    require_live_mode()
    if not wallet_status().get("connected"):
        raise HTTPException(409, "Set up and connect the shop wallet to XRPL Testnet first.")
    _, intent = _withdrawal_intent(body, False)
    try:
        _, preview = prepare_payment(body.destination, body.amount, intent)
    except PreflightError as exc:
        raise HTTPException(422, {"message": str(exc), "checks": exc.result.checks, "reasons": exc.result.reasons}) from exc
    except Exception as exc:
        raise HTTPException(502, f"Testnet withdrawal preflight could not complete: {exc}") from exc
    preview["daily_limit_xrp"] = settings.daily_cap_xrp
    preview["max_fee_xrp"] = settings.max_fee_xrp
    return preview


@app.post("/api/wallet/withdraw", dependencies=[Depends(require_api_key)])
def wallet_withdraw(body: WalletWithdrawalRequest) -> dict:
    require_live_mode()
    if not body.approved:
        raise HTTPException(400, "Owner approval is required before signing.")
    with DB_LOCK, connection() as db:
        existing = db.execute("SELECT payload FROM payment_intents WHERE intent_id=?", (body.intent_id,)).fetchone()
    if existing:
        result = json.loads(existing["payload"])
        stored = _stored()
        if stored:
            result["state"] = stored["state"]
        return result
    if not wallet_status().get("connected"):
        raise HTTPException(409, "The shop wallet is not connected to XRPL Testnet.")
    stored, intent = _withdrawal_intent(body, True)
    try:
        filled, preview = prepare_payment(body.destination, body.amount, intent)
        result = sign_persist_submit(filled, intent, "Owner wallet withdrawal", body.amount)
    except PreflightError as exc:
        raise HTTPException(422, {"message": str(exc), "checks": exc.result.checks, "reasons": exc.result.reasons}) from exc
    except Exception as exc:
        log.exception("Wallet withdrawal pipeline failed before a final result")
        raise HTTPException(502, f"Testnet withdrawal could not be completed: {exc}") from exc
    result.update({"destination": body.destination, "workflow": "wallet_withdrawal"})
    result["timestamp_local"] = __import__("datetime").datetime.now().astimezone().strftime("%I:%M %p").lstrip("0")
    with connection() as db:
        db.execute("UPDATE payment_intents SET payload=?,updated_at=? WHERE intent_id=?",
                   (json.dumps(result, ensure_ascii=False), now_iso(), body.intent_id))
        db.execute("UPDATE ledger_transactions SET payload=?,updated_at=? WHERE intent_id=?",
                   (json.dumps(result, ensure_ascii=False), now_iso(), body.intent_id))
        current = read_app_state(db) or stored
        if result["status"] == "validated":
            _apply_validated_payment(result, current["state"])
        else:
            current["state"].setdefault("transactions", []).insert(0, {
                "title": "Wallet withdrawal", "detail": f"To {body.destination[:8]}… · {body.amount:.6f} XRP · awaiting validation",
                "type": "Wallet withdrawal", "amount": 0, "xrpAmount": -body.amount,
                "time": result["timestamp_local"], "icon": "↗", "status": "Failed · Testnet" if result["status"] == "failed" else "Pending · Testnet",
                "intentId": body.intent_id, "txHash": result.get("tx_hash"), "memo": result.get("memo"), "accounted": False,
            })
            current["state"]["transactions"] = current["state"]["transactions"][:2000]
        save_app_state(db, current)
    result["state"] = current["state"]
    result["preview"] = preview
    result["ledger_submission"] = True
    result["message"] = (f"Validated on XRPL Testnet · {result.get('tx_hash', '')}" if result["status"] == "validated"
                          else "The Testnet withdrawal failed validation. Check its ledger result before taking another action."
                          if result["status"] == "failed" else "The withdrawal is pending validation. Its signed transaction is saved; do not retry it.")
    return result


def _payment_inputs(supplier_name: str, amount: float, intent_id: str, approved: bool,
                    x402_endpoint: str | None = None):
    stored = _stored()
    if not stored:
        raise HTTPException(409, "Save shop data before preparing a payment.")
    state, policy = stored["state"], stored["policy"]
    _ensure_current_day(state)
    decision = evaluate_spend(supplier_name, amount, state, policy)
    if not decision.allowed:
        raise HTTPException(403, decision.reason)
    supplier = next(x for x in state["suppliers"] if x.get("name") == supplier_name)
    destination = str(supplier.get("xrplAddress", "")).strip()
    if not destination:
        raise HTTPException(422, f"{supplier_name} needs a funded XRPL Testnet address before it can receive a payment.")
    if x402_endpoint:
        quote = x402_oracle_check(X402OracleRequest(url=x402_endpoint))
        if not quote.get("ok"):
            raise HTTPException(422, quote.get("message", "The x402 check did not pass."))
        terms = quote.get("payment") or {}
        expected_drops = int(round(amount * 1_000_000))
        if terms.get("pay_to") != destination:
            raise HTTPException(422, "The x402 quote recipient does not match this supplier's saved Testnet address.")
        if terms.get("amount_drops") != str(expected_drops):
            raise HTTPException(422, "The x402 quote amount does not match the XRP amount entered. Review the quote and amount again.")
    intent = make_intent(supplier=supplier_name, intent_id=intent_id, owner_approved=approved)
    return stored, supplier, destination, intent


@app.post("/api/payments/preview", dependencies=[Depends(require_api_key)])
def payment_preview(body: PaymentRequest) -> dict:
    require_live_mode()
    if not wallet_status().get("connected"):
        raise HTTPException(409, "Set up and fund the shop wallet on XRPL Testnet first.")
    _, supplier, destination, intent = _payment_inputs(body.supplier, body.amount, body.intent_id, False, body.x402_endpoint)
    try:
        _, preview = prepare_payment(destination, body.amount, intent)
    except PreflightError as exc:
        raise HTTPException(422, {"message": str(exc), "checks": exc.result.checks, "reasons": exc.result.reasons}) from exc
    except Exception as exc:
        raise HTTPException(502, f"Testnet preflight could not complete: {exc}") from exc
    preview["supplier"] = supplier["name"]
    preview["daily_limit_xrp"] = settings.daily_cap_xrp
    return preview


@app.post("/api/payments", dependencies=[Depends(require_api_key)])
def send_payment(body: PaymentRequest) -> dict:
    require_live_mode()
    if not body.approved:
        raise HTTPException(400, "Owner approval is required before signing.")
    with DB_LOCK:
        with connection() as db:
            existing = db.execute("SELECT payload FROM payment_intents WHERE intent_id=?", (body.intent_id,)).fetchone()
        if existing:
            result = json.loads(existing["payload"])
            stored = _stored()
            if stored:
                result["state"] = stored["state"]
            return result
        if not wallet_status().get("connected"):
            raise HTTPException(409, "The shop wallet is not connected to XRPL Testnet.")
        stored, supplier, destination, intent = _payment_inputs(body.supplier, body.amount, body.intent_id, True, body.x402_endpoint)
        try:
            filled, preview = prepare_payment(destination, body.amount, intent)
            result = sign_persist_submit(filled, intent, supplier["name"], body.amount)
        except PreflightError as exc:
            raise HTTPException(422, {"message": str(exc), "checks": exc.result.checks, "reasons": exc.result.reasons}) from exc
        except Exception as exc:
            log.exception("Testnet payment pipeline failed before a final result")
            raise HTTPException(502, f"Testnet payment could not be completed: {exc}") from exc
        result["destination"] = destination
        result["timestamp_local"] = __import__("datetime").datetime.now().astimezone().strftime("%I:%M %p").lstrip("0")
        with connection() as db:
            db.execute("UPDATE payment_intents SET payload=?,updated_at=? WHERE intent_id=?",
                       (json.dumps(result, ensure_ascii=False), now_iso(), body.intent_id))
            db.execute("UPDATE ledger_transactions SET payload=?,updated_at=? WHERE intent_id=?",
                       (json.dumps(result, ensure_ascii=False), now_iso(), body.intent_id))
            if result["status"] == "validated":
                current = read_app_state(db) or stored
                _apply_validated_payment(result, current["state"])
                save_app_state(db, current)
                result["state"] = current["state"]
            else:
                current = read_app_state(db) or stored
                current["state"].setdefault("transactions", []).insert(0, {
                    "title": supplier["name"], "detail": f"XRPL Testnet payment · {body.amount:.2f} XRP · awaiting validation",
                    "type": "Supplier payment", "amount": 0, "time": result["timestamp_local"], "icon": "↙",
                    "status": "Failed · Testnet" if result["status"] == "failed" else "Pending · Testnet", "intentId": body.intent_id, "txHash": result.get("tx_hash"),
                    "memo": result.get("memo"), "accounted": False,
                })
                current["state"]["transactions"] = current["state"]["transactions"][:2000]
                save_app_state(db, current)
                result["state"] = current["state"]
        result["preview"] = preview
        result["ledger_submission"] = True
        result["message"] = (f"Validated on XRPL Testnet · {result.get('tx_hash', '')}" if result["status"] == "validated"
                              else "The Testnet payment failed validation. Check its ledger result before taking another action."
                              if result["status"] == "failed" else "The submission is not yet validated. It is saved and will be reconciled; do not retry it.")
        return result


@app.get("/api/payment-intents")
def payment_intents() -> list[dict]:
    with connection() as db:
        rows = db.execute("SELECT payload FROM payment_intents ORDER BY created_at DESC LIMIT 100").fetchall()
    return [json.loads(row["payload"]) for row in rows]


@app.post("/api/wallet/bootstrap", dependencies=[Depends(require_api_key)])
def wallet_bootstrap() -> dict:
    require_live_mode()
    try:
        if settings.seed:
            wallet = get_wallet()
            status = wallet_status()
            if status.get("connected"):
                return {"address": wallet.address, "network": "testnet", "funded": True,
                        "connected": True, "balance_xrp": status.get("balance_xrp")}
            result = request_funding(wallet.address, float(status.get("balance_xrp") or 0))
            if not result.funded:
                raise HTTPException(429, result.reason)
            _record_wallet_topup(wallet.address, result.balance_xrp, max(0.0, float(result.balance_xrp or 0) - float(status.get("balance_xrp") or 0)))
            return {"address": wallet.address, "network": "testnet", "funded": True,
                    "connected": True, "balance_xrp": result.balance_xrp}
        result = create_and_fund_wallet()
        _record_wallet_topup(result["address"], result.get("balance_xrp"))
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Testnet wallet setup failed: {exc}") from exc


@app.post("/api/faucet/fund", dependencies=[Depends(require_api_key)])
def faucet_fund() -> dict:
    require_live_mode()
    try:
        wallet = get_wallet()
        current = wallet_status().get("balance_xrp") or 0.0
        result = request_funding(wallet.address, float(current))
        if not result.funded:
            raise HTTPException(429, result.reason)
        _record_wallet_topup(wallet.address, result.balance_xrp, max(0.0, float(result.balance_xrp or 0) - float(current)))
        return {"funded": True, "reason": result.reason, "balance_xrp": result.balance_xrp, "address": wallet.address}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Testnet faucet request failed: {exc}") from exc


@app.get("/api/faucet/status")
def faucet_info() -> dict:
    return faucet_status()


@app.post("/api/reconcile", dependencies=[Depends(require_api_key)])
def reconcile_endpoint() -> dict:
    try:
        return {"outcomes": reconcile_pending()}
    except Exception as exc:
        raise HTTPException(502, f"Could not reconcile Testnet transactions: {exc}") from exc


@app.get("/")
def index_page() -> HTMLResponse:
    index = ROOT / "index.html"
    source = index.read_text(encoding="utf-8")
    key_script = f"<script>window.SPAZA_API_KEY={json.dumps(settings.api_key)};</script>"
    if "</head>" in source:
        source = source.replace("</head>", key_script + "</head>", 1)
    return HTMLResponse(source)


@app.get("/{asset_name}")
def static_asset(asset_name: str) -> FileResponse:
    allowed = {"app.js", "styles.css", "features.css"}
    if asset_name not in allowed:
        raise HTTPException(404, "Not found.")
    return FileResponse(ROOT / asset_name)
