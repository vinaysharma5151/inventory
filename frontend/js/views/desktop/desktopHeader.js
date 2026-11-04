/**
 * desktopHeader.js — Header bar and navigation controls for Desktop Dashboard.
 * 
 * WHY:
 * Encapsulates the branding bar, live SSE pulse indicator, user role badge,
 * and top-level action buttons (QR pairing, WhatsApp, backups, garment creation).
 */

import { api } from '../../api.js?v=12';
import { renderIcon } from '../../icons.js';
import { showToast } from '../../toast.js';
import { openAddArticleModal } from '../../modals/addArticleModal.js';
import { openQrPairingModal } from '../../modals/qrPairingModal.js';
import { openShopNameModal } from '../../modals/shopNameModal.js';
import { openWhatsAppSettingsModal } from '../../modals/whatsappSettingsModal.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Returns header HTML string.
 * @param {string} shopName
 * @param {object|null} currentUser
 * @returns {string}
 */
export function renderHeaderHTML(shopName, currentUser, logoUrl = null, shopTagline = '') {
  const activeLogo = logoUrl || localStorage.getItem('app_logo_url') || '/assets/logo.png';
  const activeTagline = shopTagline || localStorage.getItem('app_shop_tagline') || 'LUXURY BRIDAL ATELIER & STUDIO INVENTORY';
  return `
    <header class="dashboard-header">
      <div class="header-inner">
        <div class="brand-badge-group">
          <div class="brand-logo-icon" title="${escapeHtml(shopName)}">
            <img src="${activeLogo}" alt="${escapeHtml(shopName)}" class="brand-logo-img" id="brand-header-logo" onerror="this.src='/assets/logo.png'" />
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h1 class="brand-main-title font-serif" id="brand-shop-name">${escapeHtml(shopName)}</h1>
              <button type="button" id="btn-edit-shop" title="Change shop name, logo and tagline" style="background: none; border: none; cursor: pointer; padding: 2px; color: var(--text-muted); display: inline-flex; align-items: center;">
                ${renderIcon('edit', { size: 14 })}
              </button>
            </div>
            <p class="brand-sub">
              <span id="brand-shop-tagline">${escapeHtml(activeTagline)}</span>
            </p>
          </div>
        </div>

        <div class="header-actions-row">
          <div class="live-sync-indicator" title="Connected to server real-time event bus">
            <span class="live-pulse-dot"></span>
            <span>Studio Live Sync</span>
          </div>

          <button type="button" id="btn-qr-modal" class="btn btn-outline btn-sm">
            ${renderIcon('qrcode', { size: 15 })} Phone Camera QR
          </button>

          <button type="button" id="btn-send-reminders-header" class="btn btn-outline btn-sm" title="Scan & send due pickup and return reminders for tomorrow via WhatsApp">
            ${renderIcon('bell', { size: 15 })} Send Reminders
          </button>

          <button type="button" id="btn-wa-header-setup" class="btn btn-outline btn-sm" title="Configure OpenWA Gateway & automated WhatsApp messaging">
            ${renderIcon('messageCircle', { size: 15 })} WhatsApp
          </button>

          <button type="button" id="btn-backup" class="btn btn-outline btn-sm" title="Backup all inventory records to CSV file in app folder">
            ${renderIcon('database', { size: 15 })} Backup
          </button>

          <button type="button" id="btn-add-garment" class="btn btn-gold btn-sm">
            ${renderIcon('plus', { size: 15 })} Add Garment
          </button>
        </div>
      </div>
    </header>
  `;
}

/**
 * Attaches event listeners for header action buttons.
 * @param {HTMLElement} containerEl
 * @param {object} callbacks - { onShopNameChange, onUserChange, onArticleAdded }
 */
