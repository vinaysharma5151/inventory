/**
 * tag.js — Printable Thermal Bill & Receipt Generator (80mm / 58mm POS Printers)
 * 
 * WHY:
 * Bridal showrooms and luxury boutiques use standard 80mm thermal receipt printers
 * (e.g. Epson, TVS, NGX, Xprinter, POSIFLEX, MUNBYN).
 * This module:
 * 1. Formats the garment booking as a professional thermal POS receipt/bill.
 * 2. Directly sends the print request via an isolated, zero-margin iframe to avoid
 *    dashboard DOM artifacts, page scrolling bugs, or blank ghost pages.
 * 3. Renders a crisp vector Code 39 barcode scannable by any optical handheld barcode gun.
 * 4. Ensures 100% pure monochrome high-contrast layout for thermal print heads.
 */

import { showToast } from './toast.js';
import { api } from './api.js';

const formatINR = (val) => Number(val || 0).toLocaleString('en-IN');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDisplayDate(dateVal) {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (_) {
    return String(dateVal);
  }
}

function formatDisplayTime(dateObj = new Date()) {
  try {
    return dateObj.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (_) {
    return '';
  }
}

/**
 * Generates an SVG Code 39 barcode for scannable optical thermal printing.
 * No external dependencies required.
 * @param {string} rawText - Article ID or code
 * @returns {string} SVG HTML string
 */
function generateCode39Svg(rawText) {
  const CODE39 = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
  };

  const clean = String(rawText || '').toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '');
  const barcodeStr = `*${clean || '0001'}*`;
  let currentX = 0;
  const bars = [];
  const narrowWidth = 1.6;
  const wideWidth = 3.6;
  const height = 34;

  for (let idx = 0; idx < barcodeStr.length; idx++) {
    const ch = barcodeStr[idx];
    const pattern = CODE39[ch] || CODE39['0'];
    for (let p = 0; p < 9; p++) {
      const isBar = (p % 2 === 0);
      const isWide = (pattern[p] === '1');
      const w = isWide ? wideWidth : narrowWidth;
      if (isBar) {
        bars.push(`<rect x="${currentX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="#000" />`);
      }
      currentX += w;
    }
    if (idx < barcodeStr.length - 1) {
      currentX += narrowWidth;
    }
  }

  const svgWidth = Math.min(180, Math.round(currentX * 1.05));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${currentX.toFixed(1)} ${height}" width="${svgWidth}" height="${height}" style="display:block;margin:0 auto;">${bars.join('')}</svg>`;
}

/**
 * Returns thermal CSS styles tuned for 80mm and 58mm slip printers.
 */
