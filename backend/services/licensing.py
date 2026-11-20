"""
services/licensing.py — Central Subscription & License Verification System

WHY:
  Each studio/shop installation is licensed and tracked via a central API:
  GET https://darshan-seq.onrender.com/shops/status
  POST https://darshan-seq.onrender.com/shops/{shop_id}/pay

  On startup or renewal check:
  1. Matches shop by shop_id (e.g. config.SHOP_ID) or shop_name (case-insensitive).
  2. If is_active is true and not expired, grants full access to the app.
  3. If is_active is false, expired, or not found, locks the app and provides
     renewal details (shop name, expiry date, renewal fee).
  4. Grace mode: If the remote license server is unreachable (offline network),
     uses the last cached activation in local SQLite settings within a 7-day grace period.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.config import LICENSE_API_BASE, SHOP_ID, SHOP_NAME
from backend.database import get_db

logger = logging.getLogger("licensing")

# Network timeout (seconds) for license server calls
_TIMEOUT = 7

# Grace period: days the app can run offline on cached active license
_GRACE_DAYS = 7


def fetch_central_shops_status() -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    """
    Fetch all shops from GET /shops/status.
    Also enriches entries with 'id' from GET /shops if /shops/status lacks the id field.
    Returns (shops_list, error_message).
    """
    endpoint_status = f"{LICENSE_API_BASE.rstrip('/')}/shops/status"
    req_status = urllib.request.Request(endpoint_status)
    req_status.add_header("Accept", "application/json")
    req_status.add_header("User-Agent", "Bhavi-Client/2.4")

    try:
        with urllib.request.urlopen(req_status, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        shops = data.get("data", []) if isinstance(data, dict) else []
        
        # Check if id field is missing from items in /shops/status
        # If so, enrich from /shops endpoint which contains full shop details including id
        needs_id_enrichment = any("id" not in item for item in shops)
        if needs_id_enrichment:
            try:
                endpoint_all = f"{LICENSE_API_BASE.rstrip('/')}/shops"
                req_all = urllib.request.Request(endpoint_all)
                req_all.add_header("Accept", "application/json")
                with urllib.request.urlopen(req_all, timeout=_TIMEOUT) as all_resp:
                    all_data = json.loads(all_resp.read().decode("utf-8"))
                    all_shops = all_data.get("data", []) if isinstance(all_data, dict) else []
                    id_map = {
                        s.get("shop_name", "").strip().lower(): s.get("id")
                        for s in all_shops if s.get("id") is not None
                    }
                    for item in shops:
                        if "id" not in item:
                            name_key = item.get("shop_name", "").strip().lower()
                            if name_key in id_map:
                                item["id"] = id_map[name_key]
            except Exception as enrich_err:
                logger.debug(f"[LICENSE] Optional /shops id enrichment skipped: {enrich_err}")

        return shops, None

    except urllib.error.HTTPError as e:
        logger.warning(f"[LICENSE] HTTP {e.code} reaching central license server: {e}")
        return None, f"Central server HTTP {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        logger.warning(f"[LICENSE] Network error reaching central license server: {e}")
        return None, f"Network error: {e}"
    except Exception as e:
        logger.error(f"[LICENSE] Unexpected error checking central license: {e}")
        return None, str(e)


def cache_license(shop_identifier: str, is_active: bool, shop_data: Optional[Dict[str, Any]] = None) -> None:
    """Save last known license result to local SQLite settings for offline grace mode."""
    try:
        db = get_db()
        now_str = datetime.now(timezone.utc).isoformat()
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('license_shop_identifier', ?)",
            (str(shop_identifier),),
        )
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('license_is_active', ?)",
            ("true" if is_active else "false",),
        )
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('license_last_checked', ?)",
            (now_str,),
        )
        if shop_data:
            db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('license_shop_data', ?)",
                (json.dumps(shop_data),),
            )
        db.commit()
    except Exception as e:
        logger.error(f"[LICENSE] Could not cache license status in SQLite: {e}")


def get_cached_license(target_identifier: Optional[str] = None) -> Tuple[Optional[bool], bool, Optional[Dict[str, Any]]]:
    """
    Read cached license from local SQLite settings.
    If target_identifier is given, ensures the cache matches the requested shop.
    Returns (is_active: bool | None, within_grace_period: bool, cached_shop_data: dict | None).
    """
    try:
        db = get_db()
        active_row = db.execute("SELECT value FROM settings WHERE key = 'license_is_active'").fetchone()
        checked_row = db.execute("SELECT value FROM settings WHERE key = 'license_last_checked'").fetchone()
        data_row = db.execute("SELECT value FROM settings WHERE key = 'license_shop_data'").fetchone()
        ident_row = db.execute("SELECT value FROM settings WHERE key = 'license_shop_identifier'").fetchone()

        if not active_row:
            return None, False, None

        cached_shop = None
        if data_row and data_row["value"]:
            try:
                cached_shop = json.loads(data_row["value"])
            except Exception:
                pass

        # If a specific target identifier was requested, verify it matches cached record
        if target_identifier and ident_row and ident_row["value"]:
            cached_ident = str(ident_row["value"]).strip().lower()
            target_norm = str(target_identifier).strip().lower()
            matches = (cached_ident == target_norm)
            if not matches and cached_shop:
                shop_name_match = str(cached_shop.get("shop_name", "")).strip().lower() == target_norm
                id_match = str(cached_shop.get("id", "")).strip().lower() == target_norm
                matches = shop_name_match or id_match
            if not matches:
                # Cache belongs to a different shop identifier
                return None, False, None

        is_active = active_row["value"] == "true"
        within_grace = False

        if checked_row:
            try:
                last_checked = datetime.fromisoformat(checked_row["value"])
                age_days = (datetime.now(timezone.utc) - last_checked).days
                within_grace = age_days <= _GRACE_DAYS
            except Exception:
                within_grace = False

        return is_active, within_grace, cached_shop
    except Exception as e:
        logger.error(f"[LICENSE] Error reading cached license: {e}")
        return None, False, None


def verify_shop_license(
    shop_id: Optional[int] = None,
    shop_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Dynamic verification flow:
    1. Reads target identifier (either shop_id or shop_name) from config or SQLite settings.
    2. Calls GET /shops/status on central license server.
    3. Finds shop matching id === config.SHOP_ID or shop_name.toLowerCase() === config.SHOP_NAME.toLowerCase().
    4. Evaluates is_active & expiration.
    5. Returns unified status dictionary.
    """
    db = get_db()

    # Resolve target shop_id & target shop_name
    # An app uses either SHOP_ID or SHOP_NAME as its configured identifier.
    target_id: Optional[int] = shop_id
    target_name: Optional[str] = shop_name

    # If neither parameter was explicitly provided, load from config or DB settings
    if target_id is None and not target_name:
        if SHOP_ID is not None:
            target_id = SHOP_ID
        elif SHOP_NAME:
            target_name = SHOP_NAME
        else:
            db_id_row = db.execute("SELECT value FROM settings WHERE key = 'shop_id'").fetchone()
            if db_id_row and db_id_row["value"] and db_id_row["value"].isdigit():
                target_id = int(db_id_row["value"])
            else:
                db_name_row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
                if db_name_row and db_name_row["value"]:
                    target_name = db_name_row["value"]

    identifier_str = str(target_id) if target_id is not None else (target_name or "Unknown")

    # 1. Attempt live check against central license API
    shops, error = fetch_central_shops_status()

    if shops is not None:
        # Match shop in data list
        matched_shop: Optional[Dict[str, Any]] = None
        for item in shops:
            # Match by numeric ID
            if target_id is not None and item.get("id") is not None:
                try:
                    if int(item["id"]) == int(target_id):
                        matched_shop = item
                        break
                except (ValueError, TypeError):
                    pass

            # Match by case-insensitive shop name
            if target_name and item.get("shop_name"):
                if str(item["shop_name"]).strip().lower() == str(target_name).strip().lower():
                    matched_shop = item
                    break

        if matched_shop:
            # Ensure id field is preserved or attached from target_id
            if "id" not in matched_shop and target_id is not None:
                matched_shop["id"] = target_id

            is_active = bool(matched_shop.get("is_active", False))

            # Expiry date check if expires_at is present
            expires_at_str = matched_shop.get("expires_at")
            if expires_at_str and is_active:
                try:
                    exp_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    if exp_dt < datetime.now(timezone.utc):
                        is_active = False
                        logger.warning(f"[LICENSE] Shop '{matched_shop.get('shop_name')}' expired on {expires_at_str}")
                except Exception:
                    pass

            # Cache the verified status
            cache_license(identifier_str, is_active, matched_shop)

            if is_active:
                logger.info(f"[LICENSE] Active license verified for '{matched_shop.get('shop_name')}'")
                return {
                    "success": True,
                    "allowed": True,
                    "is_active": True,
                    "shop": matched_shop,
                    "message": "License active",
                    "offline": False,
                }
            else:
                logger.warning(f"[LICENSE] Inactive/expired license for '{matched_shop.get('shop_name')}'")
                return {
                    "success": True,
                    "allowed": False,
                    "is_active": False,
                    "shop": matched_shop,
                    "message": f"License for '{matched_shop.get('shop_name')}' is inactive or expired.",
                    "offline": False,
                }
        else:
            # Shop not found in registry
            fallback_shop = {
                "id": target_id,
                "shop_name": target_name or f"Shop {target_id or ''}".strip(),
                "is_active": False,
                "amount": 3000.0,
                "expires_at": "Not Registered",
            }
            cache_license(identifier_str, False, fallback_shop)
            logger.warning(f"[LICENSE] Shop '{identifier_str}' not found in central license registry.")
            return {
                "success": True,
                "allowed": False,
                "is_active": False,
                "shop": fallback_shop,
                "message": f"Shop '{identifier_str}' was not found in the central license registry.",
                "offline": False,
            }

    # 2. Central API is unreachable (no internet or network failure) -> Fallback to local SQLite cache
    cached_active, within_grace, cached_shop = get_cached_license(target_identifier=identifier_str)

    if cached_active is not None and cached_active and within_grace:
        logger.info(f"[LICENSE] Offline grace mode active for '{identifier_str}' within {_GRACE_DAYS} days.")
        return {
            "success": True,
            "allowed": True,
            "is_active": True,
            "shop": cached_shop or {"shop_name": target_name or "Your Studio", "is_active": True},
            "message": f"Offline grace mode — verified within {_GRACE_DAYS} days.",
            "offline": True,
        }

    # Grace period expired or never cached
    msg = (
        "Could not verify your subscription online (no internet connection). "
        f"Please connect to the internet to verify your license."
        if cached_active is None
        else f"Your license verification is offline and exceeded the {_GRACE_DAYS}-day grace period."
    )
    logger.warning(f"[LICENSE] Locked out: {msg}")
    return {
        "success": False,
        "allowed": False,
        "is_active": False,
        "shop": cached_shop or {"shop_name": target_name or "Your Studio", "amount": 3000.0, "expires_at": "Offline"},
        "message": msg,
        "offline": True,
    }


