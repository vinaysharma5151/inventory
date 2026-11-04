"""
services/whatsapp.py — OpenWA Gateway Direct Messaging Service.

WHY:
Enables direct 1-click automated WhatsApp message dispatch through the self-hosted
OpenWA Gateway (rmyndharis/OpenWA API). Eliminates reliance on Meta Developer Apps,
paid Cloud API templates, and manual wa.me browser popups.

Zero external Python dependencies (uses standard library urllib.request).
"""

from __future__ import annotations

import base64
import json
import logging
import mimetypes
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.config import LOGS_DIR, UPLOADS_DIR
from backend.database import get_db

logger = logging.getLogger("whatsapp")
logger.setLevel(logging.INFO)

# User-Agent header (prevents reverse-proxies / WAFs from blocking python-urllib)
HTTP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

# Default pre-configured OpenWA credentials
DEFAULT_OPENWA_SERVER_URL = "https://whatsapp.ajjidihatti.com"
DEFAULT_OPENWA_API_KEY = "owa_k1_34994de68ea8f5cefb0a24b24ffbdc16ffdd2ee3979283b68b794e3ed6f43259"


def format_phone_number(phone_raw: Optional[str]) -> Optional[str]:
    """
    Sanitize and normalize customer phone number to WhatsApp international standard.
    - 10 digits (e.g. 9876543210) -> prepends country code '91' -> 919876543210.
    - 11 digits starting with 0 -> strips leading 0 and prepends '91'.
    - If already includes country code (e.g. +919876543210 or 919876543210), keeps digits.
    - Returns None if phone number has fewer than 10 digits.
    """
    if not phone_raw:
        return None

    digits = re.sub(r"\D", "", str(phone_raw).strip())

    if len(digits) == 10:
        return f"91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        return f"91{digits[1:]}"
    elif len(digits) >= 11:
        return digits
    else:
        return None


def get_shop_name() -> str:
    """Retrieve shop name from SQLite database settings."""
    try:
        db = get_db()
        db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
        if row and row["value"]:
            return row["value"].strip()
    except Exception as e:
        logger.error(f"[WHATSAPP] Failed to load shop name: {e}")
    return "Bridal Studio"


def get_openwa_credentials() -> Dict[str, str]:
    """
    Retrieve OpenWA Server URL, API Key, and optional selected Session ID from SQLite settings,
    falling back to verified default credentials.
    """
    try:
        db = get_db()
        db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        rows = db.execute("SELECT key, value FROM settings WHERE key LIKE 'openwa_%'").fetchall()
        settings_map = {row["key"]: row["value"] for row in rows}

        server_url = (settings_map.get("openwa_server_url") or "").strip().rstrip("/")
        if not server_url:
            server_url = DEFAULT_OPENWA_SERVER_URL

        api_key = (settings_map.get("openwa_api_key") or "").strip()
        if not api_key:
            api_key = DEFAULT_OPENWA_API_KEY

        session_id = (settings_map.get("openwa_session_id") or "").strip()

        return {
            "server_url": server_url,
            "api_key": api_key,
            "session_id": session_id,
        }
    except Exception as e:
        logger.error(f"[WHATSAPP] Failed to load OpenWA settings: {e}")
        return {
            "server_url": DEFAULT_OPENWA_SERVER_URL,
            "api_key": DEFAULT_OPENWA_API_KEY,
            "session_id": "",
        }


def save_openwa_credentials(
    server_url: str,
    api_key: str,
    session_id: Optional[str] = None,
) -> bool:
    """Save OpenWA Server credentials in SQLite settings."""
    try:
        db = get_db()
        db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        pairs = [
            ("openwa_server_url", (server_url or "").strip().rstrip("/")),
            ("openwa_api_key", (api_key or "").strip()),
            ("openwa_session_id", (session_id or "").strip()),
        ]
        for k, v in pairs:
            db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v))
        db.commit()
        return True
    except Exception as e:
        logger.error(f"[WHATSAPP] Failed to save OpenWA credentials: {e}")
        return False


