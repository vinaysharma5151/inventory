/**
 * mobileSubmitOverlay.js — Booking Submission Progress & Post-Booking Actions.
 * 
 * WHY:
 * Isolates the full-screen progress state, saving animation, and post-booking
 * options (one-tap WhatsApp e-bill dispatch and next-garment reset).
 */

import { renderIcon } from '../../icons.js';
import { showToast } from '../../toast.js';
import { api } from '../../api.js';

/**
 * Initializes the mobile submit and progress overlay controller.
 * @param {HTMLElement} containerEl
 * @param {object} callbacks - { onReset() }
 * @returns {object} - { showProgress(), showSuccess(article, onDone), hide() }
 */
export function initSubmitOverlay(containerEl, callbacks = {}) {
  const overlay = containerEl.querySelector('#upload-overlay');
  const overlayIcon = containerEl.querySelector('#upload-overlay-icon');
  const overlayTitle = containerEl.querySelector('#upload-overlay-title');
  const overlaySub = containerEl.querySelector('#upload-overlay-sub');
  const overlayActions = containerEl.querySelector('#upload-overlay-actions');

  return {
    showProgress(title = 'Syncing Booking...', subtitle = 'Saving booking & syncing with laptop...') {
      if (!overlay) return;
      overlay.style.display = 'flex';
      if (overlayIcon) {
        overlayIcon.innerHTML = renderIcon('loader', { size: 52, color: '#8C6A2A', className: 'spinner-icon' });
      }
      if (overlayTitle) overlayTitle.textContent = title;
      if (overlaySub) overlaySub.textContent = subtitle;
      if (overlayActions) {
        overlayActions.style.display = 'none';
        overlayActions.innerHTML = '';
      }
    },

    showSuccess(article, onDone) {
      if (!overlay) return;
      if (navigator.vibrate) navigator.vibrate([40, 30, 80]);

      if (overlayIcon) {
        overlayIcon.innerHTML = renderIcon('checkCircle', { size: 52, color: '#059669' });
      }
      if (overlayTitle) overlayTitle.textContent = 'Sent to Laptop!';
      if (overlaySub) overlaySub.textContent = `Saved ${article.article_id} successfully!`;

      showToast(`Saved ${article.article_id} to Studio Database!`, 'success');

      let doneCalled = false;
      const handleDone = () => {
        if (doneCalled) return;
        doneCalled = true;
        overlay.style.display = 'none';
        if (overlayActions) {
          overlayActions.style.display = 'none';
          overlayActions.innerHTML = '';
        }
        if (onDone) onDone();
      };

      const hasPhone = Boolean((article.customer_phone || '').trim().replace(/\D/g, '').length >= 10);
      const alreadySent = Boolean(article._wa_dispatched);

      if (overlayActions) {
        overlayActions.style.display = 'flex';
        overlayActions.style.flexDirection = 'column';
        overlayActions.style.gap = '8px';
        overlayActions.innerHTML = `
          ${hasPhone ? `
            ${alreadySent ? `
              <div style="background: rgba(37, 211, 102, 0.12); border: 1px solid #25D366; color: #075E54; font-size: 0.88rem; font-weight: 600; padding: 10px 14px; border-radius: 8px; text-align: center; margin-top: 6px;">
                ✓ WhatsApp confirmation & photo sent!
              </div>
            ` : `
              <button type="button" id="btn-m-wa-booking" class="btn btn-whatsapp" style="width: 100%; justify-content: center; font-size: 0.95rem; padding: 12px; margin-top: 6px;">
                ${renderIcon('messageCircle', { size: 18, color: '#FFFFFF' })} Send WhatsApp Confirmation
              </button>
            `}
          ` : ''}
          <button type="button" id="btn-m-next-booking" class="${hasPhone && !alreadySent ? 'btn btn-outline' : 'btn btn-gold'}" style="width: 100%; justify-content: center; font-size: 0.95rem; padding: 12px; margin-top: 6px;">
            Next Garment
          </button>
        `;

        const btnWa = overlayActions.querySelector('#btn-m-wa-booking');
        if (btnWa) {
          btnWa.addEventListener('click', async () => {
            btnWa.disabled = true;
            btnWa.innerHTML = `${renderIcon('refreshCw', { size: 16 })} Sending...`;
            try {
              const res = await api.sendWhatsAppBill(article.id);
              if (res && res.success) {
                showToast('✓ WhatsApp E-Bill sent to customer!', 'success');
              } else {
                showToast(res.error || res.message || 'Could not send WhatsApp message', 'warning');
              }
            } catch (e) {
              showToast('Failed to send WhatsApp message', 'warning');
            }
            handleDone();
          });
        }

        const btnMNext = overlayActions.querySelector('#btn-m-next-booking');
        if (btnMNext) btnMNext.addEventListener('click', handleDone);
      }

      if (!hasPhone) {
        setTimeout(handleDone, 1400);
      }
    },

    hide() {
      if (overlay) overlay.style.display = 'none';
    },
  };
}
