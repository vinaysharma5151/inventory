/**
 * whatsappSettingsModal.js — OpenWA Gateway Configuration Modal.
 * 
 * WHY:
 * Configures the self-hosted OpenWA Gateway (rmyndharis/OpenWA API) for direct 1-click
 * automated WhatsApp message dispatch. Replaces Meta Cloud API setup and wa.me links.
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
 * Opens the OpenWA WhatsApp Gateway Settings modal.
 * @param {Function} [onSaved] - Callback invoked when settings are updated.
 */
export async function openWhatsAppSettingsModal(onSaved) {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 520px;">
      <!-- Header -->
      <div class="modal-header" style="background: linear-gradient(135deg, #075E54 0%, #128C7E 100%); color: #FFFFFF; border-bottom: none; border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0; padding: 18px 24px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            ${renderIcon('messageCircle', { size: 22, color: '#FFFFFF' })}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.12rem; font-weight: 700; color: #FFFFFF;">
              OpenWA WhatsApp Gateway
            </h3>
            <p style="margin: 2px 0 0; font-size: 0.8rem; color: rgba(255, 255, 255, 0.85);">
              Self-Hosted 1-Click Automated Messaging
            </p>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only modal-close-btn" style="color: #FFFFFF; opacity: 0.85;" title="Close">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body" style="padding: 22px 24px; background: var(--bg-card, #FFFFFF); display: flex; flex-direction: column; gap: 16px;">
        
        <!-- Live Gateway Status Box -->
        <div id="wa-status-box" style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 14px 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="wa-status-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #22C55E; box-shadow: 0 0 6px #22C55E; display: inline-block;"></span>
              <strong id="wa-status-title" style="color: #15803D; font-size: 0.92rem;">Checking Gateway...</strong>
            </div>
            <button type="button" id="btn-wa-refresh-status" class="btn btn-ghost btn-sm" style="padding: 2px 8px; font-size: 0.76rem; color: #166534;" title="Refresh session status">
              ${renderIcon('refreshCw', { size: 12 })} Refresh
            </button>
          </div>
          <div id="wa-session-details" style="font-size: 0.82rem; color: #374151; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div><strong>Phone:</strong> <span id="wa-status-phone">—</span></div>
            <div><strong>Account:</strong> <span id="wa-status-account">—</span></div>
            <div><strong>Session:</strong> <span id="wa-status-session">—</span></div>
            <div><strong>Status:</strong> <span id="wa-status-text">—</span></div>
          </div>
        </div>

        <!-- Server URL -->
        <div>
          <label class="input-label" for="wa-server-url" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
            OpenWA Server URL <span style="color: #DC2626;">*</span>
          </label>
          <input
            type="url"
            id="wa-server-url"
            class="form-input"
            placeholder="https://whatsapp.ajjidihatti.com"
            value="https://whatsapp.ajjidihatti.com"
            style="width: 100%; font-family: var(--font-mono, monospace); font-size: 0.92rem;"
          />
          <span style="font-size: 0.75rem; color: var(--text-muted, #6B7280); margin-top: 3px; display: block;">
            Base address of your OpenWA server instance.
          </span>
        </div>

        <!-- API Key -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="input-label" for="wa-api-key" style="font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin: 0;">
              OpenWA API Key <span style="color: #DC2626;">*</span>
            </label>
            <button type="button" id="btn-toggle-key" class="btn btn-ghost btn-sm" style="font-size: 0.74rem; padding: 2px 6px;">
              Show / Hide
            </button>
          </div>
          <input
            type="password"
            id="wa-api-key"
            class="form-input"
            placeholder="owa_k1_..."
            style="width: 100%; font-family: var(--font-mono, monospace); font-size: 0.92rem;"
          />
          <span id="wa-key-status-hint" style="font-size: 0.75rem; color: var(--text-muted, #6B7280); margin-top: 3px; display: block;">
            API key required for X-API-Key authentication.
          </span>
        </div>

        <!-- Optional Session ID -->
        <div>
          <label class="input-label" for="wa-session-id" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
            Target Session ID (Optional)
          </label>
          <input
            type="text"
            id="wa-session-id"
            class="form-input"
            placeholder="Leave empty to auto-detect ready session"
            style="width: 100%; font-family: var(--font-mono, monospace); font-size: 0.86rem;"
          />
          <span style="font-size: 0.75rem; color: var(--text-muted, #6B7280); margin-top: 3px; display: block;">
            Auto-detects the connected ready session when left empty.
          </span>
        </div>

        <!-- Test Message Section -->
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px;">
          <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 6px;">
            Test OpenWA Message Dispatch
          </label>
          <div style="display: flex; gap: 8px;">
            <div style="position: relative; flex: 1;">
              <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.85rem; font-weight: 600; color: #64748B;">
                +91
              </span>
              <input
                type="tel"
                id="wa-test-phone"
                class="form-input"
                placeholder="10-digit mobile number"
                style="padding-left: 44px; width: 100%; font-size: 0.88rem; font-family: var(--font-mono, monospace);"
              />
            </div>
            <button type="button" id="btn-wa-test" class="btn btn-outline btn-sm" style="padding: 0 14px; white-space: nowrap;">
              ${renderIcon('send', { size: 14 })} Send Test
            </button>
          </div>
          <div id="wa-test-result" style="display: none; margin-top: 8px; font-size: 0.8rem; padding: 8px 10px; border-radius: 6px;"></div>
        </div>

        <!-- Footer Actions -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; border-top: 1px solid var(--border-color, #E5E7EB); padding-top: 14px;">
          <button type="button" id="btn-wa-settings-cancel" class="btn btn-ghost">
            Cancel
          </button>
          <button type="button" id="btn-wa-settings-save" class="btn btn-whatsapp" style="padding: 9px 20px;">
            ${renderIcon('check', { size: 16, color: '#FFFFFF' })} Save Settings
          </button>
        </div>

      </div>
    </div>
  `;

  const serverUrlInput = modalEl.querySelector('#wa-server-url');
  const apiKeyInput = modalEl.querySelector('#wa-api-key');
  const sessionIdInput = modalEl.querySelector('#wa-session-id');
  const keyHint = modalEl.querySelector('#wa-key-status-hint');
  const btnToggleKey = modalEl.querySelector('#btn-toggle-key');
  const statusBox = modalEl.querySelector('#wa-status-box');
  const statusDot = modalEl.querySelector('#wa-status-dot');
  const statusTitle = modalEl.querySelector('#wa-status-title');
  const statusPhone = modalEl.querySelector('#wa-status-phone');
  const statusAccount = modalEl.querySelector('#wa-status-account');
  const statusSession = modalEl.querySelector('#wa-status-session');
  const statusText = modalEl.querySelector('#wa-status-text');
  const btnRefreshStatus = modalEl.querySelector('#btn-wa-refresh-status');
  const testPhoneInput = modalEl.querySelector('#wa-test-phone');
  const btnTest = modalEl.querySelector('#btn-wa-test');
  const testResultBox = modalEl.querySelector('#wa-test-result');
  const btnSave = modalEl.querySelector('#btn-wa-settings-save');
  const btnCancel = modalEl.querySelector('#btn-wa-settings-cancel');
  const closeBtnTop = modalEl.querySelector('.modal-close-btn');

  // Toggle API key visibility
  let isKeyVisible = false;
  btnToggleKey.addEventListener('click', () => {
    isKeyVisible = !isKeyVisible;
    apiKeyInput.type = isKeyVisible ? 'text' : 'password';
  });

  // Render Status
  function renderStatus(status) {
    if (status && status.is_ready) {
      statusBox.style.background = '#F0FDF4';
      statusBox.style.borderColor = '#BBF7D0';
      statusDot.style.background = '#22C55E';
      statusDot.style.boxShadow = '0 0 6px #22C55E';
      statusTitle.style.color = '#15803D';
      statusTitle.textContent = '● OpenWA Connected & Ready';
    } else if (status && status.has_api_key) {
      statusBox.style.background = '#FFFBEB';
      statusBox.style.borderColor = '#FDE68A';
      statusDot.style.background = '#F59E0B';
      statusDot.style.boxShadow = '0 0 6px #F59E0B';
      statusTitle.style.color = '#B45309';
      statusTitle.textContent = `● Gateway Reachable (${status.session_status || 'Session Connecting'})`;
    } else {
      statusBox.style.background = '#FEF2F2';
      statusBox.style.borderColor = '#FECACA';
      statusDot.style.background = '#EF4444';
      statusDot.style.boxShadow = '0 0 6px #EF4444';
      statusTitle.style.color = '#B91C1C';
      statusTitle.textContent = '● OpenWA Disconnected';
    }

    statusPhone.textContent = status?.connected_phone ? `+${status.connected_phone}` : 'Not connected';
    statusAccount.textContent = status?.push_name || 'N/A';
    statusSession.textContent = status?.session_name || status?.session_id || 'Auto-detect';
    statusText.textContent = (status?.session_status || 'offline').toUpperCase();
  }

  // Load configuration & probe status
  async function loadConfig() {
    try {
      const status = await api.getWhatsAppStatus();
      if (status && status.success) {
        if (status.server_url) serverUrlInput.value = status.server_url;
        if (status.masked_key) {
          keyHint.innerHTML = `Current Key: <strong style="color: #059669;">${escapeHtml(status.masked_key)}</strong> (Enter new key to replace)`;
        }
        if (status.session_id) {
          sessionIdInput.value = status.session_id;
        }
        if (status.connected_phone) {
          testPhoneInput.value = status.connected_phone.replace(/^91/, '');
        }
        renderStatus(status);
      }
    } catch (e) {
      console.warn('Failed to load OpenWA status:', e);
      renderStatus({ is_ready: false, has_api_key: false });
    }
  }

  btnRefreshStatus.addEventListener('click', async () => {
    btnRefreshStatus.disabled = true;
    statusTitle.textContent = 'Probing OpenWA session...';
    try {
      const status = await api.getWhatsAppStatus();
      renderStatus(status);
      showToast('OpenWA status refreshed', 'neutral');
    } catch (_) {
      renderStatus({ is_ready: false });
    } finally {
      btnRefreshStatus.disabled = false;
    }
  });

  // Test Ping
  btnTest.addEventListener('click', async () => {
    const testNum = testPhoneInput.value.trim().replace(/\D/g, '');
    if (!testNum || testNum.length < 10) {
      testPhoneInput.focus();
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }

    btnTest.disabled = true;
    btnTest.innerHTML = `${renderIcon('refreshCw', { size: 14 })} Sending...`;
    testResultBox.style.display = 'none';

    try {
      // If user typed a new key or URL, save first so test uses current form values
      const sUrl = serverUrlInput.value.trim();
      const aKey = apiKeyInput.value.trim();
      const sId = sessionIdInput.value.trim();
      if (sUrl && aKey) {
        await api.saveWhatsAppSettings({
          server_url: sUrl,
          api_key: aKey,
          session_id: sId || null,
        });
      }

      const res = await api.testWhatsAppApi(testNum);
      testResultBox.style.display = 'block';

      if (res && res.success) {
        testResultBox.style.background = '#ECFDF5';
        testResultBox.style.color = '#065F46';
        testResultBox.style.border = '1px solid #A7F3D0';
        testResultBox.innerHTML = `<strong>✅ Success!</strong> ${escapeHtml(res.message || 'Test message delivered successfully via OpenWA.')}`;
        showToast('Test WhatsApp message delivered!', 'success');
      } else {
        testResultBox.style.background = '#FEF2F2';
        testResultBox.style.color = '#991B1B';
        testResultBox.style.border = '1px solid #FECACA';
        testResultBox.innerHTML = `<strong>⚠️ OpenWA Error:</strong> ${escapeHtml(res.error || 'Failed to dispatch test message. Verify server URL and API key.')}`;
        showToast('OpenWA test failed. Check details in modal.', 'warning');
      }
    } catch (err) {
      testResultBox.style.display = 'block';
      testResultBox.style.background = '#FEF2F2';
      testResultBox.style.color = '#991B1B';
      testResultBox.style.border = '1px solid #FECACA';
      testResultBox.innerHTML = `<strong>⚠️ Connection Failed:</strong> ${escapeHtml(err.message || 'Network error')}`;
    } finally {
      btnTest.disabled = false;
      btnTest.innerHTML = `${renderIcon('send', { size: 14 })} Send Test`;
    }
  });

  // Save Settings
  btnSave.addEventListener('click', async () => {
    const sUrl = serverUrlInput.value.trim();
    const aKey = apiKeyInput.value.trim();
    const sId = sessionIdInput.value.trim();

    if (!sUrl) {
      serverUrlInput.focus();
      showToast('Please enter your OpenWA Server URL.', 'warning');
      return;
    }

    btnSave.disabled = true;
    btnSave.innerHTML = `${renderIcon('refreshCw', { size: 16 })} Saving...`;

    try {
      const res = await api.saveWhatsAppSettings({
        server_url: sUrl,
        api_key: aKey,
        session_id: sId || null,
      });

      if (res && res.success) {
        showToast('OpenWA Gateway settings saved!', 'success');
        closeModal();
        if (onSaved) onSaved(res.config);
      } else {
        showToast(res.detail || res.error || 'Failed to save settings', 'warning');
      }
    } catch (e) {
      showToast(e.message || 'Failed to save settings', 'warning');
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `${renderIcon('check', { size: 16, color: '#FFFFFF' })} Save Settings`;
    }
  });

  const doClose = () => closeModal();
  btnCancel.addEventListener('click', doClose);
  closeBtnTop.addEventListener('click', doClose);

  openModal(modalEl);
  loadConfig();
}