def initiate_shop_payment(shop_id: int, customer_phone: str = "9999999999") -> Dict[str, Any]:
    """
    Sends POST /shops/{shop_id}/pay to central API and retrieves checkoutUrl.
    """
    endpoint = f"{LICENSE_API_BASE.rstrip('/')}/shops/{int(shop_id)}/pay"
    if customer_phone:
        endpoint += f"?customer_phone={urllib.parse.quote(str(customer_phone).strip())}"

    req = urllib.request.Request(endpoint, data=b"", method="POST")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "Bhavi-Client/2.4")

    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return {
            "success": True,
            "order_id": data.get("order_id"),
            "amount": data.get("amount"),
            "shop_id": data.get("shop_id", shop_id),
            "payment_data": data.get("payment_data", {}),
            "checkoutUrl": (
                data.get("payment_data", {}).get("checkoutUrl")
                or data.get("checkoutUrl")
            ),
        }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        logger.error(f"[LICENSE] HTTP {e.code} initiating payment for shop {shop_id}: {err_body}")
        return {
            "success": False,
            "message": f"Payment initiation failed (HTTP {e.code}): {e.reason}",
            "detail": err_body,
        }
    except Exception as e:
        logger.error(f"[LICENSE] Exception initiating payment for shop {shop_id}: {e}")
        return {
            "success": False,
            "message": f"Network error connecting to payment gateway: {str(e)}",
        }


def check_license(shop_name: str) -> Tuple[bool, str]:
    """
    Backwards-compatible helper for legacy callers.
    Returns (allowed: bool, message: str).
    """
    result = verify_shop_license(shop_name=shop_name)
    return bool(result.get("allowed", False)), result.get("message", "License verified")
