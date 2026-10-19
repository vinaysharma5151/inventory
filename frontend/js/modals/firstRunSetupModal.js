/**
 * firstRunSetupModal.js — First-Time Studio Setup Gatekeeper (Frontend)
 * 
 * WHY:
 * When the app is opened for the first time (or after factory reset),
 * this gatekeeper screen renders directly to protect the system.
 * The main application dashboard is completely hidden and locked until the user
 * enters the Boutique Name and the required setup password ("open it").
 */

import { api } from '../api.js';
import { showToast } from '../toast.js';
import { renderIcon } from '../icons.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders the full-screen First-Run Setup Gatekeeper into the given container.
 * Keeps the main application locked until the password "open it" is verified.
 * 
 * @param {HTMLElement} container - Root DOM element (#app-root)
 * @param {object} options - Configuration options
 * @param {string} [options.currentName='Mehak Bridal Studio'] - Current/default boutique name
 * @param {function} options.onUnlock - Callback invoked with configured shopName once unlocked
 */
export function renderFirstRunGatekeeper(container, { currentName = 'Mehak Bridal Studio', onUnlock } = {}) {
  container.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 30%, #FFFDF9 0%, #F5EFEB 100%); padding: 20px;">
      <div style="width: 100%; max-width: 460px; background: #FFFFFF; border-radius: 16px; border: 1px solid rgba(212, 160, 23, 0.25); box-shadow: 0 25px 65px -15px rgba(74, 14, 23, 0.15), 0 0 0 1px rgba(0,0,0,0.02); overflow: hidden; animation: fadeIn 0.25s ease-out;">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #4A0E17 0%, #2D050B 100%); padding: 28px 24px 24px; text-align: center; color: #FFFFFF; position: relative;">
          <div style="width: 58px; height: 58px; border-radius: 50%; background: rgba(212, 160, 23, 0.18); border: 1.5px solid var(--gold); color: var(--gold); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; box-shadow: 0 0 20px rgba(212, 160, 23, 0.3);">
            ${renderIcon('crown', { size: 28 })}
          </div>
          <h1 style="font-family: var(--font-serif); font-size: 22px; font-weight: 700; margin: 0 0 6px 0; letter-spacing: 0.01em; color: #FFFFFF;">
            Welcome to Your Bridal Suite
          </h1>
          <p style="font-size: 13px; color: rgba(255, 255, 255, 0.8); margin: 0; line-height: 1.45;">
            First-Time Studio Setup &amp; Security Gate
          </p>
        </div>

        <!-- Form Body -->
        <form id="first-run-gate-form" style="padding: 26px 24px; display: flex; flex-direction: column; gap: 18px;">
          
          <p style="font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.5; text-align: center;">
            This setup runs <strong>only once</strong>. Enter your boutique name and the setup password to initialize your showroom and unlock the app.
          </p>

          <!-- Error Alert Banner -->
          <div id="gatekeeper-error" style="display: none; background: #FDF2F2; border: 1px solid #F8B4B4; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #9B1C1C; align-items: center; gap: 8px;">
            <span style="display: inline-flex; flex-shrink: 0;">${renderIcon('alertCircle', { size: 16, color: '#9B1C1C' })}</span>
            <span id="gatekeeper-error-text">Incorrect password. Enter "open it" to unlock.</span>
          </div>

          <!-- Field 1: Shop Name -->
          <div>
            <label class="input-label" for="gate-shop-name" style="font-weight: 600; color: var(--text-primary); margin-bottom: 6px; display: block; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.5px;">
              Boutique / Shop Name *
            </label>
            <input
              type="text"
              id="gate-shop-name"
              class="input-field"
              value="${escapeHtml(currentName || 'Mehak Bridal Studio')}"
              placeholder="e.g. Mehak Bridal Studio or Vinay Collection"
              required
              style="width: 100%; box-sizing: border-box; font-size: 14.5px; padding: 11px 14px;"
            />
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 5px;">
              This name will appear on all client invoices, tags, and mobile screens.
            </div>
          </div>

          <!-- Field 2: Password -->
          <div>
            <label class="input-label" for="gate-password" style="font-weight: 600; color: var(--text-primary); margin-bottom: 6px; display: block; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.5px;">
              Setup Password *
            </label>
            <div style="position: relative;">
              <input
                type="password"
                id="gate-password"
                class="input-field"
                placeholder="Enter password to unlock"
                required
                autocomplete="current-password"
                style="width: 100%; box-sizing: border-box; font-size: 14.5px; padding: 11px 14px;"
              />
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 5px;">
              Hint: Enter <strong>open it</strong> to unlock your new installation.
            </div>
          </div>

          <!-- Actions -->
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 10px;">
            <button 
              type="submit" 
              id="gate-submit-btn" 
              class="btn btn-gold" 
              style="width: 100%; justify-content: center; padding: 13px; font-size: 14.5px; font-weight: 600; letter-spacing: 0.02em;"
            >
              ${renderIcon('check', { size: 16 })} Unlock &amp; Initialize Studio
            </button>
          </div>

        </form>

      </div>
    </div>
  `;

  const form = container.querySelector('#first-run-gate-form');
  const shopNameInput = container.querySelector('#gate-shop-name');
  const passwordInput = container.querySelector('#gate-password');
  const submitBtn = container.querySelector('#gate-submit-btn');
  const errorBox = container.querySelector('#gatekeeper-error');
  const errorText = container.querySelector('#gatekeeper-error-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const shopName = shopNameInput.value.trim() || 'Mehak Bridal Studio';
    const password = passwordInput.value.trim();

    // Hide previous error
    errorBox.style.display = 'none';

    if (!password) {
      errorText.textContent = "Please enter the setup password ('open it') to unlock.";
      errorBox.style.display = 'flex';
      passwordInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `${renderIcon('loader', { size: 16, className: 'spinner-icon' })} Verifying &amp; Unlocking...`;

    try {
      const res = await api.completeSetup(shopName, password);
      const configuredName = res.shop_name || shopName;

      localStorage.setItem('bhavi_shop_name', configuredName);
      showToast(`✨ Studio unlocked! Welcome to ${configuredName}.`, 'success');

      if (onUnlock) {
        onUnlock(configuredName);
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${renderIcon('check', { size: 16 })} Unlock &amp; Initialize Studio`;

      errorText.textContent = err.message || "Incorrect setup password. Please enter 'open it' to unlock.";
      errorBox.style.display = 'flex';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  // Automatically focus password field
  setTimeout(() => {
    if (passwordInput) passwordInput.focus();
  }, 150);
}

/**
 * Backward compatibility alias for modal callers.
 */
export function openFirstRunSetupModal(options = {}) {
  const container = document.getElementById('app-root') || document.body;
  renderFirstRunGatekeeper(container, {
    currentName: options.currentName,
    onUnlock: options.onComplete || options.onUnlock
  });
}
