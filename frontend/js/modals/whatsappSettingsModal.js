/**
 * whatsappSettingsModal.js — Meta WhatsApp Cloud API Configuration Modal
 * 
 * WHY:
 * Automates sending bridal booking receipts and digital e-bills directly to
 * brides' WhatsApp numbers upon booking or dues settlement.
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
 * Opens the WhatsApp Settings Modal.
 */
export function openWhatsAppSettingsModal() {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog wa-settings-dialog">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: #25D366;">${renderIcon('messageCircle', { size: 22 })}</span>
          <span>Meta WhatsApp Cloud API</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="wa-tabs-bar">
        <button type="button" class="wa-tab-btn active" data-tab="config">Configuration</button>
        <button type="button" class="wa-tab-btn" data-tab="test">Test Connection</button>
        <button type="button" class="wa-tab-btn" data-tab="guide">Template Guide</button>
      </div>

      <!-- Body / Tab Content -->
      <div class="modal-body" style="padding: 20px;">
        <!-- TAB 1: Configuration -->
        <div id="tab-content-config" class="wa-tab-pane">
          <div class="wa-toggle-card">
            <div>
              <div class="wa-toggle-label">Enable Automated WhatsApp E-Bills</div>
              <div class="wa-toggle-desc">Send official WhatsApp confirmation messages with garment details to customers</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="wa-enabled-toggle" />
              <span class="switch-slider"></span>
            </label>
          </div>

          <form id="wa-config-form" class="wa-fields-grid">
            <div class="wa-field-group full-width">
              <label class="input-label" for="wa-token">Meta Permanent Access Token *</label>
              <input type="password" id="wa-token" class="input-field font-mono" placeholder="EAABw..." />
              <span class="wa-field-help">Obtained from Meta Business Manager &rarr; System Users &rarr; Generate Token (whatsapp_business_messaging)</span>
            </div>

            <div class="wa-field-group">
              <label class="input-label" for="wa-phone-id">Phone Number ID *</label>
              <input type="text" id="wa-phone-id" class="input-field font-mono" placeholder="e.g. 109823471928" />
              <span class="wa-field-help">From WhatsApp &rarr; API Setup tab</span>
            </div>

            <div class="wa-field-group">
              <label class="input-label" for="wa-waba-id">WhatsApp Business Account ID</label>
              <input type="text" id="wa-waba-id" class="input-field font-mono" placeholder="e.g. 102938475612" />
            </div>

            <div class="wa-field-group">
              <label class="input-label" for="wa-template-name">Template Name</label>
              <input type="text" id="wa-template-name" class="input-field font-mono" value="booking_ebill_receipt" />
            </div>

            <div class="wa-field-group">
              <label class="input-label" for="wa-lang-code">Language Code</label>
              <input type="text" id="wa-lang-code" class="input-field font-mono" value="en_US" />
            </div>
          </form>
        </div>

        <!-- TAB 2: Test Connection -->
        <div id="tab-content-test" class="wa-tab-pane" style="display: none;">
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <p style="font-size: 0.86rem; color: var(--text-secondary); margin: 0;">
              Verify that your Meta Cloud API token and credentials are valid by sending a test message.
            </p>
            <div>
              <label class="input-label" for="wa-test-phone">Recipient WhatsApp Phone Number</label>
              <div style="display: flex; gap: 8px;">
                <input type="tel" id="wa-test-phone" class="input-field font-mono" placeholder="919876543210 (with country code)" />
                <button type="button" id="btn-send-test-wa" class="btn btn-gold" style="white-space: nowrap;">
                  ${renderIcon('send', { size: 15 })} Send Test
                </button>
              </div>
            </div>
            <div id="wa-test-feedback-box"></div>
          </div>
        </div>

        <!-- TAB 3: Template Guide -->
        <div id="tab-content-guide" class="wa-tab-pane" style="display: none;">
          <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.84rem; color: var(--text-secondary);">
            <p><strong>Approved Meta WhatsApp Template Guidelines:</strong></p>
            <p>To initiate WhatsApp conversations in India without 24-hour window restrictions, create an approved <em>Utility</em> template in your Meta WhatsApp Manager named <code>booking_ebill_receipt</code>.</p>
            <pre style="background: var(--bg-main); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-size: 0.78rem; white-space: pre-wrap; font-family: var(--font-mono);">Dear {{1}},
Thank you for booking with Mehak Bridal Studio!
Article ID: {{2}}
Pickup Date: {{3}}
Return Date: {{4}}
Total: ₹{{5}} | Paid: ₹{{6}} | Due: ₹{{7}}</pre>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button type="button" class="btn btn-outline cancel-btn">Cancel</button>
        <button type="button" id="btn-save-wa" class="btn btn-gold">
          ${renderIcon('check', { size: 16 })} Save WhatsApp Settings
        </button>
      </div>
    </div>
  `;

  const closeBtn = modalEl.querySelector('.close-btn');
  const cancelBtn = modalEl.querySelector('.cancel-btn');
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Tabs switching
  const tabs = modalEl.querySelectorAll('.wa-tab-btn');
  const panes = modalEl.querySelectorAll('.wa-tab-pane');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panes.forEach((p) => (p.style.display = 'none'));
      tab.classList.add('active');
      const pane = modalEl.querySelector(`#tab-content-${tab.dataset.tab}`);
      if (pane) pane.style.display = 'block';
    });
  });

  // Load existing settings
  api.getSettings().then((res) => {
    if (res.success && res.settings) {
      const s = res.settings;
      modalEl.querySelector('#wa-enabled-toggle').checked = s.whatsapp_enabled === 'true' || s.whatsapp_enabled === '1';
      modalEl.querySelector('#wa-token').value = s.whatsapp_token || '';
      modalEl.querySelector('#wa-phone-id').value = s.whatsapp_phone_number_id || '';
      modalEl.querySelector('#wa-waba-id').value = s.whatsapp_waba_id || '';
      modalEl.querySelector('#wa-template-name').value = s.whatsapp_template_name || 'booking_ebill_receipt';
      modalEl.querySelector('#wa-lang-code').value = s.whatsapp_language_code || 'en_US';
    }
  });

  // Save Settings
  const saveBtn = modalEl.querySelector('#btn-save-wa');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Saving...`;

    const payload = {
      whatsapp_enabled: modalEl.querySelector('#wa-enabled-toggle').checked ? 'true' : 'false',
      whatsapp_token: modalEl.querySelector('#wa-token').value.trim(),
      whatsapp_phone_number_id: modalEl.querySelector('#wa-phone-id').value.trim(),
      whatsapp_waba_id: modalEl.querySelector('#wa-waba-id').value.trim(),
      whatsapp_template_name: modalEl.querySelector('#wa-template-name').value.trim() || 'booking_ebill_receipt',
      whatsapp_language_code: modalEl.querySelector('#wa-lang-code').value.trim() || 'en_US'
    };

    try {
      await api.updateSettings(payload);
      showToast('WhatsApp settings updated!', 'success');
      closeModal();
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.innerHTML = `Save WhatsApp Settings`;
    }
  });

  // Test WhatsApp
  const sendTestBtn = modalEl.querySelector('#btn-send-test-wa');
  const testPhoneInput = modalEl.querySelector('#wa-test-phone');
  const testFeedback = modalEl.querySelector('#wa-test-feedback-box');

  sendTestBtn.addEventListener('click', async () => {
    const phone = testPhoneInput.value.trim();
    if (!phone) {
      alert('Please enter a recipient phone number with country code (e.g. 919876543210)');
      return;
    }

    sendTestBtn.disabled = true;
    sendTestBtn.innerHTML = `${renderIcon('loader', { size: 14, className: 'spinner-icon' })} Sending...`;
    testFeedback.innerHTML = '';

    try {
      const res = await api.testWhatsApp({ phone: phone, phone_number: phone, message: 'WhatsApp test message.' });
      sendTestBtn.disabled = false;
      sendTestBtn.innerHTML = `${renderIcon('send', { size: 15 })} Send Test`;

      if (res.success) {
        testFeedback.innerHTML = `<p style="color: #059669; font-weight: 600; font-size: 0.84rem; background: #ECFDF5; padding: 10px; border-radius: 6px; border: 1px solid #A7F3D0;">Test message sent successfully!</p>`;
      } else {
        testFeedback.innerHTML = `<p style="color: #DC2626; font-size: 0.84rem; background: #FEF2F2; padding: 10px; border-radius: 6px; border: 1px solid #FECACA;">Error: ${escapeHtml(res.message || 'Meta API rejected request')}</p>`;
      }
    } catch (err) {
      sendTestBtn.disabled = false;
      sendTestBtn.innerHTML = `${renderIcon('send', { size: 15 })} Send Test`;
      testFeedback.innerHTML = `<p style="color: #DC2626; font-size: 0.84rem; background: #FEF2F2; padding: 10px; border-radius: 6px;">Network error: ${escapeHtml(err.message)}</p>`;
    }
  });

  openModal(modalEl);
}
