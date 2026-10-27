"""
services/update_service.py — GitHub Releases Auto-Update Service.

WHY:
1. Queries public GitHub Releases API (https://api.github.com/repos/{owner}/{repo}/releases/latest)
   to discover new builds without requiring third-party libraries or dedicated update servers.
2. Performs semver comparison between the currently running version (APP_VERSION) and GitHub's release tag.
3. On Windows PyInstaller frozen binaries, safely manages executable replacement:
   - Downloads the new binary to a temporary file (update_LehengaBooking.exe).
   - Generates a standalone batch script (update_runner.bat) that waits for the main process to exit,
     replaces the executable, cleans up, and relaunches the app.
4. Isolates all network and filesystem operations in try-except blocks so failures never crash the app.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from backend.config import APP_VERSION, DATA_DIR

logger = logging.getLogger("lehenga_backend")

# Target GitHub repository details
GITHUB_OWNER = "vinaysharma5151"
GITHUB_REPO = "inventory"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"
EXE_NAME = "LehengaBooking.exe"


def parse_version_tuple(version_str: str) -> Tuple[int, ...]:
    """
    Extract numeric version components from a version string (e.g., 'v2.1.0' -> (2, 1, 0)).
    WHY: Handles prefixes like 'v', trailing pre-release tags, and non-standard strings cleanly.
    """
    if not version_str:
        return (0, 0, 0)
    # Extract all contiguous digit groups
    nums = re.findall(r"\d+", version_str)
    if not nums:
        return (0, 0, 0)
    return tuple(int(n) for n in nums)


def is_newer_version(latest_version_str: str, current_version_str: str) -> bool:
    """Returns True if latest_version_str is strictly newer than current_version_str."""
    latest_tuple = parse_version_tuple(latest_version_str)
    current_tuple = parse_version_tuple(current_version_str)
    return latest_tuple > current_tuple


def check_github_for_updates() -> Dict[str, Any]:
    """
    Queries GitHub API for the latest published release.
    Returns a structured dictionary with update status, version details, and asset download URL.
    """
    try:
        req = urllib.request.Request(
            GITHUB_API_URL,
            headers={
                "User-Agent": "LehengaBooking-Updater/1.0",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        # 7-second timeout so slow internet never hangs the application
        with urllib.request.urlopen(req, timeout=7) as resp:
            if resp.status != 200:
                return {
                    "success": False,
                    "update_available": False,
                    "message": f"GitHub returned status {resp.status}.",
                    "current_version": APP_VERSION,
                    "latest_version": None,
                }
            payload = json.loads(resp.read().decode("utf-8"))

        tag_name = payload.get("tag_name", "").strip()
        release_notes = payload.get("body", "").strip()
        html_url = payload.get("html_url", "")
        published_at = payload.get("published_at", "")
        assets = payload.get("assets", [])

        # Locate the executable binary in release assets
        download_url: Optional[str] = None
        asset_name: Optional[str] = None
        asset_size: int = 0

        for asset in assets:
            name = asset.get("name", "")
            # Look for LehengaBooking.exe or any .exe asset
            if name.lower() == EXE_NAME.lower():
                download_url = asset.get("browser_download_url")
                asset_name = name
                asset_size = asset.get("size", 0)
                break
            elif name.lower().endswith(".exe") and not download_url:
                download_url = asset.get("browser_download_url")
                asset_name = name
                asset_size = asset.get("size", 0)

        update_available = is_newer_version(tag_name, APP_VERSION)

        return {
            "success": True,
            "update_available": update_available,
            "current_version": APP_VERSION,
            "latest_version": tag_name,
            "release_notes": release_notes,
            "download_url": download_url,
            "asset_name": asset_name,
            "asset_size": asset_size,
            "html_url": html_url,
            "published_at": published_at,
            "message": "Update available!" if update_available else "Application is up to date.",
        }

    except urllib.error.HTTPError as e:
        if e.code == 404:
            # 404 means no releases published yet on the repository
            return {
                "success": True,
                "update_available": False,
                "current_version": APP_VERSION,
                "latest_version": APP_VERSION,
                "message": "No releases published yet on GitHub repository.",
            }
        logger.warning("GitHub update check HTTP error: %s", str(e))
        return {
            "success": False,
            "update_available": False,
            "current_version": APP_VERSION,
            "latest_version": None,
            "message": f"GitHub check failed (HTTP {e.code}).",
        }
    except Exception as e:
        logger.warning("GitHub update check failed: %s", str(e))
        return {
            "success": False,
            "update_available": False,
            "current_version": APP_VERSION,
            "latest_version": None,
            "message": "Could not connect to GitHub. Please check internet connection.",
        }


def download_file(url: str, dest_path: Path, chunk_size: int = 65536) -> bool:
    """Streams a remote file to disk safely using standard urllib."""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "LehengaBooking-Updater/1.0"},
        )
        with urllib.request.urlopen(req, timeout=120) as response, open(dest_path, "wb") as out_file:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
        return True
    except Exception as e:
        logger.error("Failed to download update file: %s", str(e))
        if dest_path.exists():
            try:
                dest_path.unlink()
            except OSError:
                pass
        return False


def apply_windows_update(temp_exe_path: Path, target_exe_path: Path) -> bool:
    """
    Spawns a detached Windows batch script that waits for this process to exit,
    replaces the target executable with the downloaded update, and restarts it.
    """
    try:
        bat_path = DATA_DIR / "update_runner.bat"
        # Script waits 2 seconds, kills any hanging process, copies over, deletes temp file, starts app, and self-deletes
        bat_content = f"""@echo off
