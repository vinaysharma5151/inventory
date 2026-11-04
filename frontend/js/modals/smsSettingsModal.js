/**
 * smsSettingsModal.js — Android SMS Gateway (Capcom6) Configuration Modal.
 * 
 * WHY:
 * Allows the studio owner to configure the Android phone's local IP address and credentials,
 * test the connection with a live SMS ping, and ensure the server can communicate with the
 * phone's SIM card over Wi-Fi.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { showToast, playMessageSentChime } from '../toast.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens the SMS Gateway Settings modal.
 * @param {Function} [onSaved] - Callback invoked when settings are updated.
 */
export async function openSmsSettingsModal(onSaved) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 520px;">
      <!-- Header -->
      <div class="modal-header" style="background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); color: #FFFFFF; border-bottom: none; border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0; padding: 18px 24px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #3B82F6; display: flex; align-items: center; justify-content: center; color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            ${renderIcon('messageSquare', { size: 20, color: '#FFFFFF' })}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.12rem; font-weight: 700; color: #FFFFFF;">
              Android SMS Gateway Setup
            </h3>
            <p style="margin: 2px 0 0; font-size: 0.8rem; color: rgba(255, 255, 255, 0.85);">
              Direct SIM Dispatch via Android Phone (Capcom6)
            </p>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only modal-close-btn" style="color: #FFFFFF; opacity: 0.85;" title="Close">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body" style="padding: 22px 24px; background: var(--bg-card, #FFFFFF); display: flex; flex-direction: column; gap: 16px;">
        
        <!-- Info Banner -->
        <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: 8px; padding: 12px 14px; font-size: 0.84rem; line-height: 1.45; color: var(--text-main);">
          <strong style="color: #1E3A8A; display: block; margin-bottom: 2px;">📱 Direct SIM Card Dispatch</strong>
          Messages are dispatched from your server to your Android phone over your Wi-Fi network and sent directly from the SIM card.
        </div>

        <!-- Status & Daily Count Summary -->
        <div id="sms-status-summary-bar" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface, #F9FAFB); border: 1px solid var(--border-light, #E5E7EB); border-radius: 8px; padding: 10px 14px; font-size: 0.82rem;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="sms-status-indicator-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #9CA3AF;"></span>
            <span id="sms-status-indicator-text" style="font-weight: 600; color: var(--text-main);">Checking status...</span>
          </div>
          <div id="sms-daily-counter-text" style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary, #6B7280); font-weight: 600;">
            Today: 0 / 100 SMS
          </div>
        </div>

        <!-- Phone IP & Port -->
        <div>
          <label class="input-label" for="sms-gateway-url" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
            Phone Gateway URL <span style="color: #DC2626;">*</span>
          </label>
          <input
            type="text"
            id="sms-gateway-url"
            class="input-field"
            placeholder="http://192.168.29.150:8080"
            style="width: 100%; font-family: monospace; font-size: 0.92rem; padding: 10px 12px;"
          />
          <span style="font-size: 0.76rem; color: var(--text-muted, #6B7280); display: block; margin-top: 4px;">
            Enter the Server URL shown on the Capcom6 app screen on your Android phone.
          </span>
        </div>

        <!-- Credentials Row -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label class="input-label" for="sms-login" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
              Username / Login
            </label>
            <input
              type="text"
              id="sms-login"
              class="input-field"
              placeholder="e.g. sms"
              style="width: 100%; font-size: 0.88rem; padding: 9px 12px;"
            />
          </div>
          <div>
            <label class="input-label" for="sms-password" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
              Password
            </label>
            <input
              type="password"
              id="sms-password"
              class="input-field"
              placeholder="App password"
              style="width: 100%; font-size: 0.88rem; padding: 9px 12px;"
            />
          </div>
        </div>

        <!-- Save Button Row -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px;">
          <button type="button" id="btn-sms-save" class="btn btn-sms" style="padding: 9px 20px;">
            ${renderIcon('check', { size: 16 })} Save Settings
          </button>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--border-light, #E5E7EB); margin: 6px 0;" />

        <!-- Live Test Section -->
        <div>
          <label style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 6px;">
            Test Phone Connection
          </label>
          <div style="display: flex; gap: 8px;">
            <input
              type="tel"
              id="sms-test-phone"
              class="input-field"
              placeholder="10-digit mobile number"
              style="flex: 1; font-size: 0.88rem; padding: 9px 12px;"
            />
            <button type="button" id="btn-sms-test" class="btn btn-outline" style="white-space: nowrap; padding: 9px 14px;">
              ${renderIcon('send', { size: 14 })} Send Test Ping
            </button>
          </div>
          <div id="sms-test-feedback" style="display: none; margin-top: 8px; font-size: 0.82rem; padding: 8px 12px; border-radius: 6px;"></div>
        </div>

        <!-- Helpful Checklist -->
        <div style="background: var(--bg-surface, #F9FAFB); border-radius: 8px; padding: 12px 14px; font-size: 0.78rem; color: var(--text-secondary, #4B5563);">
          <strong style="display: block; margin-bottom: 4px; color: var(--text-main);">Quick Checklist:</strong>
          <ul style="margin: 0; padding-left: 18px; line-height: 1.5;">
            <li>Android phone &amp; server are connected to the same JioFiber Wi-Fi.</li>
            <li>Capcom6 SMS Gateway app is opened and shows <strong>Server Running</strong>.</li>
            <li>Battery Optimization is set to <strong>Unrestricted</strong> for the SMS Gateway app.</li>
          </ul>
        </div>

      </div>
    </div>
  `;

  // Attach event handlers
  const closeBtn = modalEl.querySelector('.modal-close-btn');
  closeBtn.addEventListener('click', closeModal);

  const urlInput = modalEl.querySelector('#sms-gateway-url');
  const loginInput = modalEl.querySelector('#sms-login');
  const pwInput = modalEl.querySelector('#sms-password');
  const saveBtn = modalEl.querySelector('#btn-sms-save');
  const testPhoneInput = modalEl.querySelector('#sms-test-phone');
  const testBtn = modalEl.querySelector('#btn-sms-test');
  const feedbackEl = modalEl.querySelector('#sms-test-feedback');

  // Preload existing configuration
  try {
    const status = await api.getSmsStatus();
    const dot = modalEl.querySelector('#sms-status-indicator-dot');
    const text = modalEl.querySelector('#sms-status-indicator-text');
    const daily = modalEl.querySelector('#sms-daily-counter-text');

    if (status && status.gateway_url) {
      urlInput.value = status.gateway_url;
      loginInput.value = status.login || '';
      if (status.masked_password) {
        pwInput.placeholder = `Saved (${status.masked_password})`;
      }
      if (dot && text) {
        dot.style.background = '#10B981';
        text.textContent = 'Gateway Configured & Active';
      }
    } else {
      if (dot && text) {
        dot.style.background = '#F59E0B';
        text.textContent = 'Not Configured';
      }
    }

    if (daily && status.today_sms_count !== undefined) {
      const count = status.today_sms_count || 0;
      const limit = status.daily_carrier_limit || 100;
      daily.textContent = `Today: ${count} / ${limit} SMS`;
      if (count >= 100) daily.style.color = '#DC2626';
    }
  } catch (e) {
    // Graceful fallback
  }

  // Save Settings
  saveBtn.addEventListener('click', async () => {
    const gatewayUrl = urlInput.value.trim();
    if (!gatewayUrl) {
      showToast('Please enter the Gateway URL from the phone.', 'warning');
      urlInput.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const res = await api.saveSmsSettings({
        gateway_url: gatewayUrl,
        login: loginInput.value.trim(),
        password: pwInput.value.trim(),
      });

      if (res && res.success) {
        showToast('SMS Gateway settings saved!', 'success');
        if (onSaved) onSaved(res);
        closeModal();
      } else {
        showToast(res.detail || res.message || 'Failed to save settings', 'error');
      }
    } catch (err) {
      showToast('Error saving settings: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${renderIcon('check', { size: 16 })} Save Settings`;
    }
  });

  // Test Ping
  testBtn.addEventListener('click', async () => {
    const phone = testPhoneInput.value.trim().replace(/\D/g, '');
    if (phone.length < 10) {
      showToast('Please enter a valid 10-digit mobile number for test.', 'warning');
      testPhoneInput.focus();
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Sending...';
    feedbackEl.style.display = 'none';

    try {
      const res = await api.testSmsGateway(phone);
      if (res && res.success) {
        playMessageSentChime();
        feedbackEl.style.display = 'block';
        feedbackEl.style.background = '#ECFDF5';
        feedbackEl.style.border = '1px solid #A7F3D0';
        feedbackEl.style.color = '#065F46';
        feedbackEl.textContent = '✅ ' + (res.message || 'Test SMS sent successfully!');
      } else {
        throw new Error(res.detail || 'Test SMS failed');
      }
    } catch (err) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = '#FEF2F2';
      feedbackEl.style.border = '1px solid #FECACA';
      feedbackEl.style.color = '#991B1B';
      feedbackEl.textContent = '❌ ' + (err.message || 'Failed to connect to phone. Check URL and Wi-Fi.');
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = `${renderIcon('send', { size: 14 })} Send Test Ping`;
    }
  });

  openModal(modalEl);
}
