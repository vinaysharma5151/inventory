"""
services/whatsapp.py — Meta WhatsApp Cloud API Service for Mehak Bridal Studio.

Responsibilities:
  - Format/sanitize Indian & International mobile numbers (e.g. 9876543210 -> 919876543210).
  - Format luxury e-bill text message for customer receipts.
  - Send official Meta WhatsApp Cloud API messages (Templates and Freeform Text).
  - Read configuration dynamically from the SQLite `settings` table.
"""

import asyncio
import json
import logging
import re
from typing import Any, Dict, Optional, Tuple
import urllib.error
import urllib.request

from backend.database import get_db

logger = logging.getLogger("whatsapp")
logger.setLevel(logging.INFO)

META_GRAPH_URL = "https://graph.facebook.com/v19.0"


def format_phone_number(phone_raw: Optional[str]) -> Optional[str]:
    """
    Sanitize and normalize customer phone number.
    - If 10 digits (e.g. 9876543210), prepends '91' for India -> 919876543210.
    - If 11 digits starting with 0, strips leading 0 and prepends '91'.
    - If already includes country code (e.g. +919876543210 or 919876543210), keeps digits.
    - Returns None if phone number has fewer than 10 digits.
    """
    if not phone_raw:
        return None

    # Keep only digits
    digits = re.sub(r"\D", "", str(phone_raw).strip())

    if len(digits) == 10:
        return f"91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        return f"91{digits[1:]}"
    elif len(digits) >= 11:
        return digits
    else:
        return None


def get_whatsapp_config() -> Dict[str, str]:
    """Retrieve WhatsApp API settings from the SQLite database."""
    try:
        db = get_db()
        db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        rows = db.execute(
            "SELECT key, value FROM settings WHERE key LIKE 'whatsapp_%' OR key = 'shop_name'"
        ).fetchall()
        config = {row["key"]: (row["value"] or "").strip() for row in rows}
    except Exception as e:
        logger.error(f"[WHATSAPP] Failed to load config from DB: {e}")
        config = {}

    return {
        "enabled": config.get("whatsapp_enabled", "false").lower() in ("true", "1", "yes"),
        "token": config.get("whatsapp_token", ""),
        "phone_number_id": config.get("whatsapp_phone_number_id", ""),
        "waba_id": config.get("whatsapp_waba_id", ""),
        "template_name": config.get("whatsapp_template_name", "booking_ebill_receipt"),
        "language_code": config.get("whatsapp_language_code", "en_US"),
        "send_mode": config.get("whatsapp_send_mode", "template"),  # 'template' or 'text'
        "shop_name": config.get('shop_name', 'Bridal Studio'),
    }


def generate_ebill_text(article: Dict[str, Any], shop_name: str = "Mehak Bridal Studio") -> str:
    """Generate a formatted e-bill message with luxury emojis and clear line items."""
    customer_name = article.get("customer_name") or "Valued Customer"
    art_id = article.get("article_id") or "N/A"
    title = article.get("title") or "Bridal Outfit"
    category = article.get("category") or "Bridal Collection"
    pickup_date = article.get("pickup_date") or "N/A"
    return_date = article.get("return_date") or "N/A"

    price = float(article.get("price") or 0)
    advance = float(article.get("advance_amount") or 0)
    security = float(article.get("security_deposit") or 0)
    balance = float(article.get("balance_amount") or 0)
    salesman = article.get("salesman_name") or "Studio Staff"

    balance_line = (
        "✅ *Balance Due:* ₹0 (Paid in Full)"
        if balance <= 0
        else f"⚠️ *Balance Due:* ₹{balance:,.0f}"
    )
    security_line = f"🛡️ *Security Deposit:* ₹{security:,.0f}\n" if security > 0 else ""

    text = (
        f"🌸 *{shop_name.upper()}* 🌸\n"
        f"✨ *Booking Confirmation & E-Bill* ✨\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"Dear *{customer_name}*,\n"
        f"Thank you for choosing {shop_name}! Here is your booking summary:\n\n"
        f"🧾 *Article Code:* {art_id}\n"
        f"👗 *Item:* {title} ({category})\n"
        f"📅 *Pickup Date:* {pickup_date}\n"
        f"🔄 *Return Date:* {return_date}\n\n"
        f"💵 *Total Rent:* ₹{price:,.0f}\n"
        f"💳 *Advance Paid:* ₹{advance:,.0f}\n"
        f"{security_line}"
        f"{balance_line}\n\n"
        f"👤 *Booked By Staff:* {salesman}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📍 *{shop_name}*\n"
        f"Kindly present this e-receipt or Article Code during garment pickup.\n"
        f"Have queries or alteration requests? Reply directly to this WhatsApp number!"
    )
    return text


