"""
services/thermal_printer.py — Direct ESC/POS Driver & Windows Spooler for Thermal Printers (PIXEL DP82).

WHY:
1. Browser print dialogs have margin, scaling, and pagination quirks that distort thermal slips.
2. The PIXEL DP82 natively supports the standard ESC/POS protocol via USB.
3. Sending raw ESC/POS binary data directly to the Windows Print Spooler (winspool.drv)
   enables 1-click silent printing with zero dialog popups.
4. Ensures exact line feeding (6 lines = ~35mm) so the paper clears the internal cutter blade
   completely before the partial cut command fires.
5. Uses Python ctypes (standard library) — zero external pip packages needed, packaging-safe.
"""

from __future__ import annotations

import os
import re
import datetime
import logging
from typing import Optional, List, Tuple

from backend.database import get_db

logger = logging.getLogger("lehenga_app.thermal_printer")

# Standard 80mm ESC/POS character width (Font A)
LINE_WIDTH = 48


# ---------------------------------------------------------------------------
# Formatting Helpers
# ---------------------------------------------------------------------------
def esc_row(left: str, right: str, width: int = LINE_WIDTH) -> str:
    """Formats a two-column line with left and right alignment."""
    left = str(left or "")
    right = str(right or "")
    space = width - len(left) - len(right)
    if space < 1:
        max_l = max(10, width - len(right) - 1)
        left = left[:max_l]
        space = max(1, width - len(left) - len(right))
    return left + (" " * space) + right + "\n"


def esc_center(text: str, width: int = LINE_WIDTH) -> str:
    """Centers text within the 48-column thermal slip width."""
    return str(text or "").center(width) + "\n"


def esc_box_badge(text: str, width: int = LINE_WIDTH) -> str:
    """Draws a crisp ASCII border around key text."""
    border = "+" + ("-" * (width - 2)) + "+\n"
    content = "| " + str(text or "").center(width - 4) + " |\n"
    return border + content + border


def format_inr(val) -> str:
    """Formats numeric values into clean INR string without unicode Rupee sign."""
    try:
        n = float(val or 0)
        return f"Rs. {n:,.2f}"
    except Exception:
        return f"Rs. {val}"


def format_display_date(date_val) -> str:
    """Formats dates into a clean '23 Oct 2026' string."""
    if not date_val:
        return "N/A"
    try:
        raw = str(date_val).split()[0]
        d = datetime.date.fromisoformat(raw)
        return d.strftime("%d %b %Y")
    except Exception:
        return str(date_val)


