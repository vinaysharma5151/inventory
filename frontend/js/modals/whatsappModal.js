/**
 * whatsappModal.js — WhatsApp E-Bill Dispatcher & Preview Modal.
 * 
 * WHY:
 * Provides the shopkeeper with a 1-click dispatch interface to send formatted
 * luxury e-bills directly to customers via WhatsApp (wa.me / WhatsApp Desktop).
 * Allows verifying or updating the recipient phone number, copying formatted
 * text, or instantly launching WhatsApp with pre-filled receipt details.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const formatINR = (val) => Number(val || 0).toLocaleString('en-IN');

/**
 * Builds a direct wa.me URL directly on client side as an offline fallback.
 */
function buildClientFallbackUrl(phoneRaw, text) {
  if (!phoneRaw) return null;
  const digits = String(phoneRaw).replace(/\D/g, '');
  const cleanPhone = digits.length === 10 ? `91${digits}` : (digits.length === 11 && digits.startsWith('0') ? `91${digits.slice(1)}` : digits);
  if (!cleanPhone || cleanPhone.length < 10) return null;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Opens the WhatsApp E-Bill Dispatcher Modal.
 * @param {object} article - Garment / Booking article object
 * @param {string} [shopName] - Store brand title
 * @param {object} [options] - Optional callbacks
 */
export async function openWhatsAppBillModal(article, shopName = 'Mehak Bridal Studio', options = {}) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  const defaultPhone = (article.customer_phone || '').trim();
  const customerName = (article.customer_name || 'Valued Customer').trim();
  const articleId = article.article_id || 'N/A';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 540px;">
      <div class="modal-header" style="background: linear-gradient(135deg, #075E54 0%, #128C7E 100%); color: #FFFFFF; border-bottom: none; border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0; padding: 18px 24px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            ${renderIcon('messageCircle', { size: 22, color: '#FFFFFF' })}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.12rem; font-weight: 700; color: #FFFFFF;">
              Send WhatsApp E-Bill
            </h3>
            <p style="margin: 2px 0 0; font-size: 0.8rem; color: rgba(255, 255, 255, 0.85);">
              ${escapeHtml(articleId)} — ${escapeHtml(customerName)}
            </p>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only modal-close-btn" style="color: #FFFFFF; opacity: 0.85;" title="Close">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <div class="modal-body" style="padding: 22px 24px; background: var(--bg-card, #FFFFFF);">
        <div style="margin-bottom: 18px;">
          <label style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 6px;">
            Recipient WhatsApp Number
          </label>
          <div style="display: flex; gap: 8px;">
            <div style="position: relative; flex: 1;">
              <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 0.9rem; font-weight: 600; color: var(--text-muted, #6B7280);">
                +91
              </span>
              <input
                type="tel"
                id="wa-phone-input"
                class="form-input"
                placeholder="10-digit mobile number"
                value="${escapeHtml(defaultPhone.replace(/^\+?91/, '').replace(/\D/g, ''))}"
                style="padding-left: 48px; width: 100%; font-family: var(--font-mono, monospace); font-size: 0.98rem; font-weight: 600;"
              />
            </div>
            <button type="button" id="btn-wa-refresh" class="btn btn-outline btn-sm" title="Refresh message preview with this number" style="padding: 0 14px;">
              ${renderIcon('refreshCw', { size: 14 })} Update
            </button>
          </div>
        </div>

        <div style="margin-bottom: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280);">
              E-Bill Preview
            </label>
            <button type="button" id="btn-wa-copy" class="btn btn-ghost btn-sm" style="font-size: 0.78rem; padding: 2px 8px; color: #128C7E; font-weight: 600;">
              ${renderIcon('copy', { size: 13 })} Copy Text
            </button>
          </div>
          <div
            id="wa-preview-box"
            style="background: #EFEAE2; border: 1px solid #DAD2C7; border-radius: 10px; padding: 14px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 0.86rem; line-height: 1.5; color: #111B21; white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow-y: auto; box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);"
          >
            Loading e-bill preview...
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button
            type="button"
            id="btn-wa-launch-primary"
            class="btn btn-whatsapp"
            style="width: 100%; justify-content: center; padding: 12px; font-size: 1rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(37, 211, 102, 0.35);"
          >
            ${renderIcon('send', { size: 17, color: '#FFFFFF' })} Open in WhatsApp &amp; Send
          </button>
          
          <div style="display: flex; gap: 8px;">
            <button
              type="button"
              id="btn-wa-launch-app"
              class="btn btn-outline"
              style="flex: 1; justify-content: center; font-size: 0.82rem; padding: 8px 10px;"
              title="Launch native WhatsApp Desktop app for Windows/Mac"
            >
              ${renderIcon('externalLink', { size: 13 })} WhatsApp Desktop App
            </button>
            <button
              type="button"
              id="btn-wa-close"
              class="btn btn-ghost"
              style="padding: 8px 16px; font-size: 0.85rem;"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Internal state
  let currentEbillText = '';
  let currentWaUrl = '';
  let currentAppUrl = '';

  const phoneInput = modalEl.querySelector('#wa-phone-input');
  const previewBox = modalEl.querySelector('#wa-preview-box');
  const btnRefresh = modalEl.querySelector('#btn-wa-refresh');
  const btnCopy = modalEl.querySelector('#btn-wa-copy');
  const btnPrimary = modalEl.querySelector('#btn-wa-launch-primary');
  const btnApp = modalEl.querySelector('#btn-wa-launch-app');
  const btnClose = modalEl.querySelector('#btn-wa-close');
  const closeBtnTop = modalEl.querySelector('.modal-close-btn');

  // Load E-Bill text from server
  async function loadPreview() {
    try {
      previewBox.textContent = 'Generating e-bill...';
      const data = await api.getEbill(article.id);
      if (data && data.success) {
        currentEbillText = data.ebill_text || '';
        currentWaUrl = data.whatsapp_url || '';
        currentAppUrl = data.whatsapp_app_url || '';
        previewBox.textContent = currentEbillText;
        if (data.customer_phone && !phoneInput.value) {
          phoneInput.value = data.customer_phone.replace(/^\+?91/, '');
        }
      } else {
        // Fallback local formatting
        currentEbillText = generateClientEbillText(article, shopName);
        previewBox.textContent = currentEbillText;
      }
    } catch (err) {
      currentEbillText = generateClientEbillText(article, shopName);
      previewBox.textContent = currentEbillText;
    }
    updateUrls();
  }

  function updateUrls() {
    const rawVal = phoneInput.value.trim().replace(/\D/g, '');
    if (!rawVal) {
      currentWaUrl = '';
      currentAppUrl = '';
      return;
    }
    const fullPhone = rawVal.length === 10 ? `91${rawVal}` : rawVal;
    const encoded = encodeURIComponent(currentEbillText);
    currentWaUrl = `https://wa.me/${fullPhone}?text=${encoded}`;
    currentAppUrl = `whatsapp://send?phone=${fullPhone}&text=${encoded}`;
  }

  // Events
  btnRefresh.addEventListener('click', () => {
    updateUrls();
    showToast('Phone number updated for e-bill!', 'neutral');
  });

  phoneInput.addEventListener('input', updateUrls);

  btnCopy.addEventListener('click', async () => {
    if (!currentEbillText) return;
    try {
      await navigator.clipboard.writeText(currentEbillText);
      btnCopy.innerHTML = `${renderIcon('check', { size: 13, color: '#059669' })} Copied!`;
      showToast('E-bill message copied to clipboard!', 'success');
      setTimeout(() => {
        btnCopy.innerHTML = `${renderIcon('copy', { size: 13 })} Copy Text`;
      }, 2000);
    } catch (e) {
      showToast('Failed to copy to clipboard', 'warning');
    }
  });

  btnPrimary.addEventListener('click', () => {
    const rawVal = phoneInput.value.trim().replace(/\D/g, '');
    if (!rawVal || rawVal.length < 10) {
      phoneInput.focus();
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }
    updateUrls();
    if (currentWaUrl) {
      window.open(currentWaUrl, '_blank');
      showToast('Opening WhatsApp with formatted e-bill...', 'neutral');
      closeModal();
      if (options.onSent) options.onSent();
    }
  });

  btnApp.addEventListener('click', () => {
    const rawVal = phoneInput.value.trim().replace(/\D/g, '');
    if (!rawVal || rawVal.length < 10) {
      phoneInput.focus();
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }
    updateUrls();
    if (currentAppUrl) {
      window.location.href = currentAppUrl;
      showToast('Launching WhatsApp Desktop app...', 'neutral');
      closeModal();
      if (options.onSent) options.onSent();
    }
  });

  const doClose = () => closeModal();
  btnClose.addEventListener('click', doClose);
  closeBtnTop.addEventListener('click', doClose);

  openModal(modalEl);
  loadPreview();
}

/**
 * Quick 1-click WhatsApp Dispatcher.
 * If customer phone exists, immediately launches WhatsApp with e-bill.
 * If phone is missing, opens the preview modal to prompt for number.
 */
export async function quickSendWhatsAppBill(article, shopName = 'Mehak Bridal Studio', options = {}) {
  const phone = (article.customer_phone || '').trim().replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    // Open modal to prompt for phone number
    openWhatsAppBillModal(article, shopName, options);
    return;
  }

  showToast(`Opening WhatsApp for ${article.customer_name || 'Customer'}...`, 'neutral');
  try {
    const res = await api.sendWhatsAppBill(article.id);
    if (res && res.whatsapp_url) {
      // Opened automatically by sendWhatsAppBill
      if (options.onSent) options.onSent();
    } else {
      openWhatsAppBillModal(article, shopName, options);
    }
  } catch (err) {
    openWhatsAppBillModal(article, shopName, options);
  }
}

