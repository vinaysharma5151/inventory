/**
 * shopNameModal.js — Studio Name & Boutique Branding Modal
 * 
 * WHY:
 * The software is sold to different bridal studios and boutiques.
 * This modal allows owners to change the atelier name (e.g. 'Mehak Bridal Studio'),
 * which automatically updates printed tags, mobile screens, and desktop headers.
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

/**
 * Opens the shop name editing modal.
 * @param {string} currentName - Current studio name
 * @param {function} onSave - Callback receiving the updated name
 */
export function openShopNameModal(currentName = '', onSave) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 440px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: var(--gold);">${renderIcon('store', { size: 20 })}</span>
          <span>Boutique Branding</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Form Body -->
      <form id="shop-name-form" class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
        <p style="font-size: 0.84rem; color: var(--text-muted); margin: 0;">
          This name appears on the desktop dashboard, mobile booking views, and printed garment hanger tags.
        </p>

        <div>
          <label class="input-label" for="shop-name-input">Studio / Boutique Name</label>
          <input
            type="text"
            id="shop-name-input"
            class="input-field"
            value="${escapeHtml(currentName || 'Mehak Bridal Studio')}"
            placeholder="e.g. Mehak Bridal Studio"
            required
          />
        </div>

        <div class="modal-footer" style="margin: 10px -20px -20px; padding: 12px 20px;">
          <button type="button" class="btn btn-outline cancel-btn">Cancel</button>
          <button type="submit" id="save-shop-btn" class="btn btn-gold">
            ${renderIcon('check', { size: 15 })} Save Studio Name
          </button>
        </div>
      </form>
    </div>
  `;

  const closeBtn = modalEl.querySelector('.close-btn');
  const cancelBtn = modalEl.querySelector('.cancel-btn');
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  const form = modalEl.querySelector('#shop-name-form');
  const nameInput = modalEl.querySelector('#shop-name-input');
  const saveBtn = modalEl.querySelector('#save-shop-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = nameInput.value.trim();
    if (!newName) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = `${renderIcon('loader', { size: 15, className: 'spinner-icon' })} Saving...`;

    try {
      localStorage.setItem('bhavi_shop_name', newName);
      await api.updateSettings({ shop_name: newName });
      showToast(`Studio name set to "${newName}"`, 'success');
      closeModal();
      if (onSave) onSave(newName);
    } catch (err) {
      alert('Error updating shop name: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.innerHTML = `Save Studio Name`;
    }
  });

  openModal(modalEl);
}
