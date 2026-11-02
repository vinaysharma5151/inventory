"""
routes/system.py — Real-Time SSE, Network Discovery, Setup Wizard, and System Operations.

WHY:
1. Provides the long-lived SSE (Server-Sent Events) endpoint for instant phone-to-laptop sync.
2. Serves local showroom Wi-Fi IP and camera pairing QR codes for mobile staff.
3. Manages first-run setup wizard and persistent studio settings.
4. Delegates QR generation and database backup snapshots to dedicated services.
"""

from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from backend import sse as sse_hub
from backend.config import APP_ENV, APP_VERSION, UPLOADS_DIR, get_local_ip
from backend.database import get_db
from backend.services.auth import (
    get_client_ip,
    log_audit_event,
    require_owner,
    require_staff_or_owner,
)
from backend.services.backup_service import (
    create_database_backup,
    update_inventory_csv_backup,
)
from backend.services.licensing import check_license, register_shop_in_supabase
from backend.services.qr_service import generate_qr_data_url
from backend.services.update_service import (
    check_github_for_updates,
    trigger_update_pipeline,
)

router = APIRouter()

PORT = 8000  # Default FastAPI server port
SETUP_PASSWORD = "open it"


# ---------------------------------------------------------------------------
# Server-Sent Events (SSE) Hub
# ---------------------------------------------------------------------------
@router.get("/events")
async def sse_stream(request: Request):
    """
    Zero-latency Server-Sent Events stream.
    Desktop dashboards connect here to receive immediate updates when mobile phones save bookings.
    """
    queue = asyncio.Queue(maxsize=100)
    sse_hub.add_listener(queue)

    async def event_generator():
        try:
            # Send initial keepalive ping
            yield "event: ping\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    if isinstance(msg, tuple):
                        event_type, data = msg
                        yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                    else:
                        yield str(msg)
                except asyncio.TimeoutError:
                    # Keepalive heartbeat every 15 seconds
                    yield "event: ping\ndata: {}\n\n"
        except asyncio.CancelledError:
            pass
        except Exception as e:
            pass
        finally:
            sse_hub.remove_listener(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Network Pairing Info & QR Code
# ---------------------------------------------------------------------------
@router.get("/network-info")
def network_info(port: Optional[int] = None):
    """Returns local LAN IP, mobile pairing URL, and pre-rendered QR code PNG."""
    active_port = port or PORT
    ip = get_local_ip()
    network_url = f"http://{ip}:{active_port}"
    mobile_url = f"http://{ip}:{active_port}/capture"

    qr_data = generate_qr_data_url(mobile_url)

    return {
        "success": True,
        "ip": ip,
        "port": active_port,
        "networkUrl": network_url,
        "networkCaptureUrl": mobile_url,
        "qrCodeDataUrl": qr_data,
        "instructions": (
            f"1. Connect your phone to the same Wi-Fi.\n"
            f"2. Scan this QR code or open: {mobile_url}\n"
            f"3. Snap lehenga photos and save — bookings will instantly appear here on your laptop!"
        ),
    }


# ---------------------------------------------------------------------------
# Store Inventory Statistics
# ---------------------------------------------------------------------------
@router.get("/stats")
def stats(current_user: dict = Depends(require_staff_or_owner)):
    """Computes showroom inventory counts, stage progression, and financial aggregates."""
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    total_val = db.execute("SELECT COALESCE(SUM(price), 0) FROM articles").fetchone()[0]
    total_adv = db.execute("SELECT COALESCE(SUM(advance_amount), 0) FROM articles").fetchone()[0]
    total_bal = db.execute("SELECT COALESCE(SUM(balance_amount), 0) FROM articles").fetchone()[0]

    # 3-Stage Workflow Aggregates
    booked_count = db.execute(
        "SELECT COUNT(*) FROM articles WHERE status = 'booked' OR status IS NULL OR TRIM(status) = ''"
    ).fetchone()[0]
    picked_up_count = db.execute(
        "SELECT COUNT(*) FROM articles WHERE status = 'picked_up'"
    ).fetchone()[0]
    returned_count = db.execute(
        "SELECT COUNT(*) FROM articles WHERE status = 'returned'"
    ).fetchone()[0]

    return {
        "success": True,
        "total_articles": total,
        "total_value": total_val,
        "total_advance": total_adv,
        "total_balance_due": total_bal,
        "booked_count": booked_count,
        "picked_up_count": picked_up_count,
        "returned_count": returned_count,
    }


# ---------------------------------------------------------------------------
# First-Run Setup (Frontend Setup Wizard)
# ---------------------------------------------------------------------------
@router.get("/setup-status")
def setup_status():
    """Check if first-time studio setup has already been completed."""
    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")

    completed_row = db.execute("SELECT value FROM settings WHERE key = 'first_time_setup_completed'").fetchone()
    is_completed = completed_row is not None and completed_row["value"] == "true"

    shop_row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
    shop_name = shop_row["value"] if shop_row and shop_row["value"] else ""

    logo_row = db.execute("SELECT value FROM settings WHERE key = 'shop_logo_url'").fetchone()
    logo_url = logo_row["value"] if logo_row and logo_row["value"] else "/assets/logo.png"

    # Add cache-buster timestamp if custom logo is stored in uploads
    if logo_url.startswith("/uploads/"):
        raw_name = logo_url.split("?")[0].replace("/uploads/", "")
        logo_file = UPLOADS_DIR / raw_name
        if logo_file.exists():
            logo_url = f"/uploads/{raw_name}?t={int(logo_file.stat().st_mtime)}"

    return {
        "success": True,
        "is_completed": is_completed,
        "shop_name": shop_name,
        "logo_url": logo_url,
    }


@router.get("/branding")
def get_public_branding():
    """Public showroom branding endpoint for mobile phones and staff cameras (no login required)."""
    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")

    shop_row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
    shop_name = shop_row["value"] if shop_row and shop_row["value"] else "Bridal Studio"

    logo_row = db.execute("SELECT value FROM settings WHERE key = 'shop_logo_url'").fetchone()
    logo_url = logo_row["value"] if logo_row and logo_row["value"] else "/assets/logo.png"

    if logo_url.startswith("/uploads/"):
        raw_name = logo_url.split("?")[0].replace("/uploads/", "")
        logo_file = UPLOADS_DIR / raw_name
        if logo_file.exists():
            logo_url = f"/uploads/{raw_name}?t={int(logo_file.stat().st_mtime)}"

    return {
        "success": True,
        "shop_name": shop_name,
        "logo_url": logo_url,
    }


@router.post("/setup")
async def complete_first_run_setup(request: Request):
    """Complete one-time first-run setup from the frontend after verifying password."""
    import base64
    import re as _re
    from backend.config import UPLOADS_DIR

    # Accept multipart form OR JSON body
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        password = (form.get("password") or "").strip()
        raw_name = (form.get("shop_name") or "").strip()
        logo_file = form.get("logo")
        logo_b64 = None
    else:
        payload = await request.json()
        password = (payload.get("password") or "").strip()
        raw_name = (payload.get("shop_name") or "").strip()
        logo_b64 = payload.get("logo_base64")  # Optional base64 data URI or raw base64
        logo_file = None

    if password != SETUP_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect setup password. Please enter 'open it' to unlock and initialize the studio.",
        )

    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")

    shop_name = raw_name if raw_name else "My Bridal Studio"

    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_name', ?)",
        (shop_name,),
    )
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('first_time_setup_completed', 'true')",
    )

    # Handle logo upload
    logo_url = "/assets/logo.png"
    try:
        logo_path = UPLOADS_DIR / "shop_logo.png"
        if logo_file and hasattr(logo_file, 'read'):
            contents = await logo_file.read()
            if contents:
                logo_path.write_bytes(contents)
                logo_url = "/uploads/shop_logo.png"
        elif logo_b64:
            # Strip data URI prefix if present: data:image/png;base64,...
            b64_data = _re.sub(r'^data:[^;]+;base64,', '', logo_b64)
            img_bytes = base64.b64decode(b64_data)
            logo_path.write_bytes(img_bytes)
            logo_url = "/uploads/shop_logo.png"
    except Exception as logo_err:
        import logging
        logging.getLogger("system").warning(f"[SETUP] Logo save failed: {logo_err}")

    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_logo_url', ?)",
        (logo_url,),
    )
    db.commit()

    # Register shop in Supabase (best-effort, non-blocking)
    try:
        import threading
        threading.Thread(
            target=register_shop_in_supabase,
            args=(shop_name,),
            daemon=True,
        ).start()
    except Exception:
        pass

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="FIRST_RUN_SETUP",
        username="Admin",
        role="owner",
        details=f"First-time setup completed: Shop Name set to '{shop_name}'",
        ip_address=ip,
    )

    await sse_hub.broadcast("SETTINGS_UPDATED", {
        "type": "SETTINGS_UPDATED",
        "settings": {
            "shop_name": shop_name,
            "shop_logo_url": logo_url,
            "first_time_setup_completed": "true",
        },
    })

    return {
        "success": True,
        "is_completed": True,
        "shop_name": shop_name,
        "logo_url": logo_url,
        "message": f"First-time setup completed successfully for '{shop_name}'.",
    }