def get_openwa_sessions(
    server_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Tuple[bool, List[Dict[str, Any]], str]:
    """
    Queries OpenWA GET /api/sessions to list active WhatsApp instances.
    Returns (success, sessions_list, message).
    """
    creds = get_openwa_credentials()
    target_url = (server_url or creds["server_url"]).rstrip("/")
    target_key = api_key or creds["api_key"]

    if not target_url or not target_key:
        return False, [], "OpenWA Server URL or API Key is missing."

    url = f"{target_url}/api/sessions"
    req = urllib.request.Request(
        url,
        headers={
            "X-API-Key": target_key,
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            if isinstance(data, list):
                return True, data, "Sessions retrieved successfully"
            return True, [], "No sessions found"
    except urllib.error.HTTPError as he:
        try:
            err_body = he.read().decode("utf-8")
            err_json = json.loads(err_body)
            err_msg = err_json.get("message") or f"HTTP {he.code}"
        except Exception:
            err_msg = f"HTTP {he.code} {he.reason}"
        logger.error(f"[WHATSAPP] OpenWA query sessions HTTP error: {err_msg}")
        return False, [], f"OpenWA error: {err_msg}"
    except Exception as ex:
        logger.error(f"[WHATSAPP] OpenWA query sessions network error: {ex}")
        return False, [], f"Network error connecting to OpenWA: {ex}"


def get_openwa_active_session(
    server_url: Optional[str] = None,
    api_key: Optional[str] = None,
    session_id_override: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Finds the active/ready WhatsApp session.
    Prioritizes a session with status == 'ready'.
    """
    creds = get_openwa_credentials()
    target_sid = session_id_override or creds.get("session_id")

    ok, sessions, _ = get_openwa_sessions(server_url, api_key)
    if not ok or not sessions:
        return None

    # If specific session configured, check if it exists
    if target_sid:
        for s in sessions:
            if s.get("id") == target_sid:
                return s

    # Otherwise auto-pick the first 'ready' session
    for s in sessions:
        if s.get("status") == "ready":
            return s

    # Fallback to first session if none marked ready
    return sessions[0] if sessions else None


def get_whatsapp_config() -> Dict[str, Any]:
    """
    Returns full OpenWA gateway configuration and live connection status.
    Used by dashboard indicators, modals, and settings screens.
    """
    creds = get_openwa_credentials()
    server_url = creds["server_url"]
    api_key = creds["api_key"]
    session = get_openwa_active_session()

    masked_key = ""
    if api_key:
        masked_key = f"{api_key[:8]}...{api_key[-6:]}" if len(api_key) > 16 else "Configured"

    is_ready = bool(session and session.get("status") == "ready")

    return {
        "enabled": True,
        "mode": "openwa",
        "gateway": "OpenWA Self-Hosted API",
        "server_url": server_url,
        "has_api_key": bool(api_key),
        "masked_key": masked_key,
        "session_id": session.get("id") if session else None,
        "session_name": session.get("name") if session else None,
        "session_status": session.get("status") if session else "disconnected",
        "connected_phone": session.get("phone") if session else None,
        "push_name": session.get("pushName") if session else None,
        "is_ready": is_ready,
        "shop_name": get_shop_name(),
    }


def send_openwa_message(
    to_phone: str,
    message_text: str,
    image_path: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Dispatches a WhatsApp message directly via the OpenWA REST API gateway.
    - Formats target to '{phone}@c.us'.
    - If image_path exists, dispatches via POST /api/sessions/:sessionId/messages/send-image
      with base64 payload and e-bill caption.
    - Otherwise dispatches via POST /api/sessions/:sessionId/messages/send-text.
    """
    clean_phone = format_phone_number(to_phone)
    if not clean_phone:
        return False, "Invalid recipient phone number (must be at least 10 digits).", None

    creds = get_openwa_credentials()
    server_url = creds["server_url"].rstrip("/")
    api_key = creds["api_key"]

    session = get_openwa_active_session()
    if not session:
        return False, "No active WhatsApp session found on OpenWA server. Please verify gateway settings.", None

    if session.get("status") != "ready":
        return False, f"OpenWA session '{session.get('name', 'default')}' is not ready (current status: {session.get('status')}).", session

    session_id = session["id"]
    chat_id = f"{clean_phone}@c.us"

    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json",
        "User-Agent": HTTP_USER_AGENT,
        "Accept": "application/json",
    }

    # Resolve local garment image if available
    resolved_image_file: Optional[Path] = None
    if image_path:
        file_name = Path(image_path).name
        candidates = [
            UPLOADS_DIR / file_name,
            Path(image_path),
            Path.cwd() / str(image_path).lstrip("/\\"),
        ]
        for cand in candidates:
            if cand.exists() and cand.is_file() and cand.stat().st_size <= 10 * 1024 * 1024:
                resolved_image_file = cand
                break

    # Case 1: Send Image with e-bill caption (if photo available and caption <= 1024 chars)
    if resolved_image_file:
        try:
            with open(resolved_image_file, "rb") as f:
                img_bytes = f.read()
            b64_str = base64.b64encode(img_bytes).decode("utf-8")
            mime_type, _ = mimetypes.guess_type(str(resolved_image_file))
            if not mime_type or not mime_type.startswith("image/"):
                mime_type = "image/jpeg"

            caption = message_text if len(message_text) <= 1024 else f"{get_shop_name()} — Garment Booking Receipt"

            payload = {
                "chatId": chat_id,
                "base64": b64_str,
                "mimetype": mime_type,
                "caption": caption,
            }

            url = f"{server_url}/api/sessions/{session_id}/messages/send-image"
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                res_body = json.loads(resp.read().decode("utf-8"))
                msg_id = res_body.get("messageId") or "sent"
                logger.info(f"[WHATSAPP] OpenWA image e-bill dispatched to {chat_id}, id={msg_id}")

            # If the full text didn't fit in caption, follow up with complete text
            if len(message_text) > 1024:
                text_payload = {"chatId": chat_id, "text": message_text}
                text_url = f"{server_url}/api/sessions/{session_id}/messages/send-text"
                req2 = urllib.request.Request(
                    text_url,
                    data=json.dumps(text_payload).encode("utf-8"),
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req2, timeout=15) as resp2:
                    pass

            return True, f"E-Bill & Garment photo sent successfully to +{clean_phone} via OpenWA!", res_body
        except Exception as img_err:
            logger.warning(f"[WHATSAPP] Failed to send image via OpenWA ({img_err}), falling back to text send.")

    # Case 2: Send Text Message
    payload = {
        "chatId": chat_id,
        "text": message_text,
    }
    url = f"{server_url}/api/sessions/{session_id}/messages/send-text"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            res_json = json.loads(body)
            msg_id = res_json.get("messageId") or "sent"
            logger.info(f"[WHATSAPP] OpenWA text message dispatched to {chat_id}, id={msg_id}")
            return True, f"Message sent successfully to +{clean_phone} via OpenWA!", res_json
    except urllib.error.HTTPError as http_err:
        try:
            err_body = http_err.read().decode("utf-8")
            err_json = json.loads(err_body)
            err_msg = err_json.get("message") or f"HTTP {http_err.code}"
        except Exception:
            err_msg = f"HTTP {http_err.code} {http_err.reason}"
        logger.error(f"[WHATSAPP] OpenWA HTTP error: {err_msg}")
        return False, f"OpenWA server error: {err_msg}", None
    except urllib.error.URLError as url_err:
        logger.error(f"[WHATSAPP] OpenWA network error: {url_err}")
        return False, f"Network error connecting to OpenWA: {url_err.reason}", None
    except Exception as exc:
        logger.error(f"[WHATSAPP] OpenWA unexpected error: {exc}")
        return False, f"Failed to send message via OpenWA: {exc}", None


def format_outfit_display(
    title_raw: Optional[str],
    category_raw: Optional[str],
    customer_name: Optional[str] = None,
) -> str:
    """
    Format outfit description for WhatsApp templates.
    Appends 'Lehenga' for categories 'Bridal', 'Reception', and 'Casual'.
      - 'Bridal' -> 'Bridal Lehenga'
      - 'Reception' -> 'Reception Lehenga'
      - 'Casual' -> 'Casual Lehenga'
    """
    raw_cat = str(category_raw or "Bridal").strip().replace("–", "-").replace("—", "-")
    cat_lower = raw_cat.lower()

    lehenga_map = {
        "bridal": "Bridal Lehenga",
        "reception": "Reception Lehenga",
        "casual": "Casual Lehenga",
    }

    category_display = lehenga_map.get(cat_lower, raw_cat)

    raw_title = str(title_raw or "").strip().replace("–", "-").replace("—", "-")
    cust_clean = str(customer_name or "").strip()

    if (
        not raw_title
        or raw_title.startswith("Booking -")
        or raw_title.startswith("Booking –")
        or (cust_clean and raw_title.lower() == cust_clean.lower())
        or raw_title.lower() == cat_lower
        or raw_title.lower() == category_display.lower()
    ):
        return category_display

    if "lehenga" in raw_title.lower() or "lengha" in raw_title.lower():
        return raw_title

    return f"{raw_title} ({category_display})"


def generate_ebill_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate short, friendly booking confirmation message with terms (Message 1)."""
    store_name = shop_name or get_shop_name()
    customer_name = (article.get("customer_name") or "Valued Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip()
    item_display = format_outfit_display(article.get("title"), article.get("category"), customer_name)
    pickup_date = article.get("pickup_date") or "N/A"
    return_date = article.get("return_date") or "N/A"

    price = float(article.get("price") or 0)
    advance = float(article.get("advance_amount") or 0)
    balance = float(
        article.get("balance_amount")
        if article.get("balance_amount") is not None
        else max(0.0, price - advance)
    )

    has_j = int(article.get("has_jewellery") or 0) == 1
    jewel_line = ""
    if has_j:
        j_det = (article.get("jewellery_details") or "Matching Set").strip() or "Matching Set"
        j_pr = float(article.get("jewellery_price") or 0)
        jewel_extra = f" (+₹{j_pr:,.0f})" if j_pr > 0 else ""
        jewel_line = f"💍 *Jewellery:* {j_det}{jewel_extra}\n"

    balance_line = (
        "✅ *Balance:* ₹0 (Paid in Full)"
        if balance <= 0
        else f"⏳ *Balance Due:* ₹{balance:,.0f}"
    )

    text = (
        f"✨ *BOOKING CONFIRMED* ✨\n"
        f"*{store_name.upper()}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Dear *{customer_name}*, thank you for booking with us!\n\n"
        f"👗 *Outfit:* {item_display}\n"
        f"{jewel_line}"
        f"🗓 *Booking ID:* #{art_id}\n"
        f"📅 *Pickup Date:* {pickup_date}\n"
        f"🔄 *Return Date:* {return_date}\n"
        f"💰 *Rent:* ₹{price:,.0f} | *Advance:* ₹{advance:,.0f}\n"
        f"{balance_line}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📌 *Please Note:*\n"
        f"• No alterations after booking.\n"
        f"• Please return on or before {return_date}. Late returns will be charged ₹300/day.\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📞 *Contact:* 9541004204\n"
        f"🙏 *Thank you!* See you on pickup day."
    )
    return text


def generate_pickup_reminder_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate short, friendly pickup reminder message sent 1 day before pickup (Message 2)."""
    store_name = shop_name or get_shop_name()
    customer_name = (article.get("customer_name") or "Valued Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip()
    item_display = format_outfit_display(article.get("title"), article.get("category"), customer_name)
    pickup_date = article.get("pickup_date") or "N/A"

    price = float(article.get("price") or 0)
    advance = float(article.get("advance_amount") or 0)
    balance = float(
        article.get("balance_amount")
        if article.get("balance_amount") is not None
        else max(0.0, price - advance)
    )

    balance_line = (
        "✅ *Balance:* ₹0 (Paid in Full)"
        if balance <= 0
        else f"💰 *Balance Due:* ₹{balance:,.0f}"
    )

    text = (
        f"🌸 *PICKUP REMINDER* 🌸\n"
        f"*{store_name.upper()}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Dear *{customer_name}*,\n\n"
        f"Your outfit is ready for pickup *TOMORROW*!\n\n"
        f"👗 *Outfit:* {item_display}\n"
        f"🗓 *Booking ID:* #{art_id}\n"
        f"📅 *Pickup Date:* {pickup_date}\n"
        f"{balance_line}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📞 *Contact:* 9541004204\n"
        f"🙏 *Thank you!* We look forward to seeing you tomorrow."
    )
    return text


def generate_return_reminder_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate short, friendly return reminder message sent 1 day before return date (Message 3)."""
    store_name = shop_name or get_shop_name()
    customer_name = (article.get("customer_name") or "Valued Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip()
    item_display = format_outfit_display(article.get("title"), article.get("category"), customer_name)
    return_date = article.get("return_date") or "N/A"

    text = (
        f"💫 *RETURN REMINDER* 💫\n"
        f"*{store_name.upper()}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Dear *{customer_name}*,\n\n"
        f"We hope you loved your outfit! A quick reminder that your return is scheduled for *TOMORROW*.\n\n"
        f"👗 *Outfit:* {item_display}\n"
        f"🗓 *Booking ID:* #{art_id}\n"
        f"🔄 *Return Date:* {return_date}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📌 *Please Note:*\n"
        f"Kindly return on or before tomorrow to avoid late charges of *₹300/day*.\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📞 *Contact:* 9541004204\n"
        f"🙏 *Thank you for choosing us!*"
    )
    return text


def send_booking_ebill(
    article_id: int,
    phone_override: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Finds article and dispatches booking confirmation e-bill with outfit photo directly via OpenWA.
    """
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        return False, "Article not found", None

    article = dict(row)
    target_phone = phone_override or article.get("customer_phone") or article.get("customer_alt_phone")
    if not target_phone:
        return False, "No customer phone number found for this booking.", None

    shop_title = get_shop_name()
    ebill_text = generate_ebill_text(article, shop_title)
    image_path = article.get("image_path")

    return send_openwa_message(target_phone, ebill_text, image_path)


def send_pickup_reminder_for_article(
    article_id: int,
    phone_override: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Sends a pickup reminder message for a specific article via OpenWA
    and marks pickup_reminder_sent = 1.
    """
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        return False, "Article not found", None

    article = dict(row)
    target_phone = phone_override or article.get("customer_phone") or article.get("customer_alt_phone")
    if not target_phone:
        return False, "No customer phone number found for this booking.", None

    clean_phone = format_phone_number(target_phone)
    if not clean_phone:
        return False, "Invalid recipient phone number.", None

    shop_title = get_shop_name()
    reminder_text = generate_pickup_reminder_text(article, shop_title)

    success, msg, api_res = send_openwa_message(target_phone, reminder_text)
    if success:
        db.execute("UPDATE articles SET pickup_reminder_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (article_id,))
        db.commit()
        return True, f"Pickup reminder sent successfully to +{clean_phone} via OpenWA!", api_res
    return False, msg, api_res


def send_return_reminder_for_article(
    article_id: int,
    phone_override: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Sends a return reminder message for a specific article via OpenWA
    and marks return_reminder_sent = 1.
    """
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        return False, "Article not found", None

    article = dict(row)
    target_phone = phone_override or article.get("customer_phone") or article.get("customer_alt_phone")
    if not target_phone:
        return False, "No customer phone number found for this booking.", None

    clean_phone = format_phone_number(target_phone)
    if not clean_phone:
        return False, "Invalid recipient phone number.", None

    shop_title = get_shop_name()
    reminder_text = generate_return_reminder_text(article, shop_title)

    success, msg, api_res = send_openwa_message(target_phone, reminder_text)
    if success:
        db.execute("UPDATE articles SET return_reminder_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (article_id,))
        db.commit()
        return True, f"Return reminder sent successfully to +{clean_phone} via OpenWA!", api_res
    return False, msg, api_res


def dispatch_due_pickup_reminders() -> Dict[str, Any]:
    """
    Finds all active bookings where pickup_date is TOMORROW (1 day before pickup)
    and where reminder has not yet been sent. Dispatches reminders automatically via OpenWA.
    """
    import datetime
    t_dt = datetime.date.today() + datetime.timedelta(days=1)
    tomorrow_iso = t_dt.isoformat()
    tomorrow_slash = t_dt.strftime("%d/%m/%Y")
    tomorrow_dash = t_dt.strftime("%d-%m-%Y")

    db = get_db()
    rows = db.execute(
        """
        SELECT id, article_id, customer_name, customer_phone, customer_alt_phone, pickup_date, status, pickup_reminder_sent
        FROM articles
        WHERE status = 'booked'
          AND (pickup_reminder_sent IS NULL OR pickup_reminder_sent = 0)
          AND (pickup_date = ? OR pickup_date = ? OR pickup_date = ? OR pickup_date LIKE ?)
        """,
        (tomorrow_iso, tomorrow_slash, tomorrow_dash, f"{tomorrow_iso}%")
    ).fetchall()

    results = []
    sent_count = 0
    fail_count = 0

    for r in rows:
        art = dict(r)
        success, msg, extra = send_pickup_reminder_for_article(art["id"])
        if success:
            sent_count += 1
            results.append({"article_id": art["article_id"], "status": "sent", "message": msg})
        else:
            fail_count += 1
            results.append({"article_id": art["article_id"], "status": "failed", "error": msg})

    return {
        "success": True,
        "tomorrow_date": tomorrow_iso,
        "total_due": len(rows),
        "sent_count": sent_count,
        "fail_count": fail_count,
        "results": results,
    }


def dispatch_due_return_reminders() -> Dict[str, Any]:
    """
    Finds all active bookings where return_date is TOMORROW (1 day before return)
    and where return reminder has not yet been sent. Dispatches reminders automatically via OpenWA.
    """
    import datetime
    t_dt = datetime.date.today() + datetime.timedelta(days=1)
    tomorrow_iso = t_dt.isoformat()
    tomorrow_slash = t_dt.strftime("%d/%m/%Y")
    tomorrow_dash = t_dt.strftime("%d-%m-%Y")

    db = get_db()
    rows = db.execute(
        """
        SELECT id, article_id, customer_name, customer_phone, customer_alt_phone, return_date, status, return_reminder_sent
        FROM articles
        WHERE status IN ('booked', 'picked_up')
          AND (return_reminder_sent IS NULL OR return_reminder_sent = 0)
          AND (return_date = ? OR return_date = ? OR return_date = ? OR return_date LIKE ?)
        """,
        (tomorrow_iso, tomorrow_slash, tomorrow_dash, f"{tomorrow_iso}%")
    ).fetchall()

    results = []
    sent_count = 0
    fail_count = 0

    for r in rows:
        art = dict(r)
        success, msg, extra = send_return_reminder_for_article(art["id"])
        if success:
            sent_count += 1
            results.append({"article_id": art["article_id"], "status": "sent", "message": msg})
        else:
            fail_count += 1
            results.append({"article_id": art["article_id"], "status": "failed", "error": msg})

    return {
        "success": True,
        "tomorrow_date": tomorrow_iso,
        "total_due": len(rows),
        "sent_count": sent_count,
        "fail_count": fail_count,
        "results": results,
    }