export function bindHeaderEvents(containerEl, callbacks) {
  const { onShopNameChange, onUserChange, onArticleAdded } = callbacks;

  const btnEditShop = containerEl.querySelector('#btn-edit-shop');
  const btnQr = containerEl.querySelector('#btn-qr-modal');
  const btnWaSetup = containerEl.querySelector('#btn-wa-header-setup');
  const btnReminders = containerEl.querySelector('#btn-send-reminders-header');
  const btnBackup = containerEl.querySelector('#btn-backup') || containerEl.querySelector('#btn-export-csv');
  const btnAdd = containerEl.querySelector('#btn-add-garment');
  const btnLogout = containerEl.querySelector('#btn-logout');

  if (btnWaSetup) btnWaSetup.addEventListener('click', () => openWhatsAppSettingsModal());

  if (btnReminders) {
    btnReminders.addEventListener('click', async () => {
      const originalHtml = btnReminders.innerHTML;
      btnReminders.disabled = true;
      btnReminders.innerHTML = `${renderIcon('refreshCw', { size: 14, className: 'spin' })} Checking...`;
      try {
        const res = await api.checkAllReminders();
        if (res && res.success) {
          const sent = res.total_sent || 0;
          const due = res.total_due || 0;
          const failed = res.total_failed || 0;

          if (sent > 0) {
            showToast(`✓ Sent ${sent} reminder(s) (${res.pickup_sent || 0} pickup, ${res.return_sent || 0} return)!`, 'success', 5000);
          } else if (due === 0) {
            showToast('No bookings due for pickup or return tomorrow.', 'info', 4000);
          } else if (failed > 0) {
            showToast(`⚠️ ${failed} reminder(s) could not be sent. Please check WhatsApp connection.`, 'warning', 5000);
          } else {
            showToast('All due reminders for tomorrow have already been sent.', 'info', 4000);
          }
        } else {
          showToast(res?.message || res?.error || 'Failed to check reminders.', 'warning');
        }
      } catch (err) {
        showToast('Error checking reminders: ' + (err.message || 'Network error'), 'warning');
      } finally {
        btnReminders.disabled = false;
        btnReminders.innerHTML = originalHtml;
      }
    });
  }

  if (btnEditShop) {
    btnEditShop.addEventListener('click', () => {
      const brandTitle = containerEl.querySelector('#brand-shop-name');
      const brandTagline = containerEl.querySelector('#brand-shop-tagline');
      const brandLogo = containerEl.querySelector('#brand-header-logo');

      const currentName = brandTitle ? brandTitle.textContent.trim() : '';
      const currentTagline = brandTagline ? brandTagline.textContent.trim() : '';
      const currentLogo = brandLogo ? brandLogo.src : '';

      openShopNameModal({
        currentName,
        currentTagline,
        currentLogoUrl: currentLogo,
        onSave: (branding) => {
          const newName = typeof branding === 'object' ? branding.shopName : branding;
          const newTagline = typeof branding === 'object' ? branding.shopTagline : '';
          const newLogo = typeof branding === 'object' ? branding.logoUrl : '';

          if (brandTitle && newName) brandTitle.textContent = newName;
          if (brandTagline && newTagline) brandTagline.textContent = newTagline;
          if (brandLogo && newLogo) brandLogo.src = newLogo;

          if (callbacks.onBrandingChange) {
            callbacks.onBrandingChange({ shopName: newName, shopTagline: newTagline, logoUrl: newLogo });
          } else if (callbacks.onShopNameChange) {
            callbacks.onShopNameChange(newName);
          }
        }
      });
    });
  }

  if (btnQr) btnQr.addEventListener('click', openQrPairingModal);

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const brandTitle = containerEl.querySelector('#brand-shop-name');
      const currentName = brandTitle ? brandTitle.textContent.trim() : 'Bridal Studio';
      openAddArticleModal((newArt) => {
        if (onArticleAdded) onArticleAdded(newArt);
      }, currentName);
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await api.logout();
      showToast('Signed out successfully.', 'info');
      if (onUserChange) onUserChange(null);
    });
  }

  if (btnBackup) {
    btnBackup.addEventListener('click', async () => {
      const originalHtml = btnBackup.innerHTML;
      try {
        btnBackup.disabled = true;
        btnBackup.innerHTML = `${renderIcon('loader', { size: 15, className: 'spin' })} Backing up...`;

        const res = await api.backupNow();
        showToast(res.message || 'Backup saved successfully in backups folder', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to update backup', 'error');
      } finally {
        btnBackup.disabled = false;
        btnBackup.innerHTML = originalHtml;
      }
    });
  }
}
