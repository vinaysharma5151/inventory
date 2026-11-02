"""
services/sms.py — Capcom6 Android SMS Gateway Service for Mehak Bridal Studio.

Responsibilities:
  - Sanitize and normalize mobile numbers to international format (+91XXXXXXXXXX).
  - Generate clean, compact plain-text SMS e-bills and pickup reminders.
  - Dispatch SMS via Android SMS Gateway (Capcom6) over local Wi-Fi.
  - Save SMS dispatch history & delivery logs to SQLite.
  - Zero external dependencies: uses Python standard library (urllib, base64, json).
"""

import asyncio
import base64
from datetime import datetime, timedelta
import http.client
import json
import logging
import re
import socket
import urllib.parse
import uuid
from typing import Any, Dict, Optional, Tuple

from backend.database import get_db
from backend.sse import broadcast

logger = logging.getLogger("sms_service")
logger.setLevel(logging.INFO)


def format_sms_phone_number(phone_raw: Optional[str]) -> Optional[str]:
    """
    Sanitize and normalize customer phone number to E.164 format with leading '+'.
    - 10 digits (e.g. 9876543210) -> +919876543210.
    - 11 digits starting with 0 -> +919876543210.
    - 12 digits starting with 91 -> +919876543210.
    - Returns None if fewer than 10 digits.
    """
    if not phone_raw:
        return None

    raw_str = str(phone_raw).strip()
    digits = re.sub(r"\D", "", raw_str)

    if len(digits) == 10:
        return f"+91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"
    elif len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    elif len(digits) >= 11:
        return f"+{digits}"
    return None


def get_shop_name() -> str:
    """Retrieve shop name from SQLite settings or default to 'Bridal Studio'."""
    try:
        db = get_db()
        row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
        if row and row["value"]:
            return row["value"].strip()
    except Exception as e:
        logger.error(f"[SMS] Failed to load shop name: {e}")
    return "Bridal Studio"


def get_today_sms_count() -> int:
    """Count how many SMS messages have been dispatched successfully today."""
    try:
        db = get_db()
        row = db.execute(
            "SELECT COUNT(*) FROM sms_messages WHERE direction = 'outbound' AND status = 'sent' AND date(created_at) = date('now', 'localtime')"
        ).fetchone()
        return int(row[0]) if row else 0
    except Exception as e:
        logger.error(f"[SMS] Failed to count today's SMS: {e}")
        return 0


def get_sms_config() -> Dict[str, Any]:
    """Retrieve SMS Gateway credentials & config from SQLite settings."""
    try:
        db = get_db()
        rows = db.execute("SELECT key, value FROM settings WHERE key LIKE 'sms_%'").fetchall()
        cfg = {row["key"]: row["value"] for row in rows}
        
        gateway_url = (cfg.get("sms_gateway_url") or "").strip().rstrip("/")
        login = (cfg.get("sms_login") or "").strip()
        password = (cfg.get("sms_password") or "").strip()
        token = (cfg.get("sms_token") or "").strip()
        is_configured = bool(gateway_url)

        return {
            "gateway_url": gateway_url,
            "login": login,
            "password": password,
            "token": token,
            "is_configured": is_configured,
        }
    except Exception as e:
        logger.error(f"[SMS] Failed to load SMS settings: {e}")
        return {
            "gateway_url": "",
            "login": "",
            "password": "",
            "token": "",
            "is_configured": False,
        }


def save_sms_config(
    gateway_url: str,
    login: Optional[str] = "",
    password: Optional[str] = "",
    token: Optional[str] = "",
) -> bool:
    """Save SMS Gateway credentials in SQLite settings using parameterized queries."""
    try:
        db = get_db()
        cleaned_url = (gateway_url or "").strip().rstrip("/")
        pairs = [
            ("sms_gateway_url", cleaned_url),
            ("sms_login", (login or "").strip()),
            ("sms_password", (password or "").strip()),
            ("sms_token", (token or "").strip()),
        ]
        for k, v in pairs:
            db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v))
        db.commit()
        return True
    except Exception as e:
        logger.error(f"[SMS] Failed to save SMS config: {e}")
        return False


