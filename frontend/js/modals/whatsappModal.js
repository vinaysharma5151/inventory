/**
 * whatsappModal.js — WhatsApp E-Bill Dispatcher & Preview Modal.
 * 
 * WHY:
 * Provides the showroom owner/staff with a direct 1-click dispatch interface to send
 * formatted luxury e-bills directly to customers via the self-hosted OpenWA Gateway.
 * Zero browser popups, zero manual clicking.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';
import { openWhatsAppSettingsModal } from './whatsappSettingsModal.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens the WhatsApp E-Bill Dispatcher Modal.
 * @param {object} article - Garment / Booking article object
 * @param {string} [shopName] - Store brand title
 * @param {object} [options] - Optional callbacks
 */
export async function openWhatsAppBillModal(article, shopName = 'Bridal Studio', options = {}) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  const defaultPhone = (article.customer_phone || '').trim();
  const customerName = (article.customer_name || 'Valued Customer').trim();
  const articleId = article.article_id || 'N/A';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 520px;">
      <div class="modal-header" style="background: linear-gradient(135deg, #075E54 0%, #128C7E 100%); color: #FFFFFF; border-bottom: none; border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0; padding: 18px 24px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            ${renderIcon('messageCircle', { size: 22, color: '#FFFFFF' })}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h3 style="margin: 0; font-size: 1.12rem; font-weight: 700; color: #FFFFFF;">
                Send WhatsApp E-Bill
              </h3>
              <span id="wa-mode-badge" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 9999px; background: rgba(255,255,255,0.2); font-weight: 600;">
                Checking Gateway...
              </span>
            </div>
            <p style="margin: 2px 0 0; font-size: 0.8rem; color: rgba(255, 255, 255, 0.85);">
              ${escapeHtml(articleId)} — ${escapeHtml(customerName)}
            </p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" id="btn-wa-header-settings" class="btn btn-ghost btn-sm" style="color: #FFFFFF; opacity: 0.9; padding: 4px 8px; font-size: 0.78rem;" title="Configure OpenWA Gateway credentials">
            ${renderIcon('settings', { size: 14 })} Gateway Setup
          </button>
          <button type="button" class="btn btn-ghost btn-icon-only modal-close-btn" style="color: #FFFFFF; opacity: 0.85;" title="Close">
            ${renderIcon('x', { size: 18 })}
          </button>
        </div>
      </div>

      <div class="modal-body" style="padding: 22px 24px; background: var(--bg-card, #FFFFFF);">
        <div id="wa-error-banner" style="display: none; background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; padding: 10px 14px; border-radius: 8px; font-size: 0.84rem; margin-bottom: 14px; line-height: 1.4;">
        </div>

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
            ${renderIcon('send', { size: 17, color: '#FFFFFF' })} <span id="btn-wa-primary-text">Send WhatsApp E-Bill (1-Click)</span>
          </button>
          
          <div style="display: flex; justify-content: flex-end;">
            <button
              type="button"
              id="btn-wa-close"
              class="btn btn-ghost"
              style="padding: 8px 16px; font-size: 0.85rem;"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Internal state
  let currentEbillText = '';

  const phoneInput = modalEl.querySelector('#wa-phone-input');
  const previewBox = modalEl.querySelector('#wa-preview-box');
  const btnCopy = modalEl.querySelector('#btn-wa-copy');
  const btnPrimary = modalEl.querySelector('#btn-wa-launch-primary');
  const btnPrimaryText = modalEl.querySelector('#btn-wa-primary-text');
  const btnClose = modalEl.querySelector('#btn-wa-close');
  const closeBtnTop = modalEl.querySelector('.modal-close-btn');
  const btnHeaderSettings = modalEl.querySelector('#btn-wa-header-settings');
  const modeBadge = modalEl.querySelector('#wa-mode-badge');
  const errorBanner = modalEl.querySelector('#wa-error-banner');

  btnHeaderSettings.addEventListener('click', () => {
    openWhatsAppSettingsModal(() => {
      loadStatusAndPreview();
    });
  });

  // Load status & preview
  async function loadStatusAndPreview() {
    try {
      const status = await api.getWhatsAppStatus();
      if (status && status.is_ready) {
        modeBadge.textContent = `● OpenWA (${status.push_name || status.session_name || 'Ready'})`;
        modeBadge.style.background = '#25D366';
        modeBadge.style.color = '#FFFFFF';
      } else if (status && status.session_id) {
        modeBadge.textContent = '● Connecting...';
        modeBadge.style.background = '#F59E0B';
        modeBadge.style.color = '#FFFFFF';
      } else {
        modeBadge.textContent = '● Setup Required';
        modeBadge.style.background = '#EF4444';
        modeBadge.style.color = '#FFFFFF';
      }
    } catch (_) {
      modeBadge.textContent = '● OpenWA Offline';
    }

    try {
      previewBox.textContent = 'Generating e-bill...';
      const data = await api.getEbill(article.id);
      if (data && data.success) {
        currentEbillText = data.ebill_text || '';
        previewBox.textContent = currentEbillText;
        if (data.customer_phone && !phoneInput.value) {
          phoneInput.value = data.customer_phone.replace(/^\+?91/, '');
        }
      } else {
        previewBox.textContent = 'Failed to generate e-bill text.';
      }
    } catch (err) {
      previewBox.textContent = 'Error loading e-bill.';
    }
  }

  // Copy text handler
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

  // Primary 1-Click Send via OpenWA
  btnPrimary.addEventListener('click', async () => {
    const rawVal = phoneInput.value.trim().replace(/\D/g, '');
    if (!rawVal || rawVal.length < 10) {
      phoneInput.focus();
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }

    btnPrimary.disabled = true;
    btnPrimary.innerHTML = `${renderIcon('refreshCw', { size: 16 })} Dispatching via OpenWA...`;
    errorBanner.style.display = 'none';

    try {
      const res = await api.sendWhatsAppBill(article.id, rawVal);
      if (res && res.success) {
        showToast(`✓ E-Bill sent directly via WhatsApp to +91 ${rawVal}!`, 'success', 4000);
        closeModal();
        if (options.onSent) options.onSent();
      } else {
        const errDetail = res.error || res.message || 'OpenWA server could not dispatch message.';
        errorBanner.innerHTML = `<strong>⚠️ OpenWA Notice:</strong> ${escapeHtml(errDetail)}`;
        errorBanner.style.display = 'block';
        showToast('WhatsApp dispatch failed. Check details in modal.', 'warning');
      }
    } catch (e) {
      errorBanner.innerHTML = `<strong>⚠️ Connection Error:</strong> ${escapeHtml(e.message || 'Error communicating with server')}`;
      errorBanner.style.display = 'block';
      showToast(e.message || 'Error communicating with server', 'warning');
    } finally {
      btnPrimary.disabled = false;
      btnPrimary.innerHTML = `${renderIcon('send', { size: 17, color: '#FFFFFF' })} <span id="btn-wa-primary-text">Send WhatsApp E-Bill (1-Click)</span>`;
    }
  });

  const doClose = () => closeModal();
  btnClose.addEventListener('click', doClose);
  closeBtnTop.addEventListener('click', doClose);

  openModal(modalEl);
  loadStatusAndPreview();
}
