"""
services/whatsapp.py — Direct WhatsApp Service for Mehak Bridal Studio.

Responsibilities:
  - Sanitize and format Indian & International mobile numbers (e.g. 9876543210 -> 919876543210).
  - Format luxury e-bill text message for customer receipts.
  - Generate instant direct wa.me / WhatsApp Web click-to-send links.
  - No gateway server or external third-party API dependencies required.
"""

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

from backend.database import get_db

logger = logging.getLogger("whatsapp")
logger.setLevel(logging.INFO)

META_GRAPH_API_VERSION = "v21.0"


def format_phone_number(phone_raw: Optional[str]) -> Optional[str]:
    """
    Sanitize and normalize customer phone number for WhatsApp wa.me links.
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


def get_whatsapp_meta_credentials() -> Dict[str, Optional[str]]:
    """Retrieve Meta WhatsApp Business Cloud API settings from SQLite."""
    try:
        db = get_db()
        db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        rows = db.execute("SELECT key, value FROM settings WHERE key LIKE 'whatsapp_%'").fetchall()
        settings_map = {row["key"]: row["value"] for row in rows}
        return {
            "mode": settings_map.get("whatsapp_mode", "meta" if settings_map.get("whatsapp_meta_phone_number_id") else "direct"),
            "phone_number_id": settings_map.get("whatsapp_meta_phone_number_id") or "",
            "access_token": settings_map.get("whatsapp_meta_access_token") or "",
            "template_name": settings_map.get("whatsapp_meta_template_name") or "",
            "reminder_template_name": settings_map.get("whatsapp_meta_reminder_template_name") or "",
        }
    except Exception as e:
        logger.error(f"[WHATSAPP] Failed to load WhatsApp settings: {e}")
        return {
            "mode": "direct",
            "phone_number_id": "",
            "access_token": "",
            "template_name": "",
            "reminder_template_name": "",
        }


def save_whatsapp_meta_credentials(
    phone_number_id: str,
    access_token: str,
    mode: str = "meta",
    template_name: Optional[str] = None,
    reminder_template_name: Optional[str] = None,
) -> bool:
    """Save Meta WhatsApp Cloud API credentials in SQLite settings."""
    try:
        db = get_db()
        db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        pairs = [
            ("whatsapp_mode", mode or "meta"),
            ("whatsapp_meta_phone_number_id", (phone_number_id or "").strip()),
            ("whatsapp_meta_access_token", (access_token or "").strip()),
            ("whatsapp_meta_template_name", (template_name or "").strip()),
            ("whatsapp_meta_reminder_template_name", (reminder_template_name or "").strip()),
        ]
        for k, v in pairs:
            db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v))
        db.commit()
        return True
    except Exception as e:
        logger.error(f"[WHATSAPP] Failed to save credentials: {e}")
        return False


def get_whatsapp_config() -> Dict[str, Any]:
    """Retrieve WhatsApp configuration state (Meta Cloud API vs Direct click-to-chat)."""
    creds = get_whatsapp_meta_credentials()
    token = creds.get("access_token") or ""
    phone_id = creds.get("phone_number_id") or ""
    is_meta_configured = bool(phone_id and token)
    masked_token = f"{token[:6]}...{token[-4:]}" if len(token) > 12 else ("Configured" if token else "")

    return {
        "enabled": True,
        "mode": creds.get("mode", "meta" if is_meta_configured else "direct"),
        "is_meta_configured": is_meta_configured,
        "phone_number_id": phone_id,
        "masked_token": masked_token,
        "template_name": creds.get("template_name") or "",
        "reminder_template_name": creds.get("reminder_template_name") or "",
        "shop_name": get_shop_name(),
    }


def send_meta_whatsapp_message(
    to_phone: str,
    message_text: str,
    phone_number_id: Optional[str] = None,
    access_token: Optional[str] = None,
    template_name: Optional[str] = None,
    template_params: Optional[list] = None,
    language_code: str = "en",
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Sends a WhatsApp message via official Meta WhatsApp Business Cloud API.
    Supports both free-form text e-bills and pre-approved Meta message templates.
    Zero third-party dependencies (pure standard-library urllib.request).
    """
    clean_phone = format_phone_number(to_phone)
    if not clean_phone:
        return False, "Invalid recipient phone number (must be at least 10 digits).", None

    creds = get_whatsapp_meta_credentials()
    active_phone_id = (phone_number_id or creds.get("phone_number_id") or "").strip()
    active_token = (access_token or creds.get("access_token") or "").strip()
    active_template = (template_name or creds.get("template_name") or "").strip()

    if not active_phone_id or not active_token:
        return False, "Meta WhatsApp API is not configured (Phone Number ID or Access Token missing).", None

    url = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}/{active_phone_id}/messages"

    # Build payload: template mode vs free-form text mode
    if active_template:
        payload: Dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "template",
            "template": {
                "name": active_template,
                "language": {"code": language_code or "en"},
            },
        }
        if template_params:
            payload["template"]["components"] = [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": str(p)} for p in template_params],
                }
            ]
    else:
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message_text,
            },
        }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {active_token}",
            "Content-Type": "application/json",
            "User-Agent": "MehakBridalApp/2.1",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            res_json = json.loads(body)
            messages = res_json.get("messages", [])
            msg_id = messages[0].get("id") if messages else "sent"
            logger.info(f"[WHATSAPP] Meta Cloud API message sent to {clean_phone}, id={msg_id}")
            return True, f"Message sent successfully via Meta WhatsApp API (ID: {msg_id})", res_json
    except urllib.error.HTTPError as http_err:
        try:
            err_body = http_err.read().decode("utf-8")
            err_json = json.loads(err_body)
            meta_err = err_json.get("error", {})
            err_code = meta_err.get("code")
            meta_msg = meta_err.get("message") or f"HTTP {http_err.code}"
            meta_details = meta_err.get("error_data", {}).get("details")

            # Human-friendly decoding of common Meta API error codes
            if err_code == 131047:
                friendly = (
                    "24-Hour Window Closed: Customer has not sent a message to the studio in the last 24 hours. "
                    "Meta requires a pre-approved Message Template to initiate new chats, or use WhatsApp Web (wa.me) fallback."
                )
            elif err_code == 190:
                friendly = "Access Token Expired: Please refresh your Meta Permanent / System User Access Token in WhatsApp Settings."
            elif err_code == 131026:
                friendly = "Undeliverable: The recipient number is not registered on WhatsApp or cannot receive messages."
            elif err_code in (132000, 132001):
                friendly = f"Template Error: The template '{active_template}' does not exist or has not been approved in Meta Business Suite."
            else:
                friendly = f"{meta_msg} ({meta_details})" if meta_details else meta_msg

            logger.error(f"[WHATSAPP] Meta API error {err_code}: {err_body}")
            return False, friendly, err_json
        except Exception:
            logger.error(f"[WHATSAPP] HTTP error: {http_err}")
            return False, f"Meta WhatsApp API returned HTTP {http_err.code}", None
    except urllib.error.URLError as url_err:
        logger.error(f"[WHATSAPP] Network error connecting to Meta: {url_err}")
        return False, f"Network error connecting to Meta WhatsApp API: {url_err.reason}", None
    except Exception as exc:
        logger.error(f"[WHATSAPP] Unexpected error: {exc}")
        return False, "Failed to send message via Meta WhatsApp API.", None