# ---------------------------------------------------------------------------
# License Activation Check (Supabase)
# ---------------------------------------------------------------------------
@router.get("/license-status")
def license_status():
    """Check Supabase activation status for this shop. Called on every app boot."""
    db = get_db()
    shop_row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
    shop_name = shop_row["value"] if shop_row and shop_row["value"] else ""

    allowed, message = check_license(shop_name)

    return {
        "success": True,
        "allowed": allowed,
        "shop_name": shop_name,
        "message": message,
    }


# ---------------------------------------------------------------------------
# Settings Management (Shop Name, SMS Gateway Config)
# ---------------------------------------------------------------------------
@router.get("/settings")
def get_settings(current_user: dict = Depends(require_staff_or_owner)):
    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return {
        "success": True,
        "settings": {row["key"]: row["value"] for row in rows}
    }


@router.post("/settings")
async def update_settings(
    payload: dict,
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """Update studio settings. Restricted to showroom Owner."""
    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    for k, v in payload.items():
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (str(k), str(v))
        )
    db.commit()

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="UPDATE_SETTINGS",
        username=current_user["username"],
        role="owner",
        details=f"Updated keys: {', '.join(payload.keys())}",
        ip_address=ip,
    )

    rows = db.execute("SELECT key, value FROM settings").fetchall()
    settings_dict = {row["key"]: row["value"] for row in rows}

    await sse_hub.broadcast("SETTINGS_UPDATED", {
        "type": "SETTINGS_UPDATED",
        "settings": settings_dict,
    })

    return {
        "success": True,
        "settings": settings_dict,
    }


