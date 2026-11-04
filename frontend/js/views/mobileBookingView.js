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
import { showToast } from '../toast.js';
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
  let shopName = state.shopName || 'Bridal Studio';
  let logoUrl = state.logoUrl || localStorage.getItem('app_logo_url') || '/assets/logo.png';
  let category = 'Bridal';
  let pickupDate = getISODate(2);
  let returnDate = getISODate(5);

  let cameraController = null;
  let paymentController = null;
  let overlayController = null;
  let editingArticle = null;

  const renderMain = () => {
    containerEl.innerHTML = `
      <div class="mobile-app-shell">
        <!-- Top Sticky Mobile Bar -->
        <header class="mobile-top-bar">
          <div class="mobile-brand-group">
            <div class="mobile-brand-icon" title="${escapeHtml(shopName)}">
              <img src="${logoUrl}" alt="${escapeHtml(shopName)}" class="mobile-brand-logo-img" onerror="this.src='/assets/logo.png'" />
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
          <!-- SEARCH ARTICLE TO EDIT -->
          <section class="mobile-search-card" aria-label="Search Article">
            <div class="mobile-search-header">
              <span class="mobile-search-title">
                ${renderIcon('search', { size: 14, color: '#8C6A2A' })}
                <span>Search Article ID</span>
              </span>
              <span class="mobile-search-subhint">Load &amp; Edit Previous Data</span>
            </div>
            <div class="mobile-search-input-wrap">
              <div class="mobile-search-icon-box">
                ${renderIcon('search', { size: 16, color: '#8C6A2A' })}
              </div>
              <input
                type="text"
                id="m-search-article-input"
                class="mobile-search-input font-mono"
                placeholder="Type Article ID (e.g. 0001)..."
                autocomplete="off"
                autocapitalize="characters"
              />
              <button type="button" id="btn-m-search-clear" class="mobile-search-clear-btn" style="display: none;" title="Clear Search">
                ${renderIcon('x', { size: 15 })}
              </button>
              <button type="button" id="btn-m-search-submit" class="btn btn-gold btn-sm mobile-search-action-btn">
                <span>Find</span>
              </button>
            </div>

            <!-- Customer / Person Name Result Box in Search Card -->
            <div id="m-search-name-result" class="mobile-search-name-box" style="display: none;">
              <span class="search-name-icon">${renderIcon('user', { size: 16, color: '#8C6A2A' })}</span>
              <div class="search-name-text-group">
                <span class="search-name-caption">Customer / Person Name</span>
                <span id="m-search-name-value" class="search-name-val"></span>
              </div>
            </div>

            <div id="m-search-status-bar" class="mobile-search-status-bar" style="display: none;"></div>
          </section>

          <!-- ACTIVE EDIT MODE BANNER -->
          <div id="m-edit-mode-banner" class="mobile-edit-mode-banner" style="display: none;">
            <div class="edit-banner-left">
              <span class="edit-banner-pulsing-icon">✏️</span>
              <div>
                <div class="edit-banner-title">
                  <span>Editing Article</span>
                  <span id="m-edit-banner-id" class="font-mono">#0001</span>
                  <span id="m-edit-banner-cust-badge" class="edit-banner-name-badge" style="display: none;"></span>
                </div>
                <div class="edit-banner-sub">Previous data loaded. Edit and save below.</div>
              </div>
            </div>
            <button type="button" id="btn-m-cancel-edit" class="btn btn-outline btn-xs edit-mode-cancel-btn" title="Cancel Editing">
              ${renderIcon('x', { size: 13 })}
              <span>Cancel Edit</span>
            </button>
          </div>

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
                  <button type="button" id="btn-open-gallery" class="floating-tool-btn" title="Choose from Phone Gallery">
                    ${renderIcon('image', { size: 20 })}
                  </button>
                </div>
              </div>

              <div class="preview-container" id="preview-container" style="display: none;">
                <img id="preview-img" class="preview-image" alt="Captured Lehenga" />
                <div class="preview-actions-bar">
                  <button type="button" id="btn-retake-photo" class="preview-action-btn" title="Retake with Camera">
                    ${renderIcon('camera', { size: 16 })}
                    <span>Retake Photo</span>
                  </button>
                  <button type="button" id="btn-preview-gallery" class="preview-action-btn preview-action-btn-gold" title="Choose from Phone Gallery">
                    ${renderIcon('image', { size: 16 })}
                    <span>From Gallery</span>
                  </button>
                </div>
              </div>

              <div class="camera-fallback-screen" id="camera-fallback-screen" style="display: none;">
                <div class="fallback-inner">
                  <div class="fallback-cam-icon">${renderIcon('camera', { size: 36 })}</div>
                  <h4 class="fallback-headline">Camera Capture</h4>
                  <p class="fallback-sub">Snap a lehenga photo or choose from your phone's photo gallery</p>
                  <div class="fallback-actions-row">
                    <button type="button" id="btn-fallback-trigger" class="btn btn-gold btn-sm fallback-cta">
                      ${renderIcon('camera', { size: 16 })}
                      <span>Open Camera</span>
                    </button>
                    <button type="button" id="btn-fallback-gallery" class="btn btn-outline btn-sm fallback-cta fallback-gallery-cta">
                      ${renderIcon('image', { size: 16 })}
                      <span>From Gallery</span>
                    </button>
                  </div>
                </div>
              </div>

              <canvas id="camera-canvas" style="display: none;"></canvas>
              <!-- Native Camera Input (forces phone camera app) -->
              <input type="file" id="camera-native-input" accept="image/*" capture="environment" style="display: none;" />
              <!-- Gallery Photo Picker (allows choosing from phone photos/gallery) -->
              <input type="file" id="camera-gallery-input" accept="image/*" style="display: none;" />
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
                <button type="button" id="btn-find-mid" class="btn btn-gold id-find-btn" title="Find Article &amp; Customer Name">
                  <span>Find</span>
                </button>
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
                <button type="button" class="category-chip" data-cat="Sherwani">Sherwani</button>
                <button type="button" class="category-chip" data-cat="Casual">Casual</button>
              </div>
            </div>

            <!-- Matching Jewellery Add-on -->
            <div class="jewellery-addon-box" id="m-jewel-box">
              <div class="jewellery-toggle-header" id="m-jewel-toggle-header">
                <div class="jewellery-header-title">
                  <span class="jewellery-icon-badge">💍</span>
                  <div>
                    <div class="jewellery-title-text">Matching Jewellery Set</div>
                    <div class="jewellery-sub-text">Add paired jewellery with this outfit</div>
                  </div>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="m-toggle-jewel" />
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="jewellery-body-content" id="m-jewel-body" style="display: none;">
                <label class="input-label" style="font-size: 0.74rem;">Select Jewellery Set Type</label>
                <div class="jewel-chips-grid" id="m-jewel-chips">
                  <button type="button" class="jewel-select-chip active" data-val="Full Bridal Set">Full Bridal Set</button>
                  <button type="button" class="jewel-select-chip" data-val="Choker & Necklace">Choker &amp; Necklace</button>
                  <button type="button" class="jewel-select-chip" data-val="Matha Patti & Nath">Matha Patti &amp; Nath</button>
                  <button type="button" class="jewel-select-chip" data-val="Earrings & Tikka">Earrings &amp; Tikka</button>
                  <button type="button" class="jewel-select-chip" data-val="Other / Custom">Other / Custom</button>
                </div>
                <div>
                  <input type="text" id="m-jewel-desc" class="input-field" placeholder="Jewellery description / set code..." value="Full Bridal Set" style="font-size: 0.85rem;" />
                </div>
                <div>
                  <label class="input-label" for="m-jewel-price" style="font-size: 0.74rem;">Jewellery Rental Extra Price (₹) *</label>
                  <div class="currency-input-container">
                    <span class="currency-symbol-prefix">₹</span>
                    <input type="number" id="m-jewel-price" min="0" step="100" class="input-field" placeholder="e.g. 3000" value="0" />
                  </div>
                  <div style="font-size: 0.72rem; color: #8C6A2A; margin-top: 3px;" id="m-jewel-calc-hint">
                    💡 Added to article price for total bill.
                  </div>
                </div>
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
                  <label class="input-label" for="m-price-input">Garment Price (₹) *</label>
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
                  <input type="tel" id="m-cust-phone" class="input-field font-mono" placeholder="e.g. 98765 43210" autocomplete="tel" />
                </div>
              </div>

              <div>
                <label class="input-label" for="m-cust-alt-phone">Alternative No. (Optional)</label>
                <div class="input-with-icon">
                  <span class="field-icon">${renderIcon('phone', { size: 16 })}</span>
                  <input type="tel" id="m-cust-alt-phone" class="input-field font-mono" placeholder="e.g. 98765 12345" autocomplete="tel" />
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
    const custAltPhoneInput = containerEl.querySelector('#m-cust-alt-phone');
    const custAddrInput = containerEl.querySelector('#m-cust-addr');
    const priceInput = containerEl.querySelector('#m-price-input');
    const submitBtn = containerEl.querySelector('#btn-submit-booking');
    const submitLabel = containerEl.querySelector('#m-submit-label');

    // Search & Edit Elements
    const searchInput = containerEl.querySelector('#m-search-article-input');
    const searchClearBtn = containerEl.querySelector('#btn-m-search-clear');
    const searchSubmitBtn = containerEl.querySelector('#btn-m-search-submit');
    const statusBar = containerEl.querySelector('#m-search-status-bar');
    const editBanner = containerEl.querySelector('#m-edit-mode-banner');
    const editBannerId = containerEl.querySelector('#m-edit-banner-id');
    const cancelEditBtn = containerEl.querySelector('#btn-m-cancel-edit');

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
      if (editingArticle) return; // Do not overwrite ID in edit mode
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
    refreshIdBtn.addEventListener('click', () => {
      if (editingArticle) {
        exitEditMode();
      } else {
        fetchNextId();
      }
    });

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

    // Jewellery Controls
    const jewelBox = containerEl.querySelector('#m-jewel-box');
    const jewelToggle = containerEl.querySelector('#m-toggle-jewel');
    const jewelBody = containerEl.querySelector('#m-jewel-body');
    const jewelChips = containerEl.querySelectorAll('#m-jewel-chips .jewel-select-chip');
    const jewelDescInput = containerEl.querySelector('#m-jewel-desc');
    const jewelPriceInput = containerEl.querySelector('#m-jewel-price');
    const jewelHeader = containerEl.querySelector('#m-jewel-toggle-header');

    const updateJewelState = () => {
      if (jewelToggle.checked) {
        jewelBox.classList.add('active');
        jewelBody.style.display = 'flex';
        if (!jewelPriceInput.value || parseFloat(jewelPriceInput.value) === 0) {
          jewelPriceInput.focus();
        }
      } else {
        jewelBox.classList.remove('active');
        jewelBody.style.display = 'none';
      }
      paymentController?.update();
      updateSubmitState();
    };

    jewelToggle.addEventListener('change', updateJewelState);
    jewelHeader.addEventListener('click', (e) => {
      if (e.target !== jewelToggle && !e.target.closest('.switch-control')) {
        jewelToggle.checked = !jewelToggle.checked;
        updateJewelState();
      }
    });

    jewelChips.forEach((btn) => {
      btn.addEventListener('click', () => {
        jewelChips.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.dataset.val;
        if (val === 'Other / Custom') {
          jewelDescInput.value = '';
          jewelDescInput.placeholder = 'Enter jewellery details...';
          jewelDescInput.focus();
        } else {
          jewelDescInput.value = val;
        }
      });
    });

    jewelPriceInput.addEventListener('input', () => {
      paymentController?.update();
      updateSubmitState();
    });

    custNameInput.addEventListener('input', () => updateSubmitState());

    // --- Search & Edit Mode Functions ---
    let searchStatusTimeout = null;
    const showSearchStatus = (msg, type = 'info') => {
      if (!statusBar) return;
      if (searchStatusTimeout) clearTimeout(searchStatusTimeout);
      statusBar.className = `mobile-search-status-bar ${type}`;
      statusBar.textContent = msg;
      statusBar.style.display = 'flex';
      searchStatusTimeout = setTimeout(() => {
        statusBar.style.display = 'none';
      }, 5000);
    };

    const hideSearchStatus = () => {
      if (statusBar) statusBar.style.display = 'none';
      if (searchStatusTimeout) clearTimeout(searchStatusTimeout);
    };

    // Load an existing article's data into the form for editing
    const loadArticleForEditing = (article) => {
      if (!article) return;
      editingArticle = article;

      // 1. Show Edit Mode Banner
      if (editBanner && editBannerId) {
        editBannerId.textContent = `#${article.article_id}`;
        editBanner.style.display = 'flex';
      }

      // 2. Populate Article ID
      articleIdInput.value = article.article_id || '';

      // 3. Populate Dates
      if (article.pickup_date) {
        pickupDate = article.pickup_date;
        pickupInput.value = article.pickup_date;
      }
      if (article.return_date) {
        returnDate = article.return_date;
        returnInput.value = article.return_date;
      }

      // 4. Populate Category
      category = article.category || 'Bridal';
      containerEl.querySelectorAll('#m-category-chips .category-chip').forEach((btn) => {
        if ((btn.dataset.cat || '').toLowerCase() === (category || '').toLowerCase()) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // 5. Populate Jewellery
      const hasJewel = Number(article.has_jewellery || 0) === 1;
      jewelToggle.checked = hasJewel;
      jewelPriceInput.value = hasJewel ? (article.jewellery_price || 0) : 0;
      const jewelDesc = article.jewellery_details || 'Full Bridal Set';
      jewelDescInput.value = jewelDesc;
      jewelChips.forEach((btn) => {
        if (btn.dataset.val === jewelDesc) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      updateJewelState();

      // 6. Populate Pricing & Advance
      const totalArticlePrice = parseFloat(article.price) || 0;
      const jPrice = hasJewel ? (parseFloat(article.jewellery_price) || 0) : 0;
      const garmentP = Math.max(0, totalArticlePrice - jPrice);
      priceInput.value = garmentP > 0 ? garmentP : totalArticlePrice;
      advanceInput.value = (article.advance_amount !== undefined && article.advance_amount !== null) ? article.advance_amount : 0;
      paymentController?.update();

      // 7. Populate Customer Details
      const personName = (article.customer_name || '').trim();
      custNameInput.value = personName;
      custNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      custNameInput.dispatchEvent(new Event('change', { bubbles: true }));
      custNameInput.classList.remove('highlight-pulse');
      void custNameInput.offsetWidth;
      custNameInput.classList.add('highlight-pulse');

      custPhoneInput.value = article.customer_phone || '';
      if (custAltPhoneInput) custAltPhoneInput.value = article.customer_alt_phone || '';
      custAddrInput.value = article.customer_address || article.notes || '';

      // Update Search Card Customer / Person Name Result Box
      const searchNameResult = containerEl.querySelector('#m-search-name-result');
      const searchNameValue = containerEl.querySelector('#m-search-name-value');
      if (searchNameResult && searchNameValue) {
        searchNameValue.textContent = personName || 'Guest / Unnamed Booking';
        searchNameResult.style.display = 'flex';
      }

      // Update Edit Banner Name Badge
      const editCustBadge = containerEl.querySelector('#m-edit-banner-cust-badge');
      if (editCustBadge) {
        if (personName) {
          editCustBadge.textContent = personName;
          editCustBadge.style.display = 'inline-block';
        } else {
          editCustBadge.style.display = 'none';
        }
      }

      // Sync search input if invoked from article ID field
      if (searchInput && article.article_id) {
        searchInput.value = article.article_id;
        if (searchClearBtn) searchClearBtn.style.display = 'flex';
      }

      // 8. Populate Garment Photo (Show existing image in preview)
      if (article.image_path) {
        cameraController?.showExistingPhoto(article.image_path);
      }

      // 9. Status feedback
      showSearchStatus(`✓ Loaded Article ${article.article_id} (${personName || 'Guest'})`, 'success');
      showToast(`Loaded ${personName ? personName + ' — ' : ''}Article #${article.article_id}`, 'success', 2500);

      // 10. Update submit button
      updateSubmitState();

      // Smoothly scroll directly to the Customer Name field so the user sees it filled immediately
      setTimeout(() => {
        if (custNameInput) {
          custNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
    };

    // Exit Edit Mode and revert form to New Booking
    const exitEditMode = () => {
      editingArticle = null;
      if (editBanner) editBanner.style.display = 'none';
      const editCustBadge = containerEl.querySelector('#m-edit-banner-cust-badge');
      if (editCustBadge) editCustBadge.style.display = 'none';
      const searchNameResult = containerEl.querySelector('#m-search-name-result');
      if (searchNameResult) searchNameResult.style.display = 'none';
      if (searchInput) searchInput.value = '';
      if (searchClearBtn) searchClearBtn.style.display = 'none';
      hideSearchStatus();
      resetForm();
    };

    // Handle Article Search
    const handleSearchArticle = async (customQuery = null) => {
      let rawQuery = '';
      if (typeof customQuery === 'string' && customQuery.trim()) {
        rawQuery = customQuery;
      } else if (searchInput && searchInput.value && searchInput.value.trim()) {
        rawQuery = searchInput.value;
      } else if (articleIdInput && articleIdInput.value && articleIdInput.value.trim()) {
        rawQuery = articleIdInput.value;
      }

      const query = rawQuery.trim();
      if (!query) {
        showSearchStatus('Please enter an Article ID to search.', 'info');
        if (searchInput) searchInput.focus();
        return;
      }

      if (searchSubmitBtn) {
        searchSubmitBtn.disabled = true;
        searchSubmitBtn.innerHTML = `${renderIcon('loader', { size: 14, className: 'spinner-icon' })}`;
      }
      const findMidBtn = containerEl.querySelector('#btn-find-mid');
      if (findMidBtn) {
        findMidBtn.disabled = true;
      }

      try {
        const res = await api.getArticleByCode(query);
        if (res && res.success && res.article) {
          loadArticleForEditing(res.article);
        } else {
          showSearchStatus(`Article "${query}" not found in database.`, 'error');
        }
      } catch (err) {
        showSearchStatus(`Article "${query}" not found in database.`, 'error');
      } finally {
        if (searchSubmitBtn) {
          searchSubmitBtn.disabled = false;
          searchSubmitBtn.innerHTML = '<span>Find</span>';
        }
        if (findMidBtn) {
          findMidBtn.disabled = false;
        }
      }
    };

    if (searchSubmitBtn) searchSubmitBtn.addEventListener('click', () => handleSearchArticle());

    const findMidBtn = containerEl.querySelector('#btn-find-mid');
    if (findMidBtn) {
      findMidBtn.addEventListener('click', () => {
        const val = (articleIdInput.value || '').trim();
        if (val) {
          if (searchInput) searchInput.value = val;
          handleSearchArticle(val);
        } else {
          showSearchStatus('Please enter an Article ID to search.', 'info');
          articleIdInput.focus();
        }
      });
    }

    let searchDebounceTimer = null;
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          handleSearchArticle();
        }
      });

      searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim();
        if (searchClearBtn) searchClearBtn.style.display = val ? 'flex' : 'none';
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        // Auto-search smoothly when sequence length reached (e.g. 0001)
        if (val.length >= 4) {
          searchDebounceTimer = setTimeout(() => {
            handleSearchArticle();
          }, 450);
        }
      });
    }

    if (articleIdInput) {
      articleIdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = articleIdInput.value.trim();
          if (val && !editingArticle) {
            if (searchInput) searchInput.value = val;
            handleSearchArticle(val, true);
          }
        }
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        hideSearchStatus();
        if (editingArticle) {
          exitEditMode();
        }
      });
    }

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        exitEditMode();
        showToast('Switched back to New Booking mode', 'info');
      });
    }

    // Validation & Submit Button State
    const updateSubmitState = () => {
      const hasPhoto = Boolean(
        cameraController?.hasPhoto
          ? cameraController.hasPhoto()
          : cameraController?.getPhotoBlob()
      );
      const hasPrice = (parseFloat(priceInput.value) || 0) > 0;
      const hasCustomer = custNameInput.value.trim().length > 0;

      if (editingArticle) {
        submitBtn.classList.add('editing');
        if (!hasPhoto) {
          submitLabel.textContent = 'Take Garment Photo';
          submitBtn.disabled = true;
        } else if (!hasPrice) {
          submitLabel.textContent = 'Enter Garment Price';
          submitBtn.disabled = true;
        } else if (!hasCustomer) {
          submitLabel.textContent = 'Enter Customer Name';
          submitBtn.disabled = true;
        } else {
          submitLabel.textContent = `Update Article ${editingArticle.article_id} →`;
          submitBtn.disabled = false;
        }
      } else {
        submitBtn.classList.remove('editing');
        if (!hasPhoto) {
          submitLabel.textContent = 'Take Garment Photo';
          submitBtn.disabled = true;
        } else if (!hasPrice) {
          submitLabel.textContent = 'Enter Garment Price';
          submitBtn.disabled = true;
        } else if (!hasCustomer) {
          submitLabel.textContent = 'Enter Customer Name';
          submitBtn.disabled = true;
        } else {
          submitLabel.textContent = 'Save & Sync to Laptop →';
          submitBtn.disabled = false;
        }
      }
    };

    // Reset Form for next booking
    const resetForm = () => {
      editingArticle = null;
      if (editBanner) editBanner.style.display = 'none';
      const editCustBadge = containerEl.querySelector('#m-edit-banner-cust-badge');
      if (editCustBadge) {
        editCustBadge.style.display = 'none';
        editCustBadge.textContent = '';
      }
      const searchNameResult = containerEl.querySelector('#m-search-name-result');
      const searchNameValue = containerEl.querySelector('#m-search-name-value');
      if (searchNameResult) searchNameResult.style.display = 'none';
      if (searchNameValue) searchNameValue.textContent = '';

      cameraController?.reset();
      jewelToggle.checked = false;
      updateJewelState();
      paymentController?.reset();
      custNameInput.value = '';
      custPhoneInput.value = '';
      if (custAltPhoneInput) custAltPhoneInput.value = '';
      custAddrInput.value = '';
      fetchNextId();
      updateSubmitState();
    };

    // Submit Booking or Update
    submitBtn.addEventListener('click', async () => {
      const payValues = paymentController.getValues();
      const p = payValues.price;
      const adv = payValues.advance;
      const bal = payValues.balance;
      const name = custNameInput.value.trim();
      const photoBlob = cameraController?.getPhotoBlob();
      const hasPhoto = Boolean(
        cameraController?.hasPhoto
          ? cameraController.hasPhoto()
          : photoBlob
      );

      if (!hasPhoto || p <= 0 || !name) return;

      const hasJewel = jewelToggle.checked ? 1 : 0;
      const jewelDetails = hasJewel ? (jewelDescInput.value.trim() || 'Full Bridal Set') : '';
      const jewelPrice = hasJewel ? (parseFloat(jewelPriceInput.value) || 0) : 0;
      const finalId = articleIdInput.value.trim().toUpperCase() || '0001';

      if (editingArticle) {
        // --- EDIT EXISTING ARTICLE ---
        overlayController.showProgress(
          'Updating Article...',
          `Saving changes for ${editingArticle.article_id} & syncing with laptop...`
        );

        const updatePayload = {
          article_id: finalId,
          title: category || 'Bridal',
          category: category,
          price: p,
          advance_amount: adv,
          balance_amount: bal,
          has_jewellery: hasJewel,
          jewellery_details: jewelDetails,
          jewellery_price: jewelPrice,
          customer_name: name,
          customer_phone: custPhoneInput.value.trim(),
          customer_alt_phone: custAltPhoneInput ? custAltPhoneInput.value.trim() : (editingArticle.customer_alt_phone || null),
          customer_address: custAddrInput.value.trim(),
          pickup_date: pickupInput.value,
          return_date: returnInput.value,
          booking_date: editingArticle.booking_date || getISODate(0),
          salesman_name: editingArticle.salesman_name || 'Studio',
          status: editingArticle.status || 'booked',
        };

        try {
          // 1. Update metadata fields
          const res = await api.updateArticle(editingArticle.id, updatePayload);
          let updatedArticle = res.article || { ...editingArticle, ...updatePayload };

          // 2. If a replacement photo was snapped or selected from gallery, upload it
          if (photoBlob) {
            overlayController.showProgress(
              'Uploading Photo...',
              `Uploading new garment photo for ${finalId}...`
            );
            const photoRes = await api.uploadArticlePhoto(editingArticle.id, photoBlob);
            if (photoRes && photoRes.article) {
              updatedArticle = photoRes.article;
            }
          }

          if (state.onBookingUpdated) {
            state.onBookingUpdated(updatedArticle);
          }

          showToast(`Article ${updatedArticle.article_id} updated successfully!`, 'success');
          overlayController.showSuccess(updatedArticle, () => {
            exitEditMode();
          });
        } catch (err) {
          alert('Failed to update article: ' + (err.message || 'Unknown error'));
          overlayController.hide();
        }
      } else {
        // --- CREATE NEW BOOKING ---
        if (!photoBlob) return;

        overlayController.showProgress(
          'Syncing Booking...',
          'Saving booking & syncing with laptop...'
        );

        const formData = new FormData();
        formData.append('photo', photoBlob, `${finalId}.jpg`);
        formData.append('article_id', finalId);
        formData.append('title', category || 'Bridal');
        formData.append('category', category);
        formData.append('price', p);
        formData.append('advance_amount', adv);
        formData.append('balance_amount', bal);
        formData.append('has_jewellery', hasJewel);
        formData.append('jewellery_details', jewelDetails);
        formData.append('jewellery_price', jewelPrice);
        formData.append('customer_name', name);
        formData.append('customer_phone', custPhoneInput.value.trim());
        formData.append('customer_alt_phone', custAltPhoneInput ? custAltPhoneInput.value.trim() : '');
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
            if (res.whatsapp_dispatch && res.whatsapp_dispatch.success) {
              res.article._wa_dispatched = true;
            }
            overlayController.showSuccess(res.article, resetForm);
          } else {
            alert(res.message || 'Failed to submit booking');
            overlayController.hide();
          }
        } catch (err) {
          alert('Upload failed: ' + err.message);
          overlayController.hide();
        }
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
        const brandIcon = containerEl.querySelector('.mobile-brand-icon');
        if (brandIcon) brandIcon.title = newName;
      }
    },
    updateLogoUrl(newLogo) {
      if (newLogo) {
        logoUrl = newLogo;
        const logoImg = containerEl.querySelector('.mobile-brand-logo-img');
        if (logoImg) logoImg.src = newLogo;
      }
    }
  };
}
