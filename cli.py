"""Local setup helpers. `init` creates a local API key; `bootstrap` creates a Testnet wallet."""
from __future__ import annotations

import argparse

from auth import ensure_api_key
from db import init_db


def main() -> None:
    parser = argparse.ArgumentParser(description="The Digital Mark Spaza Shop local setup")
    parser.add_argument("command", choices=("init", "bootstrap", "health"), nargs="?", default="init")
    args = parser.parse_args()
    init_db()
    key = ensure_api_key()
    if args.command == "init":
        print("Local API is ready. A private API key was written to .env with owner-only permissions.")
        return
    if args.command == "bootstrap":
        from xrpl_agent import create_and_fund_wallet, wallet_status
        result = create_and_fund_wallet()
        print(f"Testnet wallet created: {result['address']}")
        print("Test XRP only. The secret was saved locally in .env; it was not printed.")
        return
    from xrpl_agent import wallet_status
    print({"api_key_configured": bool(key), **wallet_status()})


if __name__ == "__main__":
    main()
