"""Local Testnet signing flow with policy preflight and durable submission records."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import re
import time

from xrpl.clients import JsonRpcClient
from xrpl.core.binarycodec import encode
from xrpl.models.requests import AccountTx, ServerInfo, SubmitOnly, Tx
from xrpl.models.transactions import Memo, Payment
from xrpl.transaction import autofill, sign
from xrpl.utils import drops_to_xrp, xrp_to_drops
from xrpl.wallet import Wallet

from auth import ROOT
from config import settings
from db import connection, now_iso
from intent import Intent
from preflight import PreflightError, run_preflight

log = logging.getLogger("spaza.xrpl")
client = JsonRpcClient(settings.endpoint)
_wallet: Wallet | None = None


def get_wallet() -> Wallet:
    global _wallet
    if _wallet is None:
        if not settings.seed:
            raise RuntimeError("No Testnet wallet exists yet. Use Set up Testnet wallet to create one.")
        _wallet = Wallet.from_seed(settings.seed)
    return _wallet


def wallet_configured() -> bool:
    return bool(settings.seed)


def reset_wallet_cache() -> None:
    global _wallet
    _wallet = None


def _persist_seed(seed: str) -> None:
    env_path = ROOT / ".env"
    lines = env_path.read_text().splitlines() if env_path.exists() else []
    lines = [line for line in lines if not line.strip().startswith("XRPL_SEED=")]
    lines.append(f'XRPL_SEED="{seed}"')
    env_path.write_text("\n".join(lines).rstrip() + "\n")
    os.chmod(env_path, 0o600)
    os.environ["XRPL_SEED"] = seed
    settings.seed = seed


def create_and_fund_wallet() -> dict:
    """Generate the key locally, fund its public address via the official faucet, then save it locally."""
    if settings.seed:
        raise RuntimeError("A Testnet wallet is already configured.")
    wallet = Wallet.create()
    # Persist the key before contacting the faucet so a timeout cannot strand funded test XRP.
    _persist_seed(wallet.seed)
    reset_wallet_cache()
    from faucet import request_funding
    result = request_funding(wallet.address, 0.0)
    if not result.funded:
        raise RuntimeError(result.reason)
    return {"address": wallet.address, "network": "testnet", "funded": True, "balance_xrp": result.balance_xrp}


def wallet_status() -> dict:
    if not settings.seed:
        return {"configured": False, "network": "testnet", "connected": False, "balance_xrp": None, "address": None}
    wallet = None
    try:
        wallet = get_wallet()
        from xrpl.account import get_balance
        # xrpl-py versions may return drops as an int; its converter accepts text.
        balance = float(drops_to_xrp(str(get_balance(wallet.address, client))))
        return {"configured": True, "network": "testnet", "connected": True, "balance_xrp": round(balance, 6), "address": wallet.address}
    except Exception as exc:
        return {"configured": True, "network": "testnet", "connected": False, "balance_xrp": None, "address": wallet.address if wallet else None, "error": str(exc)[:400]}


def xrpl_node_status() -> dict:
    """Read status from the configured XRPL Testnet server; this app is not a validator."""
    response = client.request(ServerInfo())
    if hasattr(response, "is_successful") and not response.is_successful():
        raise RuntimeError("XRPL Testnet node did not return server information.")
    result = response.result
    info = result.get("info") or {}
    ledger = info.get("validated_ledger") or {}
    return {
        "network": "testnet",
        "node_role": "public XRPL Testnet RPC server",
        "app_runs_validator": False,
        "server_state": info.get("server_state", "unknown"),
        "network_id": info.get("network_id"),
        "validated_ledger_sequence": ledger.get("seq"),
        "validated_ledger_age_seconds": ledger.get("age"),
        "validation_quorum": info.get("validation_quorum"),
        "peer_count": info.get("peers"),
        "build_version": info.get("build_version"),
    }


def wallet_activity(limit: int = 30) -> list[dict]:
    """Return recent validated XRP payments involving the configured Testnet wallet."""
    wallet = get_wallet()
    response = client.request(AccountTx(account=wallet.address, ledger_index_min=-1,
                                        ledger_index_max=-1, binary=False, forward=False,
                                        limit=max(1, min(int(limit), 100))))
    if hasattr(response, "is_successful") and not response.is_successful():
        raise RuntimeError("XRPL Testnet could not return wallet activity.")
    result = response.result
    entries = result.get("transactions", [])
    activity = []
    for entry in entries:
        tx = entry.get("tx_json") or entry.get("tx") or entry
        meta = entry.get("meta") or entry.get("metaData") or {}
        if not entry.get("validated") or tx.get("TransactionType") != "Payment":
            continue
        drops = tx.get("Amount")
        if not isinstance(drops, str) or not drops.isdigit():
            continue  # Ignore issued currencies; this wallet activity is XRP-only.
        if meta.get("TransactionResult") != "tesSUCCESS":
            continue
        source, destination = tx.get("Account"), tx.get("Destination")
        if source != wallet.address and destination != wallet.address:
            continue
        outgoing = source == wallet.address
        xrp = float(drops_to_xrp(drops)) * (-1 if outgoing else 1)
        address = destination if outgoing else source
        tx_hash = entry.get("hash") or tx.get("hash")
        if not tx_hash:
            continue
        activity.append({
            "txHash": tx_hash,
            "title": "XRP sent" if outgoing else "XRP received",
            "detail": f"{'To' if outgoing else 'From'} {address[:8]}… · XRPL Testnet",
            "type": "Wallet withdrawal" if outgoing else "Wallet top-up",
            "amount": 0,
            "xrpAmount": round(xrp, 6),
            "time": "Validated on Testnet",
            "createdAt": now_iso(),
            "icon": "↗" if outgoing else "↓",
            "status": "Validated · Testnet",
            "account": wallet.address,
            "destination": destination,
            "source": source,
            "ledgerIndex": entry.get("ledger_index"),
        })
    return activity


def prepare_payment(destination: str, amount_xrp: float, intent: Intent) -> tuple[Payment, dict]:
    wallet = get_wallet()
    payment = Payment(
        account=wallet.address,
        destination=destination,
        amount=xrp_to_drops(amount_xrp),
        source_tag=settings.source_tag,
        memos=[Memo(memo_data=intent.to_hex())],
    )
    filled = autofill(payment, client)
    preflight = run_preflight(client=client, wallet=wallet, destination=destination,
                              amount_xrp=amount_xrp, intent=intent, filled_payment=filled)
    if not preflight.ok:
        raise PreflightError(preflight)
    preview = {
        "network": "testnet",
        "account": wallet.address,
        "destination": destination,
        "amount_xrp": round(amount_xrp, 6),
        "fee_drops": str(filled.fee),
        "sequence": int(filled.sequence),
        "last_ledger_sequence": int(filled.last_ledger_sequence),
        "source_tag": settings.source_tag,
        "intent_id": intent.intent_id,
        "memo": json.loads(intent.to_json()),
        "preflight": {"checks": preflight.checks, "details": preflight.details},
    }
    return filled, preview


def sign_persist_submit(filled: Payment, intent: Intent, supplier: str, amount_xrp: float) -> dict:
    wallet = get_wallet()
    signed = sign(filled, wallet)
    blob = encode(signed.to_xrpl())
    tx_hash = signed.get_hash()
    timestamp = now_iso()
    last_ledger = int(filled.last_ledger_sequence)
    stored = {
        "intent_id": intent.intent_id, "supplier": supplier, "amount_xrp": amount_xrp,
        "status": "pending", "tx_hash": tx_hash, "ledger_submission": True,
        "workflow": intent.workflow,
        "network": "testnet", "memo": json.loads(intent.to_json()),
    }
    # Store the signed blob and its hash before sending it to the network.
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            """INSERT INTO payment_intents(intent_id,supplier,destination,amount_xrp,status,tx_hash,
                last_ledger_sequence,signed_blob,payload,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (intent.intent_id, supplier, filled.destination, amount_xrp, "pending", tx_hash,
             last_ledger, blob, json.dumps(stored, ensure_ascii=False), timestamp, timestamp),
        )
        db.execute(
            """INSERT INTO ledger_transactions(tx_hash,intent_id,supplier,amount_xrp,status,
                payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)""",
            (tx_hash, intent.intent_id, supplier, amount_xrp, "pending", json.dumps(stored, ensure_ascii=False), timestamp, timestamp),
        )
        db.commit()
    try:
        submitted = client.request(SubmitOnly(tx_blob=blob, fail_hard=True))
        submit_result = submitted.result
        # Submit replies are provisional. Only a validated tx response is final.
        engine_result = submit_result.get("engine_result")
        deadline = time.monotonic() + 18
        result = None
        while time.monotonic() < deadline:
            result = fetch_tx(tx_hash)
            if result and result.get("validated"):
                break
            time.sleep(1)
        validated = bool(result and result.get("validated"))
        final_result = (result.get("meta") or {}).get("TransactionResult") if result else None
        status = "validated" if validated and final_result == "tesSUCCESS" else "failed" if validated else "submitted_not_validated"
        stored.update({"status": status, "validated": validated, "engine_result": final_result or engine_result,
                       "ledger_index": result.get("ledger_index") if result else None,
                       "fee_drops": filled.fee})
        _save_result(tx_hash, intent.intent_id, status, final_result or engine_result,
                     result.get("ledger_index") if result else None, stored)
    except Exception:
        # A disconnect does not prove the network failed to receive the blob. Keep it for reconciliation.
        log.exception("Testnet submit outcome is uncertain; keeping signed intent for reconciliation")
        status = "submitted_not_validated"
        stored.update({"status": status, "validated": False, "message": "Submission response was interrupted; reconcile before retrying."})
        _save_result(tx_hash, intent.intent_id, status, None, None, stored)
    return stored