chcp 65001 > nul
timeout /t 2 /nobreak > nul
:retry
copy /y "{temp_exe_path}" "{target_exe_path}" > nul
if errorlevel 1 (
    timeout /t 1 /nobreak > nul
    goto retry
)
del "{temp_exe_path}" > nul 2>&1
start "" "{target_exe_path}"
(goto) 2>nul & del "%~f0"
"""
        with open(bat_path, "w", encoding="utf-8") as f:
            f.write(bat_content)

        # Launch detached batch script in the background
        creation_flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
        subprocess.Popen(
            ["cmd.exe", "/c", str(bat_path)],
            cwd=str(DATA_DIR),
            creationflags=creation_flags,
            close_fds=True,
        )
        return True
    except Exception as e:
        logger.error("Failed to spawn Windows updater batch script: %s", str(e))
        return False


def trigger_update_pipeline(download_url: str) -> Dict[str, Any]:
    """
    Validates download URL, streams the new executable, and schedules restart.
    """
    # Security: Ensure URL comes from GitHub releases
    if not download_url or not (
        download_url.startswith(f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/")
        or download_url.startswith("https://objects.githubusercontent.com/")
    ):
        return {
            "success": False,
            "message": "Invalid download source URL. Only official repository releases are permitted.",
        }

    is_frozen = getattr(sys, "frozen", False)
    target_exe = Path(sys.executable).resolve() if is_frozen else (DATA_DIR / EXE_NAME)
    temp_exe = DATA_DIR / f"update_{EXE_NAME}"

    logger.info("Beginning update download from %s -> %s", download_url, temp_exe)

    # 1. Download the new version
    success = download_file(download_url, temp_exe)
    if not success or not temp_exe.exists() or temp_exe.stat().st_size == 0:
        return {
            "success": False,
            "message": "Download failed or downloaded file was empty.",
        }

    # 2. In non-frozen dev mode, don't kill the running python interpreter
    if not is_frozen or os.name != "nt":
        return {
            "success": True,
            "message": f"Update downloaded successfully to {temp_exe.name}. (Self-replacement is only active in packaged Windows .exe builds).",
            "downloaded_path": str(temp_exe),
        }

    # 3. Schedule Windows batch replacement and terminate server
    if apply_windows_update(temp_exe, target_exe):
        # Gracefully terminate this process after 1 second in a separate daemon thread
        def delayed_exit():
            time.sleep(1.0)
            os._exit(0)

        threading.Thread(target=delayed_exit, daemon=True).start()

        return {
            "success": True,
            "message": "Update downloaded! The application will restart in a few seconds.",
        }
    else:
        return {
            "success": False,
            "message": "Failed to schedule updater script.",
        }
