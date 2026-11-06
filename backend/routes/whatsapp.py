"""
routes/whatsapp.py — OpenWA Gateway Direct Messaging Endpoints.

WHY:
Dispatches automated e-bills and pickup reminders through the self-hosted OpenWA Gateway.
Zero third-party cloud costs, zero template restrictions, zero wa.me browser popups.
"""

import logging
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException

from backend.database import get_db
from backend.services.auth import require_staff_or_owner, require_owner
from backend.services.whatsapp import (
    get_whatsapp_config,
    get_shop_name,
    format_phone_number,
    generate_ebill_text,
    generate_pickup_reminder_text,
    generate_return_reminder_text,
    save_openwa_credentials,
    send_openwa_message,
    send_booking_ebill,
    send_pickup_reminder_for_article,
    send_return_reminder_for_article,
    dispatch_due_pickup_reminders,
    dispatch_due_return_reminders,
)

logger = logging.getLogger("whatsapp_route")
router = APIRouter()


class WhatsAppSendArticlePayload(BaseModel):
    phone_override: Optional[str] = None


class OpenWASettingsPayload(BaseModel):
    session_id: str = Field(..., min_length=1)
    server_url: Optional[str] = None
    api_key: Optional[str] = None


class WhatsAppTestPayload(BaseModel):
    phone_number: str = Field(..., min_length=10)
    message: Optional[str] = None


@router.get("/whatsapp/status")
def whatsapp_status(current_user: dict = Depends(require_staff_or_owner)):
    """Returns current OpenWA gateway connection state and active session info."""
    cfg = get_whatsapp_config()
    return {
        "success": True,
        "enabled": cfg.get("enabled", True),
        "mode": "openwa",
        "gateway": cfg.get("gateway"),
        "session_id": cfg.get("session_id"),
        "session_name": cfg.get("session_name"),
        "session_status": cfg.get("session_status"),
        "connected_phone": cfg.get("connected_phone"),
        "push_name": cfg.get("push_name"),
        "is_ready": cfg.get("is_ready", False),
        "shop_name": cfg.get("shop_name", "Bridal Studio"),
    }


