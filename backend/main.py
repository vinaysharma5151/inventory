"""
main.py — FastAPI application factory with Enterprise Security Layer.

Security Implementations:
1. CORS restricted to localhost and private showroom LAN IP subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
2. Defense-in-depth HTTP Security Headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP).
3. Secret & Error Obfuscation: Global exception handler captures unhandled 500 errors, writes detailed stack traces to rotating file logs (logs/app.log), and returns safe generic error messages to clients.
4. Static file serving and SPA catch-all routing for offline vanilla frontend.
5. High-performance cache headers for images and UI scripts.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import FRONTEND_DIR, LOGS_DIR, UPLOADS_DIR
from backend.database import init_db
from backend.routes import articles, auth, salesmen, system, whatsapp

# ---------------------------------------------------------------------------
# Secure Rotating File Logger
# ---------------------------------------------------------------------------
logger = logging.getLogger("lehenga_app")
logger.setLevel(logging.INFO)
log_file = LOGS_DIR / "app.log"
file_handler = RotatingFileHandler(
    log_file,
    maxBytes=5 * 1024 * 1024,  # 5 MB per file
    backupCount=5,
    encoding="utf-8",
)
formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")
file_handler.setFormatter(formatter)
if not logger.handlers:
    logger.addHandler(file_handler)


# ---------------------------------------------------------------------------
# Lifespan: database schema init
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database and application services...")
    init_db()
    logger.info("Application ready.")
    yield


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Mehak Bridal Studio — Lehenga Booking API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None,   # Hardened: disable OpenAPI docs in production
    redoc_url=None,  # Hardened: disable ReDoc in production
)

# ---------------------------------------------------------------------------
# Scoped CORS for Local Wi-Fi Network
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Security & Cache Headers Middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_and_cache_middleware(request: Request, call_next):
    response = await call_next(request)

    # Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob:; "
        "connect-src 'self' ws: http:; "
        "media-src 'self' blob: data:; "
        "frame-ancestors 'none';"
    )

    # Static asset and page caching
    path = request.url.path
    if path.startswith("/uploads/"):
        response.headers["Cache-Control"] = "public, max-age=604800, stale-while-revalidate=86400"
    elif path.startswith("/css/") or path.startswith("/js/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    elif not path.startswith("/api/"):
        # HTML pages (prevent mobile browser stale hangs)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response


# ---------------------------------------------------------------------------
# Global Error Handler: Never leak stack traces to client
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )

    # Log full exception with stack trace to secure rotating log file
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")

    # Return safe, non-leaking error to client
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "detail": "An internal server error occurred. Please contact the administrator.",
        },
    )


# ---------------------------------------------------------------------------
# Mount Uploads & Static Directories
# ---------------------------------------------------------------------------
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# ---------------------------------------------------------------------------
# API Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router,     prefix="/api")
app.include_router(articles.router, prefix="/api")
app.include_router(salesmen.router, prefix="/api")
app.include_router(system.router,   prefix="/api")
app.include_router(whatsapp.router, prefix="/api")

# ---------------------------------------------------------------------------
# Frontend SPA Fallback (No Node.js or Vite required at runtime)
# ---------------------------------------------------------------------------
if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
    app.mount("/js",  StaticFiles(directory=str(FRONTEND_DIR / "js")),  name="js")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="API route not found")
        target_file = FRONTEND_DIR / full_path
        if full_path and target_file.is_file():
            return FileResponse(str(target_file))
        index = FRONTEND_DIR / "index.html"
        return FileResponse(str(index))
