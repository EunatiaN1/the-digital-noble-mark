"""Explicit Testnet faucet requests; all faucet funds are valueless test XRP."""
from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from config import settings
from db import connection, now_iso

COOLDOWN_SECONDS = 24 * 60 * 60


@dataclass
class FaucetResult:
    funded: bool
    reason: str
    balance_xrp: float | None = None
    next_attempt_in_seconds: int | None = None


def request_funding(address: str, current_balance_xrp: float, force: bool = False) -> FaucetResult:
    with connection() as db:
        row = db.execute("SELECT requested_at FROM faucet_requests WHERE address=?", (address,)).fetchone()
    if row and not force:
        elapsed = time.time() - float(row["requested_at"])
        remaining = int(COOLDOWN_SECONDS - elapsed)
        if remaining > 0:
            return FaucetResult(False, f"Faucet cooldown: try again in about {remaining // 3600} hours.", current_balance_xrp, remaining)
    try:
        response = httpx.post(settings.faucet_url, json={"destination": address}, timeout=25)
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPStatusError as exc:
        detail = "The Testnet faucet is rate-limiting requests." if exc.response.status_code == 429 else f"The Testnet faucet returned HTTP {exc.response.status_code}."
        return FaucetResult(False, detail, current_balance_xrp)
    except (httpx.HTTPError, ValueError) as exc:
        return FaucetResult(False, f"Could not reach the official Testnet faucet: {exc}", current_balance_xrp)
    with connection() as db:
        db.execute("""INSERT INTO faucet_requests(address, requested_at) VALUES(?, ?)
                      ON CONFLICT(address) DO UPDATE SET requested_at=excluded.requested_at""",
                   (address, time.time()))
    balance = data.get("balance") or data.get("account", {}).get("balance")
    try:
        balance_value = float(balance) if balance is not None else None
    except (TypeError, ValueError):
        balance_value = None
    return FaucetResult(True, "Faucet request accepted on XRPL Testnet.", balance_value)


def faucet_status() -> dict:
    return {"network": "testnet", "faucet_url": settings.faucet_url, "test_funds_only": True}
