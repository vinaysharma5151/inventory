/**
 * smsQueueWidget.js — Persistent Bottom-Right Outbox Queue for Failed/Pending SMS
 * 
 * WHY:
 * 1. If an SMS cannot be delivered (phone screen off, Wi-Fi disconnected, SIM gateway stopped),
 *    the message is NEVER lost. It appears in the bottom right corner in an active delivery queue.
 * 2. It remains pinned in the bottom right until the issue is resolved and the message is sent.
 * 3. Includes automatic background retry every 20 seconds, manual "Retry Now", and direct
 *    shortcut to Gateway Settings.
 */

import { renderIcon } from '../../icons.js';
import { api } from '../../api.js';
import { showToast } from '../../toast.js';
import { openSmsSettingsModal } from '../../modals/smsSettingsModal.js';

let queueContainer = null;
let autoRetryTimer = null;
let isRetrying = false;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function initSmsQueueWidget() {
  if (queueContainer) return;

  queueContainer = document.createElement('div');
  queueContainer.id = 'sms-queue-panel';
  queueContainer.className = 'sms-queue-panel';
  queueContainer.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2150;
    width: 360px;
    max-width: calc(100vw - 32px);
    background: #FFFFFF;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15);
    border: 1px solid #FECACA;
    overflow: hidden;
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
    transform: translateX(120%);
    opacity: 0;
    pointer-events: none;
    font-family: inherit;
  `;

  document.body.appendChild(queueContainer);

  // Initial check on load
  refreshSmsQueue();

  // Listen for window focus to refresh
  window.addEventListener('focus', () => refreshSmsQueue());
}

export async function refreshSmsQueue() {
  if (!queueContainer) return;
  try {
    const res = await api.getSmsQueue();
    if (res && res.success && Array.isArray(res.queue) && res.count > 0) {
      renderQueueUI(res.queue);
      startAutoRetryLoop();
    } else {
      hideQueueUI();
      stopAutoRetryLoop();
    }
  } catch (_) {
    // Silent fail
  }
}

function renderQueueUI(queue) {
  if (!queueContainer) return;
  const count = queue.length;
  const firstItem = queue[0];
  const moreCount = count - 1;

  queueContainer.innerHTML = `
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%); color: #FFFFFF; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-flex;">
          ${renderIcon('alertCircle', { size: 18, color: '#FFFFFF' })}
        </span>
        <span style="font-weight: 700; font-size: 0.88rem; letter-spacing: 0.02em;">
          SMS Queue: ${count} Pending
        </span>
      </div>
      <button type="button" id="btn-sms-queue-setup" style="background: rgba(255,255,255,0.2); border: none; border-radius: 6px; padding: 4px 8px; color: #FFFFFF; font-size: 0.74rem; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Check Gateway settings">
        ${renderIcon('settings', { size: 13, color: '#FFFFFF' })} Gateway
      </button>
    </div>

    <!-- Content -->
    <div style="padding: 14px 16px; background: #FFF5F5; font-size: 0.84rem; display: flex; flex-direction: column; gap: 10px;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-weight: 700; color: #1F2937; font-size: 0.88rem;">
            ${escapeHtml(firstItem.customer_name || 'Customer')}
          </span>
          <span style="font-size: 0.72rem; padding: 2px 6px; background: rgba(220, 38, 38, 0.12); color: #B91C1C; border-radius: 4px; font-weight: 600;">
            ${escapeHtml(firstItem.sms_type || 'SMS')}
          </span>
        </div>
        <div style="font-family: monospace; font-size: 0.78rem; color: #6B7280;">
          📞 ${escapeHtml(firstItem.customer_phone)}
        </div>
      </div>

      <!-- Error / Issue info -->
      <div style="background: #FFFFFF; border: 1px solid #FECACA; border-radius: 6px; padding: 8px 10px; font-size: 0.78rem; color: #991B1B; line-height: 1.35;">
        <div style="font-weight: 600; margin-bottom: 2px;">⚠️ Issue:</div>
        <div>${escapeHtml(firstItem.error_message || 'Phone screen off or gateway unreachable')}</div>
      </div>

      ${moreCount > 0 ? `
        <div style="font-size: 0.75rem; color: #6B7280; font-weight: 600; text-align: center;">
          + ${moreCount} more message${moreCount > 1 ? 's' : ''} waiting in queue
        </div>
      ` : ''}

      <!-- Actions -->
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button type="button" id="btn-sms-queue-retry" class="btn btn-sm btn-sms" style="flex: 1; justify-content: center; font-size: 0.82rem; padding: 8px 12px;">
          ${renderIcon('refreshCw', { size: 14, color: '#FFFFFF' })} Retry Now
        </button>
      </div>

      <div style="font-size: 0.72rem; color: #6B7280; text-align: center; margin-top: -2px;">
        💡 Retrying automatically every 20s. Will dismiss once delivered.
      </div>
    </div>
  `;

  // Attach buttons
  const btnRetry = queueContainer.querySelector('#btn-sms-queue-retry');
  if (btnRetry) {
    btnRetry.addEventListener('click', async () => {
      await triggerQueueRetry(btnRetry);
    });
  }

  const btnSetup = queueContainer.querySelector('#btn-sms-queue-setup');
  if (btnSetup) {
    btnSetup.addEventListener('click', () => {
      openSmsSettingsModal();
    });
  }

  // Slide into view in bottom right
  queueContainer.style.transform = 'translateX(0)';
  queueContainer.style.opacity = '1';
  queueContainer.style.pointerEvents = 'auto';
}

function hideQueueUI() {
  if (!queueContainer) return;
  // Slide aside smoothly
  queueContainer.style.transform = 'translateX(120%)';
  queueContainer.style.opacity = '0';
  queueContainer.style.pointerEvents = 'none';
}

async function triggerQueueRetry(buttonEl) {
  if (isRetrying) return;
  isRetrying = true;

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerHTML = `${renderIcon('refreshCw', { size: 14, className: 'spinner-icon' })} Sending...`;
  }

  try {
    const res = await api.retrySmsQueue();
    if (res && res.success) {
      if (res.sent > 0) {
        showToast(`✅ Successfully delivered ${res.sent} queued SMS!`, 'success', 5000);
      }
      if (res.remaining === 0) {
        hideQueueUI();
        stopAutoRetryLoop();
      } else {
        refreshSmsQueue();
      }
    }
  } catch (err) {
    showToast('Retry attempt failed: ' + (err.message || 'Phone not reachable'), 'warning', 4000);
  } finally {
    isRetrying = false;
    if (buttonEl && buttonEl.parentNode) {
      buttonEl.disabled = false;
      buttonEl.innerHTML = `${renderIcon('refreshCw', { size: 14, color: '#FFFFFF' })} Retry Now`;
    }
  }
}

function startAutoRetryLoop() {
  if (autoRetryTimer) return;
  autoRetryTimer = setInterval(async () => {
    if (document.hidden || isRetrying) return;
    try {
      const res = await api.retrySmsQueue();
      if (res && res.success) {
        if (res.sent > 0) {
          showToast(`✅ Queued SMS delivered to customer!`, 'success', 5000);
        }
        if (res.remaining === 0) {
          hideQueueUI();
          stopAutoRetryLoop();
        } else {
          refreshSmsQueue();
        }
      }
    } catch (_) {}
  }, 20000); // 20s auto-retry interval
}

function stopAutoRetryLoop() {
  if (autoRetryTimer) {
    clearInterval(autoRetryTimer);
    autoRetryTimer = null;
  }
}