def save_sms_message_log(
    customer_phone: str,
    customer_name: Optional[str],
    message_body: str,
    status: str = "sent",
    error_message: Optional[str] = None,
    message_id: Optional[str] = None,
) -> int:
    """Save dispatched SMS log in SQLite database."""
    try:
        db = get_db()
        msg_id = message_id or f"sms_{uuid.uuid4().hex[:12]}"
        cur = db.execute(
            """
            INSERT INTO sms_messages (
                message_id, customer_phone, customer_name, direction, message_body, status, error_message
            ) VALUES (?, ?, ?, 'outbound', ?, ?, ?)
            """,
            (msg_id, customer_phone, customer_name or "", message_body, status, error_message),
        )
        db.commit()
        return cur.lastrowid
    except Exception as e:
        logger.error(f"[SMS] Failed to save SMS log: {e}")
        return 0


def generate_sms_ebill_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate a clean, compact plain-text SMS e-bill (under standard multi-part limits)."""
    store = (shop_name or get_shop_name()).upper()
    cust = (article.get("customer_name") or "Valued Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip().lstrip("#")
    raw_title = str(article.get("title") or "").strip()
    category = str(article.get("category") or "Bridal").replace("–", "-").replace("—", "-")
    item = category if (not raw_title or raw_title.startswith("Booking -") or raw_title.lower() == cust.lower()) else raw_title

    pickup = article.get("pickup_date") or "N/A"
    ret_date = article.get("return_date") or "N/A"
    price = float(article.get("price") or 0)
    adv = float(article.get("advance_amount") or 0)
    bal = float(article.get("balance_amount") if article.get("balance_amount") is not None else max(0.0, price - adv))

    bal_str = "Rs 0 (Paid)" if bal <= 0 else f"Rs {bal:,.0f}"

    lines = [
        f"{store}: BOOKING {art_id}",
        f"Dear {cust}",
        f"Item: {item}",
        f"Pickup: {pickup}",
        f"Return: {ret_date}",
        f"Total: Rs {price:,.0f}",
        f"Adv Paid: Rs {adv:,.0f}",
        f"Bal Due: {bal_str}",
        "Thank you for choosing us!",
    ]
    return "\n".join(lines)


def generate_sms_reminder_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate a compact plain-text pickup reminder SMS."""
    store = (shop_name or get_shop_name()).upper()
    cust = (article.get("customer_name") or "Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip().lstrip("#")
    price = float(article.get("price") or 0)
    adv = float(article.get("advance_amount") or 0)
    bal = float(article.get("balance_amount") if article.get("balance_amount") is not None else max(0.0, price - adv))
    bal_str = f"Bal Due: Rs {bal:,.0f}." if bal > 0 else "Fully Paid."

    return (
        f"{store} REMINDER:\n"
        f"Dear {cust}, outfit {art_id} is scheduled for pickup tomorrow. {bal_str}\n"
        f"Please collect from our shop."
    )


def generate_sms_return_reminder_text(article: Dict[str, Any], shop_name: Optional[str] = None) -> str:
    """Generate a compact plain-text 1-day before return reminder SMS."""
    store = (shop_name or get_shop_name()).upper()
    cust = (article.get("customer_name") or "Customer").strip()
    art_id = str(article.get("article_id") or "N/A").strip().lstrip("#")
    price = float(article.get("price") or 0)
    adv = float(article.get("advance_amount") or 0)
    bal = float(article.get("balance_amount") if article.get("balance_amount") is not None else max(0.0, price - adv))
    bal_str = f" Bal Due: Rs {bal:,.0f}." if bal > 0 else ""

    return (
        f"{store} REMINDER:\n"
        f"Dear {cust}, outfit {art_id} is scheduled for return tomorrow.{bal_str}\n"
        f"Kindly return it to our shop on or before the due date to avoid late charges of Rs 300/day.\n"
        f"Thank you for choosing us!"
    )


def send_sms_via_gateway(
    phone_number: str,
    message_text: str,
    customer_name: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Send an SMS message via the Capcom6 Android SMS Gateway.
    Returns: (success: bool, status_message: str, response_data: dict | None)
    """
    clean_phone = format_sms_phone_number(phone_number)
    if not clean_phone:
        return False, "Invalid mobile number. Must have at least 10 digits.", None

    cfg = get_sms_config()
    if not cfg["is_configured"]:
        return False, "SMS Gateway URL not configured. Please open SMS Settings.", None

    base_url = cfg["gateway_url"]
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = f"http://{base_url}"

    parsed = urllib.parse.urlparse(base_url)
    is_https = parsed.scheme.lower() == "https"
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if is_https else 80)
    path = (parsed.path or "").rstrip("/")
    if not path.endswith("/message"):
        send_path = f"{path}/message" if path else "/message"
    else:
        send_path = path

    payload = {
        "message": message_text,
        "phoneNumbers": [clean_phone],
    }
    encoded_payload = json.dumps(payload)

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "MehakBridalStudio-SMS/1.0",
    }

    if cfg["login"] and cfg["password"]:
        auth_str = f"{cfg['login']}:{cfg['password']}"
        b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {b64_auth}"
    elif cfg["token"]:
        headers["Authorization"] = f"Bearer {cfg['token']}"

    try:
        conn_cls = http.client.HTTPSConnection if is_https else http.client.HTTPConnection
        conn = conn_cls(host, port, timeout=6)
        conn.request("POST", send_path, body=encoded_payload, headers=headers)
        response = conn.getresponse()
        status_code = response.status
        resp_body = response.read().decode("utf-8")
        conn.close()

        res_json = {}
        if resp_body:
            try:
                res_json = json.loads(resp_body)
            except Exception:
                res_json = {"raw": resp_body}

        if 200 <= status_code < 300:
            msg_id = str(res_json.get("id") or "")
            save_sms_message_log(
                clean_phone, customer_name, message_text, status="sent", message_id=msg_id
            )
            today_count = get_today_sms_count()
            limit_notice = ""
            if today_count >= 100:
                limit_notice = " (Notice: 100 SMS daily limit reached on this SIM. Operator may throttle)."
            elif today_count >= 80:
                limit_notice = f" (SIM Daily Counter: {today_count}/100 SMS used today)."

            success_msg = f"SMS dispatched successfully via Android Gateway.{limit_notice}"
            logger.info(f"[SMS] Dispatched to {clean_phone} - Today total: {today_count}")
            return True, success_msg, res_json

        elif status_code == 401:
            err_msg = "Authentication failed (401). Check username & password in SMS Gateway settings."
            save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=err_msg)
            return False, err_msg, res_json

        elif status_code == 400:
            detail = res_json.get("message") or f"Invalid request format (400)"
            err_msg = f"SMS Gateway rejected request: {detail}"
            save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=err_msg)
            return False, err_msg, res_json

        elif status_code == 404:
            err_msg = f"SMS Gateway endpoint '{send_path}' not found (404). Ensure app supports /message."
            save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=err_msg)
            return False, err_msg, res_json

        else:
            err_msg = f"SMS Gateway returned unexpected HTTP error: {status_code}"
            save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=err_msg)
            return False, err_msg, res_json

    except (socket.timeout, TimeoutError):
        err_msg = (
            f"Connection timed out (6s). The Android phone at {host} may have gone to sleep or disconnected. "
            f"Turn phone screen on or set battery optimization to 'Unrestricted'."
        )
        logger.error(f"[SMS] Timeout connecting to {host}:{port}")
        save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=err_msg)
        return False, err_msg, None

    except ConnectionRefusedError:
        err_msg = (
            f"Connection refused by {host}:{port}. The phone is on Wi-Fi, but the SMS Gateway service is STOPPED. "
            f"Open Capcom6 on your phone and tap 'Start Service'."
        )
        logger.error(f"[SMS] Connection refused at {host}:{port}")
        save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=err_msg)
        return False, err_msg, None

    except socket.gaierror:
        err_msg = (
            f"Cannot resolve address '{host}'. The phone's IP address may have changed or your computer disconnected from Wi-Fi."
        )
        logger.error(f"[SMS] Cannot resolve host {host}")
        save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=err_msg)
        return False, err_msg, None

    except OSError as os_err:
        err_msg = (
            f"Cannot reach phone at {host}:{port} ({os_err.strerror or os_err}). "
            f"Verify both computer and phone are connected to the same JioFiber Wi-Fi."
        )
        logger.error(f"[SMS] OS network error: {os_err}")
        save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=str(os_err))
        return False, err_msg, None

    except Exception as exc:
        err_msg = f"Unexpected error dispatching SMS: {str(exc)}"
        logger.error(f"[SMS] Unexpected exception: {exc}", exc_info=True)
        save_sms_message_log(clean_phone, customer_name, message_text, status="failed", error_message=str(exc))
        return False, "Failed to send SMS message to phone. Check logs for details.", None


async def check_and_send_due_reminders(db=None) -> Dict[str, Any]:
    """
    Check and auto-dispatch 1-day pickup & return reminders.
    Rules:
      - Pickup reminders: pickup_date is tomorrow, status='booked', pickup_reminder_sent=0.
      - Return reminders: return_date is tomorrow, status='picked_up', return_reminder_sent=0.
      - If sent, increments reminder sent count by +1 so messages are not sent twice.
      - Broadcasts 'SMS_SENT' SSE event for real-time desktop popups.
    """
    if db is None:
        db = get_db()

    today = datetime.now().date()
    tomorrow = today + timedelta(days=1)
    tomorrow_str = tomorrow.strftime("%Y-%m-%d")

    shop_title = get_shop_name()
    pickup_sent_count = 0
    return_sent_count = 0
    details = []

    # 1. Pickup reminders (1 day before pickup)
    try:
        cur = db.execute(
            """
            SELECT * FROM articles
            WHERE status = 'booked'
              AND TRIM(pickup_date) = ?
              AND (pickup_reminder_sent IS NULL OR pickup_reminder_sent = 0)
              AND customer_phone IS NOT NULL
              AND TRIM(customer_phone) != ''
            """,
            (tomorrow_str,),
        )
        pickup_rows = [dict(r) for r in cur.fetchall()]
        for art in pickup_rows:
            clean_phone = format_sms_phone_number(art.get("customer_phone"))
            if not clean_phone:
                continue
            sms_text = generate_sms_reminder_text(art, shop_title)
            cust_name = art.get("customer_name") or "Valued Customer"
            success, send_msg, _ = await asyncio.to_thread(
                send_sms_via_gateway, clean_phone, sms_text, cust_name
            )
            if success:
                db.execute(
                    "UPDATE articles SET pickup_reminder_sent = COALESCE(pickup_reminder_sent, 0) + 1 WHERE id = ?",
                    (art["id"],),
                )
                db.commit()
                pickup_sent_count += 1
                details.append({
                    "type": "Pickup Reminder",
                    "article_id": art.get("article_id"),
                    "customer_name": cust_name,
                    "phone": clean_phone,
                })
                await broadcast("SMS_SENT", {
                    "type": "Pickup Reminder",
                    "recipient": cust_name,
                    "phone": clean_phone,
                    "article_id": art.get("article_id"),
                })
            else:
                enqueue_failed_sms(
                    customer_phone=clean_phone,
                    customer_name=cust_name,
                    message_body=sms_text,
                    sms_type="Pickup Reminder",
                    error_message=send_msg,
                    article_id=art.get("id"),
                )
    except Exception as e:
        logger.error(f"[SMS] Error checking pickup reminders: {e}")

    # 2. Return reminders (1 day before return)
    try:
        cur = db.execute(
            """
            SELECT * FROM articles
            WHERE status = 'picked_up'
              AND TRIM(return_date) = ?
              AND (return_reminder_sent IS NULL OR return_reminder_sent = 0)
              AND customer_phone IS NOT NULL
              AND TRIM(customer_phone) != ''
            """,
            (tomorrow_str,),
        )
        return_rows = [dict(r) for r in cur.fetchall()]
        for art in return_rows:
            clean_phone = format_sms_phone_number(art.get("customer_phone"))
            if not clean_phone:
                continue
            sms_text = generate_sms_return_reminder_text(art, shop_title)
            cust_name = art.get("customer_name") or "Valued Customer"
            success, send_msg, _ = await asyncio.to_thread(
                send_sms_via_gateway, clean_phone, sms_text, cust_name
            )
            if success:
                db.execute(
                    "UPDATE articles SET return_reminder_sent = COALESCE(return_reminder_sent, 0) + 1 WHERE id = ?",
                    (art["id"],),
                )
                db.commit()
                return_sent_count += 1
                details.append({
                    "type": "Return Reminder",
                    "article_id": art.get("article_id"),
                    "customer_name": cust_name,
                    "phone": clean_phone,
                })
                await broadcast("SMS_SENT", {
                    "type": "Return Reminder",
                    "recipient": cust_name,
                    "phone": clean_phone,
                    "article_id": art.get("article_id"),
                })
            else:
                enqueue_failed_sms(
                    customer_phone=clean_phone,
                    customer_name=cust_name,
                    message_body=sms_text,
                    sms_type="Return Reminder",
                    error_message=send_msg,
                    article_id=art.get("id"),
                )
    except Exception as e:
        logger.error(f"[SMS] Error checking return reminders: {e}")

    rem_count = get_pending_sms_count()
    if rem_count > 0:
        await broadcast("SMS_QUEUE_UPDATE", {"count": rem_count})

    return {
        "success": True,
        "date_checked": tomorrow_str,
        "pickup_reminders_sent": pickup_sent_count,
        "return_reminders_sent": return_sent_count,
        "total_sent": pickup_sent_count + return_sent_count,
        "details": details,
    }


def enqueue_failed_sms(
    customer_phone: str,
    customer_name: Optional[str],
    message_body: str,
    sms_type: str,
    error_message: Optional[str] = None,
    article_id: Optional[int] = None,
) -> int:
    """
    Enqueue a failed SMS message into the persistent outbox queue.
    If a pending message already exists for the same phone & message_body, update its error & timestamp.
    """
    try:
        db = get_db()
        existing = db.execute(
            """
            SELECT id FROM sms_queue
            WHERE customer_phone = ? AND message_body = ? AND status = 'pending'
            LIMIT 1
            """,
            (customer_phone, message_body),
        ).fetchone()

        if existing:
            q_id = existing[0]
            db.execute(
                """
                UPDATE sms_queue
                SET error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (error_message, q_id),
            )
            db.commit()
            return q_id

        cur = db.execute(
            """
            INSERT INTO sms_queue (
                article_id, customer_phone, customer_name, sms_type, message_body, status, error_message
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
            """,
            (article_id, customer_phone, customer_name or "", sms_type, message_body, error_message),
        )
        db.commit()
        return cur.lastrowid
    except Exception as e:
        logger.error(f"[SMS Queue] Failed to enqueue SMS: {e}")
        return 0


def get_pending_sms_queue() -> list:
    """Return all pending messages waiting to be sent."""
    try:
        db = get_db()
        rows = db.execute(
            """
            SELECT id, article_id, customer_phone, customer_name, sms_type, message_body, error_message, retry_count, created_at, updated_at
            FROM sms_queue
            WHERE status = 'pending'
            ORDER BY id ASC
            """
        ).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"[SMS Queue] Failed to query queue: {e}")
        return []


