"""
services/export_service.py — Formula-Safe CSV Export Service.

WHY:
1. Prevents CSV Formula Injection attacks in Microsoft Excel and LibreOffice
   by sanitizing cells that start with '=', '+', '-', or '@'.
2. Generates formatted inventory CSV stream directly from SQLite database.
"""

from __future__ import annotations

import csv
import io
import time
from fastapi.responses import StreamingResponse

from backend.database import get_db


def sanitize_csv_cell(value) -> str:
    """
    Prevent CSV Formula Injection attacks in Excel and LibreOffice.
    Prepends an apostrophe if the value starts with formula characters (=, +, -, @).
    """
    if value is None:
        return ""
    s = str(value).strip()
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


def generate_inventory_csv_response() -> StreamingResponse:
    """
    Generates a streaming CSV response containing all articles in inventory,
    with all cell values sanitized against spreadsheet injection.
    """
    db = get_db()
    rows = db.execute("SELECT * FROM articles ORDER BY created_at DESC").fetchall()

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow([
        "ID", "Article ID", "Title / Description", "Category", "Salesman",
        "Customer Name", "Customer Phone", "Customer Address", "Pickup Date", "Return Date", "Booking Date",
        "Rental Price (₹)", "Advance (₹)", "Balance (₹)", "Security Deposit (₹)", "Color", "Size",
        "Notes", "Image URL", "Created Date",
    ])
    for r in rows:
        a = dict(r)
        writer.writerow([
            sanitize_csv_cell(a["id"]),
            sanitize_csv_cell(a["article_id"]),
            sanitize_csv_cell(a.get("title")),
            sanitize_csv_cell(a.get("category")),
            sanitize_csv_cell(a.get("salesman_name") or "N/A"),
            sanitize_csv_cell(a.get("customer_name") or "N/A"),
            sanitize_csv_cell(a.get("customer_phone") or "N/A"),
            sanitize_csv_cell(a.get("customer_address") or "N/A"),
            sanitize_csv_cell(a.get("pickup_date") or "N/A"),
            sanitize_csv_cell(a.get("return_date") or "N/A"),
            sanitize_csv_cell(a.get("booking_date") or "N/A"),
            sanitize_csv_cell(a.get("price")),
            sanitize_csv_cell(a.get("advance_amount")),
            sanitize_csv_cell(a.get("balance_amount")),
            sanitize_csv_cell(a.get("security_deposit")),
            sanitize_csv_cell(a.get("color")),
            sanitize_csv_cell(a.get("size")),
            sanitize_csv_cell(a.get("notes")),
            sanitize_csv_cell(a.get("image_path")),
            sanitize_csv_cell(a.get("created_at")),
        ])

    output.seek(0)
    filename = f"lehenga_inventory_{int(time.time() * 1000)}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