# ---------------------------------------------------------------------------
# ESC/POS Receipt Builder
# ---------------------------------------------------------------------------
def build_escpos_bill(article: dict, shop_name: str = "MEHAK BRIDAL STUDIO") -> bytes:
    """
    Constructs a pure ESC/POS byte sequence tailored for 80mm printers (PIXEL DP82).
    Includes barcode, bold highlights, financial breakdown, and bottom feed with cut.
    """
    brand = (shop_name or "MEHAK BRIDAL STUDIO").strip().upper()
    art_id = str(article.get("article_id") or "0001").upper()
    now = datetime.datetime.now()
    date_str = now.strftime("%d %b %Y")
    time_str = now.strftime("%I:%M %p")

    price = float(article.get("price") or 0)
    advance = float(article.get("advance_amount") or 0)
    security = float(article.get("security_deposit") or 0)
    balance = article.get("balance_amount")
    if balance is None:
        balance = max(0.0, price - advance)
    else:
        balance = float(balance)

    has_jewel = bool(article.get("has_jewellery"))
    jewel_price = float(article.get("jewellery_price") or 0)
    jewel_details = str(article.get("jewellery_details") or "Full Set").strip()

    title = str(article.get("title") or "").strip()
    if not title or title.startswith("Booking –") or title.startswith("Booking -") or title == article.get("customer_name"):
        title = str(article.get("category") or "Bridal")

    chunks: List[bytes] = []

    # 1. Initialize printer (ESC @) & Character code table (PC437)
    chunks.append(b"\x1b\x40")
    chunks.append(b"\x1b\x74\x00")

    # 2. Header (Centered, Double Height + Double Width)
    chunks.append(b"\x1b\x61\x01")  # Align Center
    chunks.append(b"\x1d\x21\x11")  # Double size
    chunks.append(b"\x1b\x45\x01")  # Bold ON
    chunks.append(f"{brand}\n".encode("ascii", errors="replace"))
    chunks.append(b"\x1d\x21\x00")  # Normal size
    chunks.append(b"\x1b\x45\x00")  # Bold OFF
    chunks.append(b"Luxury Bridal Atelier & Designer Apparel\n")
    chunks.append(b"================================================\n")
    chunks.append(b"\x1b\x45\x01")
    chunks.append(b"BOOKING BILL & TAX INVOICE\n")
    chunks.append(b"\x1b\x45\x00")
    chunks.append(b"================================================\n")

    # 3. Meta info
    chunks.append(b"\x1b\x61\x00")  # Align Left
    chunks.append(esc_row(f"Bill No: #{art_id}", f"Date: {date_str}").encode("ascii", errors="replace"))
    chunks.append(esc_row("Counter: POS-01", f"Time: {time_str}").encode("ascii", errors="replace"))
    chunks.append(b"------------------------------------------------\n")

    # 4. Customer Details
    chunks.append(b"\x1b\x45\x01")
    chunks.append(b"[ CUSTOMER DETAILS ]\n")
    chunks.append(b"\x1b\x45\x00")
    cust_name = str(article.get("customer_name") or "Walk-in Guest").strip()
    chunks.append(esc_row("Customer Name:", cust_name).encode("ascii", errors="replace"))
    if article.get("customer_phone"):
        chunks.append(esc_row("Customer Phone:", str(article.get("customer_phone"))).encode("ascii", errors="replace"))
    if article.get("customer_address"):
        chunks.append(esc_row("Address:", str(article.get("customer_address"))[:35]).encode("ascii", errors="replace"))
    chunks.append(b"------------------------------------------------\n")

    # 5. Garment & Booking Timeline
    chunks.append(b"\x1b\x45\x01")
    chunks.append(b"[ GARMENT & BOOKING ]\n")
    chunks.append(b"\x1b\x45\x00")
    chunks.append(esc_box_badge(f"ARTICLE CODE: {art_id}").encode("ascii", errors="replace"))
    chunks.append(esc_row("Item:", title[:35]).encode("ascii", errors="replace"))
    chunks.append(esc_row("Collection:", str(article.get("category") or "Bridal")).encode("ascii", errors="replace"))

    if has_jewel:
        chunks.append(esc_row("Jewellery:", f"{jewel_details[:20]} (+{format_inr(jewel_price)})").encode("ascii", errors="replace"))

    if article.get("booking_date"):
        chunks.append(esc_row("Booked On:", format_display_date(article.get("booking_date"))).encode("ascii", errors="replace"))

    chunks.append(b"\x1b\x45\x01")
    chunks.append(esc_row("★ PICKUP DATE:", format_display_date(article.get("pickup_date"))).encode("ascii", errors="replace"))
    chunks.append(esc_row("★ RETURN DATE:", format_display_date(article.get("return_date"))).encode("ascii", errors="replace"))
    chunks.append(b"\x1b\x45\x00")
    chunks.append(b"------------------------------------------------\n")

    # 6. Payment Breakdown
    chunks.append(b"\x1b\x45\x01")
    chunks.append(b"[ PAYMENT SUMMARY ]\n")
    chunks.append(b"\x1b\x45\x00")
    if has_jewel and jewel_price > 0:
        outfit_price = max(0.0, price - jewel_price)
        chunks.append(esc_row("Outfit Rental:", format_inr(outfit_price)).encode("ascii", errors="replace"))
        chunks.append(esc_row("Jewellery Rental:", f"+ {format_inr(jewel_price)}").encode("ascii", errors="replace"))

    chunks.append(esc_row("Total Rental Price:", format_inr(price)).encode("ascii", errors="replace"))
    chunks.append(esc_row("Less Advance Paid:", f"- {format_inr(advance)}").encode("ascii", errors="replace"))

    if security > 0:
        chunks.append(esc_row("Security Deposit (Refundable):", f"+ {format_inr(security)}").encode("ascii", errors="replace"))

    chunks.append(b"================================================\n")

    if balance > 0:
        chunks.append(b"\x1b\x45\x01")
        chunks.append(b"\x1d\x21\x01")  # Double height
        chunks.append(esc_row("NET BALANCE DUE:", format_inr(balance)).encode("ascii", errors="replace"))
        chunks.append(b"\x1d\x21\x00")
        chunks.append(b"\x1b\x45\x00")
        chunks.append(b"\x1b\x61\x01")  # Center
        chunks.append(b"*** PENDING BALANCE -- PAY ON PICKUP ***\n")
    else:
        chunks.append(b"\x1b\x45\x01")
        chunks.append(b"\x1d\x21\x01")
        chunks.append(esc_row("NET BALANCE DUE:", "Rs. 0.00").encode("ascii", errors="replace"))
        chunks.append(b"\x1d\x21\x00")
        chunks.append(b"\x1b\x45\x00")
        chunks.append(b"\x1b\x61\x01")
        chunks.append(b"*** FULL PAYMENT CLEARED -- PAID IN FULL ***\n")

    # 7. Notes
    notes = str(article.get("notes") or "").strip()
    if notes:
        chunks.append(b"\x1b\x61\x00")
        chunks.append(b"------------------------------------------------\n")
        chunks.append(b"[ NOTES / ALTERATIONS ]\n")
        chunks.append(f"{notes}\n".encode("ascii", errors="replace"))

    # 8. Optical Barcode (Code 39)
    chunks.append(b"------------------------------------------------\n")
    chunks.append(b"\x1b\x61\x01")  # Center
    clean_code = re.sub(r"[^0-9A-Z\-\. \$\/\+\%]", "", art_id)
    if not clean_code:
        clean_code = "0001"

    # Barcode setup: Height 64 dots, Width mult 2, Text below
    chunks.append(b"\x1d\x68\x40")  # GS h 64 (height ~8mm)
    chunks.append(b"\x1d\x77\x02")  # GS w 2
    chunks.append(b"\x1d\x48\x02")  # GS H 2 (HRI characters below barcode)
    chunks.append(b"\x1d\x66\x00")  # GS f 0
    # ESC/POS Code 39 Format A: GS k 4 <data> NUL
    barcode_payload = clean_code.encode("ascii", errors="replace")
    chunks.append(b"\x1d\x6b\x04" + barcode_payload + b"\x00")
    chunks.append(b"\n")

    # 9. Terms & Studio Policy
    chunks.append(b"\x1b\x61\x00")  # Left
    chunks.append(b"------------------------------------------------\n")
    chunks.append(b"TERMS & CONDITIONS:\n")
    chunks.append(b"1. Original bill copy is required during Pickup & Return.\n")
    chunks.append(b"2. Security deposit is refundable upon safe return.\n")
    chunks.append(b"3. Garments must be returned on or before Return Date.\n")
    chunks.append(b"4. Verify garment condition before leaving atelier.\n")

    # 10. Footer
    chunks.append(b"\x1b\x61\x01")  # Center
    chunks.append(b"------------------------------------------------\n")
    chunks.append(b"*** THANK YOU FOR VISITING! ***\n")
    chunks.append(b"Wishing You Wonderful Celebrations\n")
    chunks.append(b"- - - - - - - - - - - - - - - - - - - - - - - -\n")

    # 11. Feed 6 blank lines (~35mm) so paper clears the DP82 cutter blade
    chunks.append(b"\x1b\x64\x06")

    # 12. Partial Cut command (GS V 1)
    chunks.append(b"\x1d\x56\x01")

    return b"".join(chunks)


