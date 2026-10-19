"""
services/qr_service.py — QR Code Generation Service.

WHY:
Generates studio camera pairing QR codes rendered as Base64 data URLs
for zero-configuration Wi-Fi phone camera pairing.
"""

from __future__ import annotations

import base64
import io
import qrcode


def generate_qr_data_url(url: str) -> str:
    """Generate a QR code PNG and return it as a base64 data URL."""
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#4A0E17", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"
