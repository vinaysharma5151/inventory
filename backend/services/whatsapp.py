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

