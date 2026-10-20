/**
 * mobileBookingView.js — Mobile Booking Studio & Camera Capture View Controller (Vanilla JS)
 * 
 * WHY:
 * Orchestrates mobile showroom camera booking by assembling modular subcomponents:
 * - ./mobile/mobileCamera.js: WebRTC camera viewfinder, resolution capping, and fallback
 * - ./mobile/paymentCalculator.js: Live rental balance math, presets, and visual status
 * - ./mobile/mobileSubmitOverlay.js: Live sync progress and WhatsApp e-bill dispatch
 */

import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { initMobileCamera } from './mobile/mobileCamera.js';
import { initPaymentCalculator } from './mobile/paymentCalculator.js';
import { initSubmitOverlay } from './mobile/mobileSubmitOverlay.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const getISODate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function createMobileBookingView(containerEl, state) {
  let shopName = state.shopName || 'Mehak Bridal Studio';
  let category = 'Bridal';
  let pickupDate = getISODate(2);
  let returnDate = getISODate(5);

  let cameraController = null;
  let paymentController = null;
  let overlayController = null;

  const renderMain = () => {
    containerEl.innerHTML = `
      <div class="mobile-app-shell">
        <!-- Top Sticky Mobile Bar -->
        <header class="mobile-top-bar">
          <div class="mobile-brand-group">
            <div class="mobile-brand-icon" title="${escapeHtml(shopName)}">
              <img src="/assets/logo.png" alt="${escapeHtml(shopName)}" class="mobile-brand-logo-img" />
            </div>
            <div>
              <span class="mobile-brand-name font-serif">${escapeHtml(shopName)}</span>
              <div class="mobile-sync-chip">
                <span class="live-dot"></span>
                <span>Studio Live Sync</span>
              </div>
            </div>
          </div>
        </header>

        <!-- Main Content -->
        <main class="mobile-content-body">
          <!-- 1. CAMERA VIEWFINDER -->
          <div class="camera-viewfinder-card" id="camera-card-wrap">
            <div class="viewfinder-frame" id="camera-frame">
              <div id="flash-effect-el" class="flash-screen" style="display: none;"></div>

              <div class="video-container" id="video-container">
                <video id="camera-video" class="live-video" playsinline autoplay muted></video>
                <div class="corner-guide corner-tl"></div>
                <div class="corner-guide corner-tr"></div>
                <div class="corner-guide corner-bl"></div>
                <div class="corner-guide corner-br"></div>
                <div class="frame-overlay-hint">Studio Camera</div>

                <div class="viewfinder-floating-controls">
                  <button type="button" id="btn-flip-camera" class="floating-tool-btn" title="Flip Camera">
                    ${renderIcon('rotateCw', { size: 20 })}
                  </button>
                  <button type="button" id="btn-shutter" class="main-shutter-btn" title="Take Photo">
                    <div class="shutter-inner-ring"></div>
                  </button>
                  <button type="button" id="btn-open-gallery" class="floating-tool-btn" title="Select Photo / Native Camera">
                    ${renderIcon('camera', { size: 20 })}
                  </button>
                </div>
              </div>

              <div class="preview-container" id="preview-container" style="display: none;">
                <img id="preview-img" class="preview-image" alt="Captured Lehenga" />
                <button type="button" id="btn-retake-photo" class="btn btn-outline btn-sm retake-button">
                  Retake Photo
                </button>
              </div>

              <div class="camera-fallback-screen" id="camera-fallback-screen" style="display: none;">
                <div class="fallback-inner">
                  <div class="fallback-cam-icon">${renderIcon('camera', { size: 36 })}</div>
                  <h4 class="fallback-headline">Camera Capture</h4>
                  <p class="fallback-sub">Tap below to snap a lehenga photo using your phone's native camera</p>
                  <button type="button" id="btn-fallback-trigger" class="btn btn-gold btn-sm fallback-cta">
                    Open Camera
                  </button>
                </div>
              </div>

              <canvas id="camera-canvas" style="display: none;"></canvas>
              <input type="file" id="camera-native-input" accept="image/*" capture="environment" style="display: none;" />
            </div>
          </div>

          <!-- 2. ARTICLE DATES & ID -->
          <div class="mobile-form-section">
            <div class="mobile-grid-2">
              <div class="mobile-info-pill pickup-pill">
                <label class="pill-label" for="m-pickup-date">🗓 Pickup Date</label>
                <input type="date" id="m-pickup-date" class="date-native-input" value="${pickupDate}" min="${getISODate(0)}" />
              </div>

              <div class="mobile-info-pill return-pill">
                <label class="pill-label" for="m-return-date">🔄 Return Date</label>
                <input type="date" id="m-return-date" class="date-native-input return-input" value="${returnDate}" min="${pickupDate}" />
              </div>
            </div>

            <!-- Quick Return Date Chips -->
            <div class="quick-date-chips-wrap">
              <span class="chips-hint-label">Return in:</span>
              <div class="quick-date-chips">
                <button type="button" class="date-chip" data-offset="2">+2 Days</button>
                <button type="button" class="date-chip" data-offset="3">+3 Days</button>
                <button type="button" class="date-chip" data-offset="5">+5 Days</button>
                <button type="button" class="date-chip" data-offset="7">+1 Week</button>
              </div>
            </div>

            <!-- Article ID -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label class="input-label" for="m-article-id">Article ID (Sequence 0001 - 1000)</label>
                <span style="font-size: 0.74rem; color: #8C6A2A; font-weight: 600;">Sequence Order</span>
              </div>
              <div class="id-input-wrap">
                <input type="text" id="m-article-id" class="input-field font-mono" value="0001" placeholder="0001" required />
                <button type="button" id="btn-refresh-mid" class="btn btn-outline id-random-btn" title="Refresh Next ID">
                  ${renderIcon('rotateCw', { size: 18 })}
                </button>
              </div>
            </div>

            <!-- Category Chips -->
            <div>
              <label class="input-label">Collection Category</label>
              <div class="category-chips-row" id="m-category-chips">
                <button type="button" class="category-chip active" data-cat="Bridal">Bridal</button>
                <button type="button" class="category-chip" data-cat="Reception">Reception</button>
                <button type="button" class="category-chip" data-cat="Jewellery">Jewellery</button>
                <button type="button" class="category-chip" data-cat="Casual">Casual</button>
              </div>
            </div>

            <!-- 3. PAYMENT CALCULATOR -->
            <div class="payment-calc-card">
              <div class="payment-calc-header">
                <div class="payment-calc-title">
                  <span class="payment-calc-icon-svg">${renderIcon('calculator', { size: 16 })}</span>
                  <span>Payment Breakdown</span>
                </div>
                <span id="m-calc-badge" class="badge badge-neutral">Enter Price</span>
              </div>

              <div class="payment-calc-grid">
                <div>
                  <label class="input-label" for="m-price-input">Article Price (₹) *</label>
                  <div class="currency-input-container">
                    <span class="currency-symbol-prefix">₹</span>
                    <input type="number" id="m-price-input" min="0" step="100" class="input-field" placeholder="e.g. 55000" required />
                  </div>
                </div>

                <div>
                  <label class="input-label" for="m-advance-input">Advance Paid (₹)</label>
                  <div class="currency-input-container">
                    <span class="currency-symbol-prefix">₹</span>
                    <input type="number" id="m-advance-input" min="0" step="100" class="input-field" placeholder="0" />
                  </div>
                </div>
              </div>

              <div class="advance-preset-row">
                <span class="preset-label">Quick Set:</span>
                <button type="button" class="preset-btn" data-pct="0">₹0 (Full Due)</button>
                <button type="button" class="preset-btn" data-pct="25">25%</button>
                <button type="button" class="preset-btn" data-pct="50">50% Adv</button>
                <button type="button" class="preset-btn preset-btn-full" data-pct="100">100% (Full Pay)</button>
              </div>

              <div id="m-balance-box" class="balance-result-box">
                <div class="balance-result-left">
                  <span class="balance-caption">Amount Left to Pay</span>
                  <span id="m-balance-sub" class="balance-sub">Enter price to calculate balance</span>
                </div>
                <div class="balance-result-right">
                  <span class="balance-currency">₹</span>
                  <span id="m-balance-num" class="balance-number">0</span>
                </div>
              </div>
            </div>

            <!-- 4. CUSTOMER INFORMATION -->
            <div class="customer-details-card">
              <div>
                <label class="input-label" for="m-cust-name">Customer Full Name *</label>
                <div class="input-with-icon">
                  <span class="field-icon">${renderIcon('user', { size: 16 })}</span>
                  <input type="text" id="m-cust-name" class="input-field" placeholder="e.g. Ananya Sharma" required />
                </div>
              </div>

              <div>
                <label class="input-label" for="m-cust-phone">Customer Phone Number</label>
                <div class="input-with-icon">
                  <span class="field-icon">${renderIcon('phone', { size: 16 })}</span>
                  <input type="tel" id="m-cust-phone" class="input-field font-mono" placeholder="e.g. 98765 43210" />
                </div>
              </div>

              <div>
                <label class="input-label" for="m-cust-addr">Address / Fitting Notes</label>
                <div class="input-with-icon">
                  <span class="field-icon top-align">${renderIcon('mapPin', { size: 16 })}</span>
                  <textarea id="m-cust-addr" rows="2" class="input-field" placeholder="Delivery address, city or alteration notes..."></textarea>
                </div>
              </div>
            </div>
          </div>
        </main>

        <!-- Sticky Bottom Submit Bar -->
        <footer class="mobile-bottom-bar">
          <button type="button" id="btn-submit-booking" class="btn btn-gold btn-lg submit-booking-btn" disabled>
            ${renderIcon('send', { size: 18 })}
            <span id="m-submit-label">Take Garment Photo</span>
          </button>
        </footer>

        <!-- Progress Overlay -->
        <div id="upload-overlay" class="upload-progress-overlay" style="display: none;">
          <div class="upload-progress-card">
            <div id="upload-overlay-icon">
              ${renderIcon('loader', { size: 52, color: '#8C6A2A', className: 'spinner-icon' })}
            </div>
            <h3 id="upload-overlay-title" class="upload-progress-title">Syncing Booking...</h3>
            <p id="upload-overlay-sub" class="upload-progress-sub">Saving booking &amp; syncing with laptop...</p>
            <div id="upload-overlay-actions" style="margin-top: 14px; display: none; flex-direction: column; gap: 8px; width: 100%;"></div>
          </div>
        </div>
      </div>
    `;

    // Elements
    const pickupInput = containerEl.querySelector('#m-pickup-date');
    const returnInput = containerEl.querySelector('#m-return-date');
    const articleIdInput = containerEl.querySelector('#m-article-id');
    const refreshIdBtn = containerEl.querySelector('#btn-refresh-mid');
    const custNameInput = containerEl.querySelector('#m-cust-name');
    const custPhoneInput = containerEl.querySelector('#m-cust-phone');
    const custAddrInput = containerEl.querySelector('#m-cust-addr');
    const priceInput = containerEl.querySelector('#m-price-input');
    const submitBtn = containerEl.querySelector('#btn-submit-booking');
    const submitLabel = containerEl.querySelector('#m-submit-label');

    // Initialize Subcomponents
    cameraController = initMobileCamera(containerEl, {
      onPhotoCaptured: () => updateSubmitState(),
      onPhotoCleared: () => updateSubmitState(),
    });
    cameraController.start();

    paymentController = initPaymentCalculator(containerEl, {
      onPaymentChange: () => updateSubmitState(),
    });

    overlayController = initSubmitOverlay(containerEl);

    // Fetch Next Sequential ID
    const fetchNextId = async () => {
      try {
        const res = await api.getNextArticleId();
        if (res.success && res.next_id) {
          articleIdInput.value = res.next_id;
        }
      } catch (_) {
        articleIdInput.value = '0001';
      }
    };
    fetchNextId();
    refreshIdBtn.addEventListener('click', fetchNextId);

    // Date changes
    pickupInput.addEventListener('change', (e) => {
      pickupDate = e.target.value;
      if (pickupDate && returnDate && returnDate < pickupDate) {
        const d = new Date(pickupDate);
        d.setDate(d.getDate() + 3);
        returnDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        returnInput.value = returnDate;
      }
    });

    returnInput.addEventListener('change', (e) => {
      returnDate = e.target.value;
    });

    // Quick Return Date Chips
    containerEl.querySelectorAll('.date-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const offset = parseInt(btn.dataset.offset, 10) || 3;
        const base = pickupDate ? new Date(pickupDate) : new Date();
        base.setDate(base.getDate() + offset);
        returnDate = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
        returnInput.value = returnDate;
      });
    });

    // Category Chips
    containerEl.querySelectorAll('#m-category-chips .category-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        containerEl.querySelectorAll('#m-category-chips .category-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        category = btn.dataset.cat;
      });
    });

    custNameInput.addEventListener('input', () => updateSubmitState());

    // Validation
    const updateSubmitState = () => {
      const hasPhoto = Boolean(cameraController?.getPhotoBlob());
      const hasPrice = (parseFloat(priceInput.value) || 0) > 0;
      const hasCustomer = custNameInput.value.trim().length > 0;

      if (!hasPhoto) {
        submitLabel.textContent = 'Take Garment Photo';
        submitBtn.disabled = true;
      } else if (!hasPrice) {
        submitLabel.textContent = 'Enter Article Price';
        submitBtn.disabled = true;
      } else if (!hasCustomer) {
        submitLabel.textContent = 'Enter Customer Name';
        submitBtn.disabled = true;
      } else {
        submitLabel.textContent = 'Save & Sync to Laptop →';
        submitBtn.disabled = false;
      }
    };

    // Reset Form for next booking
    const resetForm = () => {
      cameraController?.reset();
      paymentController?.reset();
      custNameInput.value = '';
      custPhoneInput.value = '';
      custAddrInput.value = '';
      fetchNextId();
      updateSubmitState();
    };

    // Submit Booking
    submitBtn.addEventListener('click', async () => {
      const { price: p, advance: adv, balance: bal } = paymentController.getValues();
      const name = custNameInput.value.trim();
      const photoBlob = cameraController?.getPhotoBlob();

      if (!photoBlob || p <= 0 || !name) return;

      const finalId = articleIdInput.value.trim().toUpperCase() || '0001';

      overlayController.showProgress();

      const formData = new FormData();
      formData.append('photo', photoBlob, `${finalId}.jpg`);
      formData.append('article_id', finalId);
      formData.append('title', category || 'Bridal');
      formData.append('category', category);
      formData.append('price', p);
      formData.append('advance_amount', adv);
      formData.append('balance_amount', bal);
      formData.append('customer_name', name);
      formData.append('customer_phone', custPhoneInput.value.trim());
      formData.append('customer_address', custAddrInput.value.trim());
      formData.append('pickup_date', pickupInput.value);
      formData.append('return_date', returnInput.value);
      formData.append('booking_date', getISODate(0));
      formData.append('source', 'phone');
      formData.append('salesman_name', 'Studio');

      try {
        const res = await api.uploadArticle(formData);
        if (res.success) {
          if (state.onBookingCreated) state.onBookingCreated(res.article);
          overlayController.showSuccess(res.article, resetForm);
        } else {
          alert(res.message || 'Failed to submit booking');
          overlayController.hide();
        }
      } catch (err) {
        alert('Upload failed: ' + err.message);
        overlayController.hide();
      }
    });

    updateSubmitState();
  };

  renderMain();

  return {
    destroy() {
      if (cameraController) cameraController.destroy();
    },
    updateShopName(newName) {
      if (newName) {
        shopName = newName;
        const brandEl = containerEl.querySelector('.mobile-brand-name');
        if (brandEl) brandEl.textContent = newName;
      }
    }
  };
}
