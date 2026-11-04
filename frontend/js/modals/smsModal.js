/**
 * smsModal.js — Android SMS E-Bill Dispatcher & Preview Modal.
 * 
 * WHY:
 * Provides the showroom staff with an instant, clean preview of the plain-text SMS bill,
 * verifies recipient number, displays SMS character count & segment estimates, and dispatches
 * the SMS directly through the Android phone's SIM card over local Wi-Fi.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { showToast, playMessageSentChime } from '../toast.js';
import { openSmsSettingsModal } from './smsSettingsModal.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calculates SMS segment count (standard 160 characters for single, 153 for multi-part).
 * @param {string} text
 * @returns {{length: number, parts: number}}
 */
function calculateSmsParts(text) {
  const len = (text || '').length;
  if (len === 0) return { length: 0, parts: 0 };
  if (len <= 160) return { length: len, parts: 1 };
  const parts = Math.ceil(len / 153);
  return { length: len, parts };
}

/**
 * Format collection garment description strictly for SMS templates.
 * Appends 'Lehenga' for Bridal, Reception, and Casual collections only.
 * @param {string} item
 * @param {string} category
 * @returns {string}
 */
function formatSmsCollectionItem(item, category) {
  const target = (item || '').trim();
  const cat = (category || '').trim();
  const effective = target || cat || 'Bridal';

  const mapping = {
    bridal: 'Bridal Lehenga',
    reception: 'Reception Lehenga',
    casual: 'Casual Lehenga',
  };

  const effLower = effective.toLowerCase();
  if (mapping[effLower]) {
    return mapping[effLower];
  }

  if (effLower.includes('lehenga')) {
    return effective;
  }

  for (const key of Object.keys(mapping)) {
    if (effLower.endsWith(key)) {
      return `${effective} Lehenga`;
    }
  }

  return effective;
}

/**
 * Opens the SMS E-Bill Dispatcher Modal.
 * @param {object} article - Booking article object
 * @param {string} [shopName] - Store brand title
 */
