/**
 * desktopHeader.js — Header bar and navigation controls for Desktop Dashboard.
 * 
 * WHY:
 * Encapsulates the branding bar, live SSE pulse indicator, user role badge,
 * and top-level action buttons (QR pairing, staff accounts, SMS Gateway, updates, garment creation).
 */

import { api } from '../../api.js?v=7';
import { renderIcon } from '../../icons.js';
import { showToast } from '../../toast.js';
import { openAddArticleModal } from '../../modals/addArticleModal.js';
import { openQrPairingModal } from '../../modals/qrPairingModal.js';
import { openShopNameModal } from '../../modals/shopNameModal.js';
import { openUpdateModal } from '../../modals/updateModal.js';
import { openSmsSettingsModal } from '../../modals/smsSettingsModal.js';

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

          <button type="button" id="btn-check-reminders" class="btn btn-outline btn-sm" title="Check & dispatch 1-day pickup and return reminders for today">
            ${renderIcon('bell', { size: 14 })} Check Reminders
          </button>

          <button type="button" id="btn-sms-header-setup" class="btn btn-outline btn-sm" title="Configure Android SMS Gateway (Capcom6) to dispatch SMS via SIM">
            ${renderIcon('messageSquare', { size: 15 })} SMS Gateway
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
  const btnCheckReminders = containerEl.querySelector('#btn-check-reminders');
  const btnSmsSetup = containerEl.querySelector('#btn-sms-header-setup');
  const btnBackup = containerEl.querySelector('#btn-backup') || containerEl.querySelector('#btn-export-csv');
  const btnUpdates = containerEl.querySelector('#btn-updates');
  const btnAdd = containerEl.querySelector('#btn-add-garment');
  const btnLogout = containerEl.querySelector('#btn-logout');

  if (btnCheckReminders) {
    btnCheckReminders.addEventListener('click', async () => {
      btnCheckReminders.disabled = true;
      btnCheckReminders.innerHTML = `${renderIcon('refreshCw', { size: 14, className: 'spinner-icon' })} Checking...`;
      try {
        const res = await api.checkReminders();
        const total = res.total_sent || 0;
        if (total > 0) {
          showToast(`🔔 Dispatched ${total} reminder(s): ${res.pickup_reminders_sent} pickup, ${res.return_reminders_sent} return`, 'success', 6000);
        } else {
          showToast('✅ All reminders are up to date! (0 pending for tomorrow)', 'neutral', 4000);
        }
      } catch (err) {
        showToast('Error checking reminders: ' + (err.message || 'Check gateway'), 'error', 5000);
      } finally {
        btnCheckReminders.disabled = false;
        btnCheckReminders.innerHTML = `${renderIcon('bell', { size: 14 })} Check Reminders`;
      }
    });
  }

  if (btnSmsSetup) btnSmsSetup.addEventListener('click', () => openSmsSettingsModal());

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
