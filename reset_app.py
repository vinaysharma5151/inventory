#!/usr/bin/env python3
"""
reset_app.py — Complete Factory Reset & Clean Slate Utility.

WHY:
Enables the showroom owner, staff, or developer to wipe all previous data
(bookings, customer records, test articles, uploaded photos, and old shop settings),
resetting the application back to a 100% pristine, fresh day-one state.

WHAT THIS SCRIPT DOES:
  1. Automatic Safety Backup: Archives current database & uploads into backups/
  2. Database Reset: Wipes all articles, customer data, and booking records.
     Resets SQLite auto-increment sequences so article numbering starts fresh from 0001.
  3. Uploads Purge: Deletes all uploaded garment photos from uploads/ directory.
  4. Cache & WAL Flush: Removes SQLite temporary lock/journal files and AppleDouble dot-files.
  5. Clean Slate Setup: Resets shop settings so the web app shows the initial setup modal.
     Optionally resets clean demo staff accounts (Rahul, Priya, Deepak).
  6. SQLite Optimization: Runs PRAGMA wal_checkpoint and VACUUM to minimize file size.

USAGE:
  python3 reset_app.py           # Interactive mode (asks for confirmation)
  python3 reset_app.py --force   # Unattended reset (skips confirmation prompt)
"""

from __future__ import annotations

import datetime
import hashlib
import os
import shutil
import sqlite3
import sys
from pathlib import Path

# Paths configuration
ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = ROOT_DIR / "lehenga_inventory.sqlite"
DB_WAL = ROOT_DIR / "lehenga_inventory.sqlite-wal"
DB_SHM = ROOT_DIR / "lehenga_inventory.sqlite-shm"
UPLOADS_DIR = ROOT_DIR / "uploads"
BACKUPS_DIR = ROOT_DIR / "backups"

# Schema definition ensuring clean structure
_SCHEMA = """
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS salesmen;
DROP TABLE IF EXISTS settings;

CREATE TABLE articles (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id       TEXT    NOT NULL UNIQUE,
    title            TEXT,
    category         TEXT    DEFAULT 'Bridal Lehenga',
    price            REAL    DEFAULT 0,
    security_deposit REAL    DEFAULT 0,
    advance_amount   REAL    DEFAULT 0,
    balance_amount   REAL    DEFAULT 0,
    color            TEXT    DEFAULT 'Red',
    size             TEXT    DEFAULT 'Free Size',
    notes            TEXT,
    image_path       TEXT    NOT NULL,
    source           TEXT    DEFAULT 'phone',
    customer_name    TEXT,
    customer_phone   TEXT,
    customer_address TEXT,
    pickup_date      TEXT,
    booking_date     TEXT,
    return_date      TEXT,
    salesman_name    TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_articles_article_id  ON articles(article_id);
CREATE INDEX idx_articles_category    ON articles(category);
CREATE INDEX idx_articles_created     ON articles(created_at);
CREATE INDEX idx_articles_pickup_date ON articles(pickup_date);
CREATE INDEX idx_articles_return_date ON articles(return_date);
CREATE INDEX idx_articles_customer    ON articles(customer_name);

CREATE TABLE salesmen (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""

# Default clean demo staff accounts
_DEFAULT_STAFF = [
    ("Rahul",  "rahul123"),
    ("Priya",  "priya123"),
    ("Deepak", "deepak123"),
]


def hash_password(plain: str) -> str:
    """Standard SHA-256 password hash used by the application."""
    return hashlib.sha256(plain.strip().encode("utf-8")).hexdigest()


def create_safety_backup() -> str | None:
    """Create a timestamped backup before wiping data to prevent accidental loss."""
    if not DB_PATH.exists() and not UPLOADS_DIR.exists():
        return None

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_dir = BACKUPS_DIR / f"backup_{timestamp}"
    dest_dir.mkdir(parents=True, exist_ok=True)

    copied_items = 0

    # Backup database
    if DB_PATH.exists():
        shutil.copy2(DB_PATH, dest_dir / DB_PATH.name)
        copied_items += 1
    if DB_WAL.exists():
        try:
            shutil.copy2(DB_WAL, dest_dir / DB_WAL.name)
        except Exception:
            pass
    if DB_SHM.exists():
        try:
            shutil.copy2(DB_SHM, dest_dir / DB_SHM.name)
        except Exception:
            pass

    # Backup uploads
    if UPLOADS_DIR.exists():
        backup_uploads = dest_dir / "uploads"
        backup_uploads.mkdir(parents=True, exist_ok=True)
        for item in UPLOADS_DIR.iterdir():
            if item.is_file():
                try:
                    shutil.copy2(item, backup_uploads / item.name)
                    copied_items += 1
                except Exception:
                    pass

    return str(dest_dir) if copied_items > 0 else None


def clean_uploads_directory() -> int:
    """Delete all files inside uploads/ but keep the directory ready."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    deleted_count = 0

    for item in UPLOADS_DIR.iterdir():
        try:
            if item.is_file() or item.is_symlink():
                item.unlink()
                deleted_count += 1
            elif item.is_dir():
                shutil.rmtree(item)
                deleted_count += 1
        except Exception as e:
            print(f"  [!] Could not delete {item.name}: {e}")

    return deleted_count


