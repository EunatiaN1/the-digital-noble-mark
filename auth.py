"""Shared API key protection for state-changing local API endpoints."""
from __future__ import annotations

import hmac
import os
import secrets
from pathlib import Path

from fastapi import Header, HTTPException, status

from config import ROOT, settings


def generate_api_key() -> str:
    return secrets.token_urlsafe(32)


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not settings.api_key:
        raise HTTPException(status_code=503, detail="Local API key is not initialized. Run `python cli.py init`.")
    if x_api_key is None or not hmac.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid API key.")


def set_api_key(key: str) -> None:
    env_path = ROOT / ".env"
    lines = env_path.read_text().splitlines() if env_path.exists() else []
    lines = [line for line in lines if not line.strip().startswith("THEE_SPAZA_API_KEY=")]
    lines.append(f'THEE_SPAZA_API_KEY="{key}"')
    env_path.write_text("\n".join(lines).rstrip() + "\n")
    os.chmod(env_path, 0o600)
    os.environ["THEE_SPAZA_API_KEY"] = key
    settings.api_key = key


def ensure_api_key() -> str:
    if settings.api_key:
        return settings.api_key
    key = generate_api_key()
    set_api_key(key)
    return key
