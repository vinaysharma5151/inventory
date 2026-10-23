"""
routes/whatsapp.py — Direct WhatsApp E-Bill Messaging.

WHY:
Pure direct click-to-chat WhatsApp delivery (wa.me).
No heavy browser drivers, no pairing QR codes, no background Chromium sessions.
Generates verified wa.me links with luxury e-bill text instantly.

Endpoints:
  GET  /api/whatsapp/status             Overall WhatsApp status & shop name
  POST /api/whatsapp/send-article/{id}  Generate direct wa.me link & e-bill text
  GET  /api/whatsapp/ebill-text/{id}    Get formatted e-bill text & wa.me URL
"""

from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from backend.database import get_db
from backend.services.auth import require_staff_or_owner
from backend.services.whatsapp import (
    get_whatsapp_config,
    get_shop_name,
    format_phone_number,
    generate_ebill_text,
    get_whatsapp_url,
    get_whatsapp_app_url,
)

router = APIRouter()


class WhatsAppSendArticlePayload(BaseModel):
    phone_override: Optional[str] = None
    mode: Optional[str] = None


@router.get("/whatsapp/status")
def whatsapp_status(current_user: dict = Depends(require_staff_or_owner)):
    """Returns current WhatsApp configuration state & mode (direct click-to-chat)."""
    cfg = get_whatsapp_config()
    return {
        "success": True,
        "enabled": True,
        "mode": "direct",
        "pair_status": "direct",
        "shop_name": cfg.get("shop_name", "Mehak Bridal Studio"),
    }


@router.post("/whatsapp/send-article/{article_id}")
def whatsapp_send_article(
    article_id: int,
    payload: Optional[WhatsAppSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Generates the direct wa.me click-to-chat link and formatted e-bill for an article.
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

    return {
        "success": True,
        "direct_sent": False,
        "message": "WhatsApp link ready",
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


