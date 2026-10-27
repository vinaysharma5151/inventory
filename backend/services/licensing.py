"""
services/licensing.py — Supabase License Activation Check

WHY:
  This app is sold to multiple shops. Each shop's license is controlled
  from a central Supabase table (shop_licenses). On every startup, the
  app calls Supabase to confirm is_active = true for this shop_name.

  Grace mode: if Supabase is unreachable (no internet), the app uses the
  last cached activation result stored in the local SQLite settings table.
  This prevents locking out shops with temporarily bad internet.

Supabase table expected:
  shop_licenses (shop_name TEXT UNIQUE, is_active BOOLEAN, notes TEXT, expires_at TIMESTAMPTZ)
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Optional, Tuple

from backend.config import SUPABASE_ANON_KEY, SUPABASE_URL
from backend.database import get_db

logger = logging.getLogger("licensing")

# How long (seconds) to wait for Supabase before timing out
_TIMEOUT = 6

# Grace period: days the app can run offline on cached activation
_GRACE_DAYS = 7


def _fetch_license_from_supabase(shop_name: str) -> Tuple[Optional[bool], Optional[str]]:
    """
    Call Supabase REST API and check is_active for the given shop_name.
    Queries 'shops' table first, falling back to 'shop_licenses' if needed.
    Returns (is_active: bool | None, error_message: str | None).
    None means the request failed due to network / connectivity issues.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        logger.warning("[LICENSE] Supabase credentials not configured — skipping online check.")
        return None, "Supabase not configured"

    quoted_name = urllib.parse.quote(shop_name.strip())
    # Tables to try in priority order ('shops' is the user's primary Supabase table)
    tables_to_try = ["shops", "shop_licenses"]
    last_err: Optional[Exception] = None

    for table in tables_to_try:
        endpoint = (
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
            f"?shop_name=ilike.{quoted_name}"
            f"&select=shop_name,is_active"
            f"&limit=1"
        )
        req = urllib.request.Request(endpoint)
        req.add_header("apikey", SUPABASE_ANON_KEY)
        req.add_header("Authorization", f"Bearer {SUPABASE_ANON_KEY}")
        req.add_header("Accept", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            
            # Request succeeded against this table!
            if not data:
                # shop_name not registered yet in Supabase — automatically register it!
                logger.info(f"[LICENSE] Shop '{shop_name}' not found in Supabase '{table}'. Auto-registering...")
                reg_ok, reg_msg = register_shop_in_supabase(shop_name)
                logger.info(f"[LICENSE] Auto-registration result: {reg_ok} ({reg_msg})")
                return False, f"Shop '{shop_name}' is registered in Supabase but is inactive. Please ask your administrator to set is_active=true."

            row = data[0]
            is_active = bool(row.get("is_active", False))

            # Optional expiry check if expires_at column exists
            expires_at = row.get("expires_at")
            if expires_at and is_active:
                try:
                    exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                    if exp < datetime.now(timezone.utc):
                        logger.warning(f"[LICENSE] License for '{shop_name}' has expired on {expires_at}.")
                        return False, f"Your license expired on {exp.strftime('%d %b %Y')}. Contact administrator to renew."
                except Exception:
                    pass

            return is_active, None

        except urllib.error.HTTPError as e:
            if e.code == 404:
                # Table doesn't exist under this name, try next candidate
                last_err = e
                continue
            logger.warning(f"[LICENSE] HTTP {e.code} reaching Supabase table '{table}': {e}")
            return None, f"Supabase HTTP error {e.code}: {e.reason}"
        except urllib.error.URLError as e:
            logger.warning(f"[LICENSE] Network error reaching Supabase: {e}")
            return None, f"Network error: {e}"
        except Exception as e:
            logger.error(f"[LICENSE] Unexpected error checking license in '{table}': {e}")
            return None, str(e)

    return None, f"Supabase table not found: {last_err}"


def _cache_license(shop_name: str, is_active: bool) -> None:
    """Save the last known license result to local SQLite for offline grace mode."""
    try:
        db = get_db()
        now_str = datetime.now(timezone.utc).isoformat()
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('license_shop_name', ?)",
            (shop_name,),
        )
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('license_is_active', ?)",
            ("true" if is_active else "false",),
        )
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('license_last_checked', ?)",
            (now_str,),
        )
        db.commit()
    except Exception as e:
        logger.error(f"[LICENSE] Could not cache license status: {e}")


