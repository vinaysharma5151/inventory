"""
routes/system.py — Real-Time SSE, Network Discovery, Setup Wizard, and System Operations.

WHY:
1. Provides the long-lived SSE (Server-Sent Events) endpoint for instant phone-to-laptop sync.
2. Serves local showroom Wi-Fi IP and camera pairing QR codes for mobile staff.
3. Manages first-run setup wizard and persistent studio settings.
4. Delegates QR generation, database backup snapshots, and auto-updates to dedicated services.
"""

from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from backend import sse as sse_hub
from backend.config import APP_ENV, APP_VERSION, get_local_ip
from backend.database import get_db
from backend.services.auth import (
    get_client_ip,
    log_audit_event,
    require_owner,
    require_staff_or_owner,
)
from backend.services.backup_service import create_database_backup
from backend.services.qr_service import generate_qr_data_url
from backend.services.update_service import apply_downloaded_update, check_for_updates

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
                    event_type, data = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive heartbeat every 20 seconds
                    yield "event: ping\ndata: {}\n\n"
        except asyncio.CancelledError:
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
    mobile_url = f"http://{ip}:{active_port}/"

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
    """Computes showroom inventory counts and financial aggregates."""
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    total_val = db.execute("SELECT COALESCE(SUM(price), 0) FROM articles").fetchone()[0]
    total_adv = db.execute("SELECT COALESCE(SUM(advance_amount), 0) FROM articles").fetchone()[0]
    total_bal = db.execute("SELECT COALESCE(SUM(balance_amount), 0) FROM articles").fetchone()[0]

    return {
        "success": True,
        "total_articles": total,
        "total_value": total_val,
        "total_advance": total_adv,
        "total_balance_due": total_bal,
    }


# ---------------------------------------------------------------------------
# First-Run Setup (Frontend Setup Wizard)
# ---------------------------------------------------------------------------
@router.get("/setup-status")
def setup_status():
    """Check if first-time studio setup has already been completed."""
    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    row = db.execute("SELECT value FROM settings WHERE key = 'first_time_setup_completed'").fetchone()
    is_completed = bool(row and row["value"] == "true")

    shop_row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
    shop_name = shop_row["value"] if shop_row and shop_row["value"] else "Mehak Bridal Studio"

    return {
        "success": True,
        "is_completed": is_completed,
        "shop_name": shop_name,
    }


@router.post("/setup")
async def complete_first_run_setup(payload: dict, request: Request):
    """Complete one-time first-run setup from the frontend after verifying password."""
    password = (payload.get("password") or "").strip()
    if password != SETUP_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect setup password. Please enter 'open it' to unlock and initialize the studio.",
        )

    db = get_db()
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")

    raw_name = (payload.get("shop_name") or "").strip()
    shop_name = raw_name if raw_name else "Mehak Bridal Studio"

    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_name', ?)",
        (shop_name,),
    )
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('first_time_setup_completed', 'true')",
    )
    db.commit()

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
            "first_time_setup_completed": "true",
        },
    })

    return {
        "success": True,
        "is_completed": True,
        "shop_name": shop_name,
        "message": f"First-time setup completed successfully for '{shop_name}'.",
    }


# ---------------------------------------------------------------------------
# Settings Management (Shop Name, WhatsApp Config)
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
# Version, Backups & Updates
# ---------------------------------------------------------------------------
@router.get("/version")
def get_app_version():
    """Return the installed application version."""
    return {
        "success": True,
        "version": APP_VERSION,
        "env": APP_ENV,
    }


@router.get("/check-update")
def check_for_update(current_user: dict = Depends(require_staff_or_owner)):
    """Check if a newer version of the software is available."""
    return check_for_updates()


@router.post("/backup-now")
def trigger_manual_backup(
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """Creates an immediate snapshot of the SQLite database in the backups/ folder."""
    backup_name = create_database_backup()
    if not backup_name:
        raise HTTPException(status_code=500, detail="Database file not found or could not be backed up.")

    ip = get_client_ip(request)
    log_audit_event(
        get_db(),
        action="MANUAL_BACKUP",
        username=current_user["username"],
        role="owner",
        details=f"Manual snapshot created: {backup_name}",
        ip_address=ip,
    )

    return {
        "success": True,
        "backup_name": backup_name,
        "message": f"Backup snapshot created successfully as '{backup_name}' in the backups/ folder.",
    }


@router.post("/apply-update")
async def apply_update(
    payload: dict,
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """
    Downloads new .exe, backs up database, and launches update script to restart app.
    Owner only.
    """
    download_url = payload.get("download_url", "")
    backup_name = apply_downloaded_update(download_url)

    log_audit_event(
        get_db(),
        action="APPLY_UPDATE",
        username=current_user["username"],
        role="owner",
        details=f"Backup: {backup_name}, URL: {download_url}",
        ip_address=get_client_ip(request),
    )

    return {
        "success": True,
        "message": "Update downloaded and verified. The application is restarting with the new version...",
        "backup_created": backup_name,
    }
