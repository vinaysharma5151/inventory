/**
 * editArticleModal.js — Shopkeeper Full Column Edit Modal
 * 
 * WHY:
 * If a salesman made a mistake or filled any field incorrectly during booking,
 * the shopkeeper can edit any column/field (article code, category, title, color,
 * size, salesman, price, advance, deposit, customer details, dates, notes, and photo)
 * directly from the main desktop app.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { compressToMediumResolution } from '../imageUtils.js';
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
 * Opens the Edit Article / Booking modal.
 * @param {object} article - Full article object
 * @param {object} [options] - { onUpdate }
 */
export function openEditArticleModal(article, { onUpdate } = {}) {
  if (!article) return;

  let newPhotoBlob = null;
  let newPhotoUrl = null;

  const numPrice = Number(article.price) || 0;
  const numAdvance = Number(article.advance_amount) || 0;
  const numDeposit = Number(article.security_deposit) || 0;
  const initialBalance = article.balance_amount !== undefined && article.balance_amount !== null
    ? Number(article.balance_amount)
    : Math.max(0, numPrice - numAdvance);

  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 680px; max-height: 90vh; display: flex; flex-direction: column;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title" style="display: flex; align-items: center; gap: 8px;">
          ${renderIcon('edit', { size: 18, color: 'var(--gold-dark)' })}
          <span>Edit Article &amp; Booking Details</span>
          <span class="badge badge-gold font-mono" id="edit-header-badge">${escapeHtml(article.article_id)}</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn" title="Close">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Form Body with Scrolling -->
      <form id="edit-article-form" class="modal-body" style="overflow-y: auto; display: flex; flex-direction: column; gap: 16px; padding: 20px;">
        
        <!-- Photo Section -->
        <div style="background: var(--bg-main); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 14px;">
          <label class="input-label" style="margin-bottom: 8px;">Garment Photo</label>
          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <div style="position: relative; width: 88px; height: 88px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-light); background: #181512; flex-shrink: 0;">
              <img
                id="edit-photo-preview"
                src="${escapeHtml(article.image_path)}"
                alt="${escapeHtml(article.article_id)}"
                style="width: 100%; height: 100%; object-fit: cover;"
                onerror="this.src='/uploads/sample_LH1001.jpg'"
              />
            </div>
            <div style="flex: 1; min-width: 200px;">
              <p style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                Replace Garment Photo
              </p>
              <p style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 10px;">
                Did the salesman photograph the wrong dress or blurry photo? Choose a new image to replace it.
              </p>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <button type="button" id="btn-change-photo" class="btn btn-outline btn-sm">
                  ${renderIcon('upload', { size: 14 })} Choose Replacement Photo
                </button>
                <button type="button" id="btn-cancel-new-photo" class="btn btn-ghost btn-sm" style="display: none; color: var(--danger-text);">
                  Cancel New Photo
                </button>
                <input type="file" id="edit-photo-file-input" accept="image/*" style="display: none;" />
              </div>
            </div>
          </div>
        </div>

        <!-- Row: Article ID & Category -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="edit-article-id">Article Code *</label>
            <input
              type="text"
              id="edit-article-id"
              class="input-field font-mono"
              value="${escapeHtml(article.article_id)}"
              placeholder="e.g. 0001"
              required
            />
          </div>
          <div>
            <label class="input-label" for="edit-category">Collection Category</label>
            <select id="edit-category" class="input-field">
              <option value="Bridal" ${article.category === 'Bridal' ? 'selected' : ''}>Bridal</option>
              <option value="Reception" ${article.category === 'Reception' ? 'selected' : ''}>Reception</option>
              <option value="Jewellery" ${article.category === 'Jewellery' ? 'selected' : ''}>Jewellery</option>
              <option value="Casual" ${article.category === 'Casual' ? 'selected' : ''}>Casual</option>
            </select>
          </div>
        </div>

        <!-- Row: Title -->
        <div>
          <label class="input-label" for="edit-title">Garment Title / Description *</label>
          <input
            type="text"
            id="edit-title"
            class="input-field"
            value="${escapeHtml(article.title || '')}"
            placeholder="e.g. Royal Maroon Velvet Zardozi Lehenga"
            required
          />
        </div>

        <!-- Row: Color, Size & Salesman -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 12px;">
          <div>
            <label class="input-label" for="edit-color">Color</label>
            <input
              type="text"
              id="edit-color"
              class="input-field"
              value="${escapeHtml(article.color || '')}"
              placeholder="e.g. Crimson Red"
            />
          </div>
          <div>
            <label class="input-label" for="edit-size">Size</label>
            <input
              type="text"
              id="edit-size"
              class="input-field"
              value="${escapeHtml(article.size || 'Free Size')}"
              placeholder="e.g. Free Size, XL"
            />
          </div>
          <div>
            <label class="input-label" for="edit-salesman-name">Booked By Staff</label>
            <input
              type="text"
              id="edit-salesman-name"
              class="input-field"
              list="edit-salesmen-list"
              value="${escapeHtml(article.salesman_name || '')}"
              placeholder="Sales staff name"
            />
            <datalist id="edit-salesmen-list"></datalist>
          </div>
        </div>

        <!-- Payment Breakdown Card -->
        <div style="background: var(--bg-main); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span class="input-label" style="margin-bottom: 0;">Financial Breakdown (₹)</span>
            <span id="edit-balance-badge" class="badge ${initialBalance <= 0 ? 'badge-success' : 'badge-warning'}">
              ${initialBalance <= 0 ? 'Paid in Full' : `Balance Due: ₹${formatINR(initialBalance)}`}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
            <div>
              <label class="input-label" for="edit-price" style="font-size: 0.7rem;">Rental Price *</label>
              <div class="currency-input-container">
                <span class="currency-symbol-prefix">₹</span>
                <input
                  type="number"
                  id="edit-price"
                  min="0"
                  step="100"
                  class="input-field"
                  value="${numPrice}"
                  required
                />
              </div>
            </div>
            <div>
              <label class="input-label" for="edit-advance" style="font-size: 0.7rem;">Advance Paid</label>
              <div class="currency-input-container">
                <span class="currency-symbol-prefix">₹</span>
                <input
                  type="number"
                  id="edit-advance"
                  min="0"
                  step="100"
                  class="input-field"
                  value="${numAdvance}"
                />
              </div>
            </div>
            <div>
              <label class="input-label" for="edit-deposit" style="font-size: 0.7rem;">Security Deposit</label>
              <div class="currency-input-container">
                <span class="currency-symbol-prefix">₹</span>
                <input
                  type="number"
                  id="edit-deposit"
                  min="0"
                  step="100"
                  class="input-field"
                  value="${numDeposit}"
                />
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-light); font-size: 0.84rem;">
            <span style="color: var(--text-secondary);">Calculated Balance Due (Price − Advance):</span>
            <span id="edit-calc-balance-text" class="font-mono" style="font-weight: 700; color: ${initialBalance <= 0 ? '#15803D' : '#D97706'};">
              ₹${formatINR(initialBalance)}
            </span>
          </div>
        </div>

        <!-- Customer Information -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="edit-cust-name">Customer Full Name</label>
            <input
              type="text"
              id="edit-cust-name"
              class="input-field"
              value="${escapeHtml(article.customer_name || '')}"
              placeholder="e.g. Simran Kaur"
            />
          </div>
          <div>
            <label class="input-label" for="edit-cust-phone">Customer Phone Number</label>
            <input
              type="tel"
              id="edit-cust-phone"
              class="input-field font-mono"
              value="${escapeHtml(article.customer_phone || '')}"
              placeholder="e.g. 9876543210"
            />
          </div>
        </div>

        <!-- Customer Address -->
        <div>
          <label class="input-label" for="edit-cust-addr">Customer Address</label>
          <input
            type="text"
            id="edit-cust-addr"
            class="input-field"
            value="${escapeHtml(article.customer_address || '')}"
            placeholder="Street address, colony, or city"
          />
        </div>

        <!-- Dates Row: Pickup, Return, Booking -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="edit-pickup-date">Pickup Date</label>
            <input
              type="date"
              id="edit-pickup-date"
              class="input-field"
              value="${article.pickup_date || ''}"
            />
          </div>
          <div>
            <label class="input-label" for="edit-return-date">Return Back Date</label>
            <input
              type="date"
              id="edit-return-date"
              class="input-field"
              value="${article.return_date || ''}"
            />
          </div>
          <div>
            <label class="input-label" for="edit-booking-date">Booking Date</label>
            <input
              type="date"
              id="edit-booking-date"
              class="input-field"
              value="${article.booking_date || ''}"
            />
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="input-label" for="edit-notes">Garment / Alteration Notes</label>
          <textarea
            id="edit-notes"
            rows="2"
            class="input-field"
            placeholder="Blouse sizing, fitting alterations, or garment notes..."
          >${escapeHtml(article.notes || '')}</textarea>
        </div>

      </form>

      <!-- Footer -->
      <div class="modal-footer" style="padding: 14px 24px; border-top: 1px solid var(--border-light); display: flex; justify-content: flex-end; align-items: center; gap: 12px; background: var(--bg-hover);">
        <button type="button" class="btn btn-outline btn-close-modal" style="padding: 8px 18px; font-size: 0.84rem;">Cancel</button>
        <button type="submit" form="edit-article-form" id="btn-save-edit" class="btn btn-gold" style="padding: 8px 20px; font-size: 0.84rem;">
          ${renderIcon('check', { size: 15 })} Save Changes
        </button>
      </div>
    </div>
  `;

  // Pre-load salesmen list into datalist
  api.getSalesmen().then((res) => {
    if (res?.success && Array.isArray(res.salesmen)) {
      const datalist = modalEl.querySelector('#edit-salesmen-list');
      if (datalist) {
        datalist.innerHTML = res.salesmen
          .map((s) => `<option value="${escapeHtml(s.name)}"></option>`)
          .join('');
      }
    }
  }).catch(() => {});

  // Close buttons
  const closeBtn = modalEl.querySelector('.close-btn');
  const btnCloseModal = modalEl.querySelector('.btn-close-modal');
  const cleanup = () => {
    if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
  };
  closeBtn.addEventListener('click', () => { cleanup(); closeModal(); });
  btnCloseModal.addEventListener('click', () => { cleanup(); closeModal(); });

  // Live balance calculation
  const priceInput = modalEl.querySelector('#edit-price');
  const advanceInput = modalEl.querySelector('#edit-advance');
  const balanceBadge = modalEl.querySelector('#edit-balance-badge');
  const balanceText = modalEl.querySelector('#edit-calc-balance-text');

  const updateLiveBalance = () => {
    const p = parseFloat(priceInput.value) || 0;
    const a = parseFloat(advanceInput.value) || 0;
    const bal = Math.max(0, p - a);
    balanceText.textContent = `₹${formatINR(bal)}`;
    if (bal <= 0) {
      balanceText.style.color = '#15803D';
      balanceBadge.className = 'badge badge-success';
      balanceBadge.textContent = 'Paid in Full';
    } else {
      balanceText.style.color = '#D97706';
      balanceBadge.className = 'badge badge-warning';
      balanceBadge.textContent = `Balance Due: ₹${formatINR(bal)}`;
    }
  };
  priceInput.addEventListener('input', updateLiveBalance);
  advanceInput.addEventListener('input', updateLiveBalance);

  // Photo replacement handlers
  const fileInput = modalEl.querySelector('#edit-photo-file-input');
  const btnChangePhoto = modalEl.querySelector('#btn-change-photo');
  const btnCancelPhoto = modalEl.querySelector('#btn-cancel-new-photo');
  const photoPreview = modalEl.querySelector('#edit-photo-preview');

  btnChangePhoto.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      btnChangePhoto.disabled = true;
      btnChangePhoto.innerHTML = `${renderIcon('loader', { size: 14, className: 'spinner-icon' })} Processing...`;
      const compressed = await compressToMediumResolution(file, 1200, 0.80);
      newPhotoBlob = compressed;

      if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
      newPhotoUrl = URL.createObjectURL(compressed);
      photoPreview.src = newPhotoUrl;

      btnCancelPhoto.style.display = 'inline-flex';
      btnChangePhoto.innerHTML = `${renderIcon('check', { size: 14 })} New Photo Selected`;
      btnChangePhoto.disabled = false;
    } catch (err) {
      btnChangePhoto.disabled = false;
      btnChangePhoto.innerHTML = `${renderIcon('upload', { size: 14 })} Choose Replacement Photo`;
      alert('Failed to process image: ' + err.message);
    }
  });

  btnCancelPhoto.addEventListener('click', () => {
    newPhotoBlob = null;
    if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
    newPhotoUrl = null;
    photoPreview.src = article.image_path;
    fileInput.value = '';
    btnCancelPhoto.style.display = 'none';
    btnChangePhoto.innerHTML = `${renderIcon('upload', { size: 14 })} Choose Replacement Photo`;
  });

  // Form Submit Handler
  const form = modalEl.querySelector('#edit-article-form');
  const saveBtn = modalEl.querySelector('#btn-save-edit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const price = parseFloat(priceInput.value) || 0;
    const advance = parseFloat(advanceInput.value) || 0;
    const deposit = parseFloat(modalEl.querySelector('#edit-deposit').value) || 0;
    const balance = Math.max(0, price - advance);
    const updatedId = modalEl.querySelector('#edit-article-id').value.trim();

    if (!updatedId) {
      alert('Article Code cannot be empty.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Saving Changes...`;

    const payload = {
      article_id: updatedId,
      title: modalEl.querySelector('#edit-title').value.trim(),
      category: modalEl.querySelector('#edit-category').value,
      price: price,
      advance_amount: advance,
      security_deposit: deposit,
      balance_amount: balance,
      color: modalEl.querySelector('#edit-color').value.trim(),
      size: modalEl.querySelector('#edit-size').value.trim(),
      salesman_name: modalEl.querySelector('#edit-salesman-name').value.trim() || 'Studio Desk',
      customer_name: modalEl.querySelector('#edit-cust-name').value.trim(),
      customer_phone: modalEl.querySelector('#edit-cust-phone').value.trim(),
      customer_address: modalEl.querySelector('#edit-cust-addr').value.trim(),
      pickup_date: modalEl.querySelector('#edit-pickup-date').value || null,
      return_date: modalEl.querySelector('#edit-return-date').value || null,
      booking_date: modalEl.querySelector('#edit-booking-date').value || null,
      notes: modalEl.querySelector('#edit-notes').value.trim(),
    };

    try {
      // 1. Update metadata fields
      let res = await api.updateArticle(article.id, payload);
      let updatedArticle = res.article || { ...article, ...payload };

      // 2. If replacement photo was selected, upload it
      if (newPhotoBlob) {
        saveBtn.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Uploading Photo...`;
        const photoRes = await api.uploadArticlePhoto(article.id, newPhotoBlob);
        if (photoRes?.article) {
          updatedArticle = photoRes.article;
        }
      }

      showToast(`Article ${updatedArticle.article_id} updated successfully!`, 'success');
      cleanup();
      closeModal();

      if (onUpdate) {
        onUpdate(updatedArticle);
      }
    } catch (err) {
      alert('Failed to update article: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${renderIcon('check', { size: 16 })} Save Changes`;
    }
  });

  openModal(modalEl, cleanup);
}