def build_test_receipt(printer_name: str) -> bytes:
    """Generates an 80mm test and alignment ticket for PIXEL DP82."""
    now = datetime.datetime.now().strftime("%d %b %Y %I:%M %p")
    chunks: List[bytes] = [
        b"\x1b\x40",
        b"\x1b\x74\x00",
        b"\x1b\x61\x01",
        b"\x1d\x21\x11",
        b"\x1b\x45\x01",
        b"PIXEL DP82 TEST OK\n",
        b"\x1d\x21\x00",
        b"\x1b\x45\x00",
        b"Thermal Printer Diagnostic Slip\n",
        b"================================================\n",
        b"\x1b\x61\x00",
        esc_row("Target Printer:", printer_name[:30]).encode("ascii", errors="replace"),
        esc_row("Status:", "Connected & Ready").encode("ascii", errors="replace"),
        esc_row("Timestamp:", now).encode("ascii", errors="replace"),
        esc_row("Paper Width:", "80mm (72mm printhead)").encode("ascii", errors="replace"),
        esc_row("Command Set:", "ESC/POS Native Spooler").encode("ascii", errors="replace"),
        b"------------------------------------------------\n",
        b"ALIGNMENT TEST (48 Columns across):\n",
        b"123456789012345678901234567890123456789012345678\n",
        b"[LEFT]                                   [RIGHT]\n",
        b"------------------------------------------------\n",
        b"\x1b\x61\x01",
        b"*** CUTTER BLADE CLEARANCE TEST (35mm) ***\n",
        b"If this text is NOT cut, cutter feed is PERFECT!\n",
        b"------------------------------------------------\n",
        b"\x1b\x64\x06",  # Feed 6 lines
        b"\x1d\x56\x01",  # Partial cut
    ]
    return b"".join(chunks)