/**
 * Client-side fallback bill generator if server is momentarily unreachable.
 */
function generateClientEbillText(article, shopName) {
  const store = shopName || 'Mehak Bridal Studio';
  const name = article.customer_name || 'Valued Customer';
  const id = article.article_id || 'N/A';
  const price = Number(article.price || 0);
  const adv = Number(article.advance_amount || 0);
  const bal = article.balance_amount !== undefined && article.balance_amount !== null
    ? Number(article.balance_amount)
    : Math.max(0, price - adv);
  const sec = Number(article.security_deposit || 0);
  const hasJ = Number(article.has_jewellery || 0) === 1;
  const jewelText = hasJ ? `💍 *Jewellery:* ${article.jewellery_details || 'Matching Set'}\n` : '';
  const secLine = sec > 0 ? `🛡 *Security Deposit:* Rs. ${formatINR(sec)}\n` : '';
  const dueLine = bal <= 0 ? '✅ *Balance Due:* Rs. 0 (Paid in Full)' : `⏳ *Balance Due:* Rs. ${formatINR(bal)}`;

  return (
    `🧾 *E-BILL & BOOKING CONFIRMATION*\n` +
    `*${store.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Customer:* ${name}\n` +
    `📱 *Mobile:* ${article.customer_phone || 'N/A'}\n` +
    `🗓 *Booking ID:* #${id}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👗 *Outfit:* ${article.title || article.category || 'Bridal Outfit'}\n` +
    jewelText +
    `📅 *Pickup Date:* ${article.pickup_date || 'N/A'}\n` +
    `🔄 *Return Date:* ${article.return_date || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Total Rent:* Rs. ${formatINR(price)}\n` +
    `💵 *Advance Paid:* Rs. ${formatINR(adv)}\n` +
    secLine +
    `${dueLine}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *TERMS & CONDITIONS:*\n` +
    `1. No cancellation, refund, or adjustment once booking is confirmed under any condition.\n` +
    `2. Outfit must be returned on or before the Return Date, else a penalty of Rs. 300 per day will apply.\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🙏 _Thank you for choosing ${store}!_\n` +
    `📍 _Kindly present this e-receipt or Booking #${id} at pickup._`
  );
}