export async function openSmsBillModal(article, shopName = 'Rental Studio') {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  const defaultPhone = (article.customer_phone || '').trim();
  const customerName = (article.customer_name || 'Valued Customer').trim();
  const articleId = String(article.article_id || 'N/A').replace(/^#/, '');

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 520px;">
      <!-- Header -->
      <div class="modal-header" style="background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); color: #FFFFFF; border-bottom: none; border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0; padding: 18px 24px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #3B82F6; display: flex; align-items: center; justify-content: center; color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            ${renderIcon('messageSquare', { size: 20, color: '#FFFFFF' })}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h3 style="margin: 0; font-size: 1.12rem; font-weight: 700; color: #FFFFFF;">
                Send SMS E-Bill
              </h3>
              <span id="sms-today-counter-badge" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 9999px; background: rgba(255,255,255,0.22); font-weight: 600;">
                Today: ...
              </span>
            </div>
            <p style="margin: 2px 0 0; font-size: 0.8rem; color: rgba(255, 255, 255, 0.85);">
              ${escapeHtml(articleId)} — ${escapeHtml(customerName)}
            </p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" id="btn-sms-header-settings" class="btn btn-ghost btn-sm" style="color: #FFFFFF; opacity: 0.9; padding: 4px 8px; font-size: 0.78rem;" title="Configure Android SMS Gateway">
            ${renderIcon('settings', { size: 14 })} Gateway Setup
          </button>
          <button type="button" class="btn btn-ghost btn-icon-only modal-close-btn" style="color: #FFFFFF; opacity: 0.85;" title="Close">
            ${renderIcon('x', { size: 18 })}
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="modal-body" style="padding: 22px 24px; background: var(--bg-card, #FFFFFF); display: flex; flex-direction: column; gap: 14px;">
        
        <div id="sms-error-banner" style="display: none; background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; padding: 10px 14px; border-radius: 8px; font-size: 0.84rem; line-height: 1.4;">
        </div>

        <!-- Phone Field -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="input-label" for="sms-target-phone" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin: 0;">
              Customer Mobile Number
            </label>
            ${article.customer_alt_phone ? `
              <div style="display: flex; gap: 6px; align-items: center;">
                <button type="button" id="btn-use-primary-phone" class="btn btn-outline btn-xs" style="font-size: 0.72rem; padding: 2px 7px;">Primary</button>
                <button type="button" id="btn-use-alt-phone" class="btn btn-outline btn-xs" style="font-size: 0.72rem; padding: 2px 7px;">Alt: ${escapeHtml(article.customer_alt_phone)}</button>
              </div>
            ` : ''}
          </div>
          <input
            type="tel"
            id="sms-target-phone"
            class="input-field"
            value="${escapeHtml(defaultPhone || article.customer_alt_phone || '')}"
            placeholder="10-digit customer mobile number"
            style="width: 100%; font-size: 0.95rem; padding: 9px 12px; font-weight: 600;"
          />
        </div>

        <!-- Message Body -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="input-label" for="sms-body-text" style="font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280);">
              SMS Message Text
            </label>
            <span id="sms-char-counter" style="font-size: 0.76rem; color: var(--text-muted, #6B7280); font-family: monospace;">
              0 / 160 chars (1 SMS)
            </span>
          </div>
          <textarea
            id="sms-body-text"
            class="input-field"
            rows="7"
            style="width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; font-size: 0.86rem; line-height: 1.45; resize: vertical; padding: 10px 12px;"
          >Loading bill text...</textarea>
        </div>

        <!-- Actions -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          <button type="button" id="btn-dispatch-sms" class="btn btn-sms" style="width: 100%; justify-content: center; padding: 11px; font-size: 0.92rem;">
            ${renderIcon('send', { size: 16, color: '#FFFFFF' })} Send SMS via SIM Card
          </button>

          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-copy-sms" class="btn btn-outline btn-sm" style="flex: 1; justify-content: center;">
              ${renderIcon('copy', { size: 14 })} Copy Text
            </button>
            <button type="button" id="btn-open-native-sms" class="btn btn-outline btn-sm" style="flex: 1; justify-content: center;" title="Open device Messages app with pre-filled text">
              ${renderIcon('externalLink', { size: 14 })} Open in Messages
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach elements
  const closeBtn = modalEl.querySelector('.modal-close-btn');
  closeBtn.addEventListener('click', closeModal);

  const phoneInput = modalEl.querySelector('#sms-target-phone');
  const textArea = modalEl.querySelector('#sms-body-text');
  const counterEl = modalEl.querySelector('#sms-char-counter');
  const errorBanner = modalEl.querySelector('#sms-error-banner');
  const dispatchBtn = modalEl.querySelector('#btn-dispatch-sms');
  const copyBtn = modalEl.querySelector('#btn-copy-sms');
  const nativeSmsBtn = modalEl.querySelector('#btn-open-native-sms');
  const settingsBtn = modalEl.querySelector('#btn-sms-header-settings');

  settingsBtn.addEventListener('click', () => {
    openSmsSettingsModal();
  });

  const updateCounter = () => {
    const text = textArea.value;
    const { length, parts } = calculateSmsParts(text);
    counterEl.textContent = `${length} chars (${parts} SMS ${parts === 1 ? 'part' : 'parts'})`;
  };

  textArea.addEventListener('input', updateCounter);

  // Fetch initial SMS bill text from backend
  try {
    const res = await api.getSmsBillText(article.id);
    if (res && res.sms_text) {
      textArea.value = res.sms_text;
    }
  } catch (err) {
    // Client-side fallback text if backend request fails
    const price = Number(article.price || 0);
    const adv = Number(article.advance_amount || 0);
    const bal = article.balance_amount !== undefined && article.balance_amount !== null
      ? Number(article.balance_amount)
      : Math.max(0, price - adv);
    const rawTitle = (article.title || '').trim();
    const category = (article.category || 'Bridal').replace(/–|—/g, '-');
    const baseItem = (!rawTitle || rawTitle.startsWith('Booking -') || rawTitle.toLowerCase() === customerName.toLowerCase())
      ? category
      : rawTitle;
    const item = formatSmsCollectionItem(baseItem, category);
    const balStr = bal <= 0 ? 'Rs 0 (Paid)' : `Rs ${bal.toLocaleString('en-IN')}`;

    textArea.value = [
      `${shopName.toUpperCase()}: BOOKING ${articleId}`,
      `Dear ${customerName}`,
      `Item: ${item}`,
      `Pickup: ${article.pickup_date || 'N/A'} | Return: ${article.return_date || 'N/A'}`,
      `Total: Rs ${price.toLocaleString('en-IN')} (Adv: Rs ${adv.toLocaleString('en-IN')} | Bal: ${balStr})`,
      '- No change or alteration in article once booked.',
      '- Return on or before due date to avoid Rs 300/day late fee.',
      'Thank you for choosing us!',
    ].join('\n');
  }
  updateCounter();

  // Load today's SMS usage count
  const counterBadge = modalEl.querySelector('#sms-today-counter-badge');
  try {
    const status = await api.getSmsStatus();
    if (status && status.today_sms_count !== undefined) {
      const used = status.today_sms_count || 0;
      const limit = status.daily_carrier_limit || 100;
      counterBadge.textContent = `Today: ${used}/${limit} SMS`;
      if (used >= 100) {
        counterBadge.style.background = '#DC2626';
        counterBadge.title = 'TRAI / Carrier daily 100 SMS limit reached for today!';
      } else if (used >= 80) {
        counterBadge.style.background = '#D97706';
      }
    } else {
      counterBadge.style.display = 'none';
    }
  } catch (_) {
    if (counterBadge) counterBadge.style.display = 'none';
  }

  // Quick phone toggles
  const btnUsePrimary = modalEl.querySelector('#btn-use-primary-phone');
  const btnUseAlt = modalEl.querySelector('#btn-use-alt-phone');
  if (btnUsePrimary) {
    btnUsePrimary.addEventListener('click', () => {
      phoneInput.value = (article.customer_phone || '').trim();
    });
  }
  if (btnUseAlt) {
    btnUseAlt.addEventListener('click', () => {
      phoneInput.value = (article.customer_alt_phone || '').trim();
    });
  }

  // Send via SIM / Android Gateway
  dispatchBtn.addEventListener('click', async () => {
    const targetPhone = phoneInput.value.trim().replace(/\D/g, '');
    if (targetPhone.length < 10) {
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      phoneInput.focus();
      return;
    }

    dispatchBtn.disabled = true;
    dispatchBtn.textContent = 'Sending SMS via SIM...';
    errorBanner.style.display = 'none';

    try {
      const res = await api.sendSmsArticle(article.id, {
        phone_override: targetPhone,
        custom_text: textArea.value.trim(),
      });

      if (res && res.success) {
        playMessageSentChime();
        showToast(res.message || 'SMS dispatched to customer!', 'success');
        closeModal();
      } else {
        throw new Error(res.detail || 'Failed to dispatch SMS');
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to dispatch SMS.';
      errorBanner.style.display = 'block';
      errorBanner.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 4px;">⚠️ SMS Dispatch Failed</div>
        <div style="font-size: 0.82rem; margin-bottom: 8px;">${escapeHtml(errorMsg)}</div>
        <div style="border-top: 1px solid rgba(220, 38, 38, 0.2); padding-top: 6px; font-size: 0.76rem; color: #7F1D1D;">
          💡 <strong>Quick Fix:</strong> Check if phone screen is on, or tap <em>"Open in Messages"</em> below to send manually from your device.
        </div>
      `;
      dispatchBtn.disabled = false;
      dispatchBtn.innerHTML = `${renderIcon('send', { size: 16, color: '#FFFFFF' })} Retry Sending SMS`;
    }
  });

  // Copy text
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textArea.value);
      showToast('SMS text copied to clipboard!', 'success');
    } catch (_) {
      textArea.select();
      document.execCommand('copy');
      showToast('SMS text copied!', 'success');
    }
  });

  // Open native SMS link (fallback for iPhone or mobile devices)
  nativeSmsBtn.addEventListener('click', () => {
    const digits = phoneInput.value.trim().replace(/\D/g, '');
    const clean = digits.length === 10 ? `+91${digits}` : `+${digits}`;
    const encoded = encodeURIComponent(textArea.value);
    window.open(`sms:${clean}?body=${encoded}`, '_blank');
  });

  openModal(modalEl);
}
