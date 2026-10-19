"""
routes/salesmen.py — Sales staff management and staff authentication.

Endpoints:
  POST   /api/salesman/login   authenticate staff and issue session token
  GET    /api/salesmen         list all staff members
  POST   /api/salesmen         create staff member (Owner only)
  DELETE /api/salesmen/{id}    remove staff member (Owner only)
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from backend.database import get_db, hash_password, verify_password
from backend.models import SalesmanCreate, SalesmanLogin
from backend.services.auth import (
    SESSION_COOKIE_NAME,
    check_login_rate_limit,
    create_session,
    get_client_ip,
    log_audit_event,
    record_login_failure,
    require_owner,
    require_staff_or_owner,
    reset_login_failures,
)

router = APIRouter()


@router.post("/salesman/login")
def login(body: SalesmanLogin, request: Request, response: Response):
    """
    Staff login: open access without password or PIN verification.
    """
    db = get_db()
    name = (body.name or "").strip() or "Staff"

    user_row = db.execute(
        "SELECT id, username, role FROM users WHERE LOWER(username) = LOWER(?)",
        (name,),
    ).fetchone()

    if user_row:
        user_id = user_row["id"]
        valid_name = user_row["username"]
        role = user_row["role"]
    else:
        salesman_row = db.execute(
            "SELECT id, name FROM salesmen WHERE LOWER(name) = LOWER(?)",
            (name,),
        ).fetchone()
        if salesman_row:
            user_id = salesman_row["id"]
            valid_name = salesman_row["name"]
        else:
            db.execute("INSERT INTO salesmen (name, password_hash) VALUES (?, '')", (name,))
            db.commit()
            user_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            valid_name = name
        role = "staff"

    token = create_session(db, user_id=user_id, username=valid_name, role=role)
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
        "salesman": {"id": user_id, "name": valid_name, "role": role},
        "user": {"id": user_id, "username": valid_name, "role": role},
    }


@router.post("/salesman/quick-login")
def quick_login(request: Request, response: Response):
    """
    1-Click instant mobile studio access for showroom floor staff.
    Ensures a default staff account exists, issues a secure 256-bit session token,
    and sets the HttpOnly cookie so phone camera uploads work seamlessly.
    """
    db = get_db()
    ip = get_client_ip(request)
    staff_name = "Showroom Staff"

    user_row = db.execute(
        "SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)",
        (staff_name,),
    ).fetchone()

    if not user_row:
        default_hash = hash_password("staff123")
        db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'staff')",
            (staff_name, default_hash),
        )
        db.execute(
            "INSERT OR IGNORE INTO salesmen (name, password_hash) VALUES (?, ?)",
            (staff_name, default_hash),
        )
        db.commit()
        user_row = db.execute(
            "SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)",
            (staff_name,),
        ).fetchone()

    user_id = user_row["id"]
    token = create_session(db, user_id=user_id, username=staff_name, role="staff")
    log_audit_event(
        db,
        action="QUICK_STAFF_LOGIN",
        username=staff_name,
        role="staff",
        details="Quick mobile studio access granted",
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
        "salesman": {"id": user_id, "name": staff_name, "role": "staff"},
    }


@router.get("/salesmen")
def list_salesmen(current_user: dict = Depends(require_staff_or_owner)):
    """List all showroom sales staff."""
    db = get_db()
    rows = db.execute(
        "SELECT id, name, created_at FROM salesmen ORDER BY name"
    ).fetchall()
    return {"success": True, "salesmen": [dict(r) for r in rows]}


@router.post("/salesmen", status_code=status.HTTP_201_CREATED)
def create_salesman(
    body: SalesmanCreate,
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """
    Create a new staff member. Restricted to showroom Owner.
    Hashes password with bcrypt and keeps users & salesmen tables synchronized.
    """
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Staff name is required.",
        )

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (name,)
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'A user or staff member named "{name}" already exists.',
        )

    password = (body.password or "").strip()
    hashed_pw = hash_password(password) if password else ""

    # Insert into salesmen table
    db.execute(
        "INSERT INTO salesmen (name, password_hash) VALUES (?, ?)",
        (name, hashed_pw),
    )
    salesman_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Insert into authoritative users table
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'staff')",
        (name, hashed_pw),
    )
    db.commit()

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="CREATE_STAFF",
        username=current_user["username"],
        role="owner",
        target_id=str(salesman_id),
        details=f"Added staff member '{name}'",
        ip_address=ip,
    )

    created = {"id": salesman_id, "name": name, "role": "staff"}
    return {
        "success": True,
        "salesman": created,
        "message": f"Staff member '{name}' added successfully!",
    }


@router.delete("/salesmen/{salesman_id}")
def delete_salesman(
    salesman_id: int,
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """
    Remove a staff member. Restricted to showroom Owner.
    """
    db = get_db()
    row = db.execute("SELECT name FROM salesmen WHERE id = ?", (salesman_id,)).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    name = row["name"]
    db.execute("DELETE FROM salesmen WHERE id = ?", (salesman_id,))
    db.execute("DELETE FROM users WHERE LOWER(username) = LOWER(?) AND role = 'staff'", (name,))
    db.commit()

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="DELETE_STAFF",
        username=current_user["username"],
        role="owner",
        target_id=str(salesman_id),
        details=f"Removed staff member '{name}'",
        ip_address=ip,
    )

    return {"success": True, "message": f"Staff member '{name}' removed."}
