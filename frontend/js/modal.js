/**
 * modal.js — Lightweight Vanilla Modal Manager
 * 
 * WHY:
 * Instead of keeping dozens of hidden modal nodes in memory, this helper mounts
 * a modal to a single container when opened, handles ESC key closing and backdrop clicks,
 * and removes it cleanly from the DOM when closed.
 */

let activeModalEl = null;

/**
 * Opens a modal element, appends it to the document, and sets up backdrop/escape dismissal.
 * @param {HTMLElement} modalEl - The modal container element (.modal-backdrop or content element)
 * @param {function|object} [optionsOrCb] - Optional callback or options object { onClose, preventBackdropClose, title, icon }
 * @returns {function} closeModal function
 */
export function openModal(modalEl, optionsOrCb = null) {
  closeModal(); // Close any currently open modal first

  let onCloseCallback = null;
  let preventBackdropClose = false;
  let title = '';

  if (typeof optionsOrCb === 'function') {
    onCloseCallback = optionsOrCb;
  } else if (optionsOrCb && typeof optionsOrCb === 'object') {
    onCloseCallback = optionsOrCb.onClose || null;
    preventBackdropClose = !!optionsOrCb.preventBackdropClose;
    title = optionsOrCb.title || '';
  }

  let backdrop = modalEl;
  if (!modalEl.classList.contains('modal-backdrop')) {
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    if (modalEl.style.maxWidth) {
      dialog.style.maxWidth = modalEl.style.maxWidth;
    }

    if (title) {
      const header = document.createElement('div');
      header.className = 'modal-header';
      header.innerHTML = `
        <div class="modal-title">
          <span>${title}</span>
        </div>
        ${!preventBackdropClose ? `
          <button type="button" class="btn btn-ghost btn-icon-only close-btn" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>` : ''}
      `;
      if (!preventBackdropClose) {
        header.querySelector('.close-btn')?.addEventListener('click', () => {
          closeModal();
          if (onCloseCallback) onCloseCallback();
        });
      }
      dialog.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.appendChild(modalEl);
    dialog.appendChild(body);
    backdrop.appendChild(dialog);
  }

  activeModalEl = backdrop;
  document.body.appendChild(backdrop);

  // Focus trap / focus management
  const focusable = backdrop.querySelector('input, button:not([disabled]), textarea, select');
  if (focusable) {
    setTimeout(() => focusable.focus(), 50);
  }

  // Backdrop click listener
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop && !preventBackdropClose) {
      closeModal();
      if (onCloseCallback) onCloseCallback();
    }
  });

  // ESC key dismissal
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !preventBackdropClose) {
      document.removeEventListener('keydown', handleKeyDown);
      closeModal();
      if (onCloseCallback) onCloseCallback();
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  backdrop._escHandler = handleKeyDown;

  return closeModal;
}

/**
 * Closes and removes the currently active modal from the document.
 */
export function closeModal() {
  if (activeModalEl) {
    if (activeModalEl._escHandler) {
      document.removeEventListener('keydown', activeModalEl._escHandler);
    }
    if (activeModalEl.parentNode) {
      activeModalEl.parentNode.removeChild(activeModalEl);
    }
    activeModalEl = null;
  }
}