def get_pending_sms_count() -> int:
    """Return number of unsent pending SMS messages."""
    try:
        db = get_db()
        row = db.execute("SELECT COUNT(*) FROM sms_queue WHERE status = 'pending'").fetchone()
        return row[0] if row else 0
    except Exception:
        return 0


async def retry_pending_sms_queue() -> Dict[str, Any]:
    """
    Retry sending all pending messages in the SMS outbox queue.
    Once sent, marks item as 'sent' so it is dismissed from the bottom-right queue.
    Broadcasts 'SMS_SENT' for each success and 'SMS_QUEUE_UPDATE'.
    """
    pending = get_pending_sms_queue()
    if not pending:
        return {"success": True, "retried": 0, "sent": 0, "remaining": 0, "details": []}

    db = get_db()
    sent_count = 0
    details = []

    for item in pending:
        phone = item["customer_phone"]
        body = item["message_body"]
        name = item["customer_name"]
        sms_type = item["sms_type"]
        q_id = item["id"]
        art_id = item["article_id"]

        success, send_msg, _ = await asyncio.to_thread(
            send_sms_via_gateway, phone, body, name
        )

        if success:
            db.execute(
                "UPDATE sms_queue SET status = 'sent', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (q_id,),
            )
            if art_id:
                if sms_type == "Pickup Reminder":
                    db.execute("UPDATE articles SET pickup_reminder_sent = COALESCE(pickup_reminder_sent, 0) + 1 WHERE id = ?", (art_id,))
                elif sms_type == "Return Reminder":
                    db.execute("UPDATE articles SET return_reminder_sent = COALESCE(return_reminder_sent, 0) + 1 WHERE id = ?", (art_id,))
            db.commit()
            sent_count += 1
            details.append({
                "id": q_id,
                "customer_name": name,
                "phone": phone,
                "sms_type": sms_type,
                "status": "sent",
            })
            await broadcast("SMS_SENT", {
                "type": sms_type,
                "recipient": name or "Customer",
                "phone": phone,
                "article_id": art_id,
            })
        else:
            db.execute(
                """
                UPDATE sms_queue
                SET retry_count = retry_count + 1, error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (send_msg, q_id),
            )
            db.commit()
            details.append({
                "id": q_id,
                "customer_name": name,
                "phone": phone,
                "sms_type": sms_type,
                "status": "failed",
                "error": send_msg,
            })

    remaining = get_pending_sms_count()
    await broadcast("SMS_QUEUE_UPDATE", {
        "count": remaining,
        "sent_count": sent_count,
    })

    return {
        "success": True,
        "retried": len(pending),
        "sent": sent_count,
        "remaining": remaining,
        "details": details,
    }


def dismiss_queued_sms(queue_id: int) -> bool:
    """Staff manually dismisses a stuck queue item."""
    try:
        db = get_db()
        db.execute("UPDATE sms_queue SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (queue_id,))
        db.commit()
        return True
    except Exception as e:
        logger.error(f"[SMS Queue] Failed to dismiss: {e}")
        return False

