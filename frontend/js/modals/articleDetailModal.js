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
import { printThermalBill, printGarmentTag } from '../tag.js?v=9';
import { showToast } from '../toast.js';
import { openClearoutModal } from './clearoutModal.js';
import { openEditArticleModal } from './editArticleModal.js?v=8';
import { openWhatsAppBillModal } from './whatsappModal.js';

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
  const secLine = numSecurity > 0 ? `*Security Deposit:* Rs. ${formatINR(numSecurity)}\n` : '';
  const dueLine = numBalance <= 0 ? `*Balance Due:* Rs. 0 (Paid in Full)` : `*Balance Due:* Rs. ${formatINR(numBalance)}`;
  const storeBrand = (shopName && shopName.trim()) ? shopName.trim() : 'Mehak Bridal Studio';
  const displayTitle = (article.title && !article.title.startsWith('Booking –') && !article.title.startsWith('Booking -') && article.title !== article.customer_name)
    ? article.title
    : (article.category || 'Bridal');
  const text = encodeURIComponent(
    customEbillText || (
      `*${storeBrand.toUpperCase()}*\n` +
      `*Booking Confirmation & E-Bill*\n` +
      `----------------------------------------\n` +
      `Dear *${article.customer_name || 'Customer'}*,\n` +
      `Thank you for choosing ${storeBrand}! Here is your booking summary:\n\n` +
      `*Article Code:* ${article.article_id}\n` +
      `*Outfit:* ${String(displayTitle).replace(/[–—]/g, '-')}\n` +
      `*Pickup Date:* ${article.pickup_date || 'N/A'}\n` +
      `*Return Date:* ${article.return_date || 'N/A'}\n\n` +
      `*Total Rent:* Rs. ${formatINR(numPrice)}\n` +
      `*Advance Paid:* Rs. ${formatINR(numAdvance)}\n` +
      secLine +
      `${dueLine}\n\n` +
      `----------------------------------------\n` +
      `*TERMS & CONDITIONS:*\n` +
      `1. No cancellation, refund, or adjustment once booking is confirmed under any condition.\n` +
      `2. Outfit must be returned on or before the Return Date, else a penalty of Rs. 300 per day will apply.\n` +
      `----------------------------------------\n` +
      `*${storeBrand}*\n` +
      `Kindly present this e-receipt or Article Code during garment pickup.`
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

  const stage = (article.status || 'booked').toLowerCase();
  const isBooked = stage === 'booked';
  const isPickedUp = stage === 'picked_up';
  const isReturned = stage === 'returned';

  let stageBadgeLabel = '📌 Stage 1: Booked';
  let stageBadgeClass = 'badge-stage-booked';
  if (isReturned) {
    stageBadgeLabel = '✅ Stage 3: Returned (Back in Shop)';
    stageBadgeClass = 'badge-stage-returned';
  } else if (isPickedUp) {
    stageBadgeLabel = '🛍️ Stage 2: Picked Up (Taken by Customer)';
    stageBadgeClass = 'badge-stage-picked';
  }

  const isFullyPaid = numPrice > 0 && (numBalance === 0 || isPickedUp || isReturned);
  const hasJewel = Number(article.has_jewellery || 0) === 1;

  const displayTitle = (article.title && !article.title.startsWith('Booking –') && !article.title.startsWith('Booking -') && article.title !== article.customer_name)
    ? article.title
    : (article.category || 'Bridal');

  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog article-detail-dialog" style="max-width: 900px; width: 94vw;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span>Lehenga Booking Details</span>
          <span class="badge badge-gold font-mono">${escapeHtml(article.article_id)}</span>
          <span class="badge ${stageBadgeClass}" style="margin-left: 6px;">${stageBadgeLabel}</span>
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
            alt="${escapeHtml(displayTitle)}"
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
              <span class="badge ${stageBadgeClass}">${stageBadgeLabel}</span>
              ${hasJewel ? `
                <span class="badge" style="background: rgba(184, 134, 11, 0.15); color: #8C6A2A; border: 1px solid rgba(184, 134, 11, 0.4); font-weight: 600;">
                  💍 Matching Jewellery
                </span>
              ` : ''}
            </div>
            <h2 class="detail-main-title">
              ${escapeHtml(displayTitle)}
            </h2>

            ${hasJewel ? `
              <div style="margin: 10px 0 14px; padding: 10px 14px; background: #FFFDF5; border: 1px solid #E6D5A8; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; color: #8C6A2A; font-weight: 700; display: block;">Paired Jewellery Set</span>
                  <span style="font-size: 0.92rem; font-weight: 600; color: #1e1e1e;">💍 ${escapeHtml(article.jewellery_details || 'Full Set')}</span>
                </div>
                <div style="text-align: right;">
                  <span style="font-size: 0.72rem; color: #777; display: block;">Jewellery Price</span>
                  <span style="font-size: 0.92rem; font-weight: 700; color: #8C6A2A; font-family: monospace;">+₹${formatINR(article.jewellery_price || 0)}</span>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- 3-STAGE WORKFLOW & ACTION BUTTONS IN DETAIL SECTION -->
          <div class="detail-stage-tracker-card">
            <div class="stage-tracker-top">
              <div class="stage-tracker-header">
                <span class="stage-tracker-title">Showroom 3-Stage Progress</span>
                <span class="stage-tracker-subtitle">Control garment lifecycle directly</span>
              </div>
              <span class="badge ${stageBadgeClass} font-mono">${stageBadgeLabel}</span>
            </div>

            <!-- Visual 3-Stage Stepper -->
            <div class="stage-stepper-row">
              <div class="stepper-step ${isBooked ? 'active' : 'completed'}">
                <div class="stepper-circle">${isBooked ? '1' : '✓'}</div>
                <div class="stepper-text">
                  <span class="stepper-title">1. Booked</span>
                  <span class="stepper-sub">Advance Given</span>
                </div>
              </div>
              <div class="stepper-connector ${isPickedUp || isReturned ? 'completed' : ''}"></div>
              <div class="stepper-step ${isPickedUp ? 'active' : (isReturned ? 'completed' : '')}">
                <div class="stepper-circle">${isReturned ? '✓' : '2'}</div>
                <div class="stepper-text">
                  <span class="stepper-title">2. Picked Up</span>
                  <span class="stepper-sub">Customer Taken</span>
                </div>
              </div>
              <div class="stepper-connector ${isReturned ? 'completed' : ''}"></div>
              <div class="stepper-step ${isReturned ? 'active completed' : ''}">
                <div class="stepper-circle">${isReturned ? '✓' : '3'}</div>
                <div class="stepper-text">
                  <span class="stepper-title">3. Returned</span>
                  <span class="stepper-sub">Back in Shop</span>
                </div>
              </div>
            </div>

            <!-- Detail Section Action Buttons: Pick Up & Return -->
            <div class="stage-actions-button-grid">
              <button
                type="button"
                class="btn btn-stage-action btn-stage-pickup-action ${isPickedUp ? 'is-current-stage' : ''}"
                id="btn-detail-pickup-action"
                title="Stage 2: Customer pays remaining dues and takes garment"
              >
                ${renderIcon('shoppingBag', { size: 18 })}
                <div class="btn-stage-label-group">
                  <span class="btn-stage-title">${isPickedUp ? '✓ Picked Up' : 'Pick Up'}</span>
                  <span class="btn-stage-desc">${isPickedUp ? 'Taken by Customer' : (numBalance > 0 ? `Clear Due ₹${formatINR(numBalance)} &amp; Deliver` : 'Deliver to Customer')}</span>
                </div>
              </button>

              <button
                type="button"
                class="btn btn-stage-action btn-stage-return-action ${isReturned ? 'is-current-stage' : ''}"
                id="btn-detail-return-action"
                title="Stage 3: Customer returned article back to shop"
              >
                ${renderIcon('rotateCcw', { size: 18 })}
                <div class="btn-stage-label-group">
                  <span class="btn-stage-title">Return (Stage 3)</span>
                  <span class="btn-stage-desc">Garment Back in Shop (Complete &amp; Clear)</span>
                </div>
              </button>
            </div>
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
                  <span class="clearout-subtext">Customer taking garment now? Settle and clear all dues.</span>
                </div>
                <button type="button" class="btn btn-clearout-detail btn-clear-dues-trigger">
                  ${renderIcon('checkCheck', { size: 16 })} Clear Dues &amp; Pickup
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
                <span class="stat-label">Pickup / Delivery Date</span>
                <span class="field-date-val">${renderIcon('calendar', { size: 14 })} ${escapeHtml(article.pickup_date || 'N/A')}</span>
              </div>
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


      <!-- Footer -->
      <div class="modal-footer detail-modal-footer">
        <div class="footer-actions-left">
          <button type="button" class="btn btn-danger btn-sm btn-delete-article" title="Permanently Delete Piece">
            ${renderIcon('trash', { size: 14 })} Delete Piece
          </button>
          <button type="button" class="btn btn-outline btn-sm btn-edit-detail-article" title="Edit Article Data / Fix Errors">
            ${renderIcon('edit', { size: 14 })} Edit Details
          </button>
        </div>

        <div class="footer-actions-right">
          ${article.customer_phone ? `
            <button type="button" class="btn btn-whatsapp btn-sm btn-send-wa" title="Send WhatsApp Bill">
              ${renderIcon('messageCircle', { size: 15 })} WhatsApp Bill
            </button>
          ` : ''}

          <button type="button" class="btn btn-outline btn-sm btn-close-modal">Close</button>
          <button type="button" class="btn btn-gold btn-sm btn-print-tag btn-print-bill" title="Send Print Request directly to Thermal Printer">
            ${renderIcon('printer', { size: 15 })} Print Bill (Thermal)
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach handlers
  const closeBtn = modalEl.querySelector('.close-btn');
  const btnCloseModal = modalEl.querySelector('.btn-close-modal');
  closeBtn.addEventListener('click', closeModal);
  btnCloseModal.addEventListener('click', closeModal);

  // Edit article trigger
  const editDetailBtn = modalEl.querySelector('.btn-edit-detail-article');
  if (editDetailBtn) {
    editDetailBtn.addEventListener('click', () => {
      closeModal();
      openEditArticleModal(article, {
        onUpdate: (updatedArticle) => {
          if (onUpdate) onUpdate(updatedArticle);
          openArticleDetailModal(updatedArticle, shopName, { onUpdate, onDelete, currentUser });
        }
      });
    });
  }

  // Pick Up handlers (Stage 2: Customer takes garment & pays remaining balance)
  const handlePickup = async () => {
    if (isPickedUp) {
      showToast(`Article ${article.article_id} is already marked as Picked Up.`, 'neutral');
      return;
    }
    if (isReturned) {
      if (!window.confirm(`Article ${article.article_id} was marked Returned. Revert to Stage 2: Picked Up?`)) {
        return;
      }
      try {
        const res = await api.updateArticle(article.id, { status: 'picked_up' });
        if (res.success && res.article) {
          showToast(`Article ${article.article_id} status set to Picked Up.`, 'success');
          closeModal();
          if (onUpdate) onUpdate(res.article);
          openArticleDetailModal(res.article, shopName, { onUpdate, onDelete, currentUser });
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
      return;
    }

    if (numBalance > 0) {
      openClearoutModal(article, (updatedArticle) => {
        closeModal();
        if (onUpdate) onUpdate(updatedArticle);
        openArticleDetailModal(updatedArticle, shopName, { onUpdate, onDelete, currentUser });
      });
    } else {
      try {
        const res = await api.pickupArticle(article.id);
        if (res.success && res.article) {
          showToast(`Article ${article.article_id} marked as Picked Up!`, 'success');
          closeModal();
          if (onUpdate) onUpdate(res.article);
          openArticleDetailModal(res.article, shopName, { onUpdate, onDelete, currentUser });
        }
      } catch (err) {
        alert('Error marking as picked up: ' + err.message);
      }
    }
  };

  const pickupTriggers = modalEl.querySelectorAll(
    '#btn-detail-pickup-action, .btn-clear-dues-trigger'
  );
  pickupTriggers.forEach((btn) => {
    btn.addEventListener('click', handlePickup);
  });

  // Return handlers (Stage 3: Customer Returned Article Back to Shop)
  const handleReturn = async () => {
    if (!window.confirm(`Confirm garment ${article.article_id} has been returned back to shop?\n\nThis will remove its photo and remove its record from the database.`)) {
      return;
    }
    try {
      const res = await api.returnArticle(article.id);
      if (res.success) {
        showToast(`Article ${article.article_id} returned. Photo and database record removed.`, 'success');
        closeModal();
        if (onDelete) onDelete(article.id);
      } else {
        alert(res.message || 'Failed to mark article as returned.');
      }
    } catch (err) {
      alert('Error marking as returned: ' + err.message);
    }
  };

  const returnTriggers = modalEl.querySelectorAll('#btn-detail-return-action');
  returnTriggers.forEach((btn) => {
    btn.addEventListener('click', handleReturn);
  });

  // Print bill trigger
  const printBtn = modalEl.querySelector('.btn-print-bill, .btn-print-tag');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      printThermalBill(article, shopName);
    });
  }

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

  // WhatsApp bill trigger: Open WhatsApp E-Bill Dispatcher
  const waBtn = modalEl.querySelector('.btn-send-wa');
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      openWhatsAppBillModal(article, shopName);
    });
  }

  openModal(modalEl);
}