function getThermalStyles() {
  return `
    @page {
      size: 80mm auto;
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      background: #FFF;
      color: #000;
      font-family: 'Courier New', Courier, Consolas, monospace;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .thermal-receipt {
      width: 72mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 3mm 2mm 12mm 2mm;
      background: #FFF;
      color: #000;
      box-sizing: border-box;
    }
    .receipt-header {
      text-align: center;
      margin-bottom: 4px;
    }
    .receipt-brand {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .receipt-sub {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 2px 0 3px 0;
    }
    .receipt-type-banner {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 3px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 2.5px 0;
      text-align: center;
    }
    .receipt-meta-grid {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      line-height: 1.4;
      margin: 1px 0;
    }
    .receipt-divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .receipt-divider-solid {
      border: none;
      border-top: 1px solid #000;
      margin: 5px 0;
    }
    .receipt-section-title {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .receipt-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 1.5px 0;
      font-size: 11px;
    }
    .receipt-label {
      font-weight: 700;
      flex-shrink: 0;
      margin-right: 6px;
    }
    .receipt-val {
      font-weight: 600;
      text-align: right;
      word-break: break-word;
    }
    .receipt-val.bold {
      font-weight: 900;
    }
    .article-id-badge {
      font-size: 16px;
      font-weight: 900;
      border: 2px solid #000;
      padding: 4px 6px;
      margin: 5px 0;
      text-align: center;
      letter-spacing: 1.5px;
      background: #FFF;
      color: #000;
    }
    .receipt-dates-box {
      border: 1px solid #000;
      padding: 3px 5px;
      margin: 4px 0;
      background: #FFF;
    }
    .balance-due-container {
      border: 2px solid #000;
      background: #000;
      color: #FFF;
      padding: 5px 6px;
      margin: 5px 0;
      font-weight: 900;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .balance-due-container .receipt-label,
    .balance-due-container .receipt-val {
      color: #FFF !important;
      font-size: 13px !important;
      font-weight: 900 !important;
    }
    .balance-cleared-container {
      border: 2px solid #000;
      background: #FFF;
      color: #000;
      padding: 4px 6px;
      margin: 5px 0;
      font-weight: 900;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .balance-cleared-container .receipt-label,
    .balance-cleared-container .receipt-val {
      color: #000 !important;
      font-size: 13px !important;
      font-weight: 900 !important;
    }
    .receipt-status-line {
      text-align: center;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin: 3px 0 4px 0;
    }
    .receipt-notes-box {
      border: 1px dashed #000;
      padding: 4px 5px;
      margin: 4px 0;
      font-size: 10px;
      line-height: 1.35;
    }
    .receipt-barcode-wrap {
      text-align: center;
      margin: 6px 0 4px 0;
    }
    .receipt-barcode-wrap svg {
      display: block;
      margin: 0 auto;
    }
    .receipt-barcode-text {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 2px;
      margin-top: 2px;
    }
    .receipt-terms {
      font-size: 9px;
      line-height: 1.35;
      margin-top: 5px;
      border-top: 1px dashed #000;
      padding-top: 4px;
    }
    .receipt-terms-list {
      padding-left: 14px;
      margin-top: 2px;
    }
    .receipt-terms-list li {
      margin-bottom: 2px;
    }
    .receipt-footer {
      text-align: center;
      font-size: 9px;
      line-height: 1.4;
      margin-top: 6px;
      border-top: 1px dashed #000;
      padding-top: 5px;
    }
    .receipt-cut-line {
      text-align: center;
      font-size: 9px;
      letter-spacing: 1px;
      margin-top: 5px;
      font-weight: 700;
    }
    .receipt-bottom-feed {
      height: 35mm;
      min-height: 35mm;
    }
  `;
}

/**
 * Builds the inner HTML for the thermal receipt slip.
 * @param {object} article - Article data model
 * @param {string} storeBrand - Shop or atelier name
 * @returns {string} HTML string
 */
