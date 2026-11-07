"""Server-side spending policy: kill switch, approved suppliers, caps and budget."""
from __future__ import annotations

from dataclasses import dataclass

from config import settings
from db import connection, today_local


@dataclass(frozen=True)
class SpendDecision:
    allowed: bool
    reason: str
    remaining_today: float
    available_budget: float


def pending_spend_xrp() -> float:
    with connection() as db:
        row = db.execute(
            "SELECT COALESCE(SUM(amount_xrp), 0) AS total FROM payment_intents "
            "WHERE status IN ('prepared', 'pending', 'submitted_not_validated', 'not_found')"
        ).fetchone()
    return float(row["total"])


def evaluate_spend(supplier_name: str, amount_xrp: float, state: dict, policy: dict) -> SpendDecision:
    budget = max(0.0, float(state.get("budget", 0)))
    daily_cap = settings.daily_cap_xrp
    spent = float(state.get("dailySpent", 0))
    if state.get("dailySpentDate") != today_local():
        spent = 0.0
    reserved = pending_spend_xrp()
    available = max(0.0, budget - reserved)
    remaining = max(0.0, daily_cap - spent - reserved)

    if policy.get("killSwitch"):
        reason = "The kill switch is on. Supplier payments are paused."
    elif amount_xrp <= 0:
        reason = "Enter an amount greater than zero."
    else:
        supplier = next((x for x in state.get("suppliers", []) if x.get("name") == supplier_name), None)
        if supplier is None:
            reason = f"{supplier_name} is not on the approved supplier list."
        elif amount_xrp > min(50.0, float(supplier.get("cap", 0))):
            limit = min(50.0, float(supplier.get("cap", 0)))
            reason = f"{supplier_name} per-payment limit is {limit:.2f} XRP; requested {amount_xrp:.2f} XRP."
        elif amount_xrp > available:
            reason = f"Agent spending budget available is {available:.2f} XRP; requested {amount_xrp:.2f} XRP."
        elif amount_xrp > remaining:
            reason = f"Daily spending limit is {daily_cap:.2f} XRP; {spent:.2f} XRP has been used and {reserved:.2f} XRP is pending."
        else:
            reason = "Policy checks passed."
    return SpendDecision(reason == "Policy checks passed.", reason, remaining, available)
