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
from typing import Any, Optional

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
from backend.services.thermal_printer import get_active_printer, print_article_thermal
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
            salesman_name LIKE ?
        )"""
        params.extend([search_pattern] * 5)

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
    notes:            Optional[str]   = Form(""),
    source:           Optional[str]   = Form("phone"),
    customer_name:    Optional[str]   = Form(None),
    customer_phone:   Optional[str]   = Form(None),
    customer_address: Optional[str]   = Form(None),
    pickup_date:      Optional[str]   = Form(None),
    booking_date:     Optional[str]   = Form(None),
    return_date:      Optional[str]   = Form(None),
    salesman_name:    Optional[str]   = Form(None),
    has_jewellery:    Optional[Any]   = Form(0),
    jewellery_details:Optional[str]   = Form(None),
    jewellery_price:  Optional[Any]   = Form(0),
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

    category_val = (category or "Bridal").strip() or "Bridal"
    cust_name_clean = (customer_name or "").strip()
    title_clean = (title or "").strip()
    if (
        not title_clean
        or title_clean.startswith("Booking –")
        or title_clean.startswith("Booking -")
        or (cust_name_clean and title_clean.lower() == cust_name_clean.lower())
    ):
        final_title = category_val
    else:
        final_title = title_clean

    try:
        has_jewel_val = 1 if int(str(has_jewellery or 0).strip() or 0) == 1 else 0
    except Exception:
        has_jewel_val = 0

    jewel_details_val = (jewellery_details or "").strip() if has_jewel_val else ""

    try:
        jewel_price_val = max(0.0, float(str(jewellery_price or 0).strip() or 0)) if has_jewel_val else 0.0
    except Exception:
        jewel_price_val = 0.0

    db.execute(
        """INSERT INTO articles
           (article_id, title, category, price, security_deposit,
            advance_amount, balance_amount, notes,
            image_path, source, customer_name, customer_phone, customer_address,
            pickup_date, booking_date, return_date, salesman_name,
            has_jewellery, jewellery_details, jewellery_price)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            final_id,
            final_title,
            category_val,
            price_f,
            max(0.0, float(security_deposit or 0)),
            advance_f,
            balance_f,
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
            has_jewel_val,
            jewel_details_val,
            jewel_price_val,
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
    Enforces uniqueness for article_id across all pieces.
    """
    existing = _get_or_404(article_id)

    updates = data.model_dump(exclude_none=True)
    if not updates:
        return {"success": True, "article": existing}

    allowed = {
        "article_id", "title", "category", "price", "security_deposit",
        "advance_amount", "balance_amount", "notes",
        "customer_name", "customer_phone", "customer_address", "pickup_date", "booking_date",
        "return_date", "salesman_name",
        "has_jewellery", "jewellery_details", "jewellery_price",
    }
    fields = [k for k in updates if k in allowed]
    if not fields:
        return {"success": True, "article": existing}

    db = get_db()

    # If article_id is being changed, ensure it's not empty and not in use by another article
    if "article_id" in updates:
        new_aid = str(updates["article_id"]).strip()
        if not new_aid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Article code cannot be empty.",
            )
        collision = db.execute(
            "SELECT id FROM articles WHERE article_id = ? AND id != ?",
            (new_aid, article_id),
        ).fetchone()
        if collision:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Article code '{new_aid}' is already in use by another piece.",
            )
        updates["article_id"] = new_aid

    # Ensure Garment Title contains Collection Category and not customer name
    if "title" in updates:
        t_clean = str(updates["title"] or "").strip()
        c_clean = str(updates.get("category", existing.get("category") or "Bridal")).strip() or "Bridal"
        cust_clean = str(updates.get("customer_name", existing.get("customer_name") or "")).strip()
        if (
            not t_clean
            or t_clean.startswith("Booking –")
            or t_clean.startswith("Booking -")
            or (cust_clean and t_clean.lower() == cust_clean.lower())
        ):
            updates["title"] = c_clean
        else:
            updates["title"] = t_clean

    # If price or advance were updated, enforce server-side balance calculation
    new_price = float(updates.get("price", existing.get("price", 0)))
    new_advance = float(updates.get("advance_amount", existing.get("advance_amount", 0)))
    if "price" in updates or "advance_amount" in updates:
        updates["balance_amount"] = max(0.0, new_price - new_advance)
        if "balance_amount" not in fields:
            fields.append("balance_amount")

    set_clause = ", ".join(f"{f} = ?" for f in fields)
    params = [updates[f] for f in fields] + [article_id]
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


@router.post("/articles/{article_id}/photo")
async def update_article_photo(
    article_id: int,
    photo: UploadFile = File(...),
    request: Request = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Replace garment photo for an existing article.
    Validates image, strips metadata, saves medium JPEG, and broadcasts update.
    """
    if not photo.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed.",
        )

    article = _get_or_404(article_id)
    new_image_path = save_article_image(photo, article.get("article_id") or str(article_id))

    # Remove previous image file if not a seeded sample
    old_img = article.get("image_path", "")
    if old_img and "sample_" not in old_img:
        try:
            full_path = DATA_DIR / old_img.lstrip("/")
            if full_path.exists():
                full_path.unlink(missing_ok=True)
        except Exception:
            pass

    db = get_db()
    db.execute(
        "UPDATE articles SET image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (new_image_path, article_id),
    )
    db.commit()

    updated = _get_or_404(article_id)

    ip = get_client_ip(request) if request else None
    log_audit_event(
        db,
        action="UPDATE_ARTICLE_PHOTO",
        username=current_user.get("username"),
        role=current_user.get("role"),
        target_id=str(article_id),
        details=f"Replaced photo for article {article.get('article_id')}",
        ip_address=ip,
    )

    await broadcast("UPDATE_ARTICLE", updated)
    return {
        "success": True,
        "article": updated,
        "message": "Garment photo updated successfully.",
    }


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


@router.post("/articles/{article_id}/print-thermal")
def print_article_direct_thermal(
    article_id: int,
    request: Request,
    payload: dict = None,
    current_user: dict = Depends(require_staff_or_owner),
):
    """
    Direct 1-click silent printing to PIXEL DP82 thermal printer via Windows Spooler.
    Formats exact ESC/POS layout, 6-line cutter feed, and auto-cut.
    """
    article = _get_or_404(article_id)

    db = get_db()
    shop_row = db.execute("SELECT value FROM settings WHERE key = 'shop_name'").fetchone()
    shop_name = shop_row["value"] if shop_row and shop_row["value"] else "Mehak Bridal Studio"

    target_printer = None
    if payload and payload.get("printer_name"):
        target_printer = payload.get("printer_name").strip()

    ok, msg = print_article_thermal(article, shop_name, target_printer)
    if not ok:
        raise HTTPException(status_code=500, detail=msg)

    active_p = target_printer or get_active_printer() or "PIXEL DP82"

    ip = get_client_ip(request)
    log_audit_event(
        db,
        action="PRINT_THERMAL_BILL",
        username=current_user.get("username"),
        role=current_user.get("role"),
        target_id=str(article_id),
        details=f"Direct thermal bill printed for article {article.get('article_id')} on {active_p}",
        ip_address=ip,
    )

    return {
        "success": True,
        "printer": active_p,
        "message": msg,
    }

