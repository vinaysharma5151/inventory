/**
 * updateModal.js — Software Update & Database Backup Modal
 * 
 * WHY:
 * Provides shop owners with a safe, one-click way to verify and apply software updates.
 * Guarantees zero data loss by taking an automatic timestamped database snapshot
 * before downloading and replacing the application binary.
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
 * Opens the software update and backup modal.
 * @param {object} initialUpdateInfo - Optional update check data
 */
export async function openUpdateModal(initialUpdateInfo = null) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  let updateInfo = initialUpdateInfo;

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 480px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: var(--gold);">${renderIcon('refresh-cw', { size: 20 })}</span>
          <span>Software Update & Safety</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
        <div id="update-status-container" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; align-items: center; justify-content: center; padding: 20px 0; color: var(--text-muted); gap: 10px;">
            <span class="spin">${renderIcon('loader', { size: 20 })}</span>
            <span>Checking for latest updates...</span>
          </div>
        </div>

        <!-- Zero Data Loss Guarantee Banner -->
        <div style="background: rgba(46, 125, 50, 0.08); border: 1px solid rgba(46, 125, 50, 0.25); border-radius: 8px; padding: 12px 14px; display: flex; gap: 12px; align-items: flex-start;">
          <div style="color: #2e7d32; flex-shrink: 0; margin-top: 2px;">
            ${renderIcon('shield', { size: 18 })}
          </div>
          <div style="font-size: 0.82rem; color: var(--text-primary); line-height: 1.45;">
            <strong style="color: #2e7d32; display: block; margin-bottom: 2px;">100% Safe Update Guarantee</strong>
            All customer bookings, accounts, and photos are stored separately. An automatic database backup is taken before any update runs.
          </div>
        </div>

        <!-- Manual Backup Button -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-hover, rgba(0,0,0,0.02)); padding: 10px 14px; border-radius: 8px; border: 1px dashed var(--border-color);">
          <div>
            <div style="font-weight: 500; font-size: 0.85rem;">Manual Database Backup</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Save an instant copy of all bookings & accounts</div>
          </div>
          <button type="button" id="manual-backup-btn" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
            ${renderIcon('database', { size: 14 })}
            <span>Backup Now</span>
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <button type="button" id="recheck-btn" class="btn btn-ghost btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
          ${renderIcon('refresh-cw', { size: 14 })}
          <span>Check Again</span>
        </button>
        <div style="display: flex; gap: 8px;" id="update-action-container">
          <button type="button" class="btn btn-secondary close-btn">Close</button>
        </div>
      </div>
    </div>
  `;

  openModal(modalEl);

  const container = modalEl.querySelector('#update-status-container');
  const actionContainer = modalEl.querySelector('#update-action-container');
  const manualBackupBtn = modalEl.querySelector('#manual-backup-btn');
  const recheckBtn = modalEl.querySelector('#recheck-btn');

  // Handle Manual Backup
  manualBackupBtn.addEventListener('click', async () => {
    manualBackupBtn.disabled = true;
    manualBackupBtn.innerHTML = `<span class="spin">${renderIcon('loader', { size: 14 })}</span> Backing up...`;
    try {
      const res = await api.backupNow();
      showToast(res.message || 'Database snapshot created successfully!', 'success');
      manualBackupBtn.innerHTML = `${renderIcon('check', { size: 14 })} Backed Up`;
      setTimeout(() => {
        manualBackupBtn.disabled = false;
        manualBackupBtn.innerHTML = `${renderIcon('database', { size: 14 })} Backup Now`;
      }, 3000);
    } catch (err) {
      showToast(err.message || 'Backup failed', 'error');
      manualBackupBtn.disabled = false;
      manualBackupBtn.innerHTML = `${renderIcon('database', { size: 14 })} Backup Now`;
    }
  });

  // Render Update Info View
  function renderView(info) {
    if (!info) return;

    if (info.offline) {
      container.innerHTML = `
        <div style="text-align: center; padding: 12px 0;">
          <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 6px;">
            Current Version: <strong>v${escapeHtml(info.current_version || '1.0.0')}</strong>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); background: var(--bg-hover, rgba(0,0,0,0.03)); padding: 10px; border-radius: 6px; line-height: 1.4;">
            ${renderIcon('wifi-off', { size: 16, style: 'vertical-align: middle; margin-right: 6px;' })}
            ${escapeHtml(info.message || 'Offline or GitHub could not be reached. You can continue using the studio software normally.')}
          </div>
          ${info.repo ? `
            <div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">
              Repo: <code>${escapeHtml(info.repo)}</code>
            </div>
          ` : ''}
        </div>
      `;
      actionContainer.innerHTML = `<button type="button" class="btn btn-secondary close-btn">Close</button>`;
      return;
    }

    if (info.update_available) {
      container.innerHTML = `
        <div style="background: rgba(212, 175, 55, 0.08); border: 1px solid var(--gold); border-radius: 8px; padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600; font-size: 0.95rem; color: var(--burgundy);">✨ New Update Ready</span>
            <span style="background: var(--gold); color: #fff; font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 12px;">
              v${escapeHtml(info.latest_version)}
            </span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px; display: flex; justify-content: space-between;">
            <span>Current: <strong>v${escapeHtml(info.current_version)}</strong></span>
            <span>Source: <strong>GitHub Releases</strong></span>
          </div>
          ${info.release_notes ? `
            <div style="font-size: 0.8rem; color: var(--text-primary); background: #fff; padding: 10px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.08); line-height: 1.4; max-height: 140px; overflow-y: auto;">
              <strong style="display: block; margin-bottom: 4px; font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">What's New:</strong>
              ${escapeHtml(info.release_notes)}
            </div>
          ` : ''}
        </div>
      `;

      actionContainer.innerHTML = `
        <button type="button" class="btn btn-secondary close-btn">Later</button>
        <button type="button" id="apply-update-btn" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px;">
          ${renderIcon('download', { size: 16 })}
          <span>Update & Restart Now</span>
        </button>
      `;

      const applyBtn = actionContainer.querySelector('#apply-update-btn');
      applyBtn.addEventListener('click', async () => {
        applyBtn.disabled = true;
        recheckBtn.disabled = true;
        manualBackupBtn.disabled = true;
        applyBtn.innerHTML = `<span class="spin">${renderIcon('loader', { size: 16 })}</span> Downloading Update from GitHub...`;

        try {
          const res = await api.applyUpdate(info.download_url);
          container.innerHTML = `
            <div style="text-align: center; padding: 20px 0;">
              <div style="color: #2e7d32; margin-bottom: 10px;">
                ${renderIcon('checkCircle', { size: 40 })}
              </div>
              <h4 style="margin: 0 0 8px 0;">Update Downloaded & Verified</h4>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0 0 12px 0;">
                The software is restarting now with the new version. Your screen will reload automatically in a few seconds...
              </p>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace; background: rgba(0,0,0,0.03); padding: 6px; border-radius: 4px;">
                Safety Backup: ${escapeHtml(res.backup_created || 'created')}
              </div>
            </div>
          `;
          actionContainer.innerHTML = '';
          // Auto reload after restart
          setTimeout(() => {
            window.location.reload();
          }, 4500);
        } catch (err) {
          showToast(err.message || 'Update failed to download', 'error');
          applyBtn.disabled = false;
          recheckBtn.disabled = false;
          manualBackupBtn.disabled = false;
          applyBtn.innerHTML = `${renderIcon('download', { size: 16 })} Retry Update`;
        }
      });
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 18px 0;">
          <div style="color: #2e7d32; margin-bottom: 10px;">
            ${renderIcon('checkCircle', { size: 36 })}
          </div>
          <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">
            You Are Up To Date
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 10px;">
            Installed Version: <strong>v${escapeHtml(info.current_version || '1.0.0')}</strong>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); background: var(--bg-hover, rgba(0,0,0,0.03)); padding: 8px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; max-width: 90%;">
            ${renderIcon('github', { size: 15 })}
            <span><strong>${escapeHtml(info.repo || 'vinaysharma5151/inventory')}</strong></span>
          </div>
          ${info.message ? `
            <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 8px;">
              ${escapeHtml(info.message)}
            </div>
          ` : ''}
        </div>
      `;
      actionContainer.innerHTML = `<button type="button" class="btn btn-secondary close-btn">Close</button>`;
    }
  }

  // Load update status
  async function fetchStatus() {
    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: 20px 0; color: var(--text-muted); gap: 10px;">
        <span class="spin">${renderIcon('loader', { size: 20 })}</span>
        <span>Checking for latest updates...</span>
      </div>
    `;
    const res = await api.checkUpdate();
    renderView(res);
  }

  recheckBtn.addEventListener('click', fetchStatus);

  if (updateInfo) {
    renderView(updateInfo);
  } else {
    fetchStatus();
  }

  modalEl.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => closeModal(modalEl));
  });
}
