"""Cached live XRP quotes in local currencies, with a dated cross-rate fallback."""
from __future__ import annotations

import time
from datetime import datetime

import httpx

_currencies = ("ZAR", "NGN", "KES", "GHS", "EGP", "UGX", "TZS", "ZMW", "BWP", "NAD", "LSL", "SZL", "XOF", "XAF")
_cache: dict = {"rates": {}, "updated_at": None, "fx_updated_at": None, "expires": 0.0, "stale": True, "source": ""}
_xrp_cache: dict = {"usd": None, "updated_at": None, "expires": 0.0}
_fiat_cache: dict = {"rates": {}, "updated_at": None, "expires": 0.0}


def _get_direct_market_rates() -> tuple[dict[str, float], int | None]:
    response = httpx.get(
        "https://api.coingecko.com/api/v3/simple/price",
        params={"ids": "ripple", "vs_currencies": ",".join(code.lower() for code in _currencies), "include_last_updated_at": "true"},
        timeout=6,
    )
    response.raise_for_status()
    payload = response.json()["ripple"]
    rates = {code.lower(): float(payload[code.lower()]) for code in _currencies if code.lower() in payload and float(payload[code.lower()]) > 0}
    if "zar" not in rates:
        raise ValueError("The live XRP/ZAR market quote is missing")
    updated = payload.get("last_updated_at")
    updated_at = int(updated) if updated else int(time.time())
    return rates, updated_at


def _get_cross_rates(now: float) -> tuple[dict[str, float], int | None, int | None, bool]:
    if now >= float(_xrp_cache["expires"]):
        try:
            response = httpx.get("https://api.coinpaprika.com/v1/tickers/xrp-xrp", timeout=6)
            response.raise_for_status()
            payload = response.json()
            price = float(payload["quotes"]["USD"]["price"])
            if price <= 0:
                raise ValueError("The live XRP/USD quote is invalid")
            updated = payload.get("last_updated")
            updated_at = int(datetime.fromisoformat(updated.replace("Z", "+00:00")).timestamp()) if updated else int(time.time())
            _xrp_cache.update({"usd": price, "updated_at": updated_at, "expires": now + 90})
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            _xrp_cache["expires"] = now + 30
    if not _fiat_cache["rates"] or now >= float(_fiat_cache["expires"]):
        try:
            response = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=6)
            response.raise_for_status()
            payload = response.json()
            if payload.get("result") != "success":
                raise ValueError("The currency service did not return current rates")
            _fiat_cache.update({"rates": payload["rates"], "updated_at": payload.get("time_last_update_unix"), "expires": now + 43200})
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            _fiat_cache["expires"] = now + 300
    if not _xrp_cache["usd"] or not _fiat_cache["rates"]:
        raise ValueError("No live XRP/currency quote is available")
    fiat = _fiat_cache["rates"]
    rates = {code.lower(): float(_xrp_cache["usd"]) * float(fiat[code]) for code in _currencies if code in fiat and float(fiat[code]) > 0}
    if "zar" not in rates:
        raise ValueError("No live XRP/ZAR conversion is available")
    current_time = int(time.time())
    xrp_time = int(_xrp_cache["updated_at"] or 0)
    fiat_time = int(_fiat_cache["updated_at"] or 0)
    stale = current_time - xrp_time > 180 or current_time - fiat_time > 129600
    return rates, _xrp_cache["updated_at"], _fiat_cache["updated_at"], stale


def get_rate(force_refresh: bool = False) -> dict:
    now = time.monotonic()
    if force_refresh or now >= float(_cache["expires"]):
        try:
            rates, updated_at = _get_direct_market_rates()
            _cache.update({"rates": rates, "updated_at": updated_at, "fx_updated_at": None, "expires": now + 30, "stale": time.time() - updated_at > 180, "source": "CoinGecko live XRP/local-currency market quote"})
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            try:
                rates, updated_at, fiat_updated_at, stale = _get_cross_rates(now)
                _cache.update({"rates": rates, "updated_at": updated_at, "fx_updated_at": fiat_updated_at, "expires": now + 30, "stale": stale, "source": "CoinPaprika XRP/USD + ExchangeRate-API local-currency reference"})
            except (httpx.HTTPError, KeyError, TypeError, ValueError):
                _cache.update({"expires": now + 30, "stale": True})
    rates = dict(_cache["rates"])
    source = _cache["source"] if not _cache["stale"] else (f"last available live quote · {_cache['source']}" if rates else "live rate unavailable")
    return {
        "rates": rates,
        "rate_zar_per_xrp": float(rates["zar"]) if "zar" in rates else None,
        "updated_at": _cache["updated_at"],
        "fx_updated_at": _cache["fx_updated_at"],
        "currencies": list(rates),
        "source": source,
        "stale": bool(_cache["stale"]),
    }
