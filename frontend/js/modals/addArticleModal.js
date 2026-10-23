/**
 * addArticleModal.js — Desktop Manual Add Garment Modal
 * 
 * WHY:
 * While most photos come from studio phones via camera capture, boutique managers
 * frequently need to register pieces directly from desktop laptops with local image files.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { compressToMediumResolution } from '../imageUtils.js';
import { showToast } from '../toast.js';
import { openWhatsAppBillModal } from './whatsappModal.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens the Add Garment modal for desktop.
 * @param {function} [onCreated] - Callback receiving the newly created article object
 * @param {string} [shopName] - Store brand title
 */
export function openAddArticleModal(onCreated, shopName = 'Mehak Bridal Studio') {
  let photoBlob = null;
  let photoUrl = null;

  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 640px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span>Add New Bridal Garment</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Form Body -->
      <form id="add-article-form" class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Photo Upload Box -->
        <div>
          <label class="input-label">Garment Photo *</label>
          <div id="add-photo-dropzone" style="border: 2px dashed var(--border-light); border-radius: var(--radius-md); padding: 16px; text-align: center; cursor: pointer; background: var(--bg-main); transition: all 0.2s;">
            <div id="photo-placeholder-view">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--gold-bg); border: 1px solid var(--gold-border); display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; color: var(--gold-dark);">
                ${renderIcon('upload', { size: 22 })}
              </div>
              <p style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">Click to select or drop garment photo</p>
              <p style="font-size: 0.76rem; color: var(--text-muted);">Compressed automatically to high-speed medium JPEG</p>
            </div>
            <div id="photo-preview-view" style="display: none; position: relative;">
              <img id="photo-preview-img" src="" alt="Preview" style="max-height: 200px; border-radius: var(--radius-sm); object-fit: contain; margin: 0 auto; display: block;" />
              <button type="button" id="photo-retake-btn" class="btn btn-sm btn-outline" style="margin-top: 10px;">
                Change Photo
              </button>
            </div>
            <input type="file" id="add-photo-file-input" accept="image/*" style="display: none;" />
          </div>
        </div>

        <!-- ID & Category -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="add-article-id">Article Code (0001 - 1000) *</label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="add-article-id" class="input-field font-mono" placeholder="0001" required />
              <button type="button" id="btn-refresh-id" class="btn btn-outline" title="Get Next Sequential ID" style="padding: 0 10px;">
                ${renderIcon('rotateCw', { size: 16 })}
              </button>
            </div>
          </div>
          <div>
            <label class="input-label" for="add-category">Collection Category</label>
            <select id="add-category" class="input-field">
              <option value="Bridal">Bridal</option>
              <option value="Reception">Reception</option>
              <option value="Sherwani">Sherwani</option>
              <option value="Casual">Casual</option>
            </select>
          </div>
        </div>

        <!-- Title -->
        <div>
          <label class="input-label" for="add-title">Garment Title / Description *</label>
          <input type="text" id="add-title" class="input-field" value="Bridal" placeholder="e.g. Bridal" required />
        </div>

        <!-- Price & Advance -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="add-price">Garment Rental Price (₹) *</label>
            <div class="currency-input-container">
              <span class="currency-symbol-prefix">₹</span>
              <input type="number" id="add-price" min="0" step="100" class="input-field" placeholder="e.g. 45000" required />
            </div>
          </div>
          <div>
            <label class="input-label" for="add-advance">Advance Paid (₹)</label>
            <div class="currency-input-container">
              <span class="currency-symbol-prefix">₹</span>
              <input type="number" id="add-advance" min="0" step="100" class="input-field" placeholder="0" />
            </div>
          </div>
        </div>

        <!-- Matching Jewellery Add-on Section -->
        <div class="jewellery-addon-box" id="add-jewel-box">
          <div class="jewellery-toggle-header" id="add-jewel-toggle-header">
            <div class="jewellery-header-title">
              <span class="jewellery-icon-badge">💍</span>
              <div>
                <div class="jewellery-title-text">Matching Jewellery Set</div>
                <div class="jewellery-sub-text">Add paired jewellery with this outfit</div>
              </div>
            </div>
            <label class="switch-control">
              <input type="checkbox" id="add-toggle-jewel" />
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="jewellery-body-content" id="add-jewel-body" style="display: none;">
            <label class="input-label" style="font-size: 0.74rem;">Select Jewellery Set Type</label>
            <div class="jewel-chips-grid" id="add-jewel-chips">
              <button type="button" class="jewel-select-chip active" data-val="Full Bridal Set">Full Bridal Set</button>
              <button type="button" class="jewel-select-chip" data-val="Choker & Necklace">Choker &amp; Necklace</button>
              <button type="button" class="jewel-select-chip" data-val="Matha Patti & Nath">Matha Patti &amp; Nath</button>
              <button type="button" class="jewel-select-chip" data-val="Earrings & Tikka">Earrings &amp; Tikka</button>
              <button type="button" class="jewel-select-chip" data-val="Other / Custom">Other / Custom</button>
            </div>
            <div>
              <input type="text" id="add-jewel-desc" class="input-field" placeholder="Jewellery description / set code..." value="Full Bridal Set" style="font-size: 0.85rem;" />
            </div>
            <div>
              <label class="input-label" for="add-jewel-price" style="font-size: 0.74rem;">Jewellery Rental Extra Price (₹) *</label>
              <div class="currency-input-container">
                <span class="currency-symbol-prefix">₹</span>
                <input type="number" id="add-jewel-price" min="0" step="100" class="input-field" placeholder="e.g. 3000" value="0" />
              </div>
              <div style="font-size: 0.72rem; color: #8C6A2A; margin-top: 3px;" id="add-jewel-calc-hint">
                💡 Automatically added to total rental price.
              </div>
            </div>
          </div>
        </div>

        <!-- Customer Name & Phone -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="add-customer-name">Customer Name</label>
            <input type="text" id="add-customer-name" class="input-field" placeholder="e.g. Simran Kaur" />
          </div>
          <div>
            <label class="input-label" for="add-customer-phone">Customer Phone</label>
            <input type="tel" id="add-customer-phone" class="input-field font-mono" placeholder="e.g. 9876543210" />
          </div>
        </div>

        <!-- Pickup & Return Dates -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="add-pickup-date">Pickup / Delivery Date</label>
            <input type="date" id="add-pickup-date" class="input-field" />
          </div>
          <div>
            <label class="input-label" for="add-return-date">Return Back Date</label>
            <input type="date" id="add-return-date" class="input-field" />
          </div>
        </div>

        <!-- Customer Address / Notes -->
        <div>
          <label class="input-label" for="add-notes">Customer Address / Alteration Notes</label>
          <textarea id="add-notes" rows="2" class="input-field" placeholder="Address, blouse sizing notes, or fitting notes..."></textarea>
        </div>

        <!-- Footer -->
        <div class="modal-footer" style="margin: 8px -20px -20px; padding: 12px 20px;">
          <button type="button" class="btn btn-outline cancel-btn">Cancel</button>
          <button type="submit" id="submit-article-btn" class="btn btn-gold">
            ${renderIcon('plus', { size: 16 })} Add to Studio Inventory
          </button>
        </div>
      </form>
    </div>
  `;

  const closeBtn = modalEl.querySelector('.close-btn');
  const cancelBtn = modalEl.querySelector('.cancel-btn');
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Next ID generation
  const idInput = modalEl.querySelector('#add-article-id');
  const refreshIdBtn = modalEl.querySelector('#btn-refresh-id');

  const fetchNext = async () => {
    try {
      const res = await api.getNextArticleId();
      if (res.success && res.next_id) {
        idInput.value = res.next_id;
      }
    } catch (_) {
      idInput.value = '0001';
    }
  };
  fetchNext();
  refreshIdBtn.addEventListener('click', fetchNext);

  // Sync title field with Collection Category
  const categorySelect = modalEl.querySelector('#add-category');
  const titleInput = modalEl.querySelector('#add-title');
  const standardCategories = ['Bridal', 'Reception', 'Sherwani', 'Casual'];
  categorySelect.addEventListener('change', () => {
    const cur = titleInput.value.trim();
    if (!cur || standardCategories.includes(cur)) {
      titleInput.value = categorySelect.value;
    }
  });

  // Jewellery Add-on Toggle and Presets
  const jewelBox = modalEl.querySelector('#add-jewel-box');
  const jewelToggle = modalEl.querySelector('#add-toggle-jewel');
  const jewelBody = modalEl.querySelector('#add-jewel-body');
  const jewelChips = modalEl.querySelectorAll('#add-jewel-chips .jewel-select-chip');
  const jewelDescInput = modalEl.querySelector('#add-jewel-desc');
  const jewelPriceInput = modalEl.querySelector('#add-jewel-price');
  const jewelHeader = modalEl.querySelector('#add-jewel-toggle-header');

  const updateJewelState = () => {
    if (jewelToggle.checked) {
      jewelBox.classList.add('active');
      jewelBody.style.display = 'flex';
      if (!jewelPriceInput.value || parseFloat(jewelPriceInput.value) === 0) {
        jewelPriceInput.focus();
      }
    } else {
      jewelBox.classList.remove('active');
      jewelBody.style.display = 'none';
    }
  };

  jewelToggle.addEventListener('change', updateJewelState);
  jewelHeader.addEventListener('click', (e) => {
    if (e.target !== jewelToggle && !e.target.closest('.switch-control')) {
      jewelToggle.checked = !jewelToggle.checked;
      updateJewelState();
    }
  });

  jewelChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      jewelChips.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.val;
      if (val === 'Other / Custom') {
        jewelDescInput.value = '';
        jewelDescInput.placeholder = 'Enter jewellery details (e.g. Kundan Set #12)...';
        jewelDescInput.focus();
      } else {
        jewelDescInput.value = val;
      }
    });
  });

  // Photo dropzone handling
  const dropzone = modalEl.querySelector('#add-photo-dropzone');
  const fileInput = modalEl.querySelector('#add-photo-file-input');
  const placeholderView = modalEl.querySelector('#photo-placeholder-view');
  const previewView = modalEl.querySelector('#photo-preview-view');
  const previewImg = modalEl.querySelector('#photo-preview-img');
  const retakeBtn = modalEl.querySelector('#photo-retake-btn');

  dropzone.addEventListener('click', (e) => {
    if (e.target !== retakeBtn) fileInput.click();
  });
  retakeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const compressed = await compressToMediumResolution(file, 1200, 0.80);
    photoBlob = compressed;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(compressed);

    previewImg.src = photoUrl;
    placeholderView.style.display = 'none';
    previewView.style.display = 'block';
  });

  // Submit Handler
  const form = modalEl.querySelector('#add-article-form');
  const submitBtn = modalEl.querySelector('#submit-article-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!photoBlob) {
      alert('Please select a garment photo');
      return;
    }

    const garmentPrice = parseFloat(modalEl.querySelector('#add-price').value) || 0;
    const hasJewel = jewelToggle.checked ? 1 : 0;
    const jewelPrice = hasJewel ? (parseFloat(jewelPriceInput.value) || 0) : 0;
    const jewelDetails = hasJewel ? (jewelDescInput.value.trim() || 'Full Bridal Set') : '';
    const totalPrice = garmentPrice + jewelPrice;

    const advance = parseFloat(modalEl.querySelector('#add-advance').value) || 0;
    const balance = Math.max(0, totalPrice - advance);
    const finalId = idInput.value.trim().toUpperCase() || '0001';

    submitBtn.disabled = true;
    submitBtn.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Saving...`;

    const formData = new FormData();
    formData.append('photo', photoBlob, `${finalId}.jpg`);
    formData.append('article_id', finalId);
    const categoryVal = modalEl.querySelector('#add-category').value;
    const titleVal = modalEl.querySelector('#add-title').value.trim() || categoryVal;
    formData.append('title', titleVal);
    formData.append('category', categoryVal);
    formData.append('price', totalPrice);
    formData.append('advance_amount', advance);
    formData.append('balance_amount', balance);
    formData.append('has_jewellery', hasJewel);
    formData.append('jewellery_details', jewelDetails);
    formData.append('jewellery_price', jewelPrice);
    formData.append('customer_name', modalEl.querySelector('#add-customer-name').value.trim());
    formData.append('customer_phone', modalEl.querySelector('#add-customer-phone').value.trim());
    formData.append('pickup_date', modalEl.querySelector('#add-pickup-date').value);
    formData.append('return_date', modalEl.querySelector('#add-return-date').value);
    formData.append('notes', modalEl.querySelector('#add-notes').value.trim());
    formData.append('source', 'desktop');
    formData.append('salesman_name', 'Studio Desk');

    try {
      const res = await api.uploadArticle(formData);
      if (res.success) {
        showToast(`Article ${finalId} added!`, 'success');
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        closeModal();
        if (onCreated) onCreated(res.article);

        // Instant post-booking WhatsApp e-bill dispatch prompt
        const custPhone = (res.article?.customer_phone || '').trim();
        if (custPhone) {
          openWhatsAppBillModal(res.article, shopName);
        }
      } else {
        alert(res.message || 'Failed to add article');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Add to Studio Inventory`;
      }
    } catch (err) {
      alert('Error saving article: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Add to Studio Inventory`;
    }
  });

  openModal(modalEl, () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  });
}