# ---------------------------------------------------------------------------
# Hardware Discovery & Windows Spooler Execution
# ---------------------------------------------------------------------------
def get_installed_printers() -> List[str]:
    """Returns all printer names installed on the local operating system."""
    printers: List[str] = []

    if os.name == "nt":
        # 1. Try standard Windows API EnumPrintersW Level 4
        try:
            import ctypes
            from ctypes import wintypes

            winspool = ctypes.windll.winspool
            PRINTER_ENUM_LOCAL = 0x00000002
            PRINTER_ENUM_CONNECTIONS = 0x00000004
            flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS

            class PRINTER_INFO_4(ctypes.Structure):
                _fields_ = [
                    ("pPrinterName", wintypes.LPWSTR),
                    ("pServerName", wintypes.LPWSTR),
                    ("Attributes", wintypes.DWORD),
                ]

            needed = wintypes.DWORD(0)
            returned = wintypes.DWORD(0)
            winspool.EnumPrintersW(flags, None, 4, None, 0, ctypes.byref(needed), ctypes.byref(returned))
            if needed.value > 0:
                buf = ctypes.create_string_buffer(needed.value)
                if winspool.EnumPrintersW(flags, None, 4, buf, needed.value, ctypes.byref(needed), ctypes.byref(returned)):
                    p_array = ctypes.cast(buf, ctypes.POINTER(PRINTER_INFO_4))
                    for i in range(returned.value):
                        name = p_array[i].pPrinterName
                        if name and name not in printers:
                            printers.append(name)
        except Exception as e:
            logger.debug(f"EnumPrintersW fallback: {e}")

        # 2. PowerShell fallback if EnumPrintersW returned empty
        if not printers:
            try:
                import subprocess
                cmd = ["powershell", "-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"]
                creationflags = 0x08000000 if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
                out = subprocess.check_output(cmd, text=True, timeout=3, creationflags=creationflags)
                for line in out.splitlines():
                    p = line.strip()
                    if p and p not in printers:
                        printers.append(p)
            except Exception as e:
                logger.debug(f"PowerShell printer query fallback: {e}")
    else:
        # Development / Mac / Linux fallback
        try:
            import subprocess
            out = subprocess.check_output(["lpstat", "-a"], text=True, timeout=2)
            for line in out.splitlines():
                parts = line.split()
                if parts and parts[0] not in printers:
                    printers.append(parts[0])
        except Exception:
            pass

    return printers