async def send_meta_whatsapp(
    to_phone: str,
    article: Optional[Dict[str, Any]] = None,
    custom_text: Optional[str] = None,
    override_token: Optional[str] = None,
    override_phone_id: Optional[str] = None,
    force_mode: Optional[str] = None,
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Send a WhatsApp message via Meta Cloud API.

    Returns:
      (success: bool, status_message: str, response_payload: dict)
    """
    config = get_whatsapp_config()

    token = (override_token or config["token"]).strip()
    phone_id = (override_phone_id or config["phone_number_id"]).strip()
    mode = force_mode or config["send_mode"]

    if not token or not phone_id:
        return False, "Meta Access Token or Phone Number ID is not configured.", {}

    formatted_recipient = format_phone_number(to_phone)
    if not formatted_recipient:
        return False, f"Invalid recipient phone number: '{to_phone}'. Must be at least 10 digits.", {}

    url = f"{META_GRAPH_URL}/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # Decide payload based on mode and availability of article data
    if mode == "template" and article:
        # Build standard Meta template payload
        customer_name = str(article.get("customer_name") or "Customer")
        art_id = str(article.get("article_id") or "N/A")
        title = str(article.get("title") or "Bridal Garment")
        pickup_date = str(article.get("pickup_date") or "N/A")
        return_date = str(article.get("return_date") or "N/A")
        price = f"₹{float(article.get('price') or 0):,.0f}"
        advance = f"₹{float(article.get('advance_amount') or 0):,.0f}"
        balance = f"₹{float(article.get('balance_amount') or 0):,.0f}"

        template_params = [
            {"type": "text", "text": customer_name},
            {"type": "text", "text": art_id},
            {"type": "text", "text": title},
            {"type": "text", "text": pickup_date},
            {"type": "text", "text": return_date},
            {"type": "text", "text": price},
            {"type": "text", "text": advance},
            {"type": "text", "text": balance},
        ]

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": formatted_recipient,
            "type": "template",
            "template": {
                "name": config["template_name"],
                "language": {"code": config["language_code"]},
                "components": [
                    {
                        "type": "body",
                        "parameters": template_params,
                    }
                ],
            },
        }
    else:
        # Fallback to direct rich text message (used for testing or within 24h conversation window)
        message_body = custom_text or (
            generate_ebill_text(article, config["shop_name"])
            if article
            else f"Test message from {config.get('shop_name', 'Bridal Studio')} WhatsApp Cloud API."
        )

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": formatted_recipient,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message_body,
            },
        }

    def _do_post():
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=12.0) as resp:
                resp_bytes = resp.read()
                return resp.status, json.loads(resp_bytes.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8")
            try:
                parsed = json.loads(err_body)
            except Exception:
                parsed = {"error": {"message": err_body}}
            return exc.code, parsed

    try:
        status_code, resp_data = await asyncio.to_thread(_do_post)

        if status_code in (200, 201):
            msg_id = resp_data.get("messages", [{}])[0].get("id", "OK")
            logger.info(f"[WHATSAPP] Sent successfully to {formatted_recipient} (Message ID: {msg_id})")
            return True, f"Delivered to {formatted_recipient} (ID: {msg_id})", resp_data
        else:
            error_obj = resp_data.get("error", {})
            error_msg = error_obj.get("message") or str(resp_data)
            logger.error(f"[WHATSAPP] Meta API Error ({status_code}): {error_msg}")
            return False, f"Meta API Error: {error_msg}", resp_data

    except urllib.error.URLError as exc:
        err_str = f"Network connection failed: {exc}"
        logger.error(f"[WHATSAPP] {err_str}")
        return False, err_str, {}
    except Exception as exc:
        err_str = f"Unexpected error: {exc}"
        logger.error(f"[WHATSAPP] {err_str}")
        return False, err_str, {}


async def send_booking_ebill_task(article: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Async background task executed after an article is booked.
    Checks if WhatsApp is enabled and customer_phone is provided.
    """
    config = get_whatsapp_config()
    if not config["enabled"]:
        logger.info("[WHATSAPP] Auto-send disabled in settings. Skipping e-bill dispatch.")
        return False, "WhatsApp auto-send is disabled in Settings."

    customer_phone = article.get("customer_phone")
    if not customer_phone:
        logger.info("[WHATSAPP] No customer_phone on article. Skipping e-bill.")
        return False, "No customer phone provided."

    logger.info(f"[WHATSAPP] Auto-dispatching e-bill for article {article.get('article_id')} to {customer_phone}")
    success, msg, _ = await send_meta_whatsapp(
        to_phone=customer_phone,
        article=article,
    )
    return success, msg