export function generateThermalReceiptHtml(article, storeBrand = 'MEHAK BRIDAL STUDIO') {
  const brand = (storeBrand && storeBrand.trim()) ? storeBrand.trim().toUpperCase() : 'MEHAK BRIDAL STUDIO';

  const numPrice = Number(article.price) || 0;
  const numAdvance = Number(article.advance_amount) || 0;
  const numSecurity = Number(article.security_deposit) || 0;
  const numBalance = article.balance_amount !== undefined && article.balance_amount !== null
    ? Number(article.balance_amount)
    : Math.max(0, numPrice - numAdvance);

  const now = new Date();
  const printDate = formatDisplayDate(now);
  const printTime = formatDisplayTime(now);
  const barcodeSvg = generateCode39Svg(article.article_id || '0001');

  const displayTitle = (article.title && !article.title.startsWith('Booking –') && !article.title.startsWith('Booking -') && article.title !== article.customer_name)
    ? article.title
    : (article.category || 'Bridal');

  return `
    <div class="thermal-receipt">
      <!-- Atelier Header -->
      <div class="receipt-header">
        <div class="receipt-brand">${escapeHtml(brand)}</div>
        <div class="receipt-sub">Luxury Bridal Atelier &amp; Designer Apparel</div>
        <div class="receipt-type-banner">BOOKING BILL &amp; TAX INVOICE</div>
        <div class="receipt-meta-grid">
          <span><strong>Bill No:</strong> #${escapeHtml(article.article_id || '0001')}</span>
          <span><strong>Date:</strong> ${printDate}</span>
          <span><strong>Time:</strong> ${printTime}</span>
        </div>
      </div>

      <div class="receipt-divider"></div>

      <!-- Customer Details -->
      <div class="receipt-section">
        <div class="receipt-section-title">[ CUSTOMER DETAILS ]</div>
        <div class="receipt-row">
          <span class="receipt-label">NAME:</span>
          <span class="receipt-val bold">${escapeHtml(article.customer_name || 'Walk-in Guest')}</span>
        </div>
        ${article.customer_phone ? `
          <div class="receipt-row">
            <span class="receipt-label">PHONE:</span>
            <span class="receipt-val bold font-mono">${escapeHtml(article.customer_phone)}</span>
          </div>
        ` : ''}
        ${article.customer_address ? `
          <div class="receipt-row">
            <span class="receipt-label">ADDRESS:</span>
            <span class="receipt-val">${escapeHtml(article.customer_address)}</span>
          </div>
        ` : ''}
      </div>

      <div class="receipt-divider"></div>

      <!-- Garment & Booking Timeline -->
      <div class="receipt-section">
        <div class="receipt-section-title">[ GARMENT &amp; BOOKING ]</div>
        <div class="article-id-badge font-mono">
          ARTICLE CODE: ${escapeHtml(article.article_id || '0001')}
        </div>
        <div class="receipt-status-line">
          STAGE: ${(article.status || 'booked').toUpperCase() === 'RETURNED' ? 'STAGE 3: RETURNED (BACK IN SHOP)' : ((article.status || 'booked').toUpperCase() === 'PICKED_UP' ? 'STAGE 2: PICKED UP (TAKEN BY CUSTOMER)' : 'STAGE 1: BOOKED (ADVANCE PAID)')}
        </div>
        <div class="receipt-row">
          <span class="receipt-label">ITEM:</span>
          <span class="receipt-val bold">${escapeHtml(displayTitle)}</span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">COLLECTION:</span>
          <span class="receipt-val">${escapeHtml(article.category || 'Bridal')}</span>
        </div>
        ${article.has_jewellery ? `
          <div class="receipt-row">
            <span class="receipt-label">JEWELLERY:</span>
            <span class="receipt-val bold">💍 ${escapeHtml(article.jewellery_details || 'Full Set')} (+₹${formatINR(article.jewellery_price || 0)})</span>
          </div>
        ` : ''}

        <div class="receipt-dates-box">
          ${article.booking_date ? `
            <div class="receipt-row">
              <span class="receipt-label">BOOKED ON:</span>
              <span class="receipt-val">${formatDisplayDate(article.booking_date)}</span>
            </div>
          ` : ''}
          <div class="receipt-row">
            <span class="receipt-label">★ PICKUP DATE:</span>
            <span class="receipt-val bold">${formatDisplayDate(article.pickup_date)}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">★ RETURN DATE:</span>
            <span class="receipt-val bold">${formatDisplayDate(article.return_date)}</span>
          </div>
        </div>
      </div>

      <div class="receipt-divider"></div>

      <!-- Payment Breakdown -->
      <div class="receipt-section">
        <div class="receipt-section-title">[ PAYMENT SUMMARY ]</div>
        ${(article.has_jewellery && Number(article.jewellery_price) > 0) ? `
          <div class="receipt-row" style="font-size: 11px; color: #333;">
            <span class="receipt-label">Outfit Rent:</span>
            <span class="receipt-val">₹${formatINR(Math.max(0, numPrice - Number(article.jewellery_price)))}</span>
          </div>
          <div class="receipt-row" style="font-size: 11px; color: #333;">
            <span class="receipt-label">Jewellery Rent:</span>
            <span class="receipt-val">+ ₹${formatINR(article.jewellery_price)}</span>
          </div>
        ` : ''}
        <div class="receipt-row">
          <span class="receipt-label">Total Rental Price:</span>
          <span class="receipt-val bold">₹${formatINR(numPrice)}</span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Less: Advance Paid:</span>
          <span class="receipt-val">- ₹${formatINR(numAdvance)}</span>
        </div>
        ${numSecurity > 0 ? `
          <div class="receipt-row">
            <span class="receipt-label">Security Deposit (Refundable):</span>
            <span class="receipt-val">+ ₹${formatINR(numSecurity)}</span>
          </div>
        ` : ''}

        <div class="receipt-divider-solid"></div>

        ${numBalance > 0 ? `
          <div class="balance-due-container">
            <span class="receipt-label">NET BALANCE DUE:</span>
            <span class="receipt-val">₹${formatINR(numBalance)}</span>
          </div>
          <div class="receipt-status-line">⚠ PENDING BALANCE — PAY ON PICKUP</div>
        ` : `
          <div class="balance-cleared-container">
            <span class="receipt-label">NET BALANCE DUE:</span>
            <span class="receipt-val">₹0.00</span>
          </div>
          <div class="receipt-status-line">✓ FULL PAYMENT CLEARED — PAID IN FULL</div>
        `}
      </div>

      ${article.notes ? `
        <div class="receipt-divider"></div>
        <div class="receipt-notes-box">
          <div class="receipt-section-title">NOTES / ALTERATIONS:</div>
          <div>${escapeHtml(article.notes)}</div>
        </div>
      ` : ''}

      <!-- Scannable Barcode -->
      <div class="receipt-barcode-wrap">
        ${barcodeSvg}
        <div class="receipt-barcode-text font-mono">* ${escapeHtml(article.article_id || '0001')} *</div>
      </div>

      <!-- Terms & Studio Policy -->
      <div class="receipt-terms">
        <div class="receipt-section-title">TERMS &amp; CONDITIONS:</div>
        <ol class="receipt-terms-list">
          <li>No cancellation, refund, or adjustment once booking is confirmed under any condition.</li>
          <li>Outfit must be returned on or before the Return Date, failing which a penalty of Rs. 300 per day will apply.</li>
        </ol>
      </div>

      <!-- Footer & Cut Line -->
      <div class="receipt-footer">
        <div>*** THANK YOU FOR VISITING! ***</div>
        <div>Wishing You Wonderful Celebrations</div>
        <div class="receipt-cut-line">- - - - - - - - - - - - - - - - - - - - - -</div>
      </div>

      <!-- Bottom blank feed margin for thermal paper tear bar/cutter (35mm clearance) -->
      <div class="receipt-bottom-feed" style="height: 35mm; min-height: 35mm; line-height: 35mm;">&nbsp;</div>
    </div>
  `;
}