def get_active_printer() -> Optional[str]:
    """
    Finds the active thermal printer:
    1. Checks user saved preference in SQLite settings table.
    2. Auto-detects any printer with PIXEL, DP82, POS, 80, THERMAL, or RECEIPT in its name.
    3. Falls back to first available printer or None.
    """
    all_printers = get_installed_printers()

    # Check saved setting in database
    try:
        db = get_db()
        row = db.execute("SELECT value FROM settings WHERE key = 'selected_thermal_printer'").fetchone()
        if row and row["value"]:
            saved = row["value"].strip()
            # If saved printer is currently online/listed, prioritize it
            for p in all_printers:
                if p.lower() == saved.lower():
                    return p
            return saved
    except Exception:
        pass

    # Auto-detect PIXEL DP82 or generic 80mm thermal printers
    keywords = ["pixel", "dp82", "dp-82", "pos80", "pos-80", "pos 80", "80mm", "thermal", "receipt", "slip"]
    for kw in keywords:
        for p in all_printers:
            if kw in p.lower():
                return p

    # Default to first printer if available
    return all_printers[0] if all_printers else None


def set_active_printer(printer_name: str) -> bool:
    """Saves the user-selected thermal printer to SQLite settings."""
    try:
        db = get_db()
        db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('selected_thermal_printer', ?)",
            (printer_name.strip(),)
        )
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to save selected printer: {e}")
        return False


def send_raw_escpos_to_printer(printer_name: str, raw_bytes: bytes) -> Tuple[bool, str]:
    """
    Sends raw ESC/POS binary data to the Windows Spooler for instant 1-click output.
    """
    if not printer_name:
        return False, "No thermal printer selected or detected."

    if os.name != "nt":
        # Development environment simulation
        logger.info(f"[SIMULATED THERMAL PRINT] Sent {len(raw_bytes)} bytes to '{printer_name}'")
        return True, f"Simulated print sent to '{printer_name}' ({len(raw_bytes)} bytes)."

    # Windows Native winspool.drv implementation
    import ctypes
    from ctypes import wintypes

    class DOC_INFO_1(ctypes.Structure):
        _fields_ = [
            ("pDocName", wintypes.LPCWSTR),
            ("pOutputFile", wintypes.LPCWSTR),
            ("pDataType", wintypes.LPCWSTR),
        ]

    winspool = ctypes.windll.winspool
    handle = wintypes.HANDLE()

    if not winspool.OpenPrinterW(printer_name, ctypes.byref(handle), None):
        return False, f"Could not connect to printer '{printer_name}'. Check USB cable & power."

    try:
        doc_info = DOC_INFO_1()
        doc_info.pDocName = "Thermal Receipt"
        doc_info.pOutputFile = None
        doc_info.pDataType = "RAW"  # Critical: tells Windows spooler to pass bytes unaltered

        job_id = winspool.StartDocPrinterW(handle, 1, ctypes.byref(doc_info))
        if job_id <= 0:
            err = ctypes.GetLastError()
            return False, f"Printer rejected print job (Windows Error Code: {err})."

        try:
            winspool.StartPagePrinter(handle)
            written = wintypes.DWORD(0)
            data_buf = ctypes.create_string_buffer(raw_bytes)
            success = winspool.WritePrinter(handle, data_buf, len(raw_bytes), ctypes.byref(written))
            winspool.EndPagePrinter(handle)
            if not success or written.value < len(raw_bytes):
                return False, f"Partial write to printer: {written.value}/{len(raw_bytes)} bytes sent."
        finally:
            winspool.EndDocPrinter(handle)

        return True, f"Printed successfully to {printer_name}."
    except Exception as e:
        logger.exception(f"Windows Spooler write error: {e}")
        return False, f"Spooler error: {e}"
    finally:
        winspool.ClosePrinter(handle)


def print_article_thermal(article: dict, shop_name: str, target_printer: Optional[str] = None) -> Tuple[bool, str]:
    """Renders ESC/POS bill and dispatches directly to the selected thermal printer."""
    printer = target_printer or get_active_printer()
    if not printer:
        return False, "No thermal printer found. Please connect your PIXEL DP82 via USB."

    try:
        raw_bytes = build_escpos_bill(article, shop_name)
        return send_raw_escpos_to_printer(printer, raw_bytes)
    except Exception as e:
        logger.exception(f"Failed to generate or send thermal receipt: {e}")
        return False, f"Thermal print failed: {e}"
