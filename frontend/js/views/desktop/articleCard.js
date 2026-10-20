/**
 * articleCard.js — Garment Card Component for Desktop Dashboard.
 * 
 * WHY:
 * Encapsulates the UI markup, payment math, and interactive actions (details modal,
 * thermal tag printing, WhatsApp e-bill sending, dues clearout) for a single article.
 */

import { api } from '../../api.js?v=6';
import { renderIcon } from '../../icons.js';
import { printThermalBill, printGarmentTag } from '../../tag.js?v=9';
import { showToast } from '../../toast.js';
import { openArticleDetailModal } from '../../modals/articleDetailModal.js?v=9';
import { openClearoutModal } from '../../modals/clearoutModal.js?v=8';
import { openEditArticleModal } from '../../modals/editArticleModal.js?v=8';

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

  const isPaid = numPrice > 0 && numBalance === 0;

  const card = document.createElement('div');
  card.className = 'article-studio-card';

  card.innerHTML = `
    <div class="article-card-media" data-id="${item.id}">
      <img
        src="${escapeHtml(item.image_path)}"
        alt="${escapeHtml(item.title || item.article_id)}"
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
      </div>

      <h3 class="card-title" title="${escapeHtml(item.title || item.article_id)}">
        ${escapeHtml(item.title || `Designer Piece ${item.article_id}`)}
      </h3>

      <div class="card-salesman-strip">
        <span class="salesman-chip">👤 ${escapeHtml(item.salesman_name || 'Studio')}</span>
        ${item.customer_name ? `<span class="customer-chip" title="${escapeHtml(item.customer_name)}">🏷️ ${escapeHtml(item.customer_name)}</span>` : ''}
        ${item.customer_phone ? `<span class="phone-chip font-mono">📞 ${escapeHtml(item.customer_phone)}</span>` : ''}
      </div>

      ${(item.pickup_date || item.return_date) ? `
        <div class="card-dates-row">
          ${item.pickup_date ? `
            <div class="card-pickup-date">
              ${renderIcon('calendar', { size: 12 })}
              <span>Pickup: <strong>${escapeHtml(item.pickup_date)}</strong></span>
            </div>
          ` : ''}
          ${item.return_date ? `
            <div class="card-return-date" title="Customer Return Back Date">
              ${renderIcon('rotateCcw', { size: 12 })}
              <span>Return: <strong>${escapeHtml(item.return_date)}</strong></span>
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

      ${numBalance > 0 ? (
        currentUser?.role !== 'staff' ? `
          <button type="button" class="btn-clearout-card btn-clear-dues-action" title="Customer paid whole price — click to clear all dues">
            ${renderIcon('checkCheck', { size: 14 })} Clearout Dues
          </button>
        ` : `
          <div class="settled-status-pill" style="background: rgba(217,119,6,0.08); color: #D97706; border: 1px solid rgba(217,119,6,0.2);">
            ${renderIcon('alertCircle', { size: 13 })} Dues Remaining (Owner Action)
          </div>
        `
      ) : `
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
        ${item.customer_phone ? `
          <button type="button" class="btn btn-outline btn-sm card-action-btn btn-wa-card-action" title="Send WhatsApp E-Bill to Customer">
            ${renderIcon('messageCircle', { size: 13 })} WA
          </button>
        ` : ''}
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
  const clearDuesBtn = card.querySelector('.btn-clear-dues-action');
  const waCardBtn = card.querySelector('.btn-wa-card-action');

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
    alert(`Copied ID: ${item.article_id}`);
  });

  tagBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    printGarmentTag(item, shopName);
  });

  if (clearDuesBtn) {
    clearDuesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openClearoutModal(item, (updated) => {
        if (onUpdate) onUpdate(updated);
      });
    });
  }

  if (waCardBtn) {
    waCardBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const origHtml = waCardBtn.innerHTML;
      waCardBtn.disabled = true;
      waCardBtn.innerHTML = `${renderIcon('loader', { size: 14, className: 'spinner-icon' })}`;

      try {
        const res = await api.sendWhatsAppBill(item.id);
        waCardBtn.disabled = false;
        waCardBtn.innerHTML = origHtml;

        if (res.success) {
          showToast(`WhatsApp e-bill sent to ${item.customer_name || 'Customer'}!`, 'success');
        } else {
          const cleanPhone = (item.customer_phone || '').replace(/\D/g, '');
          const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
          const textToSend = res.ebill_text || (
            `🌸 *${(shopName || 'MEHAK BRIDAL STUDIO').toUpperCase()}* 🌸\n` +
            `✨ *Booking Confirmation & E-Bill* ✨\n\n` +
            `Dear *${item.customer_name || 'Customer'}*,\n` +
            `Thank you for choosing ${shopName}!\n\n` +
            `🧾 *Article Code:* ${item.article_id}\n` +
            `👗 *Outfit:* ${item.title || 'Bridal Lehenga'}\n` +
            `📅 *Pickup Date:* ${item.pickup_date || 'N/A'}\n` +
            `🔄 *Return Date:* ${item.return_date || 'N/A'}\n\n` +
            `💵 *Total Rent:* ₹${Number(item.price || 0).toLocaleString('en-IN')}\n` +
            `💳 *Advance Paid:* ₹${Number(item.advance_amount || 0).toLocaleString('en-IN')}\n` +
            (Number(item.security_deposit || 0) > 0 ? `🛡️ *Security Deposit:* ₹${Number(item.security_deposit || 0).toLocaleString('en-IN')}\n` : '') +
            (Number(item.balance_amount || 0) <= 0 ? '✅ *Balance Due:* ₹0 (Paid in Full)\n\n' : `⚠️ *Balance Due:* ₹${Number(item.balance_amount || 0).toLocaleString('en-IN')}\n\n`) +
            `📍 *${shopName}*\nPlease present this receipt during pickup.`
          );
          const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(textToSend)}`;
          window.open(waUrl, '_blank');
          showToast('Opening WhatsApp with e-bill...', 'neutral');
        }
      } catch (err) {
        waCardBtn.disabled = false;
        waCardBtn.innerHTML = origHtml;
        showToast('WhatsApp send error: ' + err.message, 'error');
      }
    });
  }

  return card;
}