@router.post("/whatsapp/settings")
def update_whatsapp_settings(
    payload: OpenWASettingsPayload,
    current_user: dict = Depends(require_owner),
):
    """Save OpenWA Session ID (restricted to showroom Owner)."""
    saved = save_openwa_credentials(
        session_id=payload.session_id,
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to persist WhatsApp session ID.")

    cfg = get_whatsapp_config()
    return {
        "success": True,
        "message": "WhatsApp session ID saved successfully.",
        "config": cfg,
    }


@router.post("/whatsapp/test")
def test_openwa_whatsapp(
    payload: WhatsAppTestPayload,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Sends a test ping message via OpenWA to verify live connection."""
    cfg = get_whatsapp_config()
    if not cfg.get("session_id"):
        raise HTTPException(
            status_code=400,
            detail="WhatsApp Session ID is not configured. Please enter your Session ID in settings.",
        )

    shop_title = get_shop_name()
    test_msg = payload.message or (
        f"✅ *TEST MESSAGE — {shop_title.upper()}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"OpenWA Gateway is active and successfully connected!\n"
        f"Automated 1-click WhatsApp e-bills are operational."
    )

    success, message, extra = send_openwa_message(payload.phone_number, test_msg)
    if not success:
        return {
            "success": False,
            "error": message,
            "details": extra,
        }

    return {
        "success": True,
        "message": message,
        "details": extra,
    }


@router.post("/whatsapp/send-article/{article_id}")
def whatsapp_send_article(
    article_id: int,
    payload: Optional[WhatsAppSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Sends e-bill directly to customer via OpenWA Gateway.
    """
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    target_phone = (
        payload.phone_override if payload and payload.phone_override else None
    ) or article.get("customer_phone") or article.get("customer_alt_phone")

    if not target_phone:
        raise HTTPException(
            status_code=400,
            detail="No customer phone number found for this article."
        )

    shop_title = get_shop_name()
    ebill_text = generate_ebill_text(article, shop_title)
    clean_phone = format_phone_number(target_phone)

    success, message, extra = send_booking_ebill(article_id, target_phone)
    if success:
        return {
            "success": True,
            "direct_sent": True,
            "sent_via": "openwa",
            "message": message,
            "target_phone": target_phone,
            "clean_phone": clean_phone,
            "ebill_text": ebill_text,
            "details": extra,
        }
    else:
        logger.warning(f"[WHATSAPP] OpenWA dispatch failed: {message}")
        return {
            "success": False,
            "direct_sent": False,
            "sent_via": "openwa",
            "error": message,
            "target_phone": target_phone,
            "clean_phone": clean_phone,
            "ebill_text": ebill_text,
            "details": extra,
        }


@router.get("/whatsapp/ebill-text/{article_id}")
def whatsapp_ebill_text(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Returns the formatted e-bill text for an article."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_ebill_text(article, shop_title)
    phone = article.get("customer_phone") or article.get("customer_alt_phone")
    clean_phone = format_phone_number(phone) if phone else None

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": clean_phone,
        "raw_phone": phone,
        "ebill_text": text,
    }


@router.post("/whatsapp/send-pickup-reminder/{article_id}")
def whatsapp_send_pickup_reminder(
    article_id: int,
    payload: Optional[WhatsAppSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Sends an outfit pickup reminder to the customer 1 day before their pickup date via OpenWA.
    """
    phone_override = payload.phone_override if payload else None
    success, message, extra = send_pickup_reminder_for_article(article_id, phone_override)

    return {
        "success": success,
        "message": message,
        "details": extra,
    }


@router.get("/whatsapp/pickup-reminder-text/{article_id}")
def whatsapp_pickup_reminder_text(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Returns formatted pickup reminder text for an article."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_pickup_reminder_text(article, shop_title)
    phone = article.get("customer_phone") or article.get("customer_alt_phone")
    clean_phone = format_phone_number(phone) if phone else None

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": clean_phone,
        "raw_phone": phone,
        "reminder_text": text,
        "pickup_date": article.get("pickup_date"),
        "reminder_already_sent": bool(article.get("pickup_reminder_sent")),
    }


@router.post("/whatsapp/check-pickup-reminders")
def whatsapp_check_pickup_reminders(
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Scans database for all active bookings scheduled for pickup TOMORROW
    and automatically dispatches pickup reminders via OpenWA.
    """
    result = dispatch_due_pickup_reminders()
    return result


@router.post("/whatsapp/send-return-reminder/{article_id}")
def whatsapp_send_return_reminder(
    article_id: int,
    payload: Optional[WhatsAppSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Sends an outfit return reminder to the customer 1 day before their return date via OpenWA.
    """
    phone_override = payload.phone_override if payload else None
    success, message, extra = send_return_reminder_for_article(article_id, phone_override)

    return {
        "success": success,
        "message": message,
        "details": extra,
    }


@router.get("/whatsapp/return-reminder-text/{article_id}")
def whatsapp_return_reminder_text(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Returns formatted return reminder text for an article."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_return_reminder_text(article, shop_title)
    phone = article.get("customer_phone") or article.get("customer_alt_phone")
    clean_phone = format_phone_number(phone) if phone else None

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": clean_phone,
        "raw_phone": phone,
        "reminder_text": text,
        "return_date": article.get("return_date"),
        "reminder_already_sent": bool(article.get("return_reminder_sent")),
    }


@router.post("/whatsapp/check-return-reminders")
def whatsapp_check_return_reminders(
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Scans database for all active bookings scheduled for return TOMORROW
    and automatically dispatches return reminders via OpenWA.
    """
    result = dispatch_due_return_reminders()
    return result


@router.post("/whatsapp/check-all-reminders")
def whatsapp_check_all_reminders(
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Scans database for all active bookings scheduled for pickup OR return TOMORROW,
    and automatically dispatches reminders via OpenWA.
    """
    p_res = dispatch_due_pickup_reminders()
    r_res = dispatch_due_return_reminders()
    p_sent = p_res.get("sent_count", 0)
    r_sent = r_res.get("sent_count", 0)
    p_due = p_res.get("total_due", 0)
    r_due = r_res.get("total_due", 0)
    p_fail = p_res.get("fail_count", 0)
    r_fail = r_res.get("fail_count", 0)

    total_sent = p_sent + r_sent
    total_due = p_due + r_due
    total_fail = p_fail + r_fail

    return {
        "success": True,
        "pickup": p_res,
        "return": r_res,
        "total_due": total_due,
        "total_sent": total_sent,
        "total_failed": total_fail,
        "pickup_sent": p_sent,
        "return_sent": r_sent,
        "pickup_due": p_due,
        "return_due": r_due,
        "message": f"Sent {p_sent} pickup and {r_sent} return reminder(s).",
    }
