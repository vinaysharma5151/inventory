/**
 * clearoutModal.js — Dues Settlement & Clearance Modal
 * 
 * WHY:
 * When a bride or customer comes to pick up their lehenga, they pay the remaining balance.
 * This modal shows the exact balance due, confirms the customer payment, and updates
 * the server so the card shows 'Paid in Full' across all connected studio screens.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';

const formatINR = (val) => Number(val || 0).toLocaleString('en-IN');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens the dues clearout modal for a specific article.
 * @param {object} article - Article record
 * @param {function} [onSuccess] - Callback when dues are cleared successfully
 */
export function openClearoutModal(article, onSuccess) {
  if (!article) return;

  const numPrice = Number(article.price) || 0;
  const numAdvance = Number(article.advance_amount) || 0;
  const numBalance = article.balance_amount !== undefined && article.balance_amount !== null
    ? Number(article.balance_amount)
    : Math.max(0, numPrice - numAdvance);

  if (numBalance <= 0) {
    showToast(`All dues are already cleared for ${article.article_id}.`, 'neutral');
    return;
  }

  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';
  modalEl.id = 'clearout-modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog clearout-dialog" id="clearout-dialog">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span class="clearout-crest-icon">
            ${renderIcon('checkCheck', { size: 18, color: '#059669' })}
          </span>
          <span>Clearout Dues</span>
          <span class="badge badge-gold font-mono">${escapeHtml(article.article_id)}</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn" id="close-clearout-modal-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <!-- Article Preview -->
        <div class="clearout-article-preview">
          <img
            src="${escapeHtml(article.image_path)}"
            alt="${escapeHtml(article.article_id)}"
            class="clearout-thumb"
            onerror="this.src='/uploads/sample_LH1001.jpg'"
          />
          <div class="clearout-preview-info">
            <h4 class="clearout-preview-title">${escapeHtml(article.title || `Designer Piece ${article.article_id}`)}</h4>
            <div class="clearout-meta-row">
              <span class="clearout-customer-tag">👤 ${escapeHtml(article.customer_name || 'Guest')}</span>
              ${article.customer_phone ? `<span class="clearout-phone-tag">📞 ${escapeHtml(article.customer_phone)}</span>` : ''}
              ${article.return_date ? `<span class="clearout-return-tag">Return: ${escapeHtml(article.return_date)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Calculation Breakdown -->
        <div class="clearout-calculation-card">
          <div class="calc-row">
            <span class="calc-label">Total Rental Price:</span>
            <span class="calc-val-price font-mono">₹${formatINR(numPrice)}</span>
          </div>
          <div class="calc-row">
            <span class="calc-label">Advance Already Paid:</span>
            <span class="calc-val-adv font-mono">₹${formatINR(numAdvance)}</span>
          </div>
          <div class="calc-row calc-due-row">
            <span class="calc-label-due">Remaining Balance to Clear:</span>
            <span class="calc-val-due font-mono">₹${formatINR(numBalance)}</span>
          </div>
          <div class="calc-divider"></div>
          <div class="calc-row calc-result-row">
            <span class="calc-label-after">New Balance After Clearance:</span>
            <span class="calc-val-zero font-mono">₹0 (Paid in Full)</span>
          </div>
        </div>

        <!-- Warning / Confirmation Box -->
        <div class="clearout-prompt-box">
          <div class="prompt-icon">${renderIcon('alertCircle', { size: 18, color: '#D97706' })}</div>
          <div>Customer is settling the remaining <strong>₹${formatINR(numBalance)}</strong>. Confirming will set balance to ₹0 and mark the booking as Paid in Full.</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button type="button" class="btn btn-outline cancel-btn">Cancel</button>
        <button type="button" class="btn btn-clearout-confirm confirm-btn" id="confirm-clearout-btn">
          ${renderIcon('checkCheck', { size: 16, color: '#FFFFFF' })}
          <span>Confirm Clearance (₹${formatINR(numBalance)})</span>
        </button>
      </div>
    </div>
  `;

  // Attach event handlers
  const closeBtn = modalEl.querySelector('.close-btn');
  const cancelBtn = modalEl.querySelector('.cancel-btn');
  const confirmBtn = modalEl.querySelector('.confirm-btn');

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Clearing dues...`;

    try {
      const res = await api.clearDues(article.id, 'Counter Settlement');

      if (res.success && res.article) {
        showToast(`All dues cleared for ${article.article_id}! Paid in full.`, 'success');
        closeModal();
        if (onSuccess) onSuccess(res.article);
      } else {
        alert(res.message || 'Failed to clear dues.');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `Confirm Clearance`;
      }
    } catch (err) {
      alert('Error clearing dues: ' + err.message);
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `Confirm Clearance`;
    }
  });

  openModal(modalEl);
}