def generate_ebill_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate a clean, aesthetic luxury formatted e-bill message."""
    store_name = shop_name or get_shop_name()
    customer_name = (article.get("customer_name") or "Valued Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip()
    raw_title = str(article.get("title") or "").strip()
    category = str(article.get("category") or "Bridal").replace("–", "-").replace("—", "-")
    cust_clean = customer_name
    if (
        not raw_title
        or raw_title.startswith("Booking –")
        or raw_title.startswith("Booking -")
        or (cust_clean and raw_title.lower() == cust_clean.lower())
    ):
        title = category
    else:
        title = raw_title.replace("–", "-").replace("—", "-")

    item_display = title if title.lower() == category.lower() else f"{title} ({category})"
    pickup_date = article.get("pickup_date") or "N/A"
    return_date = article.get("return_date") or "N/A"
    created_date = (str(article.get("created_at") or "")[:10]) or pickup_date
    phone = article.get("customer_phone") or ""

    price = float(article.get("price") or 0)
    advance = float(article.get("advance_amount") or 0)
    security = float(article.get("security_deposit") or 0)
    balance = float(
        article.get("balance_amount")
        if article.get("balance_amount") is not None
        else max(0.0, price - advance)
    )

    has_j = int(article.get("has_jewellery") or 0) == 1
    jewel_line = ""
    if has_j:
        j_det = (article.get("jewellery_details") or "Full Matching Set").strip() or "Full Matching Set"
        j_pr = float(article.get("jewellery_price") or 0)
        jewel_extra = f" (+Rs. {j_pr:,.0f})" if j_pr > 0 else ""
        jewel_line = f"💍 *Jewellery:* {j_det}{jewel_extra}\n"

    balance_line = (
        "✅ *Balance Due:* Rs. 0 (Paid in Full)"
        if balance <= 0
        else f"⏳ *Balance Due:* Rs. {balance:,.0f}"
    )
    security_line = f"🛡 *Security Deposit:* Rs. {security:,.0f}\n" if security > 0 else ""

    st = str(article.get("status") or "booked").lower()
    if st == "picked_up":
        stage_str = "🛍️ Picked Up (Taken by Customer)"
    elif st == "returned":
        stage_str = "✅ Returned (Back in Shop)"
    else:
        stage_str = "📌 Booked (Advance Paid)"

    text = (
        f"🧾 *E-BILL & BOOKING CONFIRMATION*\n"
        f"*{store_name.upper()}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *Customer:* {customer_name}\n"
        f"📱 *Mobile:* {phone}\n"
        f"🗓 *Booking ID:* #{art_id} | *Date:* {created_date}\n"
        f"🏷 *Stage:* {stage_str}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"👗 *Outfit:* {item_display}\n"
        f"{jewel_line}"
        f"📅 *Pickup Date:* {pickup_date}\n"
        f"🔄 *Return Date:* {return_date}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"💰 *Total Rent:* Rs. {price:,.0f}\n"
        f"💵 *Advance Paid:* Rs. {advance:,.0f}\n"
        f"{security_line}"
        f"{balance_line}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📋 *TERMS & CONDITIONS:*\n"
        f"1. No cancellation, refund, or adjustment once booking is confirmed under any condition.\n"
        f"2. Outfit must be returned on or before the Return Date, else a penalty of Rs. 300 per day will apply.\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"🙏 _Thank you for choosing {store_name}!_\n"
        f"📍 _Kindly present this e-receipt or Booking #{art_id} at pickup._"
    )
    return text


def get_whatsapp_url(phone_raw: Optional[str], text: str) -> Optional[str]:
    """Build a direct click-to-chat WhatsApp wa.me URL."""
    clean_phone = format_phone_number(phone_raw)
    if not clean_phone:
        return None
    encoded_text = urllib.parse.quote(text)
    return f"https://wa.me/{clean_phone}?text={encoded_text}"


def get_whatsapp_app_url(phone_raw: Optional[str], text: str) -> Optional[str]:
    """Build a native Windows WhatsApp Desktop URI (whatsapp://send)."""
    clean_phone = format_phone_number(phone_raw)
    if not clean_phone:
        return None
    encoded_text = urllib.parse.quote(text)
    return f"whatsapp://send?phone={clean_phone}&text={encoded_text}"


async def send_booking_ebill_task(article: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Background hook stub for backwards compatibility.
    In direct mode, messages are dispatched directly via client click-to-chat.
    """
    logger.info(f"[WHATSAPP] Direct WhatsApp mode active for article {article.get('article_id')}")
    return True, "Direct WhatsApp mode active"


def generate_pickup_reminder_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate a clean, professional pickup reminder message sent 1 day before pickup."""
    store_name = shop_name or get_shop_name()
    customer_name = (article.get("customer_name") or "Valued Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip()
    raw_title = str(article.get("title") or "").strip()
    category = str(article.get("category") or "Bridal").replace("–", "-").replace("—", "-")
    cust_clean = customer_name
    if (
        not raw_title
        or raw_title.startswith("Booking –")
        or raw_title.startswith("Booking -")
        or (cust_clean and raw_title.lower() == cust_clean.lower())
    ):
        title = category
    else:
        title = raw_title.replace("–", "-").replace("—", "-")

    item_display = title if title.lower() == category.lower() else f"{title} ({category})"
    pickup_date = article.get("pickup_date") or "N/A"
    return_date = article.get("return_date") or "N/A"

    price = float(article.get("price") or 0)
    advance = float(article.get("advance_amount") or 0)
    balance = float(
        article.get("balance_amount")
        if article.get("balance_amount") is not None
        else max(0.0, price - advance)
    )

    balance_line = (
        "✅ Rs. 0 (Fully Paid)"
        if balance <= 0
        else f"⏳ Rs. {balance:,.0f}"
    )

    text = (
        f"👗 *OUTFIT PICKUP REMINDER*\n"
        f"*{store_name.upper()}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Dear *{customer_name}*,\n\n"
        f"This is a friendly reminder that your bridal outfit is scheduled for pickup *TOMORROW*:\n\n"
        f"👗 *Outfit:* {item_display}\n"
        f"🗓 *Booking ID:* #{art_id}\n"
        f"📅 *Pickup Date:* {pickup_date}\n"
        f"🔄 *Return Date:* {return_date}\n"
        f"💰 *Remaining Balance:* {balance_line}\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📍 *Kindly present Booking #{art_id} or your e-receipt at the counter.*\n"
        f"🙏 _Thank you for choosing {store_name}! We look forward to seeing you._"
    )
    return text


def send_pickup_reminder_for_article(
    article_id: int,
    phone_override: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Sends a pickup reminder message for a specific article via Meta WhatsApp Cloud API
    (or prepares direct wa.me fallback) and marks pickup_reminder_sent = 1.
    """
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        return False, "Article not found", None

    article = dict(row)
    target_phone = phone_override or article.get("customer_phone")
    if not target_phone:
        return False, "No customer phone number found for this booking.", None

    clean_phone = format_phone_number(target_phone)
    if not clean_phone:
        return False, "Invalid recipient phone number.", None

    shop_title = get_shop_name()
    reminder_text = generate_pickup_reminder_text(article, shop_title)
    wa_url = get_whatsapp_url(target_phone, reminder_text)
    wa_app_url = get_whatsapp_app_url(target_phone, reminder_text)

    creds = get_whatsapp_meta_credentials()
    mode = creds.get("mode", "direct")
    is_meta = bool(creds.get("phone_number_id") and creds.get("access_token") and mode == "meta")

    extra_data = {
        "article_id": article_id,
        "clean_phone": clean_phone,
        "reminder_text": reminder_text,
        "whatsapp_url": wa_url,
        "whatsapp_app_url": wa_app_url,
    }

    if is_meta:
        reminder_template = creds.get("reminder_template_name") or ""
        cust_name = (article.get("customer_name") or "Valued Customer").strip()
        art_id_str = str(article.get("article_id") or "").strip()
        outfit_name = str(article.get("title") or article.get("category") or "Bridal Outfit").strip()
        pickup_date = str(article.get("pickup_date") or "").strip()
        price = float(article.get("price") or 0)
        adv = float(article.get("advance_amount") or 0)
        bal = float(article.get("balance_amount") if article.get("balance_amount") is not None else max(0.0, price - adv))
        bal_str = f"Rs. {bal:,.0f}" if bal > 0 else "Rs. 0 (Paid)"

        template_params = [
            cust_name,
            shop_title,
            outfit_name,
            art_id_str,
            pickup_date,
            bal_str,
        ] if reminder_template else None

        success, msg, api_res = send_meta_whatsapp_message(
            target_phone,
            reminder_text,
            template_name=reminder_template or None,
            template_params=template_params,
        )

        if success:
            db.execute("UPDATE articles SET pickup_reminder_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (article_id,))
            db.commit()
            extra_data["api_response"] = api_res
            return True, f"Pickup reminder sent successfully via Meta WhatsApp API (Booking #{art_id_str})", extra_data
        else:
            extra_data["api_response"] = api_res
            return False, msg, extra_data

    # Direct wa.me mode
    db.execute("UPDATE articles SET pickup_reminder_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (article_id,))
    db.commit()
    return True, "WhatsApp reminder link ready", extra_data


def dispatch_due_pickup_reminders() -> Dict[str, Any]:
    """
    Finds all active bookings where pickup_date is TOMORROW (1 day before pickup)
    and where reminder has not yet been sent. Dispatches reminders automatically.
    """
    import datetime
    t_dt = datetime.date.today() + datetime.timedelta(days=1)
    tomorrow_iso = t_dt.isoformat()
    tomorrow_slash = t_dt.strftime("%d/%m/%Y")
    tomorrow_dash = t_dt.strftime("%d-%m-%Y")

    db = get_db()
    rows = db.execute(
        """
        SELECT id, article_id, customer_name, customer_phone, pickup_date, status, pickup_reminder_sent
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


