"""
services/update_service.py — Software Auto-Update & Version Verification Service.

WHY:
1. Compares semantic versioning strings between current local app and online release manifests.
2. Downloads newly published executables safely into a temporary staging file.
3. Automatically triggers a safety database backup before applying any file update.
4. Spawns an external detached process (apply_update.bat on Windows, apply_update.sh on POSIX)
   to overwrite the running binary and restart cleanly after a 2-second timeout.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import HTTPException

from backend.config import APP_VERSION, DATA_DIR
from backend.database import get_db
from backend.services.backup_service import create_database_backup


def is_newer_version(current: str, latest: str) -> bool:
    """Compare two semantic version strings like 1.0.0 and 1.1.0."""
    try:
        def parse(v: str):
            parts = [int(x) for x in v.strip().lstrip("v").split(".") if x.isdigit()]
            while len(parts) < 3:
                parts.append(0)
            return tuple(parts[:4])
        return parse(latest) > parse(current)
    except Exception:
        return False


def check_for_updates() -> dict:
    """
    Check if a newer version of the software is available on GitHub Releases.
    Reads 'github_repo' from settings table (defaults to 'vinaysharma5151/inventory').
    """
    db = get_db()
    row_repo = db.execute("SELECT value FROM settings WHERE key = 'github_repo'").fetchone()
    github_repo = row_repo["value"].strip() if row_repo and row_repo["value"] else "vinaysharma5151/inventory"

    # Normalize full GitHub URL if user pasted the entire git/web address
    if "github.com/" in github_repo:
        github_repo = github_repo.split("github.com/")[-1].replace(".git", "")
    github_repo = github_repo.strip("/")

    # Check for custom manifest JSON if configured
    row_url = db.execute("SELECT value FROM settings WHERE key = 'update_check_url'").fetchone()
    custom_manifest_url = row_url["value"].strip() if row_url and row_url["value"] else ""

    if custom_manifest_url and custom_manifest_url.endswith(".json"):
        check_url = custom_manifest_url
        is_github_api = False
    else:
        check_url = f"https://api.github.com/repos/{github_repo}/releases/latest"
        is_github_api = True

    try:
        req = urllib.request.Request(
            check_url,
            headers={
                "User-Agent": f"LehengaBooking/{APP_VERSION}",
                "Accept": "application/vnd.github.v3+json",
            }
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))

        if is_github_api:
            tag = data.get("tag_name", "").strip()
            latest_version = tag.lstrip("v").strip()
            release_name = data.get("name") or f"Release {tag}"
            release_notes = data.get("body") or release_name or "New software update released."
            published_at = data.get("published_at", "")

            # Look for Windows executable (.exe) in attached assets
            download_url = ""
            assets = data.get("assets", [])
            for asset in assets:
                asset_name = asset.get("name", "").lower()
                if asset_name.endswith(".exe"):
                    download_url = asset.get("browser_download_url", "")
                    break

            if not download_url and len(assets) == 1:
                download_url = assets[0].get("browser_download_url", "")
        else:
            latest_version = data.get("version", "").strip()
            download_url = data.get("download_url", "").strip()
            release_notes = data.get("release_notes", "Performance improvements and bug fixes.")
            published_at = ""

        has_update = is_newer_version(APP_VERSION, latest_version) if latest_version else False

        return {
            "success": True,
            "offline": False,
            "current_version": APP_VERSION,
            "latest_version": latest_version or APP_VERSION,
            "update_available": has_update,
            "download_url": download_url,
            "release_notes": release_notes,
            "published_at": published_at,
            "repo": github_repo,
        }

    except urllib.error.HTTPError as e:
        if e.code == 404:
            # GitHub returns 404 when no releases have been published yet
            return {
                "success": True,
                "offline": False,
                "current_version": APP_VERSION,
                "latest_version": APP_VERSION,
                "update_available": False,
                "message": f"Connected to {github_repo}. No releases published yet on GitHub.",
                "repo": github_repo,
            }
        elif e.code == 403:
            return {
                "success": True,
                "offline": True,
                "current_version": APP_VERSION,
                "update_available": False,
                "message": "GitHub API rate limit reached. Please try checking again in a few minutes.",
                "repo": github_repo,
            }
        else:
            return {
                "success": True,
                "offline": True,
                "current_version": APP_VERSION,
                "update_available": False,
                "message": f"GitHub returned HTTP status {e.code}.",
                "repo": github_repo,
            }
    except Exception:
        return {
            "success": True,
            "offline": True,
            "current_version": APP_VERSION,
            "update_available": False,
            "message": "Update server could not be reached (offline or no internet connection).",
            "repo": github_repo,
        }


def apply_downloaded_update(download_url: str) -> str:
    """
    Downloads new .exe from GitHub release asset, snapshots SQLite database,
    writes helper restart script, and schedules graceful process restart.
    Returns the backup filename.
    """
    download_url = download_url.strip()
    if not download_url:
        raise HTTPException(status_code=400, detail="Missing download_url in payload")

    # Step 1: Automatic database safety snapshot
    backup_name = create_database_backup()

    # Step 2: Download the new executable into a temp file
    temp_new_exe = DATA_DIR / "LehengaBooking_new.exe"
    req = urllib.request.Request(
        download_url,
        headers={
            "User-Agent": f"LehengaBooking/{APP_VERSION}",
            "Accept": "application/octet-stream",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp, open(temp_new_exe, "wb") as out_file:
            shutil.copyfileobj(resp, out_file)
    except Exception as e:
        if temp_new_exe.exists():
            temp_new_exe.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

    # Verify downloaded file is valid and non-empty
    if not temp_new_exe.exists() or temp_new_exe.stat().st_size < 1000:
        if temp_new_exe.exists():
            temp_new_exe.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Downloaded update file is invalid or incomplete")

    # Step 3: Identify running executable path
    if getattr(sys, "frozen", False):
        current_exe = Path(sys.executable).resolve()
    else:
        current_exe = DATA_DIR / "LehengaBooking.exe"

    # Step 4: Create standalone replacement script
    if os.name == "nt":
        bat_path = DATA_DIR / "apply_update.bat"
        bat_content = f"""@echo off
timeout /t 2 /nobreak > nul
copy /y "{temp_new_exe}" "{current_exe}"
del "{temp_new_exe}"
start "" "{current_exe}"
del "%~0"
"""
        with open(bat_path, "w", encoding="utf-8") as f:
            f.write(bat_content)

        creation_flags = 0x00000008  # DETACHED_PROCESS
        if hasattr(subprocess, "CREATE_NEW_CONSOLE"):
            creation_flags |= subprocess.CREATE_NEW_CONSOLE

        subprocess.Popen(
            [str(bat_path)],
            creationflags=creation_flags,
            close_fds=True
        )
    else:
        sh_path = DATA_DIR / "apply_update.sh"
        sh_content = f"""#!/bin/sh
sleep 2
cp "{temp_new_exe}" "{current_exe}"
rm -f "{temp_new_exe}"
chmod +x "{current_exe}"
rm -f "$0"
"""
        with open(sh_path, "w", encoding="utf-8") as f:
            f.write(sh_content)
        os.chmod(sh_path, 0o755)
        subprocess.Popen(["/bin/sh", str(sh_path)], close_fds=True)

    # Step 5: Schedule graceful app shutdown in 1.5 seconds so Windows releases the executable lock
    def _exit():
        time.sleep(1.5)
        os._exit(0)

    threading.Thread(target=_exit, daemon=True).start()

    return backup_name

