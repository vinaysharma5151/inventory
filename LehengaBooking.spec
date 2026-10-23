# -*- mode: python ; coding: utf-8 -*-
"""
LehengaBooking.spec — PyInstaller Packaging Specification.

WHY:
Bundles the complete FastAPI server, SQLite database drivers, and the vanilla HTML/CSS/JS
frontend into a standalone, single-file Windows executable (LehengaBooking.exe).
No Node.js, npm, Vite, or external runtimes required.
"""

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Comprehensive list of internal and third-party modules to bundle
hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "fastapi",
    "starlette",
    "pydantic",
    "python_multipart",
    "bcrypt",
    "qrcode",
    "qrcode.image.pil",
    "PIL",
    "PIL.Image",
    "PIL.ImageOps",
    "backend",
    "backend.config",
    "backend.database",
    "backend.main",
    "backend.models",
    "backend.sse",
    "backend.routes.articles",
    "backend.routes.auth",
    "backend.routes.salesmen",
    "backend.routes.system",
    "backend.routes.whatsapp",
    "backend.services",
    "backend.services.auth",
    "backend.services.backup_service",
    "backend.services.export_service",
    "backend.services.image_service",
    "backend.services.qr_service",
    "backend.services.thermal_printer",
    "backend.services.whatsapp",
    "logging.handlers",
]

# Include the lightweight Vanilla HTML/CSS/JS frontend assets inside the executable
frontend_files = []
for root, dirs, files in os.walk('frontend'):
    for f in files:
        if not f.startswith('.'):
            frontend_files.append((os.path.join(root, f), root))

datas = frontend_files if frontend_files else [('frontend', 'frontend')]


a = Analysis(
    ['desktop_launcher.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='LehengaBooking',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # Disabled: prevents Windows Defender & Antivirus heuristic false-positive kills
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Displays server startup, active port, and mobile pairing IP address
    icon=os.path.join('frontend', 'favicon.ico'),
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
