/**
 * whatsappSettingsModal.js — Meta WhatsApp Business Cloud API Configuration Modal.
 * 
 * WHY:
 * Allows the showroom owner to configure the official Meta WhatsApp Business Cloud API
 * credentials (Phone Number ID & Permanent Access Token) and send test pings,
 * switching from manual wa.me links to automated 1-click background WhatsApp dispatch.
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
 * Opens the WhatsApp Settings modal.
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
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; color: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            ${renderIcon('messageCircle', { size: 20, color: '#FFFFFF' })}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.12rem; font-weight: 700; color: #FFFFFF;">
              Meta WhatsApp Business API
            </h3>
            <p style="margin: 2px 0 0; font-size: 0.8rem; color: rgba(255, 255, 255, 0.85);">
              Official Cloud API Setup &amp; Dispatch Mode
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
        <div style="background: rgba(18, 140, 126, 0.08); border: 1px solid rgba(18, 140, 126, 0.25); border-radius: 8px; padding: 12px 14px; font-size: 0.84rem; line-height: 1.45; color: var(--text-main);">
          <strong style="color: #075E54; display: block; margin-bottom: 2px;">⚡ Official Automated WhatsApp Dispatch</strong>
          Messages are dispatched directly to customers through Meta's verified servers without opening browser tabs or manual clicking.
        </div>

        <!-- Mode Toggle -->
        <div>
          <label class="input-label" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 6px;">
            Dispatch Mode
          </label>
          <div style="display: flex; gap: 10px;">
            <label style="flex: 1; border: 1px solid #D1D5DB; border-radius: 8px; padding: 10px 12px; display: flex; align-items: flex-start; gap: 8px; cursor: pointer; background: var(--bg-surface, #F9FAFB);">
              <input type="radio" name="wa_mode" value="meta" id="wa-mode-meta" checked style="margin-top: 3px;" />
              <div>
                <strong style="font-size: 0.88rem; display: block;">Official Meta Cloud API</strong>
                <span style="font-size: 0.76rem; color: var(--text-muted, #6B7280);">Automated 1-click background dispatch</span>
              </div>
            </label>
            <label style="flex: 1; border: 1px solid #D1D5DB; border-radius: 8px; padding: 10px 12px; display: flex; align-items: flex-start; gap: 8px; cursor: pointer; background: var(--bg-surface, #F9FAFB);">
              <input type="radio" name="wa_mode" value="direct" id="wa-mode-direct" style="margin-top: 3px;" />
              <div>
                <strong style="font-size: 0.88rem; display: block;">Direct wa.me Links</strong>
                <span style="font-size: 0.76rem; color: var(--text-muted, #6B7280);">Opens WhatsApp Web or App</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Phone Number ID -->
        <div id="section-meta-creds">
          <div style="margin-bottom: 12px;">
            <label class="input-label" for="wa-phone-id" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
              Meta Phone Number ID <span style="color: #DC2626;">*</span>
            </label>
            <input
              type="text"
              id="wa-phone-id"
              class="form-input"
              placeholder="e.g. 105847291823746"
              style="width: 100%; font-family: var(--font-mono, monospace); font-size: 0.92rem;"
            />
            <span style="font-size: 0.75rem; color: var(--text-muted, #6B7280); margin-top: 3px; display: block;">
              Found in Meta for Developers &rarr; WhatsApp &rarr; API Setup &rarr; <strong>Phone number ID</strong>
            </span>
          </div>

          <!-- Permanent Access Token -->
          <div style="margin-bottom: 12px;">
            <label class="input-label" for="wa-access-token" style="display: block; font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
              Meta Permanent Access Token <span style="color: #DC2626;">*</span>
            </label>
            <div style="position: relative;">
              <input
                type="password"
                id="wa-access-token"
                class="form-input"
                placeholder="Paste EAAG... access token"
                style="width: 100%; padding-right: 40px; font-family: var(--font-mono, monospace); font-size: 0.92rem;"
              />
              <button
                type="button"
                id="btn-toggle-token"
                class="btn btn-ghost btn-sm"
                style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); padding: 4px 8px; color: var(--text-muted);"
                title="Show / Hide Token"
              >
                ${renderIcon('eye', { size: 14 })}
              </button>
            </div>
            <span id="wa-token-status-hint" style="font-size: 0.75rem; color: var(--text-muted, #6B7280); margin-top: 3px; display: block;">
              System User Token with <code>whatsapp_business_messaging</code> permission.
            </span>
          </div>

          <!-- Approved Templates Configuration -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="margin-bottom: 10px;">
              <label class="input-label" for="wa-template-name" style="display: block; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
                Booking Confirmation Template Name
              </label>
              <input
                type="text"
                id="wa-template-name"
                class="form-input"
                placeholder="e.g. booking_receipt (optional)"
                style="width: 100%; font-size: 0.88rem;"
              />
            </div>

            <div>
              <label class="input-label" for="wa-reminder-template-name" style="display: block; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6B7280); margin-bottom: 4px;">
                1-Day Pickup Reminder Template Name
              </label>
              <input
                type="text"
                id="wa-reminder-template-name"
                class="form-input"
                placeholder="e.g. pickup_reminder"
                style="width: 100%; font-size: 0.88rem;"
              />
              <span style="font-size: 0.74rem; color: var(--text-muted, #6B7280); margin-top: 4px; display: block;">
                Auto-sent to customers 1 day before their garment pickup date.
              </span>
            </div>

            <!-- Meta Template Template Guide Copy Box -->
            <div style="margin-top: 10px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 6px; padding: 8px 10px; font-size: 0.76rem; color: #475569;">
              <strong style="color: #0F172A; display: block; margin-bottom: 2px;">📋 Recommended Meta Template (Utility):</strong>
              <code>Hello {{1}}, reminder from {{2}}: Your outfit {{3}} (Booking #{{4}}) is scheduled for pickup tomorrow, {{5}}! Balance due: {{6}}. Thank you!</code>
            </div>
          </div>

          <!-- Automated Pickup Reminders Check -->
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 0.82rem; color: #166534; display: block;">Automated 1-Day Pickup Check</strong>
              <span style="font-size: 0.74rem; color: #15803D;">Scans tomorrow's scheduled pickups and delivers reminders</span>
            </div>
            <button type="button" id="btn-wa-run-reminders" class="btn btn-sm btn-outline" style="background: #FFFFFF; border-color: #86EFAC; color: #166534; font-weight: 600;">
              ${renderIcon('refreshCw', { size: 13 })} Run Check
            </button>
          </div>

          <!-- Connection Diagnostic / Test Ping -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #334155; margin-bottom: 6px;">
              Test Meta API Connection
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
                  placeholder="10-digit test mobile"
                  style="padding-left: 44px; width: 100%; font-size: 0.88rem; font-family: var(--font-mono, monospace);"
                />
              </div>
              <button type="button" id="btn-wa-test" class="btn btn-outline btn-sm" style="padding: 0 14px; white-space: nowrap;">
                ${renderIcon('send', { size: 14 })} Send Test
              </button>
            </div>
            <div id="wa-test-result" style="display: none; margin-top: 8px; font-size: 0.8rem; padding: 8px 10px; border-radius: 6px;"></div>
          </div>
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

  const phoneIdInput = modalEl.querySelector('#wa-phone-id');
  const tokenInput = modalEl.querySelector('#wa-access-token');
  const templateInput = modalEl.querySelector('#wa-template-name');
  const tokenHint = modalEl.querySelector('#wa-token-status-hint');
  const btnToggleToken = modalEl.querySelector('#btn-toggle-token');
  const radioMeta = modalEl.querySelector('#wa-mode-meta');
  const radioDirect = modalEl.querySelector('#wa-mode-direct');
  const testPhoneInput = modalEl.querySelector('#wa-test-phone');
  const btnTest = modalEl.querySelector('#btn-wa-test');
  const templateReminderInput = modalEl.querySelector('#wa-reminder-template-name');
  const btnRunReminders = modalEl.querySelector('#btn-wa-run-reminders');
  const testResultBox = modalEl.querySelector('#wa-test-result');
  const btnSave = modalEl.querySelector('#btn-wa-settings-save');
  const btnCancel = modalEl.querySelector('#btn-wa-settings-cancel');
  const closeBtnTop = modalEl.querySelector('.modal-close-btn');

  // Toggle token visibility
  let isPasswordVisible = false;
  btnToggleToken.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    tokenInput.type = isPasswordVisible ? 'text' : 'password';
  });

  // Run Manual 1-Day Pickup Reminders Check
  if (btnRunReminders) {
    btnRunReminders.addEventListener('click', async () => {
      btnRunReminders.disabled = true;
      btnRunReminders.innerHTML = `${renderIcon('refreshCw', { size: 13 })} Scanning...`;
      try {
        const res = await api.checkPickupReminders();
        if (res && res.success) {
          showToast(`Pickup Scan: ${res.sent_count} reminder(s) sent out of ${res.total_due} due tomorrow.`, res.sent_count > 0 ? 'success' : 'neutral');
        } else {
          showToast(res.error || 'Pickup check encountered an error', 'warning');
        }
      } catch (e) {
        showToast('Failed to run pickup reminder check', 'warning');
      } finally {
        btnRunReminders.disabled = false;
        btnRunReminders.innerHTML = `${renderIcon('refreshCw', { size: 13 })} Run Check`;
      }
    });
  }

  // Load current configuration
  async function loadConfig() {
    try {
      const status = await api.getWhatsAppStatus();
      if (status && status.success) {
        if (status.mode === 'direct') {
          radioDirect.checked = true;
        } else {
          radioMeta.checked = true;
        }

        if (status.phone_number_id) {
          phoneIdInput.value = status.phone_number_id;
        }
        if (status.masked_token) {
          tokenHint.innerHTML = `Current Token: <strong style="color: #059669;">${escapeHtml(status.masked_token)}</strong> (Enter new token only to replace)`;
        }
        if (status.template_name) {
          templateInput.value = status.template_name;
        }
        if (status.reminder_template_name && templateReminderInput) {
          templateReminderInput.value = status.reminder_template_name;
        }
      }
    } catch (e) {
      console.warn('Failed to load WhatsApp status:', e);
    }
  }

  // Test Meta API
  btnTest.addEventListener('click', async () => {
    const testNum = testPhoneInput.value.trim().replace(/\D/g, '');
    if (!testNum || testNum.length < 10) {
      testPhoneInput.focus();
      showToast('Please enter a valid 10-digit test mobile number.', 'warning');
      return;
    }

    btnTest.disabled = true;
    btnTest.innerHTML = `${renderIcon('refreshCw', { size: 14 })} Sending...`;
    testResultBox.style.display = 'none';

    try {
      // If user typed a new token or phone ID in the form, save first or test directly
      const phoneIdVal = phoneIdInput.value.trim();
      const tokenVal = tokenInput.value.trim();
      if (phoneIdVal && tokenVal) {
        await api.saveWhatsAppSettings({
          phone_number_id: phoneIdVal,
          access_token: tokenVal,
          mode: radioDirect.checked ? 'direct' : 'meta',
          template_name: templateInput.value.trim(),
          reminder_template_name: templateReminderInput ? templateReminderInput.value.trim() : '',
        });
      }

      const res = await api.testWhatsAppApi(testNum);
      testResultBox.style.display = 'block';

      if (res && res.success) {
        testResultBox.style.background = '#ECFDF5';
        testResultBox.style.color = '#065F46';
        testResultBox.style.border = '1px solid #A7F3D0';
        testResultBox.innerHTML = `<strong>✅ Success!</strong> ${escapeHtml(res.message || 'Test message delivered successfully.')}`;
        showToast('Test WhatsApp message delivered!', 'success');
      } else {
        testResultBox.style.background = '#FEF2F2';
        testResultBox.style.color = '#991B1B';
        testResultBox.style.border = '1px solid #FECACA';
        testResultBox.innerHTML = `<strong>⚠️ Meta Error:</strong> ${escapeHtml(res.error || 'Failed to dispatch test message. Verify Phone Number ID and Access Token.')}`;
        showToast('Meta test failed. Check details in modal.', 'warning');
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
    const isMeta = radioMeta.checked;
    const phoneId = phoneIdInput.value.trim();
    const token = tokenInput.value.trim();
    const template = templateInput.value.trim();
    const reminderTemplate = templateReminderInput ? templateReminderInput.value.trim() : '';

    if (isMeta && !phoneId) {
      phoneIdInput.focus();
      showToast('Please enter your Meta Phone Number ID.', 'warning');
      return;
    }

    btnSave.disabled = true;
    btnSave.innerHTML = `${renderIcon('refreshCw', { size: 16 })} Saving...`;

    try {
      const res = await api.saveWhatsAppSettings({
        phone_number_id: phoneId,
        access_token: token,
        mode: isMeta ? 'meta' : 'direct',
        template_name: template,
        reminder_template_name: reminderTemplate,
      });

      if (res && res.success) {
        showToast('WhatsApp Business API settings saved!', 'success');
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
