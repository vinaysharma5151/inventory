"""
routes/whatsapp.py — Endpoints for WhatsApp settings, testing, and manual receipt dispatch.

Endpoints:
  GET  /api/whatsapp/status             Check if WhatsApp is configured & enabled
  POST /api/whatsapp/test               Send a test WhatsApp message to verify token & phone ID
  POST /api/whatsapp/send-article/{id}  Send or re-send an e-bill for a specific article
  GET  /api/whatsapp/ebill-text/{id}    Get formatted e-bill text for an article
"""

from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from backend.database import get_db
from backend.services.auth import require_owner, require_staff_or_owner
from backend.services.whatsapp import (
    get_whatsapp_config,
    send_meta_whatsapp,
    format_phone_number,
    generate_ebill_text,
)

router = APIRouter()


class WhatsAppTestPayload(BaseModel):
    phone: Optional[str] = None
    phone_number: Optional[str] = None
    message: Optional[str] = None
    override_token: Optional[str] = None
    override_phone_id: Optional[str] = None
    mode: Optional[str] = None  # 'text' or 'template'


class WhatsAppSendArticlePayload(BaseModel):
    phone_override: Optional[str] = None
    mode: Optional[str] = None


@router.get("/whatsapp/status")
def whatsapp_status(current_user: dict = Depends(require_staff_or_owner)):
    """Returns current WhatsApp configuration state (without exposing full secret token)."""
    cfg = get_whatsapp_config()
    token_preview = ""
    if cfg["token"]:
        token_preview = f"{cfg['token'][:8]}...{cfg['token'][-6:]}" if len(cfg["token"]) > 14 else "***"

    return {
        "success": True,
        "enabled": cfg["enabled"],
        "has_token": bool(cfg["token"]),
        "token_preview": token_preview,
        "phone_number_id": cfg["phone_number_id"],
        "waba_id": cfg["waba_id"],
        "template_name": cfg["template_name"],
        "language_code": cfg["language_code"],
        "send_mode": cfg["send_mode"],
        "shop_name": cfg["shop_name"],
    }


@router.post("/whatsapp/test")
async def whatsapp_test(
    payload: WhatsAppTestPayload,
    current_user: dict = Depends(require_owner),
):
    """
    Sends a test message using provided or saved credentials to verify connection.
    """
    target_phone = payload.phone or payload.phone_number
    if not target_phone:
        raise HTTPException(status_code=400, detail="Target phone number is required.")

    cfg = get_whatsapp_config()
    shop_title = cfg.get("shop_name", "Bridal Studio")
    test_message = (
        payload.message
        or f"🌸 *{shop_title}* — Test Message\n\nYour WhatsApp Cloud API integration is connected and working perfectly! 🎉"
    )
    success, message, meta_resp = await send_meta_whatsapp(
        to_phone=target_phone,
        custom_text=test_message,
        override_token=payload.override_token,
        override_phone_id=payload.override_phone_id,
        force_mode=payload.mode or "text",
    )

    if not success:
        return {
            "success": False,
            "message": message,
            "meta_response": meta_resp,
        }

    return {
        "success": True,
        "message": message,
        "meta_response": meta_resp,
    }


@router.post("/whatsapp/send-article/{article_id}")
async def whatsapp_send_article(
    article_id: int,
    payload: Optional[WhatsAppSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Send or re-send the e-bill for a specific booked garment.
    """
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    target_phone = (payload.phone_override if payload and payload.phone_override else None) or article.get("customer_phone")

    if not target_phone:
        raise HTTPException(
            status_code=400,
            detail="No customer phone number found for this article. Please provide a phone number."
        )

    mode = (payload.mode if payload and payload.mode else None)

    cfg = get_whatsapp_config()
    shop_title = cfg.get("shop_name", "Mehak Bridal Studio")
    ebill_text = generate_ebill_text(article, shop_title)

    if cfg["enabled"] and cfg["token"] and cfg["phone_number_id"]:
        success, msg, meta_resp = await send_meta_whatsapp(
            to_phone=target_phone,
            article=article,
            custom_text=ebill_text,
            force_mode=mode,
        )
    else:
        success = False
        msg = "WhatsApp Cloud API is not configured or disabled in Settings. Use direct click-to-chat link."
        meta_resp = {}

    return {
        "success": success,
        "message": msg,
        "target_phone": target_phone,
        "ebill_text": ebill_text,
        "meta_response": meta_resp,
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
    cfg = get_whatsapp_config()
    shop_title = cfg.get("shop_name", "Mehak Bridal Studio")
    text = generate_ebill_text(article, shop_title)
    phone = article.get("customer_phone")
    clean_phone = format_phone_number(phone) if phone else None
    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": clean_phone,
        "ebill_text": text,
    }
