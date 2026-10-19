"""
routes/auth.py — Authentication, first-run wizard, and audit endpoints.

Endpoints:
  GET    /api/auth/setup-status   Check if an Owner account exists or needs first-run wizard
  POST   /api/auth/setup-owner    Initialize the first showroom Owner account
  POST   /api/auth/login          Authenticate username & password, returns session token
  POST   /api/auth/logout         Invalidate session and clear cookie
  GET    /api/auth/me             Return profile of current logged-in user
  GET    /api/auth/audit-logs     (Owner only) Retrieve recent showroom audit activity
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from backend.database import get_db, hash_password, verify_password
from backend.models import LoginRequest
from backend.services.auth import (
    SESSION_COOKIE_NAME,
    check_login_rate_limit,
    create_session,
    destroy_session,
    get_client_ip,
    get_current_user,
    get_session_token_from_request,
    log_audit_event,
    record_login_failure,
    require_authenticated_user,
    require_owner,
    reset_login_failures,
)

router = APIRouter()


@router.post("/auth/login")
def login(body: LoginRequest, request: Request, response: Response):
    """
    Authenticate user (Owner or Staff) with username and password.
    Includes rate-limiting (5 failures -> 15 min lockout) and audit tracking.
    """
    db = get_db()
    ip = get_client_ip(request)
    username = (body.username or "").strip()
    identifier = f"{ip}:{username.lower()}"

    # Rate limiting check
    check_login_rate_limit(db, identifier)

    user_row = db.execute(
        "SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)",
        (username,),
    ).fetchone()

    # Fallback check on salesmen table if not yet synchronized
    if not user_row:
        salesman_row = db.execute(
            "SELECT id, name, password_hash FROM salesmen WHERE LOWER(name) = LOWER(?)",
            (username,),
        ).fetchone()
        if salesman_row and verify_password(body.password, salesman_row["password_hash"]):
            # Synchronize into users table
            hashed = hash_password(body.password)
            db.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'staff')",
                (salesman_row["name"], hashed),
            )
            db.commit()
            user_row = db.execute(
                "SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)",
                (username,),
            ).fetchone()

    if not user_row or not verify_password(body.password, user_row["password_hash"]):
        record_login_failure(db, identifier)
        log_audit_event(
            db,
            action="LOGIN_FAILED",
            username=username,
            role="unknown",
            details=f"Invalid credentials for user '{username}'",
            ip_address=ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # Successful authentication
    reset_login_failures(db, identifier)
    user_id = user_row["id"]
    role = user_row["role"]
    valid_username = user_row["username"]

    token = create_session(db, user_id=user_id, username=valid_username, role=role)
    log_audit_event(
        db,
        action="LOGIN_SUCCESS",
        username=valid_username,
        role=role,
        details=f"Successful login as {role}",
        ip_address=ip,
    )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=7 * 86400,
        httponly=True,
        samesite="lax",
        path="/",
    )

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user_id,
            "username": valid_username,
            "role": role,
        },
    }


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    """
    Invalidate active session in database and clear the HttpOnly cookie.
    """
    db = get_db()
    token = get_session_token_from_request(request)
    session = get_current_user(request)

    if token:
        destroy_session(db, token)

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="LOGOUT",
        username=session["username"] if session else None,
        role=session["role"] if session else None,
        details="User logged out",
        ip_address=ip,
    )

    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"success": True, "message": "Logged out successfully."}


@router.get("/auth/me")
def get_me(current_user: Optional[dict] = Depends(get_current_user)):
    """
    Return identity of user (always open logged_in=True by default).
    """
    user = current_user or {"user_id": 1, "username": "Admin", "role": "owner"}
    return {
        "success": True,
        "logged_in": True,
        "user": {
            "id": user.get("user_id", 1),
            "username": user.get("username", "Admin"),
            "role": user.get("role", "owner"),
        },
    }


@router.get("/auth/audit-logs")
def get_audit_logs(
    limit: int = 100,
    current_user: dict = Depends(require_owner),
):
    """
    Retrieve recent audit logs. Restricted to showroom Owner.
    """
    db = get_db()
    rows = db.execute(
        """
        SELECT id, timestamp, username, role, action, target_id, details, ip_address
        FROM audit_logs
        ORDER BY id DESC
        LIMIT ?
        """,
        (min(limit, 500),),
    ).fetchall()

    return {
        "success": True,
        "count": len(rows),
        "audit_logs": [dict(r) for r in rows],
    }
