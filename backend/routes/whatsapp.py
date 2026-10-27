"""
routes/whatsapp.py — Meta WhatsApp Cloud API & Direct Messaging.

WHY:
Supports official Meta WhatsApp Business Cloud API for 1-click automated e-bill delivery,
while keeping direct click-to-chat (wa.me) as a reliable offline/instant fallback.

Endpoints:
  GET  /api/whatsapp/status             Overall WhatsApp status, mode & credentials presence
  POST /api/whatsapp/settings           Save Meta WhatsApp API credentials (Phone ID, Token)
  POST /api/whatsapp/test               Send test ping via Meta WhatsApp Cloud API
  POST /api/whatsapp/send-article/{id}  Dispatch e-bill via Meta API or generate wa.me link
  GET  /api/whatsapp/ebill-text/{id}    Get formatted e-bill text & wa.me URL
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
    get_whatsapp_url,
    get_whatsapp_app_url,
    send_meta_whatsapp_message,
    save_whatsapp_meta_credentials,
    send_pickup_reminder_for_article,
    dispatch_due_pickup_reminders,
)

logger = logging.getLogger("whatsapp_route")
router = APIRouter()


class WhatsAppSendArticlePayload(BaseModel):
    phone_override: Optional[str] = None
    mode: Optional[str] = None  # "meta" | "direct"


class WhatsAppSettingsPayload(BaseModel):
    phone_number_id: str = Field(..., min_length=1)
    access_token: str = Field(..., min_length=1)
    mode: Optional[str] = "meta"
    template_name: Optional[str] = None
    reminder_template_name: Optional[str] = None


class WhatsAppTestPayload(BaseModel):
    phone_number: str = Field(..., min_length=10)
    message: Optional[str] = None


@router.get("/whatsapp/status")
def whatsapp_status(current_user: dict = Depends(require_staff_or_owner)):
    """Returns current WhatsApp configuration state & mode (meta vs direct)."""
    cfg = get_whatsapp_config()
    return {
        "success": True,
        "enabled": cfg.get("enabled", True),
        "mode": cfg.get("mode", "direct"),
        "is_meta_configured": cfg.get("is_meta_configured", False),
        "phone_number_id": cfg.get("phone_number_id", ""),
        "masked_token": cfg.get("masked_token", ""),
        "template_name": cfg.get("template_name", ""),
        "reminder_template_name": cfg.get("reminder_template_name", ""),
        "shop_name": cfg.get("shop_name", "Bridal Studio"),
    }


@router.post("/whatsapp/settings")
def update_whatsapp_settings(
    payload: WhatsAppSettingsPayload,
    current_user: dict = Depends(require_owner),
):
    """Save official Meta WhatsApp Business Cloud API credentials (restricted to showroom Owner)."""
    saved = save_whatsapp_meta_credentials(
        phone_number_id=payload.phone_number_id,
        access_token=payload.access_token,
        mode=payload.mode or "meta",
        template_name=payload.template_name,
        reminder_template_name=payload.reminder_template_name,
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to persist WhatsApp credentials.")

    cfg = get_whatsapp_config()
    return {
        "success": True,
        "message": "Meta WhatsApp settings saved successfully.",
        "config": cfg,
    }


@router.post("/whatsapp/test")
def test_meta_whatsapp(
    payload: WhatsAppTestPayload,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Sends a test message via Meta WhatsApp Business Cloud API to verify connection."""
    cfg = get_whatsapp_config()
    if not cfg.get("is_meta_configured"):
        raise HTTPException(
            status_code=400,
            detail="Meta WhatsApp API credentials not configured. Please enter Phone Number ID and Access Token in settings.",
        )

    shop_title = get_shop_name()
    test_msg = payload.message or (
        f"✅ *TEST MESSAGE — {shop_title.upper()}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Official Meta WhatsApp Business Cloud API is active and successfully connected!\n"
        f"Your bridal salon e-bills will be dispatched automatically."
    )

    success, message, extra = send_meta_whatsapp_message(payload.phone_number, test_msg)
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
    Sends e-bill via official Meta WhatsApp Cloud API if configured/selected,
    or generates the direct wa.me click-to-chat link.
    """
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    target_phone = (
        payload.phone_override if payload and payload.phone_override else None
    ) or article.get("customer_phone")

    if not target_phone:
        raise HTTPException(
            status_code=400,
            detail="No customer phone number found for this article."
        )

    shop_title = get_shop_name()
    ebill_text = generate_ebill_text(article, shop_title)
    wa_url = get_whatsapp_url(target_phone, ebill_text)
    wa_app_url = get_whatsapp_app_url(target_phone, ebill_text)
    clean_phone = format_phone_number(target_phone)

    cfg = get_whatsapp_config()
    requested_mode = payload.mode if payload and payload.mode else cfg.get("mode", "direct")

    # If Meta mode requested or active
    if requested_mode == "meta" and cfg.get("is_meta_configured"):
        customer_name = (article.get("customer_name") or "Valued Customer").strip()
        art_id = str(article.get("article_id") or "").strip()
        outfit_name = str(article.get("title") or article.get("category") or "Bridal Outfit").strip()
        pickup_date = str(article.get("pickup_date") or "").strip()
        advance_str = f"{float(article.get('advance_amount') or 0):,.0f}"
        balance_val = float(
            article.get("balance_amount")
            if article.get("balance_amount") is not None
            else max(0.0, float(article.get("price") or 0) - float(article.get("advance_amount") or 0))
        )
        balance_str = f"{balance_val:,.0f}"

        template_params = [
            customer_name,
            art_id,
            outfit_name,
            pickup_date,
            advance_str,
            balance_str,
        ]

        success, send_msg, extra = send_meta_whatsapp_message(
            target_phone,
            ebill_text,
            template_params=template_params,
        )
        if success:
            return {
                "success": True,
                "direct_sent": True,
                "sent_via": "meta",
                "message": send_msg,
                "target_phone": target_phone,
                "clean_phone": clean_phone,
                "ebill_text": ebill_text,
                "whatsapp_url": wa_url,
                "whatsapp_app_url": wa_app_url,
                "details": extra,
            }
        else:
            # Return error detail with wa.me link as seamless backup
            logger.warning(f"[WHATSAPP] Meta dispatch failed: {send_msg}. Providing wa.me fallback.")
            return {
                "success": False,
                "direct_sent": False,
                "sent_via": "meta",
                "error": send_msg,
                "target_phone": target_phone,
                "clean_phone": clean_phone,
                "ebill_text": ebill_text,
                "whatsapp_url": wa_url,
                "whatsapp_app_url": wa_app_url,
                "details": extra,
            }

    # Direct wa.me mode
    return {
        "success": True,
        "direct_sent": False,
        "sent_via": "direct",
        "message": "WhatsApp wa.me link ready",
        "target_phone": target_phone,
        "clean_phone": clean_phone,
        "ebill_text": ebill_text,
        "whatsapp_url": wa_url,
        "whatsapp_app_url": wa_app_url,
    }


@router.get("/whatsapp/ebill-text/{article_id}")
def whatsapp_ebill_text(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Returns the formatted e-bill text and direct wa.me link for an article."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_ebill_text(article, shop_title)
    phone = article.get("customer_phone")
    clean_phone = format_phone_number(phone) if phone else None
    wa_url = get_whatsapp_url(phone, text) if phone else None
    wa_app_url = get_whatsapp_app_url(phone, text) if phone else None

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": clean_phone,
        "raw_phone": phone,
        "ebill_text": text,
        "whatsapp_url": wa_url,
        "whatsapp_app_url": wa_app_url,
    }


@router.post("/whatsapp/send-pickup-reminder/{article_id}")
def whatsapp_send_pickup_reminder(
    article_id: int,
    payload: Optional[WhatsAppSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Sends an outfit pickup reminder to the customer 1 day before their pickup date
    via Meta WhatsApp Business Cloud API (or generates wa.me link).
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
    """Returns formatted pickup reminder text and direct wa.me link for an article."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_pickup_reminder_text(article, shop_title)
    phone = article.get("customer_phone")
    clean_phone = format_phone_number(phone) if phone else None
    wa_url = get_whatsapp_url(phone, text) if phone else None
    wa_app_url = get_whatsapp_app_url(phone, text) if phone else None

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": clean_phone,
        "raw_phone": phone,
        "reminder_text": text,
        "whatsapp_url": wa_url,
        "whatsapp_app_url": wa_app_url,
        "pickup_date": article.get("pickup_date"),
        "reminder_already_sent": bool(article.get("pickup_reminder_sent")),
    }


@router.post("/whatsapp/check-pickup-reminders")
def whatsapp_check_pickup_reminders(
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Scans database for all active bookings scheduled for pickup TOMORROW
    and automatically dispatches pickup reminders.
    """
    result = dispatch_due_pickup_reminders()
    return result



