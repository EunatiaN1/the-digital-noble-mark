"""Local, Testnet-only configuration for The Digital Mark Spaza Shop."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

TESTNET_RPC = "https://s.altnet.rippletest.net:51234"
TESTNET_WS = "wss://s.altnet.rippletest.net:51233"
TESTNET_FAUCET = "https://faucet.altnet.rippletest.net/accounts"


@dataclass
class Settings:
    network: str = os.getenv("XRPL_NETWORK", "testnet").strip().lower()
    endpoint: str = TESTNET_RPC
    websocket_endpoint: str = TESTNET_WS
    faucet_url: str = TESTNET_FAUCET
    seed: str = os.getenv("XRPL_SEED", "").strip().strip('"').strip("'")
    api_key: str = os.getenv("THEE_SPAZA_API_KEY", "").strip()
    paystack_secret_key: str = os.getenv("PAYSTACK_SECRET_KEY", "").strip()
    demo_mode: bool = os.getenv("SPAZA_DEMO_MODE", "false").strip().lower() in {"1", "true", "yes"}
    database: Path = Path(os.getenv("SPAZA_DB_PATH", str(ROOT / "spaza.sqlite3")))
    host: str = os.getenv("API_HOST", "127.0.0.1").strip()
    port: int = int(os.getenv("API_PORT", "8000"))
    daily_cap_xrp: float = 100.0
    max_fee_xrp: float = 0.001
    policy_version: str = os.getenv("AGENT_POLICY_VERSION", "20261107")[:40]
    source_tag: int = int(os.getenv("AGENT_SOURCE_TAG", "20260530"))
    fx_fallback_zar_per_xrp: float = 18.5

    def __post_init__(self) -> None:
        if self.network != "testnet":
            raise ValueError("This build is locked to XRPL Testnet. Mainnet is not supported.")
        if self.host not in {"127.0.0.1", "localhost"}:
            raise ValueError("The local demo API must bind to loopback (127.0.0.1).")
        if not 0 <= self.source_tag <= 0xFFFFFFFF:
            raise ValueError("AGENT_SOURCE_TAG must fit in an unsigned 32-bit integer.")


settings = Settings()
