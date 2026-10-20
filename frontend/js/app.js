/**
 * app.js — Main Application Controller & View Router (Vanilla ES Module)
 * 
 * WHY:
 * 1. Checks first-run setup status and prompts for Owner credentials on first launch.
 * 2. Coordinates between Desktop Dashboard and Mobile Booking View based on URL path or viewport.
 * 3. Enforces session state and passes authenticated currentUser to views.
 * 4. Listens for 401 Unauthorized events to trigger login dialog.
 * 5. Establishes the real-time Server-Sent Events (SSE) connection for zero-latency live sync.
 */

import { api } from './api.js?v=6';
import { playLiveSyncChime, showToast } from './toast.js';
import { createDesktopDashboard } from './views/desktopDashboard.js?v=8';
import { createMobileBookingView } from './views/mobileBookingView.js';
import { renderFirstRunGatekeeper } from './modals/firstRunSetupModal.js';
import { openLoginModal } from './modals/loginModal.js';

class App {
  constructor() {
    this.rootEl = document.getElementById('app-root');
    this.articles = [];
    this.shopName = 'Mehak Bridal Studio';
    this.currentUser = null;
    this.activeViewController = null;
    this.viewMode = this.detectViewMode();

    this.init();
  }

  /**
   * Determines if user should see mobile phone camera studio or desktop dashboard.
   * Path containing 'capture' or 'mobile', or mobile viewport width triggers Mobile view.
   */
  detectViewMode() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('capture') || path.includes('mobile')) return 'mobile';
    if (window.innerWidth <= 768) return 'mobile';
    return 'desktop';
  }

  /**
   * Initializes data fetching, view rendering, and real-time SSE listener.
   */
  async init() {
    try {
      // Default to open Admin/Owner access
      this.currentUser = { id: 1, username: 'Admin', role: 'owner' };

      const isCaptureMode = this.viewMode === 'mobile' || window.location.pathname.toLowerCase().includes('capture');
      if (isCaptureMode) {
        // Fast-path: Render mobile studio camera and booking form IMMEDIATELY (<10ms)
        this.mountView();

        // Load studio settings and user profile in background without blocking screen render
        this.loadSettings().then(() => {
          if (this.activeViewController?.updateShopName) {
            this.activeViewController.updateShopName(this.shopName);
          }
        }).catch(() => {});

        api.getMe().then((me) => {
          if (me && me.user) this.currentUser = me.user;
        }).catch(() => {});

        return;
      }

      // Desktop Flow
      try {
        const me = await api.getMe();
        if (me && me.user) {
          this.currentUser = me.user;
        }
      } catch (_) {}

      // Check if first-time studio setup has already been completed
      try {
        const setupStatus = await api.getSetupStatus();
        if (setupStatus && setupStatus.success && !setupStatus.is_completed) {
          localStorage.removeItem('bhavi_shop_name');
          renderFirstRunGatekeeper(this.rootEl, {
            currentName: setupStatus.shop_name || 'Mehak Bridal Studio',
            onUnlock: async (configuredShopName) => {
              this.shopName = configuredShopName;
              await this.launchMainApp();
            }
          });
          return;
        }
      } catch (err) {
        console.warn('Could not check setup status:', err);
      }

      // Setup is already completed: open app immediately
      await this.loadSettings();
      await this.launchMainApp();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      if (this.rootEl) {
        this.rootEl.innerHTML = `
          <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; font-family: -apple-system, sans-serif;">
            <div style="font-size: 38px; margin-bottom: 12px;">👗</div>
            <h2 style="font-size: 18px; color: #4A0E17; margin: 0 0 8px;">Mehak Bridal Studio</h2>
            <p style="font-size: 13px; color: #666; max-width: 320px; margin-bottom: 18px;">Failed to initialize studio. Tap reload to retry.</p>
            <button onclick="location.reload(true)" style="padding: 10px 24px; background: #9E7B3B; color: #FFF; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
              Reload Studio
            </button>
          </div>
        `;
      }
    }
  }

  /**
   * Initializes articles, view rendering, and real-time SSE listener.
   * Only called AFTER first-run setup is complete (or verified).
   */
  async launchMainApp() {
    // 1. Load existing articles (only needed on desktop dashboard)
    if (this.viewMode !== 'mobile') {
      await this.loadArticles();
    }

    // 2. Mount active view
    this.mountView();

    // 3. Start real-time Server-Sent Events (SSE) sync (desktop only to prevent mobile connection limits)
    if (this.viewMode !== 'mobile') {
      this.initRealtimeSync();
    }

    // 4. Handle window resize gracefully
    window.addEventListener('resize', () => {
      const mode = this.detectViewMode();
      if (mode !== this.viewMode && !window.location.pathname.includes('capture')) {
        this.viewMode = mode;
        this.mountView();
        if (this.viewMode !== 'mobile') {
          this.initRealtimeSync();
        } else if (this.sseUnsubscribe) {
          this.sseUnsubscribe();
          this.sseUnsubscribe = null;
        }
      }
    });
  }

  /**
   * Fetches shop name and branding settings.
   */
  async loadSettings() {
    const stored = localStorage.getItem('bhavi_shop_name');
    if (stored && stored !== 'Bhavi') {
      this.shopName = stored;
    }

    try {
      const res = await api.getSettings();
      if (res.success && res.settings?.shop_name) {
        this.shopName = res.settings.shop_name;
        localStorage.setItem('bhavi_shop_name', res.settings.shop_name);
      }
    } catch (_) {}
  }

  /**
   * Fetches the articles list from the SQLite database.
   */
  async loadArticles() {
    try {
      const res = await api.getArticles();
      if (res.success && Array.isArray(res.articles)) {
        this.articles = res.articles;
      }
    } catch (err) {
      console.warn('Could not load initial articles:', err);
    }
  }

  /**
   * Mounts either DesktopDashboard or MobileBookingView into #app-root.
   */
  mountView() {
    if (this.activeViewController?.destroy) {
      this.activeViewController.destroy();
    }
    this.rootEl.innerHTML = '';

    if (this.viewMode === 'mobile') {
      this.activeViewController = createMobileBookingView(this.rootEl, {
        shopName: this.shopName,
        currentUser: this.currentUser,
        onBookingCreated: (newArticle) => {
          this.articles = [newArticle, ...this.articles];
        }
      });
    } else {
      this.activeViewController = createDesktopDashboard(this.rootEl, {
        articles: this.articles,
        shopName: this.shopName,
        currentUser: this.currentUser,
        onStateChange: (delta) => {
          if (delta.shopName) this.shopName = delta.shopName;
        },
        onUserChange: (user) => {
          this.currentUser = user;
          this.loadArticles();
          this.mountView();
        }
      });
    }
  }

  /**
   * Subscribes to backend SSE stream (/api/events) for zero-latency live sync.
   */
  initRealtimeSync() {
    if (this.sseUnsubscribe) {
      this.sseUnsubscribe();
      this.sseUnsubscribe = null;
    }
    this.sseUnsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'NEW_ARTICLE' && event.article) {
        playLiveSyncChime();
        showToast(
          `✨ New Mobile Booking: ${event.article.article_id} (${event.article.customer_name || 'Guest'})`,
          'success'
        );

        if (!this.articles.some((a) => a.id === event.article.id)) {
          this.articles = [event.article, ...this.articles];
          if (this.activeViewController?.updateArticles) {
            this.activeViewController.updateArticles(this.articles);
          }
        }
      } else if (event.type === 'UPDATE_ARTICLE' && event.article) {
        this.articles = this.articles.map((a) => (a.id === event.article.id ? event.article : a));
        if (this.activeViewController?.updateArticles) {
          this.activeViewController.updateArticles(this.articles);
        }
      } else if (event.type === 'DELETE_ARTICLE' && event.data?.id) {
        this.articles = this.articles.filter((a) => a.id !== event.data.id);
        if (this.activeViewController?.updateArticles) {
          this.activeViewController.updateArticles(this.articles);
        }
      } else if (event.type === 'SETTINGS_UPDATED' && event.settings?.shop_name) {
        this.shopName = event.settings.shop_name;
        localStorage.setItem('bhavi_shop_name', this.shopName);
        if (this.activeViewController?.updateShopName) {
          this.activeViewController.updateShopName(this.shopName);
        }
      }
    });
  }
}

// Start application safely whether DOM is still loading or already parsed (fixes mobile race conditions)
function bootApp() {
  try {
    new App();
  } catch (err) {
    console.error('Fatal App boot error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
