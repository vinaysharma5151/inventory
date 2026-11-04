"""
routes/sms.py — Android SMS Gateway Integration for Mehak Bridal Studio.

Endpoints:
  GET  /api/sms/status             Overall SMS status & gateway presence
  POST /api/sms/settings           Save Android SMS Gateway URL & Credentials
  POST /api/sms/test               Send test ping via Android SMS Gateway
  GET  /api/sms/ebill-text/{id}    Get formatted plain-text SMS e-bill
  POST /api/sms/send-article/{id}  Dispatch e-bill via Android SMS Gateway
  GET  /api/sms/reminder-text/{id} Get formatted SMS pickup reminder text
  POST /api/sms/send-reminder/{id} Dispatch pickup reminder via Android SMS Gateway
  GET  /api/sms/history            Get history of dispatched SMS messages
"""

import logging
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException

from backend.database import get_db
from backend.services.auth import require_staff_or_owner, require_owner
from backend.services.sms import (
    get_sms_config,
    save_sms_config,
    format_sms_phone_number,
    generate_sms_ebill_text,
    generate_sms_reminder_text,
    generate_sms_return_reminder_text,
    send_sms_via_gateway,
    get_shop_name,
    get_today_sms_count,
    check_and_send_due_reminders,
    enqueue_failed_sms,
    get_pending_sms_queue,
    get_pending_sms_count,
    retry_pending_sms_queue,
    dismiss_queued_sms,
)
from backend.sse import broadcast

logger = logging.getLogger("sms_route")
router = APIRouter()


class SMSSendArticlePayload(BaseModel):
    phone_override: Optional[str] = None
    custom_text: Optional[str] = None


class SMSSettingsPayload(BaseModel):
    gateway_url: str = Field(..., min_length=1)
    login: Optional[str] = ""
    password: Optional[str] = ""
    token: Optional[str] = ""


class SMSTestPayload(BaseModel):
    phone_number: str = Field(..., min_length=10)
    message: Optional[str] = None


@router.get("/sms/status")
def sms_status(current_user: dict = Depends(require_staff_or_owner)):
    """Return status of the Android SMS Gateway."""
    cfg = get_sms_config()
    masked_pw = ("*" * len(cfg["password"])) if cfg["password"] else ""
    masked_token = (f"{cfg['token'][:4]}...{cfg['token'][-4:]}" if len(cfg["token"]) > 8 else "***") if cfg["token"] else ""
    today_count = get_today_sms_count()

    return {
        "success": True,
        "is_configured": cfg["is_configured"],
        "gateway_url": cfg["gateway_url"],
        "login": cfg["login"],
        "masked_password": masked_pw,
        "masked_token": masked_token,
        "today_sms_count": today_count,
        "daily_carrier_limit": 100,
    }


