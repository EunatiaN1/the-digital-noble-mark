"""Reconcile persisted Testnet submissions using validated XRPL outcomes."""
from __future__ import annotations

import json

from db import connection, now_iso
from xrpl_agent import current_ledger, fetch_tx


def sweep() -> list[dict]:
    with connection() as db:
        rows = db.execute("SELECT * FROM payment_intents WHERE status IN ('pending','submitted_not_validated','not_found') OR (status='settlement_unknown' AND tx_hash IS NOT NULL) ORDER BY created_at").fetchall()
    if not rows:
        return []
    ledger = current_ledger()
    results = []
    for row in rows:
        payload = json.loads(row["payload"])
        tx = fetch_tx(row["tx_hash"])
        if tx is None:
            if row["last_ledger_sequence"] is not None and ledger > row["last_ledger_sequence"]:
                status = "expired"
            else:
                status = "not_found"
            engine = None
        else:
            validated = bool(tx.get("validated"))
            engine = (tx.get("meta") or {}).get("TransactionResult")
            status = "submitted_not_validated" if not validated else "validated" if engine == "tesSUCCESS" else "failed"
            if validated and payload.get("workflow") == "x402_supplier_payment" and engine == "tesSUCCESS":
                tx_json = tx.get("tx_json") or tx.get("tx") or tx
                amount = tx_json.get("Amount", tx_json.get("DeliverMax"))
                try:
                    from xrpl_agent import get_wallet
                    expected_account = get_wallet().address
                except Exception:
                    expected_account = None
                from xrpl.utils import xrp_to_drops
                expected_drops = str(xrp_to_drops(float(row["amount_xrp"])))
                matches = (tx_json.get("TransactionType") == "Payment"
                           and tx_json.get("Account") == expected_account
                           and tx_json.get("Destination") == row["destination"]
                           and isinstance(amount, str) and amount == expected_drops)
                if not matches:
                    status = "failed"
                    payload["unexpected_payment"] = True
                    payload["message"] = "Validated hash did not match the approved x402 supplier payment; review wallet activity."
        payload.update({"status": status, "validated": status == "validated", "engine_result": engine})
        if tx:
            payload["ledger_index"] = tx.get("ledger_index")
        now = now_iso()
        with connection() as db:
            db.execute("UPDATE payment_intents SET status=?,payload=?,updated_at=? WHERE intent_id=?",
                       (status, json.dumps(payload, ensure_ascii=False), now, row["intent_id"]))
            db.execute("UPDATE ledger_transactions SET status=?,engine_result=?,ledger_index=?,payload=?,updated_at=? WHERE tx_hash=?",
                       (status, engine, tx.get("ledger_index") if tx else None,
                        json.dumps(payload, ensure_ascii=False), now, row["tx_hash"]))
        results.append({"hash": row["tx_hash"], "intent_id": row["intent_id"], "supplier": row["supplier"], "state": status, "engine_result": engine})
    return results
