"""
routes/articles.py — Secure Article CRUD, Dues Clearout, and Inventory Endpoints.

WHY:
1. Enforces Role-Based Access Control (RBAC):
   - Listing, viewing, and creating articles: Staff and Owner.
   - Deleting articles, clearing dues, and CSV exports: Strictly Owner only.
2. Delegates image processing & validation to services/image_service.py.
3. Delegates formula-safe spreadsheet export to services/export_service.py.
4. Preserves server-enforced financial invariants (balance = max(0.0, price - advance)).
5. Emits real-time SSE broadcasts on create, update, delete, and dues clearout.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from backend.config import DATA_DIR
from backend.database import article_row_to_dict, generate_article_id, get_db
from backend.models import ArticleUpdate, ClearDuesRequest
from backend.services.auth import (
    get_client_ip,
    log_audit_event,
    require_owner,
    require_staff_or_owner,
)
from backend.services.export_service import generate_inventory_csv_response
from backend.services.image_service import save_article_image
from backend.services.whatsapp import send_booking_ebill_task
from backend.sse import broadcast

router = APIRouter()


# ---------------------------------------------------------------------------
# Database Helpers
# ---------------------------------------------------------------------------
def _get_or_404(article_id: int) -> dict:
    """Retrieve an article by its integer ID or raise 404."""
    db = get_db()
    row = db.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found.")
    return article_row_to_dict(row)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/articles")
def list_articles(
    search: Optional[str] = None,
    category: Optional[str] = None,
    salesman: Optional[str] = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    List articles with optional search and category filters.
    Accessible by staff and owner.
    """
    db = get_db()
    query = "SELECT * FROM articles WHERE 1=1"
    params = []

    if search:
        search_pattern = f"%{search.strip()}%"
        query += """ AND (
            article_id LIKE ? OR
            title LIKE ? OR
            customer_name LIKE ? OR
            customer_phone LIKE ? OR
            salesman_name LIKE ? OR
            color LIKE ?
        )"""
        params.extend([search_pattern] * 6)

    if category and category.lower() != "all":
        query += " AND category = ?"
        params.append(category)

    if salesman:
        query += " AND salesman_name = ?"
        params.append(salesman)

    query += " ORDER BY created_at DESC"
    rows = db.execute(query, params).fetchall()
    return {
        "success": True,
        "count": len(rows),
        "articles": [article_row_to_dict(r) for r in rows],
    }


@router.get("/articles/next-id")
def get_next_id(current_user: dict = Depends(require_staff_or_owner)):
    """Generate the next sequential formatted article ID (e.g. '0001', '0002')."""
    db = get_db()
    next_id = generate_article_id(db)
    return {"success": True, "next_id": next_id}


@router.get("/articles/{article_id}")
def get_article(
    article_id: int,
    current_user: dict = Depends(require_staff_or_owner),
):
    """Fetch single article by ID."""
    return {"success": True, "article": _get_or_404(article_id)}


@router.post("/articles", status_code=status.HTTP_201_CREATED)
async def create_article(
    request: Request,
    photo:            UploadFile      = File(...),
    article_id:       Optional[str]   = Form(None),
    title:            Optional[str]   = Form(None),
    category:         Optional[str]   = Form("Bridal"),
    price:            Optional[float] = Form(0),
    security_deposit: Optional[float] = Form(0),
    advance_amount:   Optional[float] = Form(0),
    balance_amount:   Optional[str]   = Form(None),
    color:            Optional[str]   = Form("Standard"),
    size:             Optional[str]   = Form("Free Size"),
    notes:            Optional[str]   = Form(""),
    source:           Optional[str]   = Form("phone"),
    customer_name:    Optional[str]   = Form(None),
    customer_phone:   Optional[str]   = Form(None),
    customer_address: Optional[str]   = Form(None),
    pickup_date:      Optional[str]   = Form(None),
    booking_date:     Optional[str]   = Form(None),
    return_date:      Optional[str]   = Form(None),
    salesman_name:    Optional[str]   = Form(None),
    current_user:     dict            = Depends(require_staff_or_owner),
):
    """
    Create a new lehenga booking with photo upload.
    Server-side calculates balance: balance = max(0.0, price - advance).
    """
    if not photo.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed.",
        )

    db = get_db()

    # Resolve article ID (0001 to 1000 sequence)
    final_id = (article_id or "").strip() or generate_article_id(db)
    if db.execute("SELECT id FROM articles WHERE article_id = ?", (final_id,)).fetchone():
        final_id = generate_article_id(db)
        if db.execute("SELECT id FROM articles WHERE article_id = ?", (final_id,)).fetchone():
            final_id = f"{final_id}-{uuid.uuid4().hex[:4]}"

    # Save photo using specialized image pipeline
    image_path = save_article_image(photo, final_id)

    price_f   = max(0.0, float(price or 0))
    advance_f = max(0.0, float(advance_amount or 0))
    balance_f = max(0.0, price_f - advance_f)

    creator_name = (salesman_name or "").strip() or current_user.get("username", "Staff")

    db.execute(
        """INSERT INTO articles
           (article_id, title, category, price, security_deposit,
            advance_amount, balance_amount, color, size, notes,
            image_path, source, customer_name, customer_phone, customer_address,
            pickup_date, booking_date, return_date, salesman_name)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            final_id,
            title or f"Booking – {final_id}",
            category or "Bridal",
            price_f,
            max(0.0, float(security_deposit or 0)),
            advance_f,
            balance_f,
            color or "Standard",
            size or "Free Size",
            notes or "",
            image_path,
            source or "phone",
            customer_name or None,
            customer_phone or None,
            customer_address or None,
            pickup_date or None,
            booking_date or None,
            return_date or None,
            creator_name,
        ),
    )
    db.commit()

    new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    article = _get_or_404(new_id)

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="CREATE_ARTICLE",
        username=current_user.get("username"),
        role=current_user.get("role"),
        target_id=str(new_id),
        details=f"Created article {final_id} (Customer: {customer_name or 'N/A'}, Price: ₹{price_f})",
        ip_address=ip,
    )

    await broadcast("NEW_ARTICLE", article)

    # Automatically dispatch WhatsApp e-bill if customer phone is provided
    if article.get("customer_phone"):
        asyncio.create_task(send_booking_ebill_task(article))

    return {
        "success": True,
        "message": "Article and photo saved successfully to showroom database!",
        "article": article,
    }


@router.put("/articles/{article_id}")
async def update_article(
    article_id: int,
    data: ArticleUpdate,
    request: Request,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Update article fields.
    If financial fields (price, advance, deposit) are altered, recalculates balance.
    """
    existing = _get_or_404(article_id)

    updates = data.model_dump(exclude_none=True)
    if not updates:
        return {"success": True, "article": existing}

    allowed = {
        "article_id", "title", "category", "price", "security_deposit",
        "advance_amount", "balance_amount", "color", "size", "notes",
        "customer_name", "customer_phone", "customer_address", "pickup_date", "booking_date",
        "return_date", "salesman_name",
    }
    fields = [k for k in updates if k in allowed]
    if not fields:
        return {"success": True, "article": existing}

    # If price or advance were updated, enforce server-side balance calculation
    new_price = float(updates.get("price", existing.get("price", 0)))
    new_advance = float(updates.get("advance_amount", existing.get("advance_amount", 0)))
    if "price" in updates or "advance_amount" in updates:
        updates["balance_amount"] = max(0.0, new_price - new_advance)
        if "balance_amount" not in fields:
            fields.append("balance_amount")

    set_clause = ", ".join(f"{f} = ?" for f in fields)
    params = [updates[f] for f in fields] + [article_id]
    db = get_db()
    db.execute(
        f"UPDATE articles SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        params,
    )
    db.commit()

    updated = _get_or_404(article_id)

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="UPDATE_ARTICLE",
        username=current_user.get("username"),
        role=current_user.get("role"),
        target_id=str(article_id),
        details=f"Updated fields: {', '.join(fields)}",
        ip_address=ip,
    )

    await broadcast("UPDATE_ARTICLE", updated)
    return {"success": True, "article": updated}