def submit_x402_payment(endpoint: str, destination: str, amount_xrp: float) -> dict:
    """Complete one approved x402 resource purchase on XRPL Testnet.

    The x402 client handles the 402 challenge, signs the exact Payment, obtains
    the facilitator receipt, and retries the resource request. We independently
    verify the receipt's transaction against validated XRPL data before calling
    the purchase successful.
    """
    from x402_xrpl.clients.requests import x402_requests
    from x402_xrpl.clients.base import decode_payment_response

    wallet = get_wallet()
    fee_limit_drops = max(1, int(round(settings.max_fee_xrp * 1_000_000)))
    session = x402_requests(
        wallet,
        rpc_url=settings.endpoint,
        network_filter="xrpl:1",
        scheme_filter="exact",
        max_fee_drops=fee_limit_drops,
    )
    expected_drops = str(xrp_to_drops(amount_xrp))
    try:
        response = session.get(endpoint, timeout=90, allow_redirects=False)
    except Exception as exc:
        # x402 may have submitted before a network interruption; never retry blindly.
        return {"status": "settlement_unknown", "validated": False, "network": "testnet",
                "destination": destination, "amount_xrp": round(amount_xrp, 6),
                "message": f"The x402 request was interrupted. Check the wallet activity before trying again. ({type(exc).__name__})"}

    receipt_header = response.headers.get("PAYMENT-RESPONSE")
    if not receipt_header:
        return {"status": "settlement_unknown", "validated": False, "network": "testnet",
                "destination": destination, "amount_xrp": round(amount_xrp, 6),
                "resource_status": response.status_code,
                "message": "The service response had no settlement receipt. A payment may have been submitted; check wallet activity and do not retry blindly."}
    try:
        receipt = decode_payment_response(receipt_header)
    except Exception as exc:
        return {"status": "settlement_unknown", "validated": False, "network": "testnet",
                "destination": destination, "amount_xrp": round(amount_xrp, 6),
                "resource_status": response.status_code,
                "message": f"The service response could not be verified. Check wallet activity before retrying. ({type(exc).__name__})"}

    tx_hash = receipt.get("transaction") if isinstance(receipt, dict) else None
    if not isinstance(receipt, dict) or receipt.get("success") is not True or receipt.get("network") != "xrpl:1":
        return {"status": "failed", "validated": False, "network": "testnet", "tx_hash": tx_hash,
                "destination": destination, "amount_xrp": round(amount_xrp, 6),
                "resource_status": response.status_code,
                "message": "The x402 facilitator did not confirm a successful XRPL Testnet settlement."}
    if not isinstance(tx_hash, str) or not re.fullmatch(r"[A-Fa-f0-9]{64}", tx_hash):
        return {"status": "settlement_unknown", "validated": False, "network": "testnet",
                "destination": destination, "amount_xrp": round(amount_xrp, 6),
                "resource_status": response.status_code,
                "message": "The x402 receipt did not include a usable transaction hash. Check wallet activity before retrying."}

    deadline = time.monotonic() + 20
    transaction = None
    while time.monotonic() < deadline:
        transaction = fetch_tx(tx_hash)
        if transaction and transaction.get("validated"):
            break
        time.sleep(1)
    if not transaction or not transaction.get("validated"):
        return {"status": "submitted_not_validated", "validated": False, "network": "testnet",
                "tx_hash": tx_hash, "destination": destination, "amount_xrp": round(amount_xrp, 6),
                "last_ledger_sequence": ((transaction.get("tx_json") or transaction.get("tx") or transaction).get("LastLedgerSequence") if transaction else None),
                "resource_status": response.status_code,
                "message": "The x402 facilitator returned a receipt; XRPL validation is still pending. This payment is saved for reconciliation. Do not retry it."}

    tx = transaction.get("tx_json") or transaction.get("tx") or transaction
    meta = transaction.get("meta") or transaction.get("metaData") or {}
    engine_result = meta.get("TransactionResult")
    delivered = tx.get("Amount", tx.get("DeliverMax"))
    matches = (
        tx.get("TransactionType") == "Payment"
        and tx.get("Account") == wallet.address
        and tx.get("Destination") == destination
        and isinstance(delivered, str)
        and delivered == expected_drops
    )
    if engine_result != "tesSUCCESS" or not matches:
        return {"status": "failed", "validated": True, "network": "testnet", "tx_hash": tx_hash,
                "destination": tx.get("Destination", destination), "amount_xrp": round(amount_xrp, 6),
                "engine_result": engine_result, "ledger_index": transaction.get("ledger_index"),
                "unexpected_payment": not matches, "resource_status": response.status_code,
                "message": "XRPL validated this x402 transaction, but its result did not match the approved supplier payment. Review wallet activity before taking another action."}

    return {"status": "validated", "validated": True, "network": "testnet", "tx_hash": tx_hash,
            "destination": destination, "amount_xrp": round(amount_xrp, 6),
            "engine_result": engine_result, "ledger_index": transaction.get("ledger_index"),
            "resource_status": response.status_code, "x402_settled": True,
            "message": "x402 payment settled by the facilitator and validated on XRPL Testnet."}


def _save_result(tx_hash: str, intent_id: str, status: str, engine_result: str | None,
                 ledger_index: int | None, payload: dict) -> None:
    now = now_iso()
    with connection() as db:
        db.execute("UPDATE payment_intents SET status=?, payload=?, updated_at=? WHERE intent_id=?",
                   (status, json.dumps(payload, ensure_ascii=False), now, intent_id))
        db.execute("UPDATE ledger_transactions SET status=?, engine_result=?, ledger_index=?, payload=?, updated_at=? WHERE tx_hash=?",
                   (status, engine_result, ledger_index, json.dumps(payload, ensure_ascii=False), now, tx_hash))


def fetch_tx(tx_hash: str) -> dict | None:
    try:
        response = client.request(Tx(transaction=tx_hash, binary=False))
        if hasattr(response, "is_successful") and not response.is_successful():
            return None
        return response.result
    except Exception:
        return None


def current_ledger() -> int:
    from xrpl.ledger import get_latest_validated_ledger_sequence
    return int(get_latest_validated_ledger_sequence(client))
