/**
 * mobileSubmitOverlay.js — Booking Submission Progress & Post-Booking Actions.
 * 
 * WHY:
 * Isolates the full-screen progress state, saving animation, and post-booking
 * options (one-tap WhatsApp e-bill dispatch and next-garment reset).
 */

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

      if (overlayActions) {
        overlayActions.style.display = 'flex';
        overlayActions.innerHTML = `
          <button type="button" id="btn-m-next-booking" class="btn btn-gold" style="width: 100%; justify-content: center; font-size: 0.95rem; padding: 12px; margin-top: 6px;">
            Next Garment
          </button>
        `;

        const btnMNext = overlayActions.querySelector('#btn-m-next-booking');
        if (btnMNext) btnMNext.addEventListener('click', handleDone);
      }

      setTimeout(handleDone, 1400);
    },

    hide() {
      if (overlay) overlay.style.display = 'none';
    },
  };
}
