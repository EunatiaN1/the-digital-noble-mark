"""SQLite persistence for shop state and recoverable XRPL payment intents."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Iterator

from config import settings

DB_LOCK = threading.RLock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def today_local() -> str:
    return datetime.now(ZoneInfo("Africa/Johannesburg")).date().isoformat()


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    settings.database.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(settings.database, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=15000")
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    with DB_LOCK, connection() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS payment_intents (
                intent_id TEXT PRIMARY KEY,
                supplier TEXT NOT NULL,
                destination TEXT NOT NULL,
                amount_xrp REAL NOT NULL,
                status TEXT NOT NULL,
                tx_hash TEXT,
                last_ledger_sequence INTEGER,
                signed_blob TEXT,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ledger_transactions (
                tx_hash TEXT PRIMARY KEY,
                intent_id TEXT NOT NULL UNIQUE,
                supplier TEXT NOT NULL,
                amount_xrp REAL NOT NULL,
                status TEXT NOT NULL,
                engine_result TEXT,
                ledger_index INTEGER,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS faucet_requests (
                address TEXT PRIMARY KEY,
                requested_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS card_payments (
                reference TEXT PRIMARY KEY,
                amount_minor INTEGER NOT NULL,
                email TEXT NOT NULL,
                status TEXT NOT NULL,
                authorization_url TEXT,
                credited_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS paystack_operations (
                reference TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                amount_minor INTEGER NOT NULL,
                status TEXT NOT NULL,
                provider_reference TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_payment_intents_status
                ON payment_intents(status, created_at);
            """
        )
        # Upgrade databases created by the earlier demo without discarding shop data.
        columns = {row["name"] for row in db.execute("PRAGMA table_info(payment_intents)")}
        additions = {
            "destination": "TEXT NOT NULL DEFAULT ''",
            "tx_hash": "TEXT",
            "last_ledger_sequence": "INTEGER",
            "signed_blob": "TEXT",
            "updated_at": "TEXT NOT NULL DEFAULT ''",
        }
        for name, declaration in additions.items():
            if name not in columns:
                db.execute(f"ALTER TABLE payment_intents ADD COLUMN {name} {declaration}")


def read_app_state(db: sqlite3.Connection) -> dict | None:
    row = db.execute("SELECT payload FROM app_state WHERE id=1").fetchone()
    return json.loads(row["payload"]) if row else None


def save_app_state(db: sqlite3.Connection, payload: dict) -> None:
    db.execute(
        """INSERT INTO app_state(id, payload, updated_at) VALUES(1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at""",
        (json.dumps(payload, ensure_ascii=False, separators=(",", ":")), now_iso()),
    )
