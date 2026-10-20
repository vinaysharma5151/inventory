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
  5. Clean Slate Setup: Resets shop settings and initial configurations.
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
LOGS_DIR = ROOT_DIR / "logs"

# Full production schema definition matching backend/database.py
_SCHEMA = """
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS salesmen;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS settings;

CREATE TABLE articles (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id       TEXT    NOT NULL UNIQUE,
    title            TEXT,
    category         TEXT    DEFAULT 'Bridal',
    price            REAL    DEFAULT 0,
    security_deposit REAL    DEFAULT 0,
    advance_amount   REAL    DEFAULT 0,
    balance_amount   REAL    DEFAULT 0,
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


CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role     ON users(role);

CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    username   TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token   ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE login_attempts (
    identifier   TEXT PRIMARY KEY,
    failed_count INTEGER DEFAULT 0,
    locked_until DATETIME,
    last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP,
    username   TEXT,
    role       TEXT,
    action     TEXT NOT NULL,
    target_id  TEXT,
    details    TEXT,
    ip_address TEXT
);

CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_action    ON audit_logs(action);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def hash_password(plain: str) -> str:
    """Hash password using bcrypt with fallback to sha256."""
    try:
        import bcrypt
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(plain.strip().encode("utf-8"), salt).decode("utf-8")
    except ImportError:
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
            if item.is_file() and item.name != ".gitkeep":
                try:
                    shutil.copy2(item, backup_uploads / item.name)
                    copied_items += 1
                except Exception:
                    pass

    return str(dest_dir) if copied_items > 0 else None


def clean_uploads_directory() -> int:
    """Delete all photos inside uploads/ while preserving .gitkeep."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    deleted_count = 0

    for item in UPLOADS_DIR.iterdir():
        if item.name == ".gitkeep":
            continue
        try:
            if item.is_file() or item.is_symlink():
                item.unlink()
                deleted_count += 1
            elif item.is_dir():
                shutil.rmtree(item)
                deleted_count += 1
        except Exception as e:
            print(f"  [!] Could not delete {item.name}: {e}")

    # Ensure .gitkeep is present
    (UPLOADS_DIR / ".gitkeep").touch()
    return deleted_count


def clean_temp_files():
    """Remove SQLite WAL/SHM files, app logs, and all recursive macOS AppleDouble dot-files."""
    for temp_file in [DB_WAL, DB_SHM]:
        if temp_file.exists():
            try:
                temp_file.unlink()
            except Exception:
                pass

    # Truncate / clean log file
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    app_log = LOGS_DIR / "app.log"
    if app_log.exists():
        try:
            app_log.unlink()
        except Exception:
            pass
    (LOGS_DIR / ".gitkeep").touch()

    # Recursively clean macOS dot-underscore files and .DS_Store across the entire repository
    for dot_file in ROOT_DIR.rglob("._*"):
        try:
            dot_file.unlink()
        except Exception:
            pass

    for ds_store in ROOT_DIR.rglob(".DS_Store"):
        try:
            ds_store.unlink()
        except Exception:
            pass


def reset_database():
    """Rebuild database schema, clear sequences, and insert default settings."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Enable WAL mode & foreign keys
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=OFF;")

        # Execute fresh schema
        cursor.executescript(_SCHEMA)

        # Clean up legacy salesmen table if any
        cursor.execute("DROP TABLE IF EXISTS salesmen;")
        cursor.execute("DELETE FROM users WHERE role = 'staff';")

        # Clear sqlite_sequence so AUTOINCREMENT restarts at 1
        try:
            cursor.execute("DELETE FROM sqlite_sequence;")
        except sqlite3.OperationalError:
            pass

        # Insert initial clean settings
        cursor.execute(
            "INSERT INTO settings (key, value) VALUES ('shop_name', 'Mehak Bridal Studio');"
        )
        cursor.execute(
            "INSERT INTO settings (key, value) VALUES ('first_time_setup_completed', 'true');"
        )

        conn.commit()

        # Checkpoint WAL and optimize database to minimal size
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
    print("  • Resets shop settings to defaults")
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
    reset_database()
    print("      Database recreated with clean schema.")

    print("\n[5/5] Verifying fresh system state...")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    articles_count = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    settings_count = conn.execute("SELECT COUNT(*) FROM settings").fetchone()[0]
    conn.close()

    # Final temp file cleanup and ship mode check
    if "--ship" in sys.argv:
        for b_item in BACKUPS_DIR.iterdir():
            if b_item.name != ".gitkeep":
                try:
                    if b_item.is_dir():
                        shutil.rmtree(b_item)
                    else:
                        b_item.unlink()
                except Exception:
                    pass
        (BACKUPS_DIR / ".gitkeep").touch()

    clean_temp_files()

    remaining_uploads = len([f for f in UPLOADS_DIR.iterdir() if f.is_file() and f.name != ".gitkeep"])

    print("\n" + "=" * 64)
    print("             RESET COMPLETED SUCCESSFULLY! ✓")
    print("=" * 64)
    print(f"  • Total Articles in Catalog: {articles_count} (Fresh start)")
    print(f"  • Next Article ID:           0001")
    print(f"  • Uploaded Photos Remaining: {remaining_uploads}")
    print(f"  • Shop Settings Configured:  {settings_count} (Default showroom settings)")
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
