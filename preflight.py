"""XRPL Testnet preflight checks performed before signing."""
from __future__ import annotations

from dataclasses import dataclass, field

from xrpl.clients import JsonRpcClient
from xrpl.models.requests import AccountInfo, ServerInfo
from xrpl.utils import drops_to_xrp
from xrpl.wallet import Wallet

from config import settings
from db import connection
from intent import Intent, validate_memo_size


@dataclass
class PreflightResult:
    ok: bool = True
    checks: dict[str, bool] = field(default_factory=dict)
    reasons: dict[str, str] = field(default_factory=dict)
    details: dict[str, object] = field(default_factory=dict)

    def pass_(self, name: str) -> None:
        self.checks[name] = True

    def fail(self, name: str, reason: str) -> None:
        self.checks[name] = False
        self.reasons[name] = reason
        self.ok = False


class PreflightError(ValueError):
    def __init__(self, result: PreflightResult):
        self.result = result
        super().__init__("Preflight blocked this payment: " + "; ".join(result.reasons.values()))


def _result(client: JsonRpcClient, request) -> dict:
    response = client.request(request)
    if hasattr(response, "is_successful") and not response.is_successful():
        raise RuntimeError(getattr(response, "result", {}).get("error_message", "XRPL request failed"))
    return response.result


def _current_reserves(client: JsonRpcClient) -> tuple[float, float]:
    info = _result(client, ServerInfo())
    ledger = info.get("info", {}).get("validated_ledger", {})
    base = ledger.get("reserve_base_xrp")
    increment = ledger.get("reserve_inc_xrp")
    if base is None or increment is None:
        raise RuntimeError("The Testnet server did not provide current reserve values.")
    return float(base), float(increment)


def run_preflight(*, client: JsonRpcClient, wallet: Wallet, destination: str,
                  amount_xrp: float, intent: Intent, filled_payment) -> PreflightResult:
    result = PreflightResult()
    try:
        from xrpl.core.addresscodec import is_valid_classic_address
        valid = is_valid_classic_address(destination)
        if not valid:
            result.fail("valid_destination", "Supplier address is not a valid XRPL classic address.")
        elif destination == wallet.address:
            result.fail("valid_destination", "Supplier destination cannot be the shop wallet itself.")
        else:
            result.pass_("valid_destination")
    except Exception as exc:
        result.fail("valid_destination", f"Could not validate supplier address: {exc}")

    try:
        dest = _result(client, AccountInfo(account=destination, ledger_index="validated"))
        if not dest.get("account_data"):
            result.fail("destination_exists", "Supplier address has no funded Testnet account.")
        else:
            result.pass_("destination_exists")
    except Exception as exc:
        result.fail("destination_exists", f"Could not verify supplier account on Testnet: {exc}")

    try:
        source = _result(client, AccountInfo(account=wallet.address, ledger_index="validated"))
        owner_count = int(source.get("account_data", {}).get("OwnerCount", 0))
        balance_xrp = float(drops_to_xrp(source.get("account_data", {}).get("Balance", "0")))
        base_reserve, owner_reserve = _current_reserves(client)
        fee_xrp = float(drops_to_xrp(filled_payment.fee or "10"))
        required_xrp = amount_xrp + fee_xrp + base_reserve + owner_count * owner_reserve
        result.details.update({"balance_xrp": balance_xrp, "reserve_xrp": base_reserve + owner_count * owner_reserve,
                               "fee_xrp": fee_xrp, "required_xrp": required_xrp})
        if balance_xrp < required_xrp:
            result.fail("sufficient_balance", f"Wallet has {balance_xrp:.6f} XRP; {required_xrp:.6f} XRP is needed including the current reserve and fee.")
        else:
            result.pass_("sufficient_balance")
        if fee_xrp > settings.max_fee_xrp:
            result.fail("fee_ceiling", f"Current transaction fee {fee_xrp:.6f} XRP exceeds the app ceiling of {settings.max_fee_xrp:.6f} XRP.")
        else:
            result.pass_("fee_ceiling")
    except Exception as exc:
        result.fail("sufficient_balance", f"Could not check wallet balance and current reserve: {exc}")

    memo_ok, memo_reason = validate_memo_size(intent)
    if memo_ok:
        result.pass_("memo_size")
    else:
        result.fail("memo_size", memo_reason)

    if not filled_payment.sequence or int(filled_payment.sequence) <= 0:
        result.fail("sequence_valid", "XRPL did not provide a usable account sequence.")
    else:
        result.pass_("sequence_valid")
    if not filled_payment.last_ledger_sequence:
        result.fail("last_ledger_valid", "XRPL did not provide LastLedgerSequence.")
    else:
        result.pass_("last_ledger_valid")
        result.details["last_ledger_sequence"] = int(filled_payment.last_ledger_sequence)

    with connection() as db:
        duplicate = db.execute("SELECT 1 FROM payment_intents WHERE intent_id=?", (intent.intent_id,)).fetchone()
    if duplicate:
        result.fail("no_duplicate_intent", "This payment intent has already been recorded.")
    else:
        result.pass_("no_duplicate_intent")
    return result
