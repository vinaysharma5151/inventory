"""
services/whatsapp.py — Direct WhatsApp Service for Mehak Bridal Studio.

Responsibilities:
  - Sanitize and format Indian & International mobile numbers (e.g. 9876543210 -> 919876543210).
  - Format luxury e-bill text message for customer receipts.
  - Generate instant direct wa.me / WhatsApp Web click-to-send links.
  - No gateway server or external third-party API dependencies required.
"""

import logging
import re
import urllib.parse
from typing import Any, Dict, Optional, Tuple

from backend.database import get_db

logger = logging.getLogger("whatsapp")
logger.setLevel(logging.INFO)


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
    return "Mehak Bridal Studio"


def get_whatsapp_config() -> Dict[str, Any]:
    """Retrieve WhatsApp configuration state (Direct click-to-chat mode)."""
    return {
        "enabled": True,
        "mode": "direct",
        "shop_name": get_shop_name(),
    }


def generate_ebill_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate a clean formatted luxury e-bill message without emojis or corrupt unicode symbols."""
    store_name = shop_name or get_shop_name()
    customer_name = article.get("customer_name") or "Valued Customer"
    art_id = str(article.get("article_id") or "N/A")
    raw_title = str(article.get("title") or "").strip()
    category = str(article.get("category") or "Bridal").replace("–", "-").replace("—", "-")
    cust_clean = str(article.get("customer_name") or "").strip()
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
    security = float(article.get("security_deposit") or 0)
    balance = float(article.get("balance_amount") or 0)

    balance_line = (
        "*Balance Due:* Rs. 0 (Paid in Full)"
        if balance <= 0
        else f"*Balance Due:* Rs. {balance:,.0f}"
    )
    security_line = f"*Security Deposit:* Rs. {security:,.0f}\n" if security > 0 else ""

    text = (
        f"*{store_name.upper()}*\n"
        f"*Booking Confirmation & E-Bill*\n"
        f"----------------------------------------\n"
        f"Dear *{customer_name}*,\n"
        f"Thank you for choosing {store_name}! Here is your booking summary:\n\n"
        f"*Article Code:* {art_id}\n"
        f"*Item:* {item_display}\n"
        f"*Pickup Date:* {pickup_date}\n"
        f"*Return Date:* {return_date}\n\n"
        f"*Total Rent:* Rs. {price:,.0f}\n"
        f"*Advance Paid:* Rs. {advance:,.0f}\n"
        f"{security_line}"
        f"{balance_line}\n\n"
        f"----------------------------------------\n"
        f"*{store_name}*\n"
        f"Kindly present this e-receipt or Article Code during garment pickup.\n"
        f"Have queries or alteration requests? Reply directly to this WhatsApp number!"
    )
    return text


def get_whatsapp_url(phone_raw: Optional[str], text: str) -> Optional[str]:
    """Build a direct click-to-chat WhatsApp wa.me URL."""
    clean_phone = format_phone_number(phone_raw)
    if not clean_phone:
        return None
    encoded_text = urllib.parse.quote(text)
    return f"https://wa.me/{clean_phone}?text={encoded_text}"


async def send_booking_ebill_task(article: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Background hook stub for backwards compatibility.
    In direct mode, messages are dispatched directly via client click-to-chat.
    """
    logger.info(f"[WHATSAPP] Direct WhatsApp mode active for article {article.get('article_id')}")
    return True, "Direct WhatsApp mode active"
