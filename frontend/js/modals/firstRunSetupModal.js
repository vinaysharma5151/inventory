/**
 * firstRunSetupModal.js — First-Time Studio Setup Wizard (Frontend)
 *
 * WHY:
 * When the app is opened for the very first time (fresh install / factory reset),
 * this full-screen wizard captures the shop name and logo from the new shop owner.
 * The main dashboard is completely locked until the setup password is verified.
 *
 * Flow:
 * 1. User uploads their shop logo (optional, can skip).
 * 2. User enters their boutique / shop name.
 * 3. User enters the setup password ("open it") to unlock.
 * 4. Backend saves logo to uploads/shop_logo.png and shop_name to DB settings.
 * 5. onUnlock callback is fired — app boots into the main dashboard.
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
 * Renders the full-screen First-Run Setup Wizard into the given container.
 *
 * @param {HTMLElement} container - Root DOM element (#app-root)
 * @param {object} options
 * @param {string}   [options.currentName='']             - Pre-filled shop name (empty for fresh install)
 * @param {string}   [options.currentLogoUrl]             - Existing logo URL (if any)
 * @param {function} options.onUnlock                     - Callback(shopName, logoUrl) after successful setup
 */
export function renderFirstRunGatekeeper(container, { currentName = '', currentLogoUrl = '/assets/logo.png', onUnlock } = {}) {
  // Track selected logo file in closure
  let selectedLogoFile = null;
  let previewUrl = null;

  container.innerHTML = `
    <div id="setup-wizard-root" style="
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at 50% 0%, #2D050B 0%, #1a0308 40%, #0e0105 100%);
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <!-- Stars / decorative dots -->
      <div style="position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0;">
        <div style="position:absolute;top:10%;left:15%;width:2px;height:2px;background:#D4A017;border-radius:50%;opacity:0.6;animation:twinkle 3s ease-in-out infinite;"></div>
        <div style="position:absolute;top:25%;left:70%;width:3px;height:3px;background:#D4A017;border-radius:50%;opacity:0.4;animation:twinkle 2s ease-in-out infinite 0.7s;"></div>
        <div style="position:absolute;top:70%;left:8%;width:2px;height:2px;background:#D4A017;border-radius:50%;opacity:0.5;animation:twinkle 4s ease-in-out infinite 1.2s;"></div>
        <div style="position:absolute;top:60%;left:85%;width:2px;height:2px;background:#D4A017;border-radius:50%;opacity:0.4;animation:twinkle 3.5s ease-in-out infinite 0.3s;"></div>
        <div style="position:absolute;top:85%;left:45%;width:3px;height:3px;background:#D4A017;border-radius:50%;opacity:0.3;animation:twinkle 2.8s ease-in-out infinite 1.8s;"></div>
      </div>

      <style>
        @keyframes twinkle { 0%,100%{opacity:.2} 50%{opacity:.8} }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        #setup-card { animation: slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .setup-step { display:none; }
        .setup-step.active { display:block; animation: fadeIn 0.25s ease-out; }
        #logo-drop-zone { transition: border-color 0.2s, background 0.2s; }
        #logo-drop-zone.drag-over { border-color: #D4A017 !important; background: rgba(212,160,23,0.08) !important; }
        .setup-input {
          width: 100%; box-sizing: border-box;
          background: rgba(255,255,255,0.06);
          border: 1.5px solid rgba(212,160,23,0.3);
          border-radius: 10px;
          color: #F5E6C8;
          font-size: 15px;
          padding: 12px 16px;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .setup-input::placeholder { color: rgba(245,230,200,0.35); }
        .setup-input:focus { border-color: #D4A017; background: rgba(212,160,23,0.06); }
        .setup-btn-gold {
          width: 100%; padding: 13px; font-size: 15px; font-weight: 700;
          background: linear-gradient(135deg, #C9920A, #D4A017 50%, #B07D0A);
          color: #1a0308; border: none; border-radius: 10px; cursor: pointer;
          letter-spacing: 0.04em; display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: filter 0.15s, transform 0.1s;
        }
        .setup-btn-gold:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .setup-btn-gold:active:not(:disabled) { transform: translateY(0); filter: brightness(0.95); }
        .setup-btn-gold:disabled { opacity: 0.6; cursor: not-allowed; }
        .setup-btn-ghost {
          width: 100%; padding: 10px; font-size: 13px; font-weight: 500;
          background: transparent; color: rgba(245,230,200,0.5);
          border: 1px solid rgba(245,230,200,0.15); border-radius: 10px; cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .setup-btn-ghost:hover { border-color: rgba(212,160,23,0.4); color: rgba(245,230,200,0.8); }
        .progress-dot { width:8px;height:8px;border-radius:50%;background:rgba(212,160,23,0.25);transition:background 0.3s; }
        .progress-dot.done { background:#D4A017; }
      </style>

      <div id="setup-card" style="
        width: 100%; max-width: 460px;
        background: rgba(30, 5, 10, 0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(212, 160, 23, 0.25);
        border-radius: 20px;
        box-shadow: 0 40px 100px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,160,23,0.08);
        overflow: hidden;
        position: relative; z-index: 1;
      ">

        <!-- Top Header -->
        <div style="background:linear-gradient(135deg,#4A0E17,#2D050B); padding:28px 28px 22px; text-align:center;">
          <div style="font-size:28px; margin-bottom:8px;">✨</div>
          <h1 style="margin:0 0 6px; font-size:20px; font-weight:800; color:#F5E6C8; letter-spacing:0.02em;">
            Welcome! Let's Set Up Your Store
          </h1>
          <p style="margin:0; font-size:13px; color:rgba(245,230,200,0.65); line-height:1.5;">
            This runs once. Personalise your store before opening the app.
          </p>
          <!-- Progress -->
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;">
            <div class="progress-dot done" id="pdot-1"></div>
            <div style="height:1px;width:32px;background:rgba(212,160,23,0.2);"></div>
            <div class="progress-dot" id="pdot-2"></div>
            <div style="height:1px;width:32px;background:rgba(212,160,23,0.2);"></div>
            <div class="progress-dot" id="pdot-3"></div>
          </div>
        </div>

        <!-- Steps Container -->
        <div style="padding:26px 28px;">

          <!-- ===== STEP 1: LOGO ===== -->
          <div class="setup-step active" id="step-1">
            <div style="margin-bottom:20px;">
              <h2 style="margin:0 0 6px;font-size:16px;font-weight:700;color:#F5E6C8;">Upload Your Shop Logo</h2>
              <p style="margin:0;font-size:13px;color:rgba(245,230,200,0.55);line-height:1.5;">
                Your logo appears on receipts, tags & all screens. You can skip this and add it later.
              </p>
            </div>

            <!-- Drop zone -->
            <div id="logo-drop-zone" style="
              border: 2px dashed rgba(212,160,23,0.35);
              border-radius: 14px;
              padding: 32px 20px;
              text-align: center;
              cursor: pointer;
              margin-bottom: 16px;
              position: relative;
            ">
              <input type="file" id="logo-file-input" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;" />
              <div id="logo-preview-wrap">
                <div style="font-size:36px;margin-bottom:10px;">🖼️</div>
                <div style="font-size:14px;font-weight:600;color:#D4A017;margin-bottom:4px;">Click or drag your logo here</div>
                <div style="font-size:12px;color:rgba(245,230,200,0.4);">PNG, JPG, SVG • Max 5 MB</div>
              </div>
              <div id="logo-preview-img-wrap" style="display:none;">
                <img id="logo-preview-img" src="" alt="Logo Preview" style="max-height:100px;max-width:100%;border-radius:10px;object-fit:contain;" />
                <div style="margin-top:8px;font-size:12px;color:rgba(245,230,200,0.5);" id="logo-preview-name"></div>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;">
              <button class="setup-btn-gold" id="step1-next-btn" type="button">
                Continue →
              </button>
              <button class="setup-btn-ghost" id="step1-skip-btn" type="button">
                Skip — I'll add a logo later
              </button>
            </div>
          </div>

          <!-- ===== STEP 2: SHOP NAME ===== -->
          <div class="setup-step" id="step-2">
            <div style="margin-bottom:20px;">
              <h2 style="margin:0 0 6px;font-size:16px;font-weight:700;color:#F5E6C8;">What's Your Shop Name?</h2>
              <p style="margin:0;font-size:13px;color:rgba(245,230,200,0.55);line-height:1.5;">
                This name will appear on all client invoices, SMS bills, and mobile screens.
              </p>
            </div>

            <div style="margin-bottom:20px;">
              <label style="display:block;font-size:12px;font-weight:700;color:rgba(245,230,200,0.7);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">
                Shop / Boutique Name *
              </label>
              <input
                type="text"
                id="gate-shop-name"
                class="setup-input"
                value="${escapeHtml(currentName)}"
                placeholder="e.g. Royal Rentals, City Collections…"
                maxlength="80"
                required
                autocomplete="organization"
              />
              <div style="font-size:11.5px;color:rgba(245,230,200,0.35);margin-top:6px;">
                You can change this anytime from Settings → Shop Name.
              </div>
            </div>

            <div id="step2-error" style="display:none;background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.4);border-radius:8px;padding:10px 14px;font-size:13px;color:#FCA5A5;margin-bottom:14px;">
              Please enter your shop name to continue.
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;">
              <button class="setup-btn-gold" id="step2-next-btn" type="button">
                Continue →
              </button>
              <button class="setup-btn-ghost" id="step2-back-btn" type="button">
                ← Back
              </button>
            </div>
          </div>

          <!-- ===== STEP 3: PASSWORD ===== -->
          <div class="setup-step" id="step-3">
            <!-- Logo + Name preview -->
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;padding:14px;background:rgba(212,160,23,0.06);border:1px solid rgba(212,160,23,0.18);border-radius:12px;">
              <img id="confirm-logo" src="" alt="Logo" style="width:48px;height:48px;border-radius:10px;object-fit:contain;background:#fff;padding:4px;" />
              <div>
                <div style="font-size:12px;font-weight:700;color:rgba(245,230,200,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Your Store</div>
                <div id="confirm-shop-name" style="font-size:16px;font-weight:800;color:#F5E6C8;"></div>
              </div>
            </div>

            <div style="margin-bottom:20px;">
              <h2 style="margin:0 0 6px;font-size:16px;font-weight:700;color:#F5E6C8;">Enter Setup Password</h2>
              <p style="margin:0;font-size:13px;color:rgba(245,230,200,0.55);line-height:1.5;">
                Enter the one-time unlock password to initialize your store.
              </p>
            </div>

            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:12px;font-weight:700;color:rgba(245,230,200,0.7);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">
                Setup Password *
              </label>
              <input
                type="password"
                id="gate-password"
                class="setup-input"
                placeholder="Enter password to unlock"
                required
                autocomplete="current-password"
              />
              <div style="font-size:11.5px;color:rgba(245,230,200,0.35);margin-top:6px;">
                Hint: <strong style="color:rgba(212,160,23,0.7);">open it</strong>
              </div>
            </div>

            <div id="gatekeeper-error" style="display:none;background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.4);border-radius:8px;padding:10px 14px;font-size:13px;color:#FCA5A5;margin-bottom:14px;">
              <span id="gatekeeper-error-text">Incorrect password. Enter "open it" to unlock.</span>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;">
              <button class="setup-btn-gold" id="gate-submit-btn" type="button">
                ✨ Unlock &amp; Open My Store
              </button>
              <button class="setup-btn-ghost" id="step3-back-btn" type="button">
                ← Back
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  // ── Element refs ──
  const dropZone        = container.querySelector('#logo-drop-zone');
  const fileInput       = container.querySelector('#logo-file-input');
  const previewWrap     = container.querySelector('#logo-preview-wrap');
  const previewImgWrap  = container.querySelector('#logo-preview-img-wrap');
  const previewImg      = container.querySelector('#logo-preview-img');
  const previewName     = container.querySelector('#logo-preview-name');
  const step1NextBtn    = container.querySelector('#step1-next-btn');
  const step1SkipBtn    = container.querySelector('#step1-skip-btn');

  const shopNameInput   = container.querySelector('#gate-shop-name');
  const step2NextBtn    = container.querySelector('#step2-next-btn');
  const step2BackBtn    = container.querySelector('#step2-back-btn');
  const step2Error      = container.querySelector('#step2-error');

  const confirmLogo     = container.querySelector('#confirm-logo');
  const confirmName     = container.querySelector('#confirm-shop-name');
  const passwordInput   = container.querySelector('#gate-password');
  const submitBtn       = container.querySelector('#gate-submit-btn');
  const step3BackBtn    = container.querySelector('#step3-back-btn');
  const errorBox        = container.querySelector('#gatekeeper-error');
  const errorText       = container.querySelector('#gatekeeper-error-text');

  const dots = [
    container.querySelector('#pdot-1'),
    container.querySelector('#pdot-2'),
    container.querySelector('#pdot-3'),
  ];

  let currentStep = 1;

  // ── Step navigation ──
  function goToStep(n) {
    container.querySelectorAll('.setup-step').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === n);
    });
    dots.forEach((d, i) => d.classList.toggle('done', i < n));
    currentStep = n;

    if (n === 3) {
      // Fill confirm panel
      confirmLogo.src = previewUrl || currentLogoUrl;
      confirmName.textContent = shopNameInput.value.trim() || 'Rental Studio';
      setTimeout(() => passwordInput?.focus(), 120);
    }
    if (n === 2) {
      setTimeout(() => shopNameInput?.focus(), 120);
    }
  }

  // ── Logo drag-and-drop ──
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) applyLogoFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) applyLogoFile(file);
  });

  function applyLogoFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('Logo file is too large (max 5 MB).', 'error');
      return;
    }
    selectedLogoFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      previewUrl = ev.target.result;
      previewImg.src = previewUrl;
      previewName.textContent = file.name;
      previewWrap.style.display = 'none';
      previewImgWrap.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  // ── Step 1 actions ──
  step1NextBtn.addEventListener('click', () => goToStep(2));
  step1SkipBtn.addEventListener('click', () => { selectedLogoFile = null; previewUrl = null; goToStep(2); });

  // ── Step 2 actions ──
  step2NextBtn.addEventListener('click', () => {
    const name = shopNameInput.value.trim();
    if (!name) { step2Error.style.display = 'block'; shopNameInput.focus(); return; }
    step2Error.style.display = 'none';
    goToStep(3);
  });
  step2BackBtn.addEventListener('click', () => goToStep(1));

  // ── Step 3 back ──
  step3BackBtn.addEventListener('click', () => goToStep(2));

  // ── Final submit ──
  submitBtn.addEventListener('click', async () => {
    const shopName = shopNameInput.value.trim() || 'Rental Studio';
    const password = passwordInput.value.trim();

    errorBox.style.display = 'none';

    if (!password) {
      errorText.textContent = 'Please enter the setup password to unlock.';
      errorBox.style.display = 'block';
      passwordInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span style="display:inline-block;width:16px;height:16px;border:2.5px solid rgba(26,3,8,0.3);border-top-color:#1a0308;border-radius:50%;animation:studioSpin .7s linear infinite;vertical-align:middle;"></span>&nbsp; Saving…`;

    try {
      const res = await api.completeSetup(shopName, password, selectedLogoFile);
      const configuredName = res.shop_name || shopName;
      const configuredLogo = res.logo_url || previewUrl || currentLogoUrl;

      localStorage.setItem('app_shop_name', configuredName);
      localStorage.setItem('app_logo_url', configuredLogo);

      showToast(`✨ Store unlocked! Welcome to ${configuredName}.`, 'success');

      if (onUnlock) {
        onUnlock(configuredName, configuredLogo);
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '✨ Unlock &amp; Open My Store';
      errorText.textContent = err.message || "Incorrect password. Enter 'open it' to unlock.";
      errorBox.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  // Allow Enter key on password field
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click();
  });

  // Set confirm logo placeholder immediately
  confirmLogo.src = currentLogoUrl;
}


/**
 * Backward compatibility alias for modal callers.
 */
export function openFirstRunSetupModal(options = {}) {
  const container = document.getElementById('app-root') || document.body;
  renderFirstRunGatekeeper(container, {
    currentName: options.currentName,
    currentLogoUrl: options.currentLogoUrl,
    onUnlock: options.onComplete || options.onUnlock
  });
}
