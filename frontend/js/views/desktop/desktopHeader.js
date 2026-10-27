/**
 * desktopHeader.js — Header bar and navigation controls for Desktop Dashboard.
 * 
 * WHY:
 * Encapsulates the branding bar, live SSE pulse indicator, user role badge,
 * and top-level action buttons (QR pairing, staff accounts, WhatsApp, updates, garment creation).
 */

import { api } from '../../api.js?v=7';
import { renderIcon } from '../../icons.js';
import { showToast } from '../../toast.js';
import { openAddArticleModal } from '../../modals/addArticleModal.js';
import { openQrPairingModal } from '../../modals/qrPairingModal.js';
import { openShopNameModal } from '../../modals/shopNameModal.js';
import { openPrinterModal } from '../../modals/printerModal.js';
import { openUpdateModal } from '../../modals/updateModal.js';
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
export function renderHeaderHTML(shopName, currentUser, logoUrl = null) {
  const activeLogo = logoUrl || localStorage.getItem('app_logo_url') || '/assets/logo.png';
  return `
    <header class="dashboard-header">
      <div class="header-inner">
        <div class="brand-badge-group">
          <div class="brand-logo-icon" title="${escapeHtml(shopName)}">
            <img src="${activeLogo}" alt="${escapeHtml(shopName)}" class="brand-logo-img" onerror="this.src='/assets/logo.png'" />
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h1 class="brand-main-title font-serif" id="brand-shop-name">${escapeHtml(shopName)}</h1>
              <button type="button" id="btn-edit-shop" title="Change shop name" style="background: none; border: none; cursor: pointer; padding: 2px; color: var(--text-muted); display: inline-flex; align-items: center;">
                ${renderIcon('edit', { size: 14 })}
              </button>
            </div>
            <p class="brand-sub">
              <span>LUXURY BRIDAL ATELIER &amp; STUDIO INVENTORY</span>
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

          <button type="button" id="btn-printer-setup" class="btn btn-outline btn-sm" title="Configure PIXEL DP82 thermal printer & test cut">
            ${renderIcon('printer', { size: 15 })} Printer
          </button>

          <button type="button" id="btn-wa-header-setup" class="btn btn-outline btn-sm" title="Configure Meta WhatsApp Business Cloud API & automated dispatch">
            ${renderIcon('messageCircle', { size: 15 })} WhatsApp
          </button>

          <button type="button" id="btn-backup" class="btn btn-outline btn-sm" title="Backup all inventory records to CSV file in app folder">
            ${renderIcon('database', { size: 15 })} Backup
          </button>

          <button type="button" id="btn-updates" class="btn btn-outline btn-sm" title="Check for software updates from GitHub" style="position: relative;">
            ${renderIcon('refreshCw', { size: 14 })} Updates
            <span id="update-badge-dot" style="display: none; position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background: #28a745; box-shadow: 0 0 4px #28a745;"></span>
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
  const btnPrinter = containerEl.querySelector('#btn-printer-setup');
  const btnWaSetup = containerEl.querySelector('#btn-wa-header-setup');
  const btnBackup = containerEl.querySelector('#btn-backup') || containerEl.querySelector('#btn-export-csv');
  const btnUpdates = containerEl.querySelector('#btn-updates');
  const btnAdd = containerEl.querySelector('#btn-add-garment');
  const btnLogout = containerEl.querySelector('#btn-logout');

  if (btnPrinter) btnPrinter.addEventListener('click', openPrinterModal);
  if (btnWaSetup) btnWaSetup.addEventListener('click', () => openWhatsAppSettingsModal());

  if (btnUpdates) {
    let latestUpdateInfo = null;

    btnUpdates.addEventListener('click', () => {
      openUpdateModal(latestUpdateInfo);
    });

    // Quiet background check after 3 seconds of startup to avoid delaying dashboard rendering
    setTimeout(async () => {
      try {
        const check = await api.checkForUpdates();
        if (check && check.update_available) {
          latestUpdateInfo = check;
          const dot = containerEl.querySelector('#update-badge-dot');
          if (dot) dot.style.display = 'block';
        }
      } catch (_) {
        // Silently ignore background network errors
      }
    }, 3000);
  }

  if (btnEditShop) {
    btnEditShop.addEventListener('click', () => {
      const brandTitle = containerEl.querySelector('#brand-shop-name');
      const currentName = brandTitle ? brandTitle.textContent : '';
      openShopNameModal(currentName, (newName) => {
        if (brandTitle) brandTitle.textContent = newName;
        if (onShopNameChange) onShopNameChange(newName);
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
