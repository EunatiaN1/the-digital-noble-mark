"""Structured, unique payment intents and XRPL memo encoding."""
from __future__ import annotations

import json
import secrets
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from config import settings

MAX_MEMO_HEX_CHARACTERS = 1024


@dataclass(frozen=True)
class Intent:
    intent_id: str
    workflow: str
    supplier: str
    item: str | None
    quantity: int | None
    policy_version: str
    owner_approved: bool
    network: str
    timestamp: str

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    def to_hex(self) -> str:
        return self.to_json().encode("utf-8").hex().upper()


def make_intent(*, supplier: str, intent_id: str | None = None, owner_approved: bool = False,
                item: str | None = None, quantity: int | None = None,
                workflow: str = "supplier_invoice") -> Intent:
    sortable_id = f"{int(time.time() * 1000):010X}{secrets.token_hex(8).upper()}"
    return Intent(
        intent_id=intent_id or sortable_id,
        workflow=workflow,
        supplier=supplier,
        item=item,
        quantity=quantity,
        policy_version=settings.policy_version,
        owner_approved=owner_approved,
        network="testnet",
        timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )


def validate_memo_size(intent: Intent) -> tuple[bool, str]:
    size = len(intent.to_hex())
    if size > MAX_MEMO_HEX_CHARACTERS:
        return False, f"Encoded memo is {size} characters; the app limit is {MAX_MEMO_HEX_CHARACTERS}."
    return True, "OK"


def parse_memo(hex_memo: str) -> dict | None:
    try:
        return json.loads(bytes.fromhex(hex_memo).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
