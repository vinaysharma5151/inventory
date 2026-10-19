/**
 * articleDetailModal.js — Full Garment Details, WhatsApp Bill & Actions Modal
 * 
 * WHY:
 * Provides the central command view for a single bridal piece. Staff can inspect
 * customer details, send instant automated WhatsApp e-bills, print physical tags,
 * clear remaining balance dues, or delete obsolete pieces.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { printGarmentTag } from '../tag.js';
import { showToast } from '../toast.js';
import { openClearoutModal } from './clearoutModal.js';

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
 * Builds the direct WhatsApp click-to-chat URL as a fallback when Cloud API is unconfigured.
 */
function getDirectWhatsAppUrl(article, shopName, numPrice, numAdvance, numBalance, customEbillText) {
  if (!article.customer_phone) return null;
  const cleanPhone = article.customer_phone.replace(/\D/g, '');
  const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const numSecurity = Number(article.security_deposit || 0);
  const secLine = numSecurity > 0 ? `🛡️ *Security Deposit:* ₹${formatINR(numSecurity)}\n` : '';
  const dueLine = numBalance <= 0 ? `✅ *Balance Due:* ₹0 (Paid in Full)` : `⚠️ *Balance Due:* ₹${formatINR(numBalance)}`;
  const storeBrand = (shopName && shopName.trim()) ? shopName.trim() : 'Bridal Studio';
  const text = encodeURIComponent(
    customEbillText || (
      `🌸 *${storeBrand.toUpperCase()}* 🌸\n` +
      `✨ *Booking Confirmation & E-Bill* ✨\n\n` +
      `Dear *${article.customer_name || 'Customer'}*,\n` +
      `Thank you for choosing ${storeBrand}!\n\n` +
      `🧾 *Article Code:* ${article.article_id}\n` +
      `👗 *Outfit:* ${article.title || 'Bridal Lehenga'}\n` +
      `📅 *Pickup Date:* ${article.pickup_date || 'N/A'}\n` +
      `🔄 *Return Date:* ${article.return_date || 'N/A'}\n\n` +
      `💵 *Total Rent:* ₹${formatINR(numPrice)}\n` +
      `💳 *Advance Paid:* ₹${formatINR(numAdvance)}\n` +
      secLine +
      `${dueLine}\n\n` +
      `📍 *${storeBrand}*\nPlease present this receipt during pickup.`
    )
  );
  return `https://wa.me/${fullPhone}?text=${text}`;
}

/**
 * Opens the article detail modal.
 * @param {object} article - Full article object
 * @param {string} [shopName='Mehak Bridal Studio'] - Boutique name
 * @param {object} [callbacks] - { onUpdate, onDelete }
 */
