"""
services/image_service.py — Secure Image Upload & Processing Pipeline.

WHY:
1. Validates image size (max 15 MB).
2. Verifies file authenticity using Pillow (rejects executable/polyglot files).
3. Transposes EXIF camera orientation (ensures phone photos are right-side-up).
4. Converts color modes (RGBA, LA, P) into clean RGB JPEGs with a white background.
5. Downscales images to max 1200px width/height to conserve disk space and speed up loading.
6. Re-encodes as clean JPEG with zero EXIF or tracking metadata.
7. Saves with a cryptographically randomized UUID filename.
"""

from __future__ import annotations

import io
import time
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

from backend.config import UPLOADS_DIR

MAX_MEDIUM_DIMENSION = 1200
MEDIUM_JPEG_QUALITY = 80
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB


def save_article_image(file: UploadFile, article_id: str) -> str:
    """
    Validate, sanitize, strip metadata, and save uploaded photo as an optimized medium JPEG.
    Enforces format validation and rejects malformed or oversized files.
    """
    safe_id = "".join(c for c in article_id if c.isalnum() or c in "-_")
    unique_suffix = f"{uuid.uuid4().hex[:8]}_{int(time.time())}"
    filename = f"{safe_id}_{unique_suffix}.jpg"
    dest = UPLOADS_DIR / filename

    file_bytes = file.file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 15 MB limit.",
        )

    try:
        # Pillow parses image header and checks authenticity
        img = Image.open(io.BytesIO(file_bytes))
        if img.format not in ("JPEG", "PNG", "WEBP", "MPO"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported format: {img.format}. Only JPEG, PNG, and WebP are allowed.",
            )

        # Handle mobile phone camera EXIF orientation
        img = ImageOps.exif_transpose(img)

        # Convert RGBA/palette modes to clean RGB
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Downscale to medium resolution (max 1200px)
        if max(img.width, img.height) > MAX_MEDIUM_DIMENSION:
            img.thumbnail((MAX_MEDIUM_DIMENSION, MAX_MEDIUM_DIMENSION), Image.Resampling.LANCZOS)

        # Save freshly re-encoded JPEG with zero EXIF/metadata
        img.save(dest, format="JPEG", quality=MEDIUM_JPEG_QUALITY, optimize=True)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to process image. File may be corrupt or not a valid image.",
        )

    return f"/uploads/{filename}"
