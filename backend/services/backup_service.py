"""
services/backup_service.py — Database Snapshot and CSV Backup Service.

WHY:
1. Flushes SQLite WAL (Write-Ahead Logging) journal with PRAGMA wal_checkpoint(TRUNCATE)
   so all uncommitted memory writes are finalized to disk before creating a snapshot.
2. Updates inventory_backup.csv in the same application folder with formula-injection sanitization
   and utf-8-sig BOM (safe for MS Excel on Windows).
3. Archives timestamped snapshots in the backups/ folder.
"""

from __future__ import annotations

import csv
import logging
import os
import shutil

from backend.config import BACKUPS_DIR, CSV_BACKUP_PATH, DATA_DIR, DB_PATH
from backend.database import get_db

logger = logging.getLogger("lehenga_backend")


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


def create_database_backup() -> str:
    """
    Overwrites the single fixed database backup file in backups/.
    Flushes WAL journal first to ensure 100% data integrity.
    Returns the backup filename.
    """
    if not DB_PATH.exists():
        return ""

    try:
        # Flush SQLite WAL journal to ensure 100% data integrity
        db = get_db()
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception as exc:
        logger.warning(f"WAL checkpoint before backup warning: {exc}")

    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    backup_file = BACKUPS_DIR / "lehenga_inventory_backup.sqlite"
    shutil.copy2(DB_PATH, backup_file)
    return backup_file.name


def update_inventory_csv_backup() -> dict:
    """
    Exports all showroom inventory records to inventory_backup.csv in the application root directory
    (same folder structure as database and launcher). Also archives a copy in backups/.
    Safe against spreadsheet formula injection attacks and Windows Excel file locks.
    """
    try:
        db = get_db()
        try:
            db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception:
            pass

        rows = db.execute("SELECT * FROM articles ORDER BY id ASC").fetchall()
    except Exception as exc:
        logger.error(f"Error reading articles for CSV backup: {exc}")
        return {
            "success": False,
            "error": str(exc),
            "filename": CSV_BACKUP_PATH.name,
            "count": 0,
            "message": "Failed to read database records for backup.",
        }

    headers = [
        "ID", "Article ID", "Title / Description", "Category",
        "Customer Name", "Customer Phone", "Customer Address",
        "Booking Date", "Pickup Date", "Return Date",
        "Rental Price (₹)", "Advance Paid (₹)", "Balance Due (₹)",
        "Matching Jewellery", "Jewellery Details", "Jewellery Price (₹)",
        "Notes / Audit History", "Created At", "Updated At",
    ]

    csv_data = []
    for r in rows:
        a = dict(r)
        raw_t = str(a.get("title") or "").strip()
        cust_n = str(a.get("customer_name") or "").strip()
        cat_n = str(a.get("category") or "Bridal").strip() or "Bridal"
        if not raw_t or raw_t.startswith("Booking –") or raw_t.startswith("Booking -") or (cust_n and raw_t.lower() == cust_n.lower()):
            clean_t = cat_n
        else:
            clean_t = raw_t

        has_j = int(a.get("has_jewellery") or 0) == 1
        j_details = str(a.get("jewellery_details") or "Yes") if has_j else "No"
        j_price = a.get("jewellery_price") if has_j else 0

        csv_data.append([
            sanitize_csv_cell(a.get("id")),
            sanitize_csv_cell(a.get("article_id")),
            sanitize_csv_cell(clean_t),
            sanitize_csv_cell(cat_n),
            sanitize_csv_cell(a.get("customer_name") or "N/A"),
            sanitize_csv_cell(a.get("customer_phone") or "N/A"),
            sanitize_csv_cell(a.get("customer_address") or "N/A"),
            sanitize_csv_cell(a.get("booking_date") or "N/A"),
            sanitize_csv_cell(a.get("pickup_date") or "N/A"),
            sanitize_csv_cell(a.get("return_date") or "N/A"),
            sanitize_csv_cell(a.get("price") or 0),
            sanitize_csv_cell(a.get("advance_amount") or 0),
            sanitize_csv_cell(a.get("balance_amount") or 0),
            sanitize_csv_cell("Yes" if has_j else "No"),
            sanitize_csv_cell(j_details),
            sanitize_csv_cell(j_price),
            sanitize_csv_cell(a.get("notes") or ""),
            sanitize_csv_cell(a.get("created_at") or ""),
            sanitize_csv_cell(a.get("updated_at") or ""),
        ])

    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

    # Clean up any legacy CSV backup file from root if it exists
    open_csv = DATA_DIR / "inventory_backup.csv"
    if open_csv.exists():
        try:
            open_csv.unlink()
        except Exception:
            pass

    # Write inventory_backup.csv — always overwrite the single fixed file via temp-swap
    saved_to_backups = True
    temp_file = BACKUPS_DIR / ".inventory_backup.tmp"
    try:
        with open(temp_file, mode="w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_ALL)
            writer.writerow(headers)
            writer.writerows(csv_data)

        os.replace(temp_file, CSV_BACKUP_PATH)
    except (PermissionError, OSError) as lock_err:
        saved_to_backups = False
        logger.warning(f"backups/inventory_backup.csv is locked by another process (e.g. Excel): {lock_err}")
        if temp_file.exists():
            try:
                temp_file.unlink()
            except Exception:
                pass
    except Exception as exc:
        saved_to_backups = False
        logger.error(f"Error saving inventory_backup.csv in backups: {exc}")
        if temp_file.exists():
            try:
                temp_file.unlink()
            except Exception:
                pass

    if not saved_to_backups:
        return {
            "success": False,
            "filename": CSV_BACKUP_PATH.name,
            "path": str(CSV_BACKUP_PATH),
            "count": len(rows),
            "warning": "inventory_backup.csv is open in Excel or locked. Close it and try again.",
            "message": "Backup failed — the file is open in another program. Please close it and retry.",
        }

    return {
        "success": True,
        "filename": CSV_BACKUP_PATH.name,
        "path": str(CSV_BACKUP_PATH),
        "count": len(rows),
        "message": f"Backup updated successfully! {len(rows)} items saved to backups/inventory_backup.csv.",
    }
