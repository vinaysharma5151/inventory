"""
config.py — Centralized path and environment configuration.

Handles paths safely whether running in:
  1. Local development (python / uvicorn)
  2. Frozen desktop binary (PyInstaller .exe via sys._MEIPASS & sys.executable)
"""

import os
import sys
from pathlib import Path

if getattr(sys, "frozen", False):
    # Running inside a PyInstaller .exe bundle
    DATA_DIR = Path(sys.executable).resolve().parent
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", DATA_DIR)).resolve()
else:
    # Standard python execution
    DATA_DIR = Path(__file__).resolve().parent.parent
    BUNDLE_DIR = DATA_DIR

# ---------------------------------------------------------------------------
# Production Storage & Paths
# ---------------------------------------------------------------------------
APP_ENV = "prod"
IS_DEV = False

APP_VERSION = "2.1.0"
DB_PATH = DATA_DIR / "lehenga_inventory.sqlite"
UPLOADS_DIR = DATA_DIR / "uploads"
LOGS_DIR = DATA_DIR / "logs"
BACKUPS_DIR = DATA_DIR / "backups"
CSV_BACKUP_PATH = BACKUPS_DIR / "inventory_backup.csv"

FRONTEND_DIR = BUNDLE_DIR / "frontend"

# Ensure required directories exist
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)


def get_local_ip() -> str:
    """Best-effort local network IP for mobile connections (offline & online LAN)."""
    import socket

    # 1. Try external connection test (works when internet is active)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    # 2. Try inspecting local network interfaces via hostname (works on offline routers)
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                return ip
    except Exception:
        pass

    # 3. Fallback attempt connecting to default LAN gateway
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("192.168.1.1", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    return "127.0.0.1"


