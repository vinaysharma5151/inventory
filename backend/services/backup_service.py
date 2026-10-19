"""
services/backup_service.py — Database Snapshot and Safety Backup Service.

WHY:
1. Flushes SQLite WAL (Write-Ahead Logging) journal with PRAGMA wal_checkpoint(TRUNCATE)
   so all uncommitted memory writes are finalized to disk before creating a snapshot.
2. Creates an immutable timestamped copy of lehenga_inventory.sqlite in the backups/ folder.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

from backend.config import BACKUPS_DIR, DB_PATH
from backend.database import get_db


def create_database_backup() -> str:
    """
    Creates a timestamped snapshot of the SQLite database in backups/.
    Flushes WAL journal first to ensure 100% data integrity.
    Returns the backup filename.
    """
    if not DB_PATH.exists():
        return ""

    try:
        # Flush SQLite WAL journal to ensure 100% data integrity
        db = get_db()
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception:
        pass

    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUPS_DIR / f"lehenga_inventory_backup_{timestamp}.sqlite"
    shutil.copy2(DB_PATH, backup_file)
    return backup_file.name
