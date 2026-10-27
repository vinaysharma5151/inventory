/**
 * updateModal.js — GitHub Releases Software Update Dialog (Vanilla ES Module)
 * 
 * WHY:
 * Allows studio owners to check GitHub for updates, review release notes,
 * and trigger 1-click automatic background download and restart without technical knowledge.
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

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Opens the software update modal.
 * @param {object} [initialData] - Optional pre-fetched update check response
 */
export async function openUpdateModal(initialData = null) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 520px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: var(--gold);">${renderIcon('refreshCw', { size: 20 })}</span>
          <span>Software Updates</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn" title="Close">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
        <div id="update-status-container" style="display: flex; flex-direction: column; gap: 12px;">
          <!-- Content dynamically rendered here -->
          <div style="text-align: center; padding: 24px; color: var(--text-muted);">
            <div style="display: inline-block; animation: spin 1s linear infinite; margin-bottom: 8px;">
              ${renderIcon('refreshCw', { size: 24 })}
            </div>
            <p>Checking GitHub for latest release...</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <a href="https://github.com/vinaysharma5151/inventory/releases" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-muted);">
          ${renderIcon('github', { size: 14 })} View on GitHub ${renderIcon('externalLink', { size: 12 })}
        </a>
        <div style="display: flex; gap: 8px;">
          <button type="button" id="btn-recheck-update" class="btn btn-outline btn-sm">
            ${renderIcon('rotateCcw', { size: 13 })} Check Again
          </button>
          <button type="button" class="btn btn-ghost btn-sm close-modal-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  // Bind close buttons
  modalEl.querySelector('.close-btn').addEventListener('click', closeModal);
  modalEl.querySelector('.close-modal-btn').addEventListener('click', closeModal);

  openModal(modalEl);

  const container = modalEl.querySelector('#update-status-container');
  const btnRecheck = modalEl.querySelector('#btn-recheck-update');

  async function performCheck() {
    container.innerHTML = `
      <div style="text-align: center; padding: 28px 12px; color: var(--text-muted);">
        <div style="display: inline-block; animation: spin 1s linear infinite; margin-bottom: 8px; color: var(--gold);">
          ${renderIcon('refreshCw', { size: 26 })}
        </div>
        <p style="font-size: 0.9rem;">Connecting to GitHub Releases...</p>
      </div>
    `;

    try {
      const data = await api.checkForUpdates();
      renderUpdateResult(data);
    } catch (err) {
      renderError(err.message || 'Failed to check GitHub for updates');
    }
  }

  function renderError(message) {
    container.innerHTML = `
      <div style="background: rgba(220, 53, 69, 0.08); border: 1px solid rgba(220, 53, 69, 0.25); border-radius: 8px; padding: 14px; display: flex; gap: 12px; align-items: flex-start;">
        <span style="color: #e63946; flex-shrink: 0; margin-top: 2px;">${renderIcon('alertCircle', { size: 20 })}</span>
        <div>
          <strong style="color: #e63946; display: block; font-size: 0.9rem; margin-bottom: 4px;">Update Check Failed</strong>
          <p style="font-size: 0.85rem; color: var(--text-main); margin: 0;">${escapeHtml(message)}</p>
        </div>
      </div>
    `;
  }

  function renderUpdateResult(data) {
    const currentVer = data.current_version || '2.2.1';
    const latestVer = data.latest_version || currentVer;
    const isNewer = data.update_available && data.download_url;

    if (isNewer) {
      container.innerHTML = `
        <div style="background: rgba(40, 167, 69, 0.08); border: 1px solid rgba(40, 167, 69, 0.25); border-radius: 8px; padding: 14px; display: flex; gap: 12px; align-items: flex-start;">
          <span style="color: #28a745; flex-shrink: 0; margin-top: 2px;">${renderIcon('sparkles', { size: 22 })}</span>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: #28a745; font-size: 0.95rem;">New Update Available: ${escapeHtml(latestVer)}</strong>
              <span style="font-size: 0.78rem; background: rgba(40, 167, 69, 0.15); color: #28a745; padding: 2px 8px; border-radius: 12px; font-weight: 600;">
                Current: v${escapeHtml(currentVer)}
              </span>
            </div>
            <p style="font-size: 0.84rem; color: var(--text-muted); margin: 0;">
              Package: <strong>${escapeHtml(data.asset_name || 'LehengaBooking.exe')}</strong> ${formatBytes(data.asset_size) ? `(${formatBytes(data.asset_size)})` : ''}
            </p>
          </div>
        </div>

        ${data.release_notes ? `
          <div>
            <label style="font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 6px;">
              What's New in this Release:
            </label>
            <div style="background: var(--bg-surface, #1e1e1e); border: 1px solid var(--border-color, #333); border-radius: 8px; padding: 12px 14px; font-size: 0.85rem; max-height: 140px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5; color: var(--text-main);">
${escapeHtml(data.release_notes)}
            </div>
          </div>
        ` : ''}

        <div style="background: rgba(184, 134, 11, 0.06); border: 1px solid rgba(184, 134, 11, 0.2); border-radius: 8px; padding: 10px 14px; font-size: 0.82rem; color: var(--text-muted);">
          ℹ️ Your studio data, garments, and photos will remain 100% intact. The app will download the update and restart automatically.
        </div>

        <button type="button" id="btn-apply-update" class="btn btn-gold" style="width: 100%; justify-content: center; padding: 11px; font-size: 0.92rem; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
          ${renderIcon('download', { size: 16 })} Download &amp; Restart Now
        </button>
      `;

      const btnApply = container.querySelector('#btn-apply-update');
      btnApply.addEventListener('click', async () => {
        btnApply.disabled = true;
        btnRecheck.disabled = true;
        btnApply.innerHTML = `
          <span style="display: inline-block; animation: spin 1s linear infinite;">${renderIcon('refreshCw', { size: 16 })}</span>
          Downloading update from GitHub (please wait)...
        `;

        try {
          const res = await api.applyUpdate(data.download_url);
          container.innerHTML = `
            <div style="text-align: center; padding: 24px 12px;">
              <span style="color: #28a745; display: inline-block; margin-bottom: 12px;">${renderIcon('checkCircle', { size: 40 })}</span>
              <h3 style="font-size: 1.1rem; margin-bottom: 8px; color: var(--text-main);">Update Downloaded!</h3>
              <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">${escapeHtml(res.message || 'The application is now restarting with the new version.')}</p>
              <div style="margin-top: 14px; font-size: 0.8rem; color: var(--gold);">
                Reconnecting to studio in 5 seconds...
              </div>
            </div>
          `;
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        } catch (err) {
          btnApply.disabled = false;
          btnRecheck.disabled = false;
          btnApply.innerHTML = `${renderIcon('download', { size: 16 })} Download &amp; Restart Now`;
          showToast(`Update failed: ${err.message}`, 'error');
        }
      });
    } else {
      // Up to date or no release
      container.innerHTML = `
        <div style="text-align: center; padding: 24px 12px;">
          <span style="color: var(--gold); display: inline-block; margin-bottom: 12px;">${renderIcon('checkCircle', { size: 36 })}</span>
          <h3 style="font-size: 1.05rem; margin-bottom: 6px; color: var(--text-main);">You're Up to Date!</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 12px;">
            Version <strong>v${escapeHtml(currentVer)}</strong> is currently the latest version.
          </p>
          <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; background: rgba(255, 255, 255, 0.05); padding: 4px 12px; border-radius: 20px; color: var(--text-muted); border: 1px solid var(--border-color, #333);">
            ${escapeHtml(data.message || 'Connected to GitHub Releases')}
          </div>
        </div>
      `;
    }
  }

  btnRecheck.addEventListener('click', performCheck);

  if (initialData) {
    renderUpdateResult(initialData);
  } else {
    performCheck();
  }
}
