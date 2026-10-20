/**
 * desktopHeader.js — Header bar and navigation controls for Desktop Dashboard.
 * 
 * WHY:
 * Encapsulates the branding bar, live SSE pulse indicator, user role badge,
 * and top-level action buttons (QR pairing, staff accounts, WhatsApp, updates, garment creation).
 */

import { api } from '../../api.js?v=6';
import { renderIcon } from '../../icons.js';
import { showToast } from '../../toast.js';
import { openAddArticleModal } from '../../modals/addArticleModal.js';
import { openSalesStaffModal } from '../../modals/salesStaffModal.js';
import { openQrPairingModal } from '../../modals/qrPairingModal.js';
import { openShopNameModal } from '../../modals/shopNameModal.js';
import { openWhatsAppSettingsModal } from '../../modals/whatsappSettingsModal.js';
import { openUpdateModal } from '../../modals/updateModal.js';

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
export function renderHeaderHTML(shopName, currentUser) {
  return `
    <header class="dashboard-header">
      <div class="header-inner">
        <div class="brand-badge-group">
          <div class="brand-logo-icon" title="${escapeHtml(shopName)}">
            <img src="/assets/logo.png" alt="${escapeHtml(shopName)}" class="brand-logo-img" />
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h1 class="brand-main-title font-serif" id="brand-shop-name">${escapeHtml(shopName)}</h1>
              ${currentUser?.role !== 'staff' ? `
                <button type="button" id="btn-edit-shop" title="Change shop name" style="background: none; border: none; cursor: pointer; padding: 2px; color: var(--text-muted); display: inline-flex; align-items: center;">
                  ${renderIcon('edit', { size: 14 })}
                </button>
              ` : ''}
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

          ${currentUser && currentUser.role === 'staff' ? `
            <div class="user-badge" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; background: var(--color-surface); border: 1px solid var(--color-border); font-size: 13px; font-weight: 600;">
              <span>👤 ${escapeHtml(currentUser.username)}</span>
              <span style="font-size: 10px; text-transform: uppercase; color: var(--color-burgundy); background: var(--color-burgundy-light); padding: 2px 6px; border-radius: 10px; font-weight: 700;">${currentUser.role}</span>
            </div>
            <button type="button" id="btn-logout" class="btn btn-outline btn-sm" title="Sign Out">
              ${renderIcon('logOut', { size: 14 })} Sign Out
            </button>
          ` : ''}

          <button type="button" id="btn-qr-modal" class="btn btn-outline btn-sm">
            ${renderIcon('qrcode', { size: 15 })} Phone Camera QR
          </button>

          ${currentUser?.role !== 'staff' ? `
            <button type="button" id="btn-staff-modal" class="btn btn-outline btn-sm">
              ${renderIcon('users', { size: 15 })} Sales Staff
            </button>

            <button type="button" id="btn-wa-modal" class="btn btn-outline btn-sm">
              ${renderIcon('messageCircle', { size: 15, color: '#25D366' })} WhatsApp API
            </button>

            <button type="button" id="btn-export-csv" class="btn btn-outline btn-sm">
              ${renderIcon('download', { size: 15 })} Export CSV
            </button>

            <button type="button" id="btn-update-modal" class="btn btn-outline btn-sm" title="Software updates and database safety backups">
              ${renderIcon('refresh-cw', { size: 14 })} Updates
              <span id="update-badge" style="display: none; background: #2e7d32; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; margin-left: 4px;">NEW</span>
            </button>
          ` : ''}

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
  const btnStaff = containerEl.querySelector('#btn-staff-modal');
  const btnWa = containerEl.querySelector('#btn-wa-modal');
  const btnCsv = containerEl.querySelector('#btn-export-csv');
  const btnAdd = containerEl.querySelector('#btn-add-garment');
  const btnLogout = containerEl.querySelector('#btn-logout');
  const btnUpdate = containerEl.querySelector('#btn-update-modal');

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
  if (btnStaff) btnStaff.addEventListener('click', openSalesStaffModal);
  if (btnWa) btnWa.addEventListener('click', openWhatsAppSettingsModal);

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      openAddArticleModal((newArt) => {
        if (onArticleAdded) onArticleAdded(newArt);
      });
    });
  }


  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await api.logout();
      showToast('Signed out successfully.', 'info');
      if (onUserChange) onUserChange(null);
    });
  }

  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      window.location.href = '/api/export/csv';
    });
  }

  if (btnUpdate) {
    let cachedUpdateInfo = null;
    btnUpdate.addEventListener('click', () => {
      openUpdateModal(cachedUpdateInfo);
    });

    api.checkUpdate().then((info) => {
      cachedUpdateInfo = info;
      const badge = containerEl.querySelector('#update-badge');
      if (info && info.update_available && badge) {
        badge.style.display = 'inline-block';
        btnUpdate.style.borderColor = 'var(--gold)';
        btnUpdate.title = `Update available: v${info.latest_version}`;
      }
    }).catch(() => {});
  }
}