@router.post("/articles/{article_id}/clear-dues")
async def clear_dues(
    article_id: int,
    payload: Optional[ClearDuesRequest] = None,
    request: Request = None,
    current_user: dict = Depends(require_owner),
):
    """
    Clear all remaining balance dues for an article.
    Protected with require_owner to prevent unauthorized dues clearance.
    """
    article = _get_or_404(article_id)
    db = get_db()
    price = float(article.get("price") or 0)
    old_balance = float(article.get("balance_amount") or 0)

    existing_notes = (article.get("notes") or "").strip()
    reason = f"Dues cleared by Owner ({current_user['username']})"
    if payload and payload.notes and payload.notes.strip():
        reason += f": {payload.notes.strip()}"
    new_notes = f"{existing_notes} [{reason}]".strip() if existing_notes else f"[{reason}]"

    # Set advance equal to price so balance becomes 0
    db.execute(
        """
        UPDATE articles
        SET advance_amount = ?, balance_amount = 0, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (price, new_notes, article_id),
    )
    db.commit()

    updated = _get_or_404(article_id)

    ip = get_client_ip(request) if request else None
    log_audit_event(
        db,
        action="CLEAR_DUES",
        username=current_user.get("username"),
        role="owner",
        target_id=str(article_id),
        details=f"Cleared dues of ₹{old_balance} for article {article.get('article_id')}",
        ip_address=ip,
    )

    await broadcast("UPDATE_ARTICLE", updated)

    # Automatically dispatch updated WhatsApp receipt showing balance cleared
    if updated.get("customer_phone"):
        asyncio.create_task(send_booking_ebill_task(updated))

    return {
        "success": True,
        "message": f"Dues of ₹{old_balance} cleared successfully.",
        "article": updated,
    }


@router.delete("/articles/{article_id}")
async def delete_article(
    article_id: int,
    request: Request,
    current_user: dict = Depends(require_owner),
):
    """
    Permanently delete an article and its uploaded image.
    Protected with require_owner.
    """
    article = _get_or_404(article_id)

    # Remove image file unless it's a seeded sample
    img = article.get("image_path", "")
    if img and "sample_" not in img:
        full_path = DATA_DIR / img.lstrip("/")
        if full_path.exists():
            full_path.unlink(missing_ok=True)

    db = get_db()
    db.execute("DELETE FROM articles WHERE id = ?", (article_id,))
    db.commit()

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="DELETE_ARTICLE",
        username=current_user.get("username"),
        role="owner",
        target_id=str(article_id),
        details=f"Deleted article {article.get('article_id')} ({article.get('title')})",
        ip_address=ip,
    )

    await broadcast("DELETE_ARTICLE", {"id": article_id})
    return {"success": True, "message": "Article deleted successfully."}


@router.get("/export/csv")
def export_csv(current_user: dict = Depends(require_owner)):
    """
    Download complete showroom inventory as CSV.
    Protected with require_owner and formula injection sanitization.
    """
    return generate_inventory_csv_response()
