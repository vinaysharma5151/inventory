/**
 * shopNameModal.js — Studio Name, Logo & Tagline Branding Modal
 * 
 * WHY:
 * Allows boutique owners to customize their branding from the top header pencil icon:
 * - Studio / Boutique Name
 * - Header Tagline / Subtitle
 * - Boutique Logo Image
 * Changes update the desktop dashboard and mobile booking views.
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
 * Opens the shop branding modal (Name, Tagline, Logo).
 * @param {string|object} optionsOrName - Current studio name string OR options object
 * @param {function} [maybeOnSave] - Callback receiving the updated branding
 */
export function openShopNameModal(optionsOrName = '', maybeOnSave) {
  let currentName = '';
  let currentTagline = '';
  let currentLogoUrl = '';
  let onSave = null;

  if (typeof optionsOrName === 'object' && optionsOrName !== null) {
    currentName = optionsOrName.currentName || '';
    currentTagline = optionsOrName.currentTagline || '';
    currentLogoUrl = optionsOrName.currentLogoUrl || '';
    onSave = optionsOrName.onSave;
  } else {
    currentName = optionsOrName || '';
    onSave = maybeOnSave;
  }

  const activeName = currentName || localStorage.getItem('app_shop_name') || 'Bridal Studio';
  const activeTagline = currentTagline || localStorage.getItem('app_shop_tagline') || 'LUXURY BRIDAL ATELIER & STUDIO INVENTORY';
  const activeLogo = currentLogoUrl || localStorage.getItem('app_logo_url') || '/assets/logo.png';

  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 480px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: var(--gold);">${renderIcon('store', { size: 20 })}</span>
          <span>Boutique Branding &amp; Header</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Form Body -->
      <form id="branding-form" class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
        <p style="font-size: 0.84rem; color: var(--text-muted); margin: 0;">
          Customise your showroom branding. Changes automatically update the header and mobile booking view.
        </p>

        <!-- 1. Logo Picker -->
        <div style="display: flex; align-items: center; gap: 14px; padding: 12px 14px; background: var(--bg-subtle, #F9FAFB); border: 1px solid var(--border-light, #E5E7EB); border-radius: 10px;">
          <div style="width: 62px; height: 62px; border-radius: 8px; background: #FFFFFF; border: 1px solid var(--border-light, #E5E7EB); display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 4px; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
            <img id="branding-logo-preview" src="${escapeHtml(activeLogo)}" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.src='/assets/logo.png'" />
          </div>
          <div style="flex: 1; min-width: 0;">
            <label class="input-label" style="margin-bottom: 2px;">Boutique Logo</label>
            <p style="font-size: 0.74rem; color: var(--text-muted); margin: 0 0 8px;">PNG, JPG or WebP image</p>
            <div style="display: flex; gap: 8px; align-items: center;">
              <label class="btn btn-outline btn-xs" style="cursor: pointer; display: inline-flex; align-items: center; gap: 5px; margin: 0; padding: 4px 10px;">
                ${renderIcon('upload', { size: 13 })} Upload Logo
                <input type="file" id="branding-logo-input" accept="image/*" style="display: none;" />
              </label>
              <button type="button" id="btn-reset-logo" class="btn btn-ghost btn-xs" style="font-size: 0.74rem; color: var(--text-muted); padding: 4px 8px;">
                Reset
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Studio Name -->
        <div>
          <label class="input-label" for="shop-name-input">Studio / Boutique Name *</label>
          <input
            type="text"
            id="shop-name-input"
            class="input-field"
            value="${escapeHtml(activeName)}"
            placeholder="e.g. Luxury Bridal Atelier"
            required
          />
        </div>

        <!-- 3. Webpage Tagline -->
        <div>
          <label class="input-label" for="shop-tagline-input">Webpage Tagline / Subtitle</label>
          <input
            type="text"
            id="shop-tagline-input"
            class="input-field"
            value="${escapeHtml(activeTagline)}"
            placeholder="e.g. LUXURY BRIDAL ATELIER &amp; STUDIO INVENTORY"
          />
          <span style="font-size: 0.74rem; color: var(--text-muted); display: block; margin-top: 4px;">
            Appears below the boutique name on your main dashboard header.
          </span>
        </div>

        <div class="modal-footer" style="margin: 10px -20px -20px; padding: 12px 20px;">
          <button type="button" class="btn btn-outline cancel-btn">Cancel</button>
          <button type="submit" id="save-branding-btn" class="btn btn-gold">
            ${renderIcon('check', { size: 15 })} Save Branding
          </button>
        </div>
      </form>
    </div>
  `;

  const closeBtn = modalEl.querySelector('.close-btn');
  const cancelBtn = modalEl.querySelector('.cancel-btn');
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  const form = modalEl.querySelector('#branding-form');
  const nameInput = modalEl.querySelector('#shop-name-input');
  const taglineInput = modalEl.querySelector('#shop-tagline-input');
  const fileInput = modalEl.querySelector('#branding-logo-input');
  const logoPreview = modalEl.querySelector('#branding-logo-preview');
  const resetBtn = modalEl.querySelector('#btn-reset-logo');
  const saveBtn = modalEl.querySelector('#save-branding-btn');

  let selectedFile = null;
  let resetToDefault = false;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    selectedFile = file;
    resetToDefault = false;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (logoPreview) logoPreview.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  resetBtn.addEventListener('click', () => {
    selectedFile = null;
    resetToDefault = true;
    fileInput.value = '';
    if (logoPreview) logoPreview.src = '/assets/logo.png';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = nameInput.value.trim();
    const newTagline = taglineInput.value.trim() || 'LUXURY BRIDAL ATELIER & STUDIO INVENTORY';
    if (!newName) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = `${renderIcon('loader', { size: 15, className: 'spinner-icon' })} Saving...`;

    try {
      const formData = new FormData();
      formData.append('shop_name', newName);
      formData.append('shop_tagline', newTagline);
      if (selectedFile) {
        formData.append('logo', selectedFile);
      } else if (resetToDefault) {
        formData.append('logo_base64', ''); // signal reset
      }

      const res = await api.updateBranding(formData);
      const savedName = res?.shop_name || newName;
      const savedTagline = res?.shop_tagline || newTagline;
      const savedLogo = res?.logo_url || (selectedFile ? logoPreview.src : activeLogo);

      localStorage.setItem('app_shop_name', savedName);
      localStorage.setItem('app_shop_tagline', savedTagline);
      localStorage.setItem('app_logo_url', savedLogo);

      showToast(`Branding updated for "${savedName}"`, 'success');
      closeModal();

      if (onSave) {
        onSave({
          shopName: savedName,
          shopTagline: savedTagline,
          logoUrl: savedLogo,
        });
      }
    } catch (err) {
      alert('Error updating branding: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${renderIcon('check', { size: 15 })} Save Branding`;
    }
  });

  openModal(modalEl);
}
