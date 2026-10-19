"""
desktop_launcher.py — Standalone Desktop & Server Launcher.

Features:
  - Supports --dev flag: Automatically isolates test data to lehenga_dev.sqlite & uploads_dev/.
  - Calls multiprocessing.freeze_support() for Windows PyInstaller compatibility.
  - Starts FastAPI / Uvicorn server on 0.0.0.0:8000.
  - Automatically launches the default web browser to http://localhost:8000.
  - Displays local PC URL and Mobile Staff WiFi connection URL.
"""

import multiprocessing
import os
import sys
import threading
import time
import webbrowser
import socket

# Auto-detect .venv if current Python environment is missing required dependencies
try:
    import qrcode
    import fastapi
    import uvicorn
except ImportError:
    from pathlib import Path
    _root = Path(__file__).resolve().parent
    _venv_py = _root / ".venv" / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")
    if _venv_py.exists() and sys.executable != str(_venv_py):
        os.execv(str(_venv_py), [str(_venv_py)] + sys.argv)

# Windows PyInstaller freeze support
if __name__ == "__main__":
    multiprocessing.freeze_support()

import uvicorn
from backend.main import app
from backend.config import DATA_DIR, FRONTEND_DIR, DB_PATH, UPLOADS_DIR, get_local_ip


def open_browser():
    """Wait for server to bind and open desktop browser."""
    time.sleep(1.2)
    webbrowser.open("http://localhost:8000")


def main():
    # Ensure frontend directory is present
    if not FRONTEND_DIR.exists():
        print(f"[WARNING] Frontend directory '{FRONTEND_DIR}' not found.")

    local_ip = get_local_ip()

    print("=" * 60)
    print("   MEHAK BRIDAL STUDIO — LEHENGA BOOKING & INVENTORY SYSTEM")
    print("=" * 60)
    print("  * Environment:        PRODUCTION (Clean Showroom)")
    print(f"  * Database:           {DB_PATH.name}")
    print(f"  * Uploads Folder:     {UPLOADS_DIR.name}/")
    print(f"  * Desktop Web App:    http://localhost:8000")
    print(f"  * Mobile Staff Sync:  http://{local_ip}:8000/capture")
    print("-" * 60)
    print("  Opening browser automatically...")
    print("  Press Ctrl + C in this window to stop the server.")
    print("=" * 60)

    # Launch browser in a background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Run Uvicorn directly
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