# ---------------------------------------------------------------------------
# Version & Backups
# ---------------------------------------------------------------------------
@router.get("/version")
def get_app_version():
    """Return the installed application version."""
    return {
        "success": True,
        "version": APP_VERSION,
        "env": APP_ENV,
    }


@router.get("/updates/check")
@router.get("/updates")
def check_for_updates():
    """
    Checks GitHub Releases for new published versions.
    Returns release information, comparison against APP_VERSION, and download asset details.
    """
    return check_github_for_updates()


@router.post("/updates/apply")
async def apply_update(
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """
    Downloads the new release executable from GitHub and triggers the safe Windows self-replacement.
    Protected: Restricted to studio owners.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    download_url = (body.get("download_url") or "").strip()
    if not download_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid download_url is required to apply the update.",
        )

    ip = get_client_ip(request)
    log_audit_event(
        get_db(),
        action="APPLY_UPDATE",
        username=current_user.get("username", "owner"),
        role="owner",
        ip_address=ip,
        details=f"Triggered application update from {download_url}",
    )

    result = trigger_update_pipeline(download_url)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("message", "Failed to apply update."),
        )

    return result


@router.post("/backup-now")
@router.post("/backup")
def trigger_manual_backup(
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """
    Creates an immediate CSV backup (inventory_backup.csv) and SQLite database snapshot
    exclusively inside the backups/ folder (not in the open app root).
    """
    csv_result = update_inventory_csv_backup()
    backup_name = create_database_backup()

    if not backup_name and not csv_result.get("success"):
        raise HTTPException(status_code=500, detail="Database file not found or could not be backed up.")

    ip = get_client_ip(request)
    log_audit_event(
        get_db(),
        action="MANUAL_BACKUP",
        username=current_user["username"],
        role="owner",
        details=f"Backup created: {csv_result.get('filename')} ({csv_result.get('count', 0)} items), Snapshot: {backup_name}",
        ip_address=ip,
    )

    return {
        "success": True,
        "backup_name": backup_name,
        "csv_backup": csv_result.get("filename"),
        "count": csv_result.get("count", 0),
        "message": csv_result.get("message") or f"Backup updated successfully as '{csv_result.get('filename')}'.",
    }

