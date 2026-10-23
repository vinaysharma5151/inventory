"""
desktop_launcher.py — Standalone Desktop & Server Launcher.

Features:
  - Calls multiprocessing.freeze_support() for Windows PyInstaller compatibility.
  - Disables Windows Console QuickEdit mode to prevent accidental terminal freeze on mouse click.
  - Pre-checks Port 8000: if already in use, opens the existing browser session rather than crashing.
  - Wraps server startup in try-except-finally with pause on exit so terminal never abruptly disappears.
  - Logs runtime errors cleanly to logs/app.log without leaking internals.
  - Automatically launches the default web browser to http://localhost:8000.
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
from backend.main import app, logger
from backend.config import DATA_DIR, FRONTEND_DIR, DB_PATH, UPLOADS_DIR, get_local_ip


def disable_windows_quickedit():
    """
    Disable QuickEdit mode in Windows Command Prompt.
    WHY: Clicking inside the Windows console with QuickEdit enabled pauses the
    process and halts all network requests. Disabling it prevents accidental server freeze.
    """
    if os.name != "nt":
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        STD_INPUT_HANDLE = -10
        h_stdin = kernel32.GetStdHandle(STD_INPUT_HANDLE)
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(h_stdin, ctypes.byref(mode)):
            ENABLE_QUICK_EDIT_MODE = 0x0040
            ENABLE_EXTENDED_FLAGS = 0x0080
            new_mode = (mode.value & ~ENABLE_QUICK_EDIT_MODE) | ENABLE_EXTENDED_FLAGS
            kernel32.SetConsoleMode(h_stdin, new_mode)
    except Exception:
        pass


def is_port_in_use(port: int = 8000) -> bool:
    """Check if the target port is already bound on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def open_browser():
    """Wait for server to bind and open desktop browser."""
    time.sleep(1.2)
    webbrowser.open("http://localhost:8000")


def pause_on_exit():
    """Keep terminal open so users/clients can read any message before window closes."""
    try:
        print("\nPress Enter to exit...")
        input()
    except Exception:
        pass


def main():
    disable_windows_quickedit()

    # Pre-check: If port 8000 is already active, another instance is running
    if is_port_in_use(8000):
        print("=" * 65)
        print("   MEHAK BRIDAL STUDIO — ALREADY RUNNING")
        print("=" * 65)
        print("  The server is already running in another window on this PC.")
        print("  Opening your browser now: http://localhost:8000")
        print("=" * 65)
        webbrowser.open("http://localhost:8000")
        pause_on_exit()
        return

    # Ensure frontend directory is present
    if not FRONTEND_DIR.exists():
        print(f"[WARNING] Frontend directory '{FRONTEND_DIR}' not found.")

    local_ip = get_local_ip()

    print("=" * 65)
    print("   MEHAK BRIDAL STUDIO — LEHENGA BOOKING & INVENTORY SYSTEM")
    print("=" * 65)
    print("  * Environment:        PRODUCTION (Clean Showroom)")
    print(f"  * Database:           {DB_PATH.name}")
    print(f"  * Uploads Folder:     {UPLOADS_DIR.name}/")
    print(f"  * Desktop Web App:    http://localhost:8000")
    print(f"  * Mobile Staff Sync:  http://{local_ip}:8000/capture")
    print("-" * 65)
    print("  [IMPORTANT] KEEP THIS TERMINAL OPEN WHILE WORKING!")
    print("  You can minimize this window, but do NOT close it.")
    print("  Opening browser automatically...")
    print("  To stop the server safely, press Ctrl + C in this window.")
    print("=" * 65)

    # Launch browser in a background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Run Uvicorn directly with crash protection
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            access_log=False,
        )
    except KeyboardInterrupt:
        print("\n" + "=" * 65)
        print("   Server stopped by user (Ctrl + C).")
        print("=" * 65)
    except Exception as e:
        logger.exception(f"Fatal launcher runtime exception: {e}")
        print("\n" + "=" * 65)
        print(f"   [ERROR] Server stopped due to an error: {e}")
        print("   Error details have been saved to logs/app.log")
        print("=" * 65)
    finally:
        pause_on_exit()


if __name__ == "__main__":
    main()