def clean_temp_files():
    """Remove SQLite WAL/SHM temporary files and macOS AppleDouble dot-files."""
    for temp_file in [DB_WAL, DB_SHM]:
        if temp_file.exists():
            try:
                temp_file.unlink()
            except Exception:
                pass

    # Clean macOS dot-underscore files if present
    for dot_file in ROOT_DIR.glob("._*"):
        try:
            dot_file.unlink()
        except Exception:
            pass


def reset_database(include_default_staff: bool = True):
    """Rebuild database schema, clear sequences, insert clean staff if requested."""
    # Ensure parent dir exists
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Enable WAL mode & foreign keys
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=OFF;")

        # Execute fresh schema
        cursor.executescript(_SCHEMA)

        # Clear sqlite_sequence if it exists so AUTOINCREMENT restarts at 1
        try:
            cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('articles', 'salesmen');")
        except sqlite3.OperationalError:
            pass

        # Optionally insert default clean staff
        if include_default_staff:
            for name, pwd in _DEFAULT_STAFF:
                cursor.execute(
                    "INSERT INTO salesmen (name, password_hash) VALUES (?, ?);",
                    (name, hash_password(pwd)),
                )

        conn.commit()

        # Checkpoint WAL and optimize database
        cursor.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        cursor.execute("VACUUM;")
        conn.commit()

    finally:
        conn.close()


def print_banner():
    """Display warning header."""
    print("=" * 64)
    print("        LEHENGA BOOKING — FACTORY RESET UTILITY")
    print("=" * 64)
    print("This utility will wipe all existing data and reset the app to")
    print("a brand-new, fresh state for a new client or showroom.")
    print("")
    print("  • Deletes all articles, bookings, and customer details")
    print("  • Resets article sequence numbering (next article will be 0001)")
    print("  • Clears all uploaded garment photos in uploads/")
    print("  • Resets shop settings (triggers setup modal on next launch)")
    print("  • Configures clean default staff accounts (Rahul, Priya, Deepak)")
    print("=" * 64)


def main():
    print_banner()

    is_forced = "--force" in sys.argv or "-y" in sys.argv

    if not is_forced:
        try:
            confirm = input("\nAre you sure you want to reset everything? (type 'yes' to proceed): ").strip().lower()
            if confirm != "yes":
                print("\n[CANCELLED] Reset operation aborted by user. No data was changed.")
                if sys.platform.startswith("win"):
                    input("\nPress Enter to exit...")
                return
        except (KeyboardInterrupt, EOFError):
            print("\n\n[CANCELLED] Operation aborted.")
            return

    print("\n[1/5] Creating automatic safety backup...")
    backup_path = create_safety_backup()
    if backup_path:
        print(f"      Safety backup saved to:\n      -> {backup_path}")
    else:
        print("      No existing data needed backup.")

    print("\n[2/5] Cleaning uploaded photos...")
    deleted_images = clean_uploads_directory()
    print(f"      Removed {deleted_images} uploaded file(s). Uploads directory is fresh and empty.")

    print("\n[3/5] Cleaning lock and temporary cache files...")
    clean_temp_files()
    print("      Temporary WAL and metadata files cleared.")

    print("\n[4/5] Resetting database schema and auto-increment sequences...")
    reset_database(include_default_staff=True)
    print("      Database recreated with clean schema and default demo staff.")

    print("\n[5/5] Verifying fresh system state...")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    articles_count = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    staff_count = conn.execute("SELECT COUNT(*) FROM salesmen").fetchone()[0]
    settings_count = conn.execute("SELECT COUNT(*) FROM settings").fetchone()[0]
    staff_names = [r["name"] for r in conn.execute("SELECT name FROM salesmen ORDER BY id").fetchall()]
    conn.close()

    remaining_uploads = len([f for f in UPLOADS_DIR.iterdir() if f.is_file()])

    print("\n" + "=" * 64)
    print("             RESET COMPLETED SUCCESSFULLY! ✓")
    print("=" * 64)
    print(f"  • Total Articles in Catalog: {articles_count} (Fresh start)")
    print(f"  • Next Article ID:           0001")
    print(f"  • Uploaded Photos Remaining: {remaining_uploads}")
    print(f"  • Active Staff Accounts:     {staff_count} ({', '.join(staff_names)})")
    print(f"    - Rahul  (Password: rahul123)")
    print(f"    - Priya  (Password: priya123)")
    print(f"    - Deepak (Password: deepak123)")
    print(f"  • Shop Settings Configured:  {settings_count} (Blank — ready for setup)")
    print("-" * 64)
    print("  HOW TO LAUNCH THE FRESH APP:")
    print("    • Windows: Double click Start_App_Windows.bat or run:")
    print("               python desktop_launcher.py")
    print("    • Mac:     python3 desktop_launcher.py")
    print("=" * 64)

    # Keep console open on Windows if double-clicked
    if sys.platform.startswith("win") and not is_forced:
        try:
            input("\nPress Enter to exit...")
        except Exception:
            pass


if __name__ == "__main__":
    main()
