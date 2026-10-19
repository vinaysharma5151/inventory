/**
 * mobileSubmitOverlay.js — Booking Submission Progress & Post-Booking Actions.
 * 
 * WHY:
 * Isolates the full-screen progress state, saving animation, and post-booking
 * options (one-tap WhatsApp e-bill dispatch and next-garment reset).
 */

import { api } from '../../api.js';
import { renderIcon } from '../../icons.js';
import { showToast } from '../../toast.js';

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

      const rawPhone = article.customer_phone ? article.customer_phone.trim() : '';

      const handleDone = () => {
        overlay.style.display = 'none';
        if (overlayActions) {
          overlayActions.style.display = 'none';
          overlayActions.innerHTML = '';
        }
        if (onDone) onDone();
      };

      if (rawPhone && overlayActions) {
        overlayActions.style.display = 'flex';
        overlayActions.innerHTML = `
          <button type="button" id="btn-m-send-wa" class="btn btn-whatsapp" style="width: 100%; justify-content: center; font-size: 0.95rem; padding: 12px; margin-top: 6px;">
            ${renderIcon('messageCircle', { size: 18, color: '#fff' })} Send WhatsApp E-Bill
          </button>
          <button type="button" id="btn-m-next-booking" class="btn btn-outline" style="width: 100%; justify-content: center; font-size: 0.88rem; padding: 9px;">
            Next Garment
          </button>
        `;

        const btnMNext = overlayActions.querySelector('#btn-m-next-booking');
        const btnMWa = overlayActions.querySelector('#btn-m-send-wa');

        if (btnMNext) btnMNext.addEventListener('click', handleDone);

        if (btnMWa) {
          btnMWa.addEventListener('click', async () => {
            btnMWa.disabled = true;
            btnMWa.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Sending...`;

            try {
              const waRes = await api.sendWhatsAppBill(article.id);
              if (waRes.success) {
                showToast('WhatsApp e-bill sent!', 'success');
                handleDone();
              } else {
                const cleanPhone = rawPhone.replace(/\D/g, '');
                const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                const ebillMsg = waRes.ebill_text || `✨ E-Bill for Article ${article.article_id} from Studio`;
                const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(ebillMsg)}`;
                window.open(waUrl, '_blank');
                handleDone();
              }
            } catch (_) {
              const cleanPhone = rawPhone.replace(/\D/g, '');
              const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
              const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent('✨ Booking E-Bill for Article ' + article.article_id)}`;
              window.open(waUrl, '_blank');
              handleDone();
            }
          });
        }
      } else {
        setTimeout(handleDone, 1200);
      }
    },

    hide() {
      if (overlay) overlay.style.display = 'none';
    },
  };
}