/**
 * Prepares the receipt and directly sends the print request to the thermal printer.
 * Tries direct 1-click ESC/POS silent print via Windows Spooler first.
 * If printer is offline, seamlessly falls back to browser print with 35mm clearance.
 * @param {object} article - Article data model
 * @param {string} [shopName='MEHAK BRIDAL STUDIO'] - Boutique name
 */
export async function printThermalBill(article, shopName = '') {
  if (!article) return;

  const storeBrand = (shopName && shopName.trim()) ? shopName.trim().toUpperCase() : 'MEHAK BRIDAL STUDIO';

  // 1. Direct 1-Click Silent Print via ESC/POS Spooler (zero popup dialogs)
  try {
    showToast(`Sending Bill #${article.article_id || '0001'} to thermal printer...`, 'neutral', 2000);
    const res = await api.printThermalDirect(article.id);
    if (res && res.success) {
      showToast(`✓ Bill #${article.article_id || '0001'} printed directly to ${res.printer || 'PIXEL DP82'}!`, 'success', 3500);
      return;
    }
  } catch (err) {
    console.info('Direct spooler print unavailable, opening browser print dialog:', err?.message || err);
  }

  // 2. Fallback: Browser zero-margin iframe print (with 35mm bottom cutter feed clearance)
  const receiptHtml = generateThermalReceiptHtml(article, storeBrand);
  const thermalCss = getThermalStyles();

  // 1. Update on-page fallback container for Ctrl+P / Cmd+P
  let tagContainer = document.getElementById('printable-hanger-tag');
  if (!tagContainer) {
    tagContainer = document.createElement('div');
    tagContainer.id = 'printable-hanger-tag';
    tagContainer.className = 'printable-tag-wrapper';
    document.body.appendChild(tagContainer);
  }
  tagContainer.innerHTML = receiptHtml;

  // 2. Direct print via isolated zero-margin iframe
  // This sends the print request directly to the thermal printer without
  // modal backdrop interference, scrolling offsets, or header/footer URLs.
  showToast(`Sending Bill #${article.article_id || '0001'} to thermal printer...`, 'neutral', 3000);

  const frameId = 'thermal-print-direct-frame';
  let iframe = document.getElementById(frameId);
  if (iframe) {
    try { iframe.remove(); } catch (_) {}
  }

  iframe = document.createElement('iframe');
  iframe.id = frameId;
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Bill_${escapeHtml(article.article_id || 'Receipt')}</title>
        <style>
          ${thermalCss}
        </style>
      </head>
      <body>
        ${receiptHtml}
      </body>
      </html>
    `);
    doc.close();

    // Trigger print request once document layout settles
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.warn('Iframe thermal print error, falling back to window.print():', err);
        window.print();
      }
    }, 150);
  } catch (err) {
    console.warn('Direct iframe creation failed, using window.print():', err);
    setTimeout(() => {
      window.print();
    }, 100);
  }
}

// Backward-compatible alias for existing imports
export const printGarmentTag = printThermalBill;
