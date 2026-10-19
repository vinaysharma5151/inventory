"""
database.py — SQLite connection, schema init, migrations, and seed data.

One module-level connection. All route handlers call get_db() to get it.
Thread safety: SQLite in WAL mode handles concurrent reads fine for this scale.
"""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path
from typing import Optional

from backend.config import DB_PATH


# ---------------------------------------------------------------------------
# Connection (singleton — module-level, re-used across requests)
# ponytail: one shared connection, add connection pool if load increases
# ---------------------------------------------------------------------------
_conn: Optional[sqlite3.Connection] = None


def get_db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row  # rows behave like dicts
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _conn.execute("PRAGMA cache_size=-64000")
        _conn.execute("PRAGMA temp_store=MEMORY")
        _conn.execute("PRAGMA mmap_size=268435456")
    return _conn


# ---------------------------------------------------------------------------
# Password hashing & verification (bcrypt + legacy SHA-256 fallback)
# ---------------------------------------------------------------------------
import bcrypt


def hash_password(plain: str) -> str:
    """Hash a plaintext password using bcrypt with an automatic unique salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plaintext password against a stored hash.
    Supports bcrypt and gracefully verifies legacy sha256 hashes during migration.
    """
    if not plain or not hashed:
        return False
    # Bcrypt hashes start with $2a$, $2b$, or $2y$
    if hashed.startswith("$2"):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False
    # Legacy fallback for older SHA-256 hashes
    legacy_hash = hashlib.sha256(plain.encode("utf-8")).hexdigest()
    return legacy_hash.lower() == hashed.lower()


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
_SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id       TEXT    NOT NULL UNIQUE,
    title            TEXT,
    category         TEXT    DEFAULT 'Bridal',
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

CREATE INDEX IF NOT EXISTS idx_articles_article_id  ON articles(article_id);
CREATE INDEX IF NOT EXISTS idx_articles_category    ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_created     ON articles(created_at);
CREATE INDEX IF NOT EXISTS idx_articles_pickup_date ON articles(pickup_date);
CREATE INDEX IF NOT EXISTS idx_articles_return_date ON articles(return_date);
CREATE INDEX IF NOT EXISTS idx_articles_customer    ON articles(customer_name);

CREATE TABLE IF NOT EXISTS salesmen (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL, -- 'owner' or 'staff'
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    username   TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
    identifier   TEXT PRIMARY KEY,
    failed_count INTEGER DEFAULT 0,
    locked_until DATETIME,
    last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP,
    username   TEXT,
    role       TEXT,
    action     TEXT NOT NULL,
    target_id  TEXT,
    details    TEXT,
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""

# Columns that may be missing in older DB versions
_MIGRATE_COLUMNS = {
    "customer_name":    "TEXT",
    "customer_phone":   "TEXT",
    "customer_address": "TEXT",
    "pickup_date":      "TEXT",
    "booking_date":     "TEXT",
    "return_date":      "TEXT",
    "salesman_name":    "TEXT",
    "advance_amount":   "REAL DEFAULT 0",
    "balance_amount":   "REAL DEFAULT 0",
}


# ---------------------------------------------------------------------------
# Public init — called once at app startup
# ---------------------------------------------------------------------------
def init_db() -> None:
    db = get_db()
    db.executescript(_SCHEMA)

    # Migrate: add missing columns to existing databases
    existing_cols = {row[1] for row in db.execute("PRAGMA table_info(articles)")}
    for col, col_type in _MIGRATE_COLUMNS.items():
        if col not in existing_cols:
            db.execute(f"ALTER TABLE articles ADD COLUMN {col} {col_type}")
            print(f"[DB MIGRATE] Added column: {col}")
    db.commit()

    # Ensure default shop_name is set to Mehak Bridal Studio
    db.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_name', 'Mehak Bridal Studio')"
    )

    # Ensure default GitHub repository for software updates
    db.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('github_repo', 'vinaysharma5151/inventory')"
    )

    # Prune expired sessions on startup
    db.execute("DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP")

    # Sync legacy salesmen into users table with 'staff' role if not already present
    salesmen_rows = db.execute("SELECT name, password_hash FROM salesmen").fetchall()
    for s in salesmen_rows:
        user_row = db.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (s["name"],)).fetchone()
        if not user_row:
            db.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'staff')",
                (s["name"], s["password_hash"]),
            )

    db.commit()


# ---------------------------------------------------------------------------
# Article helpers
# ---------------------------------------------------------------------------
def article_row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def generate_article_id(db: sqlite3.Connection) -> str:
    """
    Generate sequential article ID between 0001 and 1000.
    Finds the first available sequence number in 1..1000.
    """
    rows = db.execute("SELECT article_id FROM articles").fetchall()
    used_numbers = set()
    for row in rows:
        val = str(row["article_id"]).strip()
        if val.isdigit():
            num = int(val)
            if 1 <= num <= 1000:
                used_numbers.add(num)
        else:
            # Match formats like LHN-0001 if any exist
            import re
            m = re.match(r"^LHN-(\d+)$", val, re.IGNORECASE)
            if m:
                num = int(m.group(1))
                if 1 <= num <= 1000:
                    used_numbers.add(num)

    # Return the first free number from 1 to 1000 formatted with leading zeros (0001, 0002...)
    for seq in range(1, 1001):
        if seq not in used_numbers:
            return f"{seq:04d}"

    # Fallback if 1000 are all assigned
    return "1001"
