/**
 * articleCard.js — Garment Card Component for Desktop Dashboard.
 * 
 * WHY:
 * Encapsulates the UI markup, payment math, and interactive actions (details modal,
 * thermal tag printing, WhatsApp e-bill sending, dues clearout) for a single article.
 */

import { api } from '../../api.js?v=7';
import { renderIcon } from '../../icons.js';
import { printThermalBill, printGarmentTag } from '../../tag.js?v=10';
import { showToast } from '../../toast.js';
import { openArticleDetailModal } from '../../modals/articleDetailModal.js?v=10';
import { openClearoutModal } from '../../modals/clearoutModal.js?v=8';
import { openEditArticleModal } from '../../modals/editArticleModal.js?v=9';
import { openWhatsAppBillModal } from '../../modals/whatsappModal.js';

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
 * Creates and returns an HTMLElement representing an article card.
 * @param {object} item - Article data object
 * @param {object} context - { shopName, currentUser, onUpdate, onDelete }
 * @returns {HTMLElement}
 */
export function createArticleCard(item, context) {
  const { shopName, currentUser, onUpdate, onDelete } = context;

  const numPrice = Number(item.price) || 0;
  const numAdvance = Number(item.advance_amount) || 0;
  const numBalance = item.balance_amount !== undefined && item.balance_amount !== null
    ? Number(item.balance_amount)
    : Math.max(0, numPrice - numAdvance);

  const customerName = (item.customer_name || '').trim();
  const personDisplayName = customerName || (
    (item.title && !item.title.startsWith('Booking –') && !item.title.startsWith('Booking -') && item.title.toLowerCase() !== (item.category || '').toLowerCase())
      ? item.title
      : 'Customer'
  );

  const hasDistinctOutfit = Boolean(
    item.title &&
    !item.title.startsWith('Booking –') &&
    !item.title.startsWith('Booking -') &&
    item.title.toLowerCase() !== (item.category || '').toLowerCase() &&
    item.title.toLowerCase() !== customerName.toLowerCase()
  );

  const isPaid = numPrice > 0 && numBalance === 0;
  const hasJewel = Number(item.has_jewellery || 0) === 1;

  const card = document.createElement('div');
  card.className = 'article-studio-card';

  card.innerHTML = `
    <div class="article-card-media" data-id="${item.id}">
      <img
        src="${escapeHtml(item.image_path)}"
        alt="${escapeHtml(personDisplayName)}"
        class="article-card-img"
        loading="lazy"
        decoding="async"
        onerror="this.src='/uploads/sample_LH1001.jpg'"
      />
      <div class="card-source-tag">
        ${item.source === 'phone' ? '📱 Mobile' : '💻 Studio'}
      </div>
    </div>

    <div class="article-card-info">
      <div class="card-top-tags">
        <span class="badge badge-gold font-mono card-id-pill" title="Click to copy ID">
          ${escapeHtml(item.article_id)}
        </span>
        <span class="badge badge-neutral">${escapeHtml(item.category || 'Bridal')}</span>
        ${hasJewel ? `
          <span class="badge" style="background: rgba(184, 134, 11, 0.15); color: #8C6A2A; border: 1px solid rgba(184, 134, 11, 0.35); font-weight: 600;" title="Matching Jewellery Included">
            💍 Jewellery
          </span>
        ` : ''}
      </div>

      <div class="card-header-block">
        <h3 class="card-title" title="${escapeHtml(personDisplayName)}">
          ${escapeHtml(personDisplayName)}
        </h3>

        ${(item.customer_phone || hasDistinctOutfit || hasJewel) ? `
          <div class="card-customer-meta">
            ${item.customer_phone ? `
              <span class="phone-chip font-mono" title="Customer Phone">
                📞 ${escapeHtml(item.customer_phone)}
              </span>
            ` : ''}
            ${hasDistinctOutfit ? `
              <span class="outfit-chip" title="Outfit: ${escapeHtml(item.title)}">
                👗 ${escapeHtml(item.title)}
              </span>
            ` : ''}
            ${hasJewel ? `
              <span class="jewellery-chip" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; background: #FFF9E6; color: #8C6A2A; border: 1px solid #E6D5A8; padding: 2px 7px; border-radius: 6px; font-weight: 500;" title="Jewellery: ${escapeHtml(item.jewellery_details || 'Matching Set')}">
                💍 ${escapeHtml(item.jewellery_details || 'Jewellery Set')}${Number(item.jewellery_price) > 0 ? ` (+₹${formatINR(item.jewellery_price)})` : ''}
              </span>
            ` : ''}
          </div>
        ` : ''}
      </div>

      ${(item.pickup_date || item.return_date) ? `
        <div class="card-dates-box">
          ${item.pickup_date ? `
            <div class="card-date-item card-date-pickup">
              <span class="card-date-label">
                ${renderIcon('calendar', { size: 12 })} Pickup:
              </span>
              <span class="card-date-val font-mono">${escapeHtml(item.pickup_date)}</span>
            </div>
          ` : ''}
          ${item.return_date ? `
            <div class="card-date-item card-date-return" title="Customer Return Back Date">
              <span class="card-date-label">
                ${renderIcon('rotateCcw', { size: 12 })} Return:
              </span>
              <span class="card-date-val font-mono">${escapeHtml(item.return_date)}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="card-payment-breakdown">
        <div class="breakdown-price-row">
          <span class="breakdown-label">Total Price:</span>
          <span class="breakdown-total font-mono">₹${formatINR(numPrice)}</span>
        </div>
        <div class="breakdown-split-row">
          <span class="split-adv">Adv: ₹${formatINR(numAdvance)}</span>
          <span class="split-bal ${isPaid ? 'paid' : 'due'}">
            ${isPaid ? '✓ Paid' : `Due: ₹${formatINR(numBalance)}`}
          </span>
        </div>
      </div>

      ${numBalance > 0 ? `
        <button type="button" class="btn-clearout-card btn-clear-dues-action" title="Customer paid whole price — click to clear all dues">
          ${renderIcon('checkCheck', { size: 14 })} Clearout Dues
        </button>
      ` : `
        <div class="settled-status-pill">
          ${renderIcon('checkCircle', { size: 13 })} Paid in Full (Dues Cleared)
        </div>
      `}

      <div class="card-actions-row">
        <button type="button" class="btn btn-outline btn-sm card-action-btn btn-details-action" title="View Details">
          ${renderIcon('eye', { size: 13 })} Details
        </button>
        <button type="button" class="btn btn-outline btn-sm card-action-btn btn-edit-action" title="Edit Article Data / Fix Errors">
          ${renderIcon('edit', { size: 13 })} Edit
        </button>
        <button type="button" class="btn btn-gold btn-sm card-action-btn btn-tag-action" title="Print Thermal Bill / Receipt (Direct to Printer)">
          ${renderIcon('printer', { size: 13 })} Bill
        </button>
        <button type="button" class="btn btn-whatsapp-card btn-sm card-action-btn btn-wa-action" title="Send Formatted E-Bill via WhatsApp">
          ${renderIcon('messageCircle', { size: 13, color: '#FFFFFF' })} WA
        </button>
      </div>
    </div>
  `;

  // Selectors
  const mediaEl = card.querySelector('.article-card-media');
  const titleEl = card.querySelector('.card-title');
  const idPill = card.querySelector('.card-id-pill');
  const detailsBtn = card.querySelector('.btn-details-action');
  const editBtn = card.querySelector('.btn-edit-action');
  const tagBtn = card.querySelector('.btn-tag-action');
  const waBtn = card.querySelector('.btn-wa-action');
  const clearDuesBtn = card.querySelector('.btn-clear-dues-action');

  const openDetails = () => {
    openArticleDetailModal(item, shopName, {
      currentUser,
      onUpdate,
      onDelete,
    });
  };

  mediaEl.addEventListener('click', openDetails);
  titleEl.addEventListener('click', openDetails);
  detailsBtn.addEventListener('click', openDetails);

  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditArticleModal(item, {
        onUpdate: (updated) => {
          if (onUpdate) onUpdate(updated);
        }
      });
    });
  }

  idPill.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.article_id);
    showToast(`Copied ID: ${item.article_id}`, 'neutral');
  });

  tagBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    printGarmentTag(item, shopName);
  });

  if (waBtn) {
    waBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openWhatsAppBillModal(item, shopName);
    });
  }

  if (clearDuesBtn) {
    clearDuesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openClearoutModal(item, (updated) => {
        if (onUpdate) onUpdate(updated);
      });
    });
  }

  return card;
}