export function openArticleDetailModal(article, shopName = 'Mehak Bridal Studio', { onUpdate, onDelete, currentUser } = {}) {
  if (!article) return;

  const numPrice = Number(article.price) || 0;
  const numAdvance = Number(article.advance_amount) || 0;
  const numBalance = article.balance_amount !== undefined && article.balance_amount !== null
    ? Number(article.balance_amount)
    : Math.max(0, numPrice - numAdvance);

  const isFullyPaid = numPrice > 0 && numBalance === 0;

  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog article-detail-dialog" style="max-width: 820px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span>Lehenga Booking Details</span>
          <span class="badge badge-gold font-mono">${escapeHtml(article.article_id)}</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body detail-modal-grid">
        <!-- Left: Photo -->
        <div class="detail-photo-wrapper">
          <img
            src="${escapeHtml(article.image_path)}"
            alt="${escapeHtml(article.title || article.article_id)}"
            class="detail-photo"
            onerror="this.src='/uploads/sample_LH1001.jpg'"
          />
          <div class="detail-photo-badge">
            ${article.source === 'phone' ? '📱 Mobile Capture' : '💻 Studio Entry'}
          </div>
        </div>

        <!-- Right: Information -->
        <div class="detail-info-col">
          <div>
            <div class="detail-tags-row">
              <span class="badge badge-gold">${escapeHtml(article.category || 'Bridal')}</span>
              <span class="badge badge-neutral">Color: ${escapeHtml(article.color || 'Standard')}</span>
              <span class="badge badge-neutral">Size: ${escapeHtml(article.size || 'Free Size')}</span>
            </div>
            <h2 class="detail-main-title">
              ${escapeHtml(article.title || `Royal Designer Piece ${article.article_id}`)}
            </h2>
          </div>

          <!-- Payment Breakdown -->
          <div class="detail-payment-card">
            <div class="payment-card-top">
              <span class="stat-label">Financial Breakdown</span>
              ${isFullyPaid ? `
                <span class="badge badge-success">${renderIcon('checkCircle', { size: 12 })} Paid in Full</span>
              ` : `
                <span class="badge badge-warning">${renderIcon('clock', { size: 12 })} Balance Due at Pickup</span>
              `}
            </div>

            <div class="payment-stats-grid">
              <div class="payment-stat-box">
                <span class="stat-label">Total Price</span>
                <span class="stat-val-price font-mono">₹${formatINR(numPrice)}</span>
              </div>
              <div class="payment-stat-box">
                <span class="stat-label">Advance Paid</span>
                <span class="stat-val-advance font-mono">₹${formatINR(numAdvance)}</span>
              </div>
              <div class="payment-stat-box balance-highlight">
                <span class="stat-label">Amount Left to Pay</span>
                <span class="stat-val-balance font-mono ${isFullyPaid ? 'paid' : 'due'}">
                  ₹${formatINR(numBalance)}
                </span>
              </div>
            </div>

            ${numBalance > 0 ? `
              <div class="clearout-detail-strip">
                <div class="clearout-detail-text">
                  <span class="clearout-badge-due">Remaining Due: ₹${formatINR(numBalance)}</span>
                  <span class="clearout-subtext">Customer paid whole price? Settle and clear all dues.</span>
                </div>
                <button type="button" class="btn btn-clearout-detail btn-clear-dues-trigger">
                  ${renderIcon('checkCheck', { size: 16 })} Clearout Dues (Paid in Full)
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Customer & Booking Info -->
          <div class="detail-booking-card">
            <div class="booking-card-row">
              <div class="booking-field">
                <span class="stat-label">Customer Name</span>
                <span class="field-bold-val">
                  ${renderIcon('user', { size: 14 })} ${escapeHtml(article.customer_name || 'N/A')}
                </span>
              </div>

              <div class="booking-field">
                <span class="stat-label">Customer Phone</span>
                <span class="field-bold-val">
                  ${renderIcon('phone', { size: 14 })}
                  ${article.customer_phone ? `
                    <a href="tel:${escapeHtml(article.customer_phone)}" style="color: #8C6A2A; text-decoration: none; font-weight: 600;">
                      ${escapeHtml(article.customer_phone)}
                    </a>
                  ` : 'N/A'}
                </span>
              </div>
            </div>

            <div class="booking-card-row">
              <div class="booking-field">
                <span class="stat-label">Booked By Staff</span>
                <span class="field-staff-val">👤 ${escapeHtml(article.salesman_name || 'Studio Desk')}</span>
              </div>
              <div class="booking-field">
                <span class="stat-label">Pickup / Delivery Date</span>
                <span class="field-date-val">${renderIcon('calendar', { size: 14 })} ${escapeHtml(article.pickup_date || 'N/A')}</span>
              </div>
            </div>

            <div class="booking-card-row">
              <div class="booking-field">
                <span class="stat-label">Return Date (Back to Shop)</span>
                <span class="field-date-val field-return-val">${renderIcon('rotateCcw', { size: 14 })} ${escapeHtml(article.return_date || 'Not specified')}</span>
              </div>
            </div>

            ${article.customer_address ? `
              <div class="booking-address-box">
                <div class="address-icon">${renderIcon('mapPin', { size: 14 })}</div>
                <span>${escapeHtml(article.customer_address)}</span>
              </div>
            ` : ''}
          </div>

          ${article.notes ? `
            <div class="detail-notes-box">
              <span class="stat-label">Garment Notes</span>
              <p>${escapeHtml(article.notes)}</p>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Dynamic WhatsApp Feedback Container -->
      <div id="wa-feedback-container"></div>

      <!-- Footer -->
      <div class="modal-footer">
        ${currentUser?.role !== 'staff' ? `
          <button type="button" class="btn btn-danger btn-sm btn-delete-article">
            ${renderIcon('trash', { size: 15 })} Delete Piece
          </button>
        ` : ''}
        <div style="flex: 1;"></div>

        ${numBalance > 0 && currentUser?.role !== 'staff' ? `
          <button type="button" class="btn btn-clearout-footer btn-clear-dues-footer">
            ${renderIcon('checkCheck', { size: 15 })} Clearout Dues
          </button>
        ` : ''}

        ${article.customer_phone ? `
          <button type="button" class="btn btn-whatsapp btn-send-wa">
            ${renderIcon('messageCircle', { size: 16 })} WhatsApp Bill
          </button>
        ` : ''}

        <button type="button" class="btn btn-outline btn-close-modal">Close</button>
        <button type="button" class="btn btn-gold btn-print-tag">
          ${renderIcon('printer', { size: 16 })} Print Garment Tag
        </button>
      </div>
    </div>
  `;

  // Attach handlers
  const closeBtn = modalEl.querySelector('.close-btn');
  const btnCloseModal = modalEl.querySelector('.btn-close-modal');
  closeBtn.addEventListener('click', closeModal);
  btnCloseModal.addEventListener('click', closeModal);

  // Clear dues trigger
  const clearTriggers = modalEl.querySelectorAll('.btn-clear-dues-trigger, .btn-clear-dues-footer');
  clearTriggers.forEach((btn) => {
    btn.addEventListener('click', () => {
      openClearoutModal(article, (updatedArticle) => {
        closeModal();
        if (onUpdate) onUpdate(updatedArticle);
        openArticleDetailModal(updatedArticle, shopName, { onUpdate, onDelete });
      });
    });
  });

  // Print tag trigger
  const printBtn = modalEl.querySelector('.btn-print-tag');
  printBtn.addEventListener('click', () => {
    printGarmentTag(article, shopName);
  });

  // Delete article trigger
  const deleteBtn = modalEl.querySelector('.btn-delete-article');
  deleteBtn.addEventListener('click', async () => {
    if (!window.confirm(`Are you sure you want to delete article ${article.article_id}? This cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteArticle(article.id);
      showToast(`Article ${article.article_id} removed from catalog`, 'neutral');
      closeModal();
      if (onDelete) onDelete(article.id);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  });

  // WhatsApp bill trigger
  const waBtn = modalEl.querySelector('.btn-send-wa');
  if (waBtn) {
    waBtn.addEventListener('click', async () => {
      waBtn.disabled = true;
      waBtn.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Sending...`;

      const fbContainer = modalEl.querySelector('#wa-feedback-container');
      fbContainer.innerHTML = '';

      try {
        const res = await api.sendWhatsAppBill(article.id);
        waBtn.disabled = false;
        waBtn.innerHTML = `${renderIcon('messageCircle', { size: 16 })} WhatsApp Bill`;

        if (res.success) {
          fbContainer.innerHTML = `
            <div class="wa-detail-feedback success">
              <div class="wa-feedback-text">
                ${renderIcon('check', { size: 16 })}
                <span>WhatsApp e-bill sent successfully!</span>
              </div>
            </div>
          `;
          showToast('WhatsApp e-bill sent!', 'success');
        } else {
          const directUrl = getDirectWhatsAppUrl(article, shopName, numPrice, numAdvance, numBalance, res?.ebill_text);
          fbContainer.innerHTML = `
            <div class="wa-detail-feedback error">
              <div class="wa-feedback-text">
                ${renderIcon('messageCircle', { size: 16 })}
                <span>${escapeHtml(res.message || 'WhatsApp Cloud API not active. Use direct link below.')}</span>
              </div>
              ${directUrl ? `
                <a href="${directUrl}" target="_blank" rel="noreferrer" class="btn-wa-direct-link">
                  ${renderIcon('externalLink', { size: 13 })} Open Click-to-Chat Link
                </a>
              ` : ''}
            </div>
          `;
        }
      } catch (err) {
        waBtn.disabled = false;
        waBtn.innerHTML = `${renderIcon('messageCircle', { size: 16 })} WhatsApp Bill`;
        const directUrl = getDirectWhatsAppUrl(article, shopName, numPrice, numAdvance, numBalance);
        fbContainer.innerHTML = `
          <div class="wa-detail-feedback error">
            <div class="wa-feedback-text">
              ${renderIcon('alertCircle', { size: 16 })}
              <span>${escapeHtml(err.message || 'Network error.')}</span>
            </div>
            ${directUrl ? `
              <a href="${directUrl}" target="_blank" rel="noreferrer" class="btn-wa-direct-link">
                ${renderIcon('externalLink', { size: 13 })} Open Click-to-Chat Link
              </a>
            ` : ''}
          </div>
        `;
      }
    });
  }

  openModal(modalEl);
}
