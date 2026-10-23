/**
 * desktopDashboard.js — Desktop Studio Dashboard View Controller (Vanilla JS)
 * 
 * WHY:
 * Orchestrates the Desktop Dashboard by assembling modular components:
 * - ./desktop/desktopHeader.js: Studio branding, sync status, and admin action dialogs
 * - ./desktop/desktopFilters.js: Real-time collection search and timeline query engine
 * - ./desktop/articleCard.js: Garment cards with photo, pricing math, tag print, and WhatsApp e-bills
 */

import { renderIcon } from '../icons.js';
import { openAddArticleModal } from '../modals/addArticleModal.js';
import { openQrPairingModal } from '../modals/qrPairingModal.js';
import { renderHeaderHTML, bindHeaderEvents } from './desktop/desktopHeader.js?v=9';
import { filterArticles, getTodayISO } from './desktop/desktopFilters.js?v=9';
import { createArticleCard } from './desktop/articleCard.js?v=12';

const formatINR = (val) => Number(val || 0).toLocaleString('en-IN');

export function createDesktopDashboard(containerEl, state) {
  let articles = state.articles || [];
  let shopName = state.shopName || 'Mehak Bridal Studio';
  let currentUser = state.currentUser || null;

  // Filters State
  const filterState = {
    searchQuery: '',
    selectedCategory: 'all',
    paymentFilter: 'all',
    jewelleryFilter: 'all',
    dateField: 'pickup_date',
    datePreset: 'all',
    filterMonth: '',
    filterSpecificDate: '',
    filterRangeStart: '',
    filterRangeEnd: '',
  };

  // Mount Base Layout
  containerEl.innerHTML = `
    <div class="desktop-dashboard-wrapper">
      ${renderHeaderHTML(shopName, currentUser)}

      <main class="dashboard-main-content">
        <!-- Search & Filter Card -->
        <section class="search-filter-card">
          <!-- Summary Metrics Strip (At Top of Search Bar) -->
          <div class="dashboard-metrics-summary" id="dashboard-metrics-summary">
            <div class="summary-metric-card metric-card-items" title="Total pieces currently matching active filters">
              <div class="summary-metric-icon">
                ${renderIcon('layers', { size: 18, color: 'var(--gold)' })}
              </div>
              <div class="summary-metric-info">
                <span class="summary-metric-label">Total Items</span>
                <span class="summary-metric-val font-mono" id="metric-total-items">0</span>
              </div>
            </div>

            <div class="summary-metric-card metric-card-amount" title="Total booking value of items shown below">
              <div class="summary-metric-icon">
                ${renderIcon('indianRupee', { size: 18, color: '#FFFFFF' })}
              </div>
              <div class="summary-metric-info">
                <span class="summary-metric-label">Total Amount</span>
                <span class="summary-metric-val font-mono" id="metric-total-amount">₹0</span>
              </div>
            </div>

            <div class="summary-metric-card metric-card-paid" title="Total advance and payments collected for items shown below">
              <div class="summary-metric-icon">
                ${renderIcon('checkCircle', { size: 18, color: 'var(--success)' })}
              </div>
              <div class="summary-metric-info">
                <span class="summary-metric-label">Payment Done</span>
                <span class="summary-metric-val font-mono text-success" id="metric-payment-done">₹0</span>
              </div>
            </div>

            <div class="summary-metric-card metric-card-left" title="Pending balance dues for items shown below">
              <div class="summary-metric-icon">
                ${renderIcon('clock', { size: 18, color: 'var(--warning)' })}
              </div>
              <div class="summary-metric-info">
                <span class="summary-metric-label">Payment Left</span>
                <span class="summary-metric-val font-mono text-warning" id="metric-payment-left">₹0</span>
              </div>
            </div>
          </div>

          <div class="search-input-wrap">
            <div class="search-icon">${renderIcon('search', { size: 18, color: 'var(--text-muted)' })}</div>
            <input
              type="text"
              id="dashboard-search-input"
              class="search-input"
              placeholder="Search by Article ID (e.g. 0001), Customer, or Phone..."
            />
          </div>

          <div class="filter-chips-row">
            <div class="chips-group" id="category-chips-container">
              <span class="chips-label">Collection:</span>
              <button type="button" class="filter-chip active" data-cat="all">All Pieces</button>
              <button type="button" class="filter-chip" data-cat="Bridal">Bridal</button>
              <button type="button" class="filter-chip" data-cat="Reception">Reception</button>
              <button type="button" class="filter-chip" data-cat="Sherwani">Sherwani</button>
              <button type="button" class="filter-chip" data-cat="Casual">Casual</button>
            </div>

            <div class="chips-group" id="payment-chips-container">
              <span class="chips-label">Payment:</span>
              <button type="button" class="filter-chip active" data-pay="all">All</button>
              <button type="button" class="filter-chip" data-pay="due">Balance Due</button>
              <button type="button" class="filter-chip" data-pay="paid">Fully Paid</button>
            </div>

            <div class="chips-group" id="jewellery-chips-container">
              <span class="chips-label">Add-ons:</span>
              <button type="button" class="filter-chip" id="chip-filter-jewellery">💍 With Jewellery</button>
            </div>
          </div>

          <!-- Date Filter Row -->
          <div class="filter-date-row">
            <div class="date-field-group">
              <span class="chips-label">
                ${renderIcon('calendar', { size: 13, color: 'var(--gold)', className: 'inline-icon-label' })}
                Filter By:
              </span>
              <select id="date-field-select" class="date-select-dropdown">
                <option value="pickup_date">Pickup Date</option>
                <option value="return_date">Return Date</option>
                <option value="booking_date">Booking Date</option>
                <option value="any">Any Date</option>
              </select>
            </div>

            <div class="chips-group date-presets-group" id="date-presets-container">
              <span class="chips-label">Timeline:</span>
              <button type="button" class="filter-chip active" data-preset="all">All Dates</button>
              <button type="button" class="filter-chip" data-preset="today">Today</button>
              <button type="button" class="filter-chip" data-preset="tomorrow">Tomorrow</button>
              <button type="button" class="filter-chip" data-preset="this_week">Next 7 Days</button>
              <button type="button" class="filter-chip" data-preset="this_month">This Month</button>
              <button type="button" class="filter-chip" data-preset="by_month">Select Month</button>
              <button type="button" class="filter-chip" data-preset="by_date">Specific Date</button>
              <button type="button" class="filter-chip" data-preset="range">Date Range</button>
              <button type="button" id="btn-clear-date-filter" class="filter-chip clear-date-btn" style="display: none;">
                ${renderIcon('rotateCcw', { size: 12 })} Clear
              </button>
            </div>
          </div>

          <!-- Dynamic Date Picker Subbar -->
          <div id="date-picker-subbar" class="date-picker-subbar" style="display: none;"></div>
        </section>

        <!-- Live Sync Alert Slot -->
        <div id="live-sync-alert-slot"></div>

        <!-- Grid Container -->
        <section id="articles-grid-container" class="articles-cards-grid"></section>
      </main>
    </div>
  `;

  // Attach Header Controls
  bindHeaderEvents(containerEl, {
    onShopNameChange: (newName) => {
      shopName = newName;
      if (state.onStateChange) state.onStateChange({ shopName: newName });
    },
    onUserChange: (user) => {
      currentUser = user;
      if (state.onUserChange) state.onUserChange(user);
    },
    onArticleAdded: (newArt) => {
      articles = [newArt, ...articles];
      renderGrid();
    }
  });

  // DOM Elements for Filters
  const searchInput = containerEl.querySelector('#dashboard-search-input');
  const catChips = containerEl.querySelectorAll('#category-chips-container .filter-chip');
  const payChips = containerEl.querySelectorAll('#payment-chips-container .filter-chip');
  const dateFieldSelect = containerEl.querySelector('#date-field-select');
  const datePresets = containerEl.querySelectorAll('#date-presets-container .filter-chip:not(.clear-date-btn)');
  const btnClearDate = containerEl.querySelector('#btn-clear-date-filter');
  const dateSubbar = containerEl.querySelector('#date-picker-subbar');
  const gridContainer = containerEl.querySelector('#articles-grid-container');

  // Dynamic Date Subbar Renderer
  const renderDateSubbar = () => {
    if (filterState.datePreset === 'by_month') {
      dateSubbar.style.display = 'flex';
      dateSubbar.innerHTML = `
        <span class="picker-label">Select Month:</span>
        <input type="month" id="picker-month-input" class="date-input-picker" value="${filterState.filterMonth || getTodayISO(0).slice(0, 7)}" />
      `;
      dateSubbar.querySelector('#picker-month-input').addEventListener('change', (e) => {
        filterState.filterMonth = e.target.value;
        renderGrid();
      });
    } else if (filterState.datePreset === 'by_date') {
      dateSubbar.style.display = 'flex';
      dateSubbar.innerHTML = `
        <span class="picker-label">Specific Date:</span>
        <input type="date" id="picker-specific-input" class="date-input-picker" value="${filterState.filterSpecificDate || getTodayISO(0)}" />
      `;
      dateSubbar.querySelector('#picker-specific-input').addEventListener('change', (e) => {
        filterState.filterSpecificDate = e.target.value;
        renderGrid();
      });
    } else if (filterState.datePreset === 'range') {
      dateSubbar.style.display = 'flex';
      dateSubbar.innerHTML = `
        <span class="picker-label">From:</span>
        <input type="date" id="picker-range-start" class="date-input-picker" value="${filterState.filterRangeStart}" />
        <span class="picker-label">To:</span>
        <input type="date" id="picker-range-end" class="date-input-picker" value="${filterState.filterRangeEnd}" />
      `;
      dateSubbar.querySelector('#picker-range-start').addEventListener('change', (e) => {
        filterState.filterRangeStart = e.target.value;
        renderGrid();
      });
      dateSubbar.querySelector('#picker-range-end').addEventListener('change', (e) => {
        filterState.filterRangeEnd = e.target.value;
        renderGrid();
      });
    } else {
      dateSubbar.style.display = 'none';
      dateSubbar.innerHTML = '';
    }
  };

  // Live Metrics Calculator for visible/filtered items
  const updateMetrics = (filteredList) => {
    let totalItems = filteredList.length;
    let totalAmount = 0;
    let paymentDone = 0;
    let paymentLeft = 0;

    for (let i = 0; i < filteredList.length; i++) {
      const item = filteredList[i];
      const price = Number(item.price) || 0;
      const advance = Number(item.advance_amount) || 0;
      const balance = (item.balance_amount !== undefined && item.balance_amount !== null)
        ? Math.max(0, Number(item.balance_amount))
        : Math.max(0, price - advance);
      const done = (advance > 0) ? advance : Math.max(0, price - balance);

      totalAmount += price;
      paymentDone += done;
      paymentLeft += balance;
    }

    const elItems = containerEl.querySelector('#metric-total-items');
    const elAmount = containerEl.querySelector('#metric-total-amount');
    const elDone = containerEl.querySelector('#metric-payment-done');
    const elLeft = containerEl.querySelector('#metric-payment-left');

    if (elItems) elItems.textContent = totalItems.toLocaleString('en-IN');
    if (elAmount) elAmount.textContent = `₹${formatINR(totalAmount)}`;
    if (elDone) elDone.textContent = `₹${formatINR(paymentDone)}`;
    if (elLeft) elLeft.textContent = `₹${formatINR(paymentLeft)}`;
  };

  // Render Grid
  const renderGrid = () => {
    const filteredList = filterArticles(articles, filterState);
    updateMetrics(filteredList);

    if (filteredList.length === 0) {
      gridContainer.className = '';
      gridContainer.innerHTML = `
        <div class="empty-catalog-card">
          <div class="empty-icon">👗</div>
          <h3 class="empty-title">No Lehengas Found</h3>
          <p class="empty-sub">
            ${articles.length === 0
              ? 'Scan the QR code with a studio phone to photograph and register new bookings!'
              : 'No articles match your current search, date, or filter criteria.'}
          </p>
          <div style="display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap;">
            <button type="button" id="btn-empty-qr" class="btn btn-gold btn-sm">
              ${renderIcon('qrcode', { size: 16 })} Open Phone Pairing QR
            </button>
            <button type="button" id="btn-empty-add" class="btn btn-outline btn-sm">
              ${renderIcon('plus', { size: 16 })} Add Garment Manually
            </button>
          </div>
        </div>
      `;

      containerEl.querySelector('#btn-empty-qr')?.addEventListener('click', openQrPairingModal);
      containerEl.querySelector('#btn-empty-add')?.addEventListener('click', () => {
        openAddArticleModal((newArt) => {
          articles = [newArt, ...articles];
          renderGrid();
        });
      });
      return;
    }

    gridContainer.className = 'articles-cards-grid';
    gridContainer.innerHTML = '';

    filteredList.forEach((item) => {
      const card = createArticleCard(item, {
        shopName,
        currentUser,
        onUpdate: (updated) => {
          articles = articles.map((a) => (a.id === updated.id ? updated : a));
          renderGrid();
        },
        onDelete: (id) => {
          articles = articles.filter((a) => a.id !== id);
          renderGrid();
        }
      });
      gridContainer.appendChild(card);
    });
  };

  // Wire Filter Events
  searchInput.addEventListener('input', (e) => {
    filterState.searchQuery = e.target.value;
    renderGrid();
  });

  catChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      catChips.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.selectedCategory = btn.dataset.cat;
      renderGrid();
    });
  });

  payChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      payChips.forEach((b) => {
        b.classList.remove('active');
        b.classList.remove('due');
        b.classList.remove('paid');
      });
      btn.classList.add('active');
      if (btn.dataset.pay === 'due') btn.classList.add('due');
      if (btn.dataset.pay === 'paid') btn.classList.add('paid');
      filterState.paymentFilter = btn.dataset.pay;
      renderGrid();
    });
  });

  const jewelChip = containerEl.querySelector('#chip-filter-jewellery');
  jewelChip?.addEventListener('click', () => {
    const isActive = jewelChip.classList.toggle('active');
    filterState.jewelleryFilter = isActive ? 'only' : 'all';
    renderGrid();
  });

  dateFieldSelect.addEventListener('change', (e) => {
    filterState.dateField = e.target.value;
    renderGrid();
  });

  datePresets.forEach((btn) => {
    btn.addEventListener('click', () => {
      datePresets.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.datePreset = btn.dataset.preset;

      if (filterState.datePreset === 'by_month' && !filterState.filterMonth) {
        filterState.filterMonth = getTodayISO(0).slice(0, 7);
      }
      if (filterState.datePreset === 'by_date' && !filterState.filterSpecificDate) {
        filterState.filterSpecificDate = getTodayISO(0);
      }

      btnClearDate.style.display = filterState.datePreset === 'all' ? 'none' : 'inline-flex';
      renderDateSubbar();
      renderGrid();
    });
  });

  btnClearDate.addEventListener('click', () => {
    filterState.datePreset = 'all';
    filterState.filterMonth = '';
    filterState.filterSpecificDate = '';
    filterState.filterRangeStart = '';
    filterState.filterRangeEnd = '';
    datePresets.forEach((b) => b.classList.remove('active'));
    containerEl.querySelector('[data-preset="all"]').classList.add('active');
    btnClearDate.style.display = 'none';
    renderDateSubbar();
    renderGrid();
  });

  // Helper to visually highlight a newly arrived article card
  const highlightCard = (articleId) => {
    const cardMedia = gridContainer.querySelector(`.article-card-media[data-id="${articleId}"]`);
    if (!cardMedia) return;
    const cardEl = cardMedia.closest('.article-studio-card');
    if (!cardEl) return;

    cardEl.classList.remove('just-arrived');
    // Force reflow
    void cardEl.offsetWidth;
    cardEl.classList.add('just-arrived');

    cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Helper to clear filters and show all articles
  const resetAllFilters = () => {
    filterState.searchQuery = '';
    filterState.selectedCategory = 'all';
    filterState.paymentFilter = 'all';
    filterState.datePreset = 'all';
    filterState.filterMonth = '';
    filterState.filterSpecificDate = '';
    filterState.filterRangeStart = '';
    filterState.filterRangeEnd = '';

    if (searchInput) searchInput.value = '';
    catChips.forEach((b) => b.classList.toggle('active', b.dataset.cat === 'all'));
    payChips.forEach((b) => {
      b.classList.toggle('active', b.dataset.pay === 'all');
      b.classList.remove('due', 'paid');
    });
    datePresets.forEach((b) => b.classList.toggle('active', b.dataset.preset === 'all'));
    if (btnClearDate) btnClearDate.style.display = 'none';

    renderDateSubbar();
    renderGrid();
  };

  // Initial Grid Render
  renderGrid();

  return {
    addNewArticle(newArt) {
      if (!newArt || !newArt.id) return;
      if (articles.some((a) => a.id === newArt.id)) return;

      articles = [newArt, ...articles];

      // Check if new article matches active filter
      const matches = filterArticles([newArt], filterState).length > 0;
      const alertSlot = containerEl.querySelector('#live-sync-alert-slot');

      if (matches) {
        if (alertSlot) alertSlot.innerHTML = '';
        renderGrid();
        highlightCard(newArt.id);
      } else if (alertSlot) {
        alertSlot.innerHTML = `
          <div class="new-article-sync-banner">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="live-pulse-dot"></span>
              <span><strong>⚡ New Mobile Capture:</strong> ${newArt.article_id} (${newArt.customer_name || 'Guest'}) in ${newArt.category || 'Collection'}</span>
            </div>
            <button type="button" class="btn btn-gold btn-sm" id="btn-show-live-art" style="padding: 4px 12px; font-size: 0.8rem;">
              Show Now
            </button>
          </div>
        `;
        alertSlot.querySelector('#btn-show-live-art')?.addEventListener('click', () => {
          alertSlot.innerHTML = '';
          resetAllFilters();
          highlightCard(newArt.id);
        });
      }
    },
    updateArticles(newArticles) {
      articles = newArticles;
      renderGrid();
    },
    updateShopName(newName) {
      shopName = newName;
      const brandTitle = containerEl.querySelector('#brand-shop-name');
      if (brandTitle) brandTitle.textContent = newName;
    },
    setSyncStatus(status) {
      const syncEl = containerEl.querySelector('.live-sync-indicator');
      const pulseDot = containerEl.querySelector('.live-pulse-dot');
      if (!syncEl || !pulseDot) return;
      if (status === 'connected') {
        syncEl.classList.remove('sync-warning');
        syncEl.title = 'Connected to studio real-time event bus';
        const label = syncEl.querySelector('span:not(.live-pulse-dot)');
        if (label) label.textContent = 'Studio Live Sync';
      } else if (status === 'disconnected') {
        syncEl.classList.add('sync-warning');
        syncEl.title = 'Reconnecting to server...';
        const label = syncEl.querySelector('span:not(.live-pulse-dot)');
        if (label) label.textContent = 'Reconnecting...';
      }
    }
  };
}
