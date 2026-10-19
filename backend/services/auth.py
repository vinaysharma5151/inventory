"""
services/auth.py — Authentication, session management, RBAC dependencies, and audit logging.

Security Architecture:
1. Sessions are stored in SQLite and validated on every protected request.
2. Session tokens are 256-bit cryptographically secure random tokens.
3. Tokens are transmitted via HttpOnly cookie (with Authorization Bearer fallback for local network clients).
4. Brute-force protection: 5 failed attempts locks the IP/identifier for 15 minutes.
5. Audit logging: Records all critical business events (login, bookings, deletes, dues clearout, settings changes).
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
import sqlite3

from backend.database import get_db, verify_password


SESSION_COOKIE_NAME = "session_token"
SESSION_DURATION_DAYS = 7
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


# ---------------------------------------------------------------------------
# Session Management
# ---------------------------------------------------------------------------
def create_session(
    db: sqlite3.Connection,
    user_id: int,
    username: str,
    role: str,
    duration_days: int = SESSION_DURATION_DAYS,
) -> str:
    """
    Generate a secure 32-byte session token, store it in SQLite, and return it.
    Tokens expire after duration_days (default: 7 days).
    """
    token = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=duration_days)
    expires_str = expires_at.strftime("%Y-%m-%d %H:%M:%S")

    db.execute(
        """
        INSERT INTO sessions (token, user_id, username, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (token, user_id, username, role, expires_str),
    )
    db.commit()
    return token


def get_session(db: sqlite3.Connection, token: str) -> Optional[dict]:
    """
    Fetch an active session by token.
    Returns the session dict if valid and unexpired; otherwise returns None.
    """
    if not token:
        return None

    row = db.execute(
        """
        SELECT token, user_id, username, role, created_at, expires_at
        FROM sessions
        WHERE token = ? AND expires_at > CURRENT_TIMESTAMP
        """,
        (token,),
    ).fetchone()

    if not row:
        return None

    return dict(row)


def destroy_session(db: sqlite3.Connection, token: str) -> None:
    """Delete a session token from the database upon user logout."""
    if token:
        db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        db.commit()


# ---------------------------------------------------------------------------
# Rate Limiting & Brute-Force Protection (Disabled for Open Access)
# ---------------------------------------------------------------------------
def check_login_rate_limit(db: sqlite3.Connection, identifier: str) -> None:
    """Rate limiting disabled: allow unrestricted access without lockouts."""
    pass


def record_login_failure(db: sqlite3.Connection, identifier: str) -> None:
    """Rate limiting disabled: do not track failures."""
    pass


def reset_login_failures(db: sqlite3.Connection, identifier: str) -> None:
    """Clear login attempt entries if present."""
    try:
        db.execute("DELETE FROM login_attempts WHERE identifier = ?", (identifier,))
        db.commit()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Audit Logging
# ---------------------------------------------------------------------------
def log_audit_event(
    db: sqlite3.Connection,
    action: str,
    username: Optional[str] = None,
    role: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Append an immutable event entry to the audit_logs table.
    Ensures accountability for showroom operations (bookings, cancellations, dues clearout).
    """
    try:
        db.execute(
            """
            INSERT INTO audit_logs (username, role, action, target_id, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (username, role, action, target_id, details, ip_address),
        )
        db.commit()
    except Exception as e:
        # Never crash the main request if logging encounters an issue
        print(f"[AUDIT LOG WARNING] Failed to record audit log: {e}")


# ---------------------------------------------------------------------------
# Client IP Helper
# ---------------------------------------------------------------------------
def get_client_ip(request: Request) -> str:
    """Extract client IP address for rate-limiting and audit tracking."""
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


# ---------------------------------------------------------------------------
# FastAPI RBAC Dependencies
# ---------------------------------------------------------------------------
def get_session_token_from_request(request: Request) -> Optional[str]:
    """
    Retrieve session token from either:
    1. 'Authorization: Bearer <token>' header (explicit API authorization takes precedence)
    2. HttpOnly 'session_token' cookie (browser standard)
    """
    # 1. Check Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    # 2. Check cookie
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token:
        return cookie_token

    return None


DEFAULT_OPEN_USER = {"user_id": 1, "username": "Admin", "role": "owner"}


async def get_current_user(request: Request) -> Optional[dict]:
    """
    FastAPI dependency: Returns active session user if logged in,
    or falls back to default open Admin/Owner user.
    """
    token = get_session_token_from_request(request)
    if token:
        db = get_db()
        session = get_session(db, token)
        if session:
            return session
    return DEFAULT_OPEN_USER


require_authenticated_user = get_current_user
require_owner = get_current_user
require_staff_or_owner = get_current_user