def _get_cached_license() -> Tuple[Optional[bool], bool]:
    """
    Read cached license from SQLite.
    Returns (is_active: bool | None, within_grace_period: bool).
    """
    try:
        db = get_db()
        active_row = db.execute(
            "SELECT value FROM settings WHERE key = 'license_is_active'"
        ).fetchone()
        checked_row = db.execute(
            "SELECT value FROM settings WHERE key = 'license_last_checked'"
        ).fetchone()

        if not active_row:
            return None, False

        is_active = active_row["value"] == "true"

        if checked_row:
            try:
                last_checked = datetime.fromisoformat(checked_row["value"])
                age_days = (datetime.now(timezone.utc) - last_checked).days
                within_grace = age_days <= _GRACE_DAYS
            except Exception:
                within_grace = False
        else:
            within_grace = False

        return is_active, within_grace
    except Exception as e:
        logger.error(f"[LICENSE] Error reading cached license: {e}")
        return None, False


def check_license(shop_name: str) -> Tuple[bool, str]:
    """
    Main entry point — call this on every app startup.

    Returns:
        (allowed: bool, message: str)
        allowed=True  → app can open
        allowed=False → show blocking screen with message
    """
    if not shop_name or not shop_name.strip():
        # App not set up yet — let the setup wizard run first
        return True, "Setup not completed yet"

    shop_name = shop_name.strip()
    logger.info(f"[LICENSE] Checking license for: '{shop_name}'")

    # 1. Try live Supabase check
    is_active, error = _fetch_license_from_supabase(shop_name)

    if is_active is not None:
        # Got a live response — cache it and use it
        _cache_license(shop_name, is_active)
        if is_active:
            logger.info(f"[LICENSE] ✅ Active license confirmed for '{shop_name}'")
            return True, "License active"
        else:
            msg = error or f"Your license for '{shop_name}' is inactive. Contact your vendor to activate."
            logger.warning(f"[LICENSE] ❌ Inactive license for '{shop_name}': {msg}")
            return False, msg

    # 2. Supabase unreachable — fall back to cache
    cached_active, within_grace = _get_cached_license()

    if cached_active is None:
        # Never activated before AND can't reach Supabase
        logger.warning(f"[LICENSE] No cached license and Supabase unreachable.")
        return False, (
            "Could not verify your license (no internet connection). "
            "Please connect to the internet and restart the app."
        )

    if cached_active and within_grace:
        logger.info(f"[LICENSE] 🌐 Offline grace mode — using cached active license for '{shop_name}'")
        return True, f"Grace mode — license verified offline (cached within {_GRACE_DAYS} days)"

    if cached_active and not within_grace:
        logger.warning(f"[LICENSE] ⏰ Grace period expired — cached license too old.")
        return False, (
            f"Your license could not be verified online for more than {_GRACE_DAYS} days. "
            "Please connect to the internet to reactivate."
        )

    # Cached as inactive
    return False, (
        f"Your license for '{shop_name}' is inactive. "
        "Contact your vendor to activate your subscription."
    )


def register_shop_in_supabase(shop_name: str) -> Tuple[bool, str]:
    """
    Registers the shop_name in Supabase with is_active=false.
    Tries 'shops' table first, falling back to 'shop_licenses'.
    This is a best-effort call; failure does not crash the app.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False, "Supabase not configured"

    clean_name = shop_name.strip()
    tables_to_try = ["shops", "shop_licenses"]

    for table in tables_to_try:
        endpoint = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
        payload_dict = {
            "shop_name": clean_name,
            "is_active": False,
        }
        payload = json.dumps(payload_dict).encode("utf-8")

        req = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("apikey", SUPABASE_ANON_KEY)
        req.add_header("Authorization", f"Bearer {SUPABASE_ANON_KEY}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=minimal,resolution=ignore-duplicates")

        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                status = resp.status
            if status in (200, 201, 204):
                logger.info(f"[LICENSE] Registered '{clean_name}' in Supabase table '{table}' (pending activation).")
                return True, "Registered successfully"
            else:
                return False, f"Unexpected status {status}"
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 404:
                # Try next table candidate
                continue
            if e.code == 409 or "duplicate" in body.lower():
                logger.info(f"[LICENSE] '{clean_name}' already registered in Supabase '{table}'.")
                return True, "Already registered"
            logger.warning(f"[LICENSE] HTTP {e.code} registering '{clean_name}' in '{table}': {body}")
            return False, f"HTTP {e.code}: {body}"
        except Exception as e:
            logger.warning(f"[LICENSE] Could not register shop in '{table}' (network issue): {e}")
            return False, str(e)

    return False, "Could not register shop in Supabase (table not found)"


# Needed for urllib.parse.quote used inside _fetch_license_from_supabase
import urllib.parse  # noqa: E402 (imported at module level for clarity)