@router.post("/sms/settings")
def update_sms_settings(
    payload: SMSSettingsPayload,
    current_user: dict = Depends(require_owner),
):
    """Save Android SMS Gateway credentials (Owner only)."""
    saved = save_sms_config(
        gateway_url=payload.gateway_url,
        login=payload.login,
        password=payload.password,
        token=payload.token,
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to persist SMS settings to database.")

    cfg = get_sms_config()
    return {
        "success": True,
        "message": "SMS Gateway settings updated successfully.",
        "gateway_url": cfg["gateway_url"],
        "is_configured": cfg["is_configured"],
    }


@router.post("/sms/test")
def test_sms_gateway(
    payload: SMSTestPayload,
    current_user: dict = Depends(require_owner),
):
    """Send a test SMS to confirm connection with the Android phone."""
    cfg = get_sms_config()
    if not cfg["is_configured"]:
        raise HTTPException(
            status_code=400,
            detail="SMS Gateway URL is not configured. Please enter the Android phone IP.",
        )

    shop = get_shop_name()
    test_msg = payload.message or f"Test SMS ping from {shop} rental system. Connection to Android SMS Gateway is working!"
    success, message, extra = send_sms_via_gateway(
        phone_number=payload.phone_number,
        message_text=test_msg,
        customer_name="Test Recipient",
    )

    if not success:
        raise HTTPException(status_code=502, detail=message)

    return {
        "success": True,
        "message": message,
        "details": extra,
    }


@router.get("/sms/ebill-text/{article_id}")
def sms_ebill_text(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Generate and return formatted plain-text SMS e-bill."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_sms_ebill_text(article, shop_title)
    clean_phone = format_sms_phone_number(article.get("customer_phone") or article.get("customer_alt_phone"))

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": article.get("customer_phone"),
        "customer_alt_phone": article.get("customer_alt_phone"),
        "formatted_phone": clean_phone,
        "sms_text": text,
    }


@router.post("/sms/send-article/{article_id}")
async def sms_send_article(
    article_id: int,
    payload: Optional[SMSSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Dispatch SMS e-bill directly via Android SMS Gateway."""
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
    sms_text = (payload.custom_text if payload and payload.custom_text else None) or generate_sms_ebill_text(article, shop_title)
    customer_name = article.get("customer_name")

    success, send_msg, extra = send_sms_via_gateway(
        phone_number=target_phone,
        message_text=sms_text,
        customer_name=customer_name,
    )

    if not success:
        enqueue_failed_sms(
            customer_phone=target_phone,
            customer_name=customer_name or "Customer",
            message_body=sms_text,
            sms_type="Booking E-Bill",
            error_message=send_msg,
            article_id=article.get("id"),
        )
        await broadcast("SMS_QUEUE_UPDATE", {"count": get_pending_sms_count()})
        raise HTTPException(status_code=502, detail=send_msg)

    cust_disp = customer_name or "Customer"
    await broadcast("SMS_SENT", {
        "type": "Booking E-Bill",
        "recipient": cust_disp,
        "phone": target_phone,
        "article_id": article.get("article_id"),
    })

    return {
        "success": True,
        "message": send_msg,
        "sms_text": sms_text,
        "details": extra,
    }


@router.get("/sms/reminder-text/{article_id}")
def sms_reminder_text(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Generate and return formatted pickup reminder SMS text."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_sms_reminder_text(article, shop_title)
    clean_phone = format_sms_phone_number(article.get("customer_phone") or article.get("customer_alt_phone"))

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": article.get("customer_phone"),
        "customer_alt_phone": article.get("customer_alt_phone"),
        "formatted_phone": clean_phone,
        "sms_text": text,
    }


@router.post("/sms/send-reminder/{article_id}")
async def sms_send_reminder(
    article_id: int,
    payload: Optional[SMSSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Dispatch pickup reminder SMS via Android Gateway."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    target_phone = (
        payload.phone_override if payload and payload.phone_override else None
    ) or article.get("customer_phone") or article.get("customer_alt_phone")

    if not target_phone:
        raise HTTPException(status_code=400, detail="No customer phone number found.")

    shop_title = get_shop_name()
    sms_text = (payload.custom_text if payload and payload.custom_text else None) or generate_sms_reminder_text(article, shop_title)
    customer_name = article.get("customer_name")

    success, send_msg, extra = send_sms_via_gateway(
        phone_number=target_phone,
        message_text=sms_text,
        customer_name=customer_name,
    )

    if not success:
        enqueue_failed_sms(
            customer_phone=target_phone,
            customer_name=customer_name or "Customer",
            message_body=sms_text,
            sms_type="Pickup Reminder",
            error_message=send_msg,
            article_id=article.get("id"),
        )
        await broadcast("SMS_QUEUE_UPDATE", {"count": get_pending_sms_count()})
        raise HTTPException(status_code=502, detail=send_msg)

    # Mark pickup reminder as sent (+1)
    try:
        db.execute(
            "UPDATE articles SET pickup_reminder_sent = COALESCE(pickup_reminder_sent, 0) + 1 WHERE id = ?",
            (article_id,),
        )
        db.commit()
    except Exception as e:
        logger.error(f"[SMS] Failed to update pickup_reminder_sent: {e}")

    cust_disp = customer_name or "Customer"
    await broadcast("SMS_SENT", {
        "type": "Pickup Reminder",
        "recipient": cust_disp,
        "phone": target_phone,
        "article_id": article.get("article_id"),
    })

    return {
        "success": True,
        "message": send_msg,
        "sms_text": sms_text,
        "details": extra,
    }


@router.get("/sms/return-reminder-text/{article_id}")
def sms_return_reminder_text(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Generate and return formatted 1-day return reminder SMS text."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    shop_title = get_shop_name()
    text = generate_sms_return_reminder_text(article, shop_title)
    clean_phone = format_sms_phone_number(article.get("customer_phone") or article.get("customer_alt_phone"))

    return {
        "success": True,
        "article_id": article_id,
        "customer_phone": article.get("customer_phone"),
        "customer_alt_phone": article.get("customer_alt_phone"),
        "formatted_phone": clean_phone,
        "sms_text": text,
    }


@router.post("/sms/send-return-reminder/{article_id}")
async def sms_send_return_reminder(
    article_id: int,
    payload: Optional[SMSSendArticlePayload] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Dispatch 1-day return reminder SMS via Android Gateway."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    article = dict(row)
    target_phone = (
        payload.phone_override if payload and payload.phone_override else None
    ) or article.get("customer_phone") or article.get("customer_alt_phone")

    if not target_phone:
        raise HTTPException(status_code=400, detail="No customer phone number found.")

    shop_title = get_shop_name()
    sms_text = (payload.custom_text if payload and payload.custom_text else None) or generate_sms_return_reminder_text(article, shop_title)
    customer_name = article.get("customer_name")

    success, send_msg, extra = send_sms_via_gateway(
        phone_number=target_phone,
        message_text=sms_text,
        customer_name=customer_name,
    )

    if not success:
        enqueue_failed_sms(
            customer_phone=target_phone,
            customer_name=customer_name or "Customer",
            message_body=sms_text,
            sms_type="Return Reminder",
            error_message=send_msg,
            article_id=article.get("id"),
        )
        await broadcast("SMS_QUEUE_UPDATE", {"count": get_pending_sms_count()})
        raise HTTPException(status_code=502, detail=send_msg)

    # Mark return reminder as sent (+1)
    try:
        db.execute(
            "UPDATE articles SET return_reminder_sent = COALESCE(return_reminder_sent, 0) + 1 WHERE id = ?",
            (article_id,),
        )
        db.commit()
    except Exception as e:
        logger.error(f"[SMS] Failed to update return_reminder_sent: {e}")

    cust_disp = customer_name or "Customer"
    await broadcast("SMS_SENT", {
        "type": "Return Reminder",
        "recipient": cust_disp,
        "phone": target_phone,
        "article_id": article.get("article_id"),
    })

    return {
        "success": True,
        "message": send_msg,
        "sms_text": sms_text,
        "details": extra,
    }


@router.post("/sms/check-reminders")
@router.get("/sms/check-reminders")
async def sms_check_reminders(
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Check and dispatch today's 1-day pickup & return reminders.
    Ensures messages are only sent once per case (+1 sent tracking).
    """
    db = get_db()
    return await check_and_send_due_reminders(db)


@router.get("/sms/history")
def sms_history(
    limit: int = 50,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Retrieve recent dispatched SMS logs."""
    db = get_db()
    rows = db.execute(
        """
        SELECT id, message_id, customer_phone, customer_name, message_body, status, error_message, created_at
        FROM sms_messages
        ORDER BY id DESC
        LIMIT ?
        """,
        (min(limit, 100),),
    ).fetchall()

    return {
        "success": True,
        "messages": [dict(r) for r in rows],
    }


@router.get("/sms/queue")
def sms_queue_list(
    current_user: dict = Depends(require_staff_or_owner),
):
    """Retrieve all pending/failed SMS messages waiting in the outbox queue."""
    items = get_pending_sms_queue()
    return {
        "success": True,
        "count": len(items),
        "queue": items,
    }


@router.post("/sms/queue/retry")
async def sms_queue_retry(
    current_user: dict = Depends(require_staff_or_owner),
):
    """Retry sending all pending messages currently in the SMS outbox queue."""
    return await retry_pending_sms_queue()


@router.delete("/sms/queue/{queue_id}")
async def sms_queue_dismiss(
    queue_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Dismiss a failed message from the retry queue."""
    ok = dismiss_queued_sms(queue_id)
    rem = get_pending_sms_count()
    await broadcast("SMS_QUEUE_UPDATE", {"count": rem})
    return {"success": ok, "remaining": rem}

