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

import { api } from './api.js?v=11';
import { playLiveSyncChime, playMessageSentChime, showToast } from './toast.js';
import { createDesktopDashboard } from './views/desktopDashboard.js?v=15';
import { createMobileBookingView } from './views/mobileBookingView.js?v=15';
import { openLoginModal } from './modals/loginModal.js';
import { initSmsQueueWidget, refreshSmsQueue } from './views/desktop/smsQueueWidget.js';

class App {
  constructor() {
    this.rootEl = document.getElementById('app-root');
    this.articles = [];
    this.shopName = localStorage.getItem('app_shop_name') || '';
    this.logoUrl = localStorage.getItem('app_logo_url') || '/assets/logo.png';
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
          if (this.activeViewController?.updateLogoUrl) {
            this.activeViewController.updateLogoUrl(this.logoUrl);
          }
        }).catch(() => {});

        api.getMe().then((me) => {
          if (me && me.user) this.currentUser = me.user;
        }).catch(() => {});

        return;
      }

      // --- First-Run Setup Check ---
      const setupStatus = await api.getSetupStatus().catch(() => ({ is_completed: false, shop_name: '', logo_url: '/assets/logo.png' }));

      if (!setupStatus.is_completed) {
        // Show the full-screen first-run wizard and wait for unlock
        const { renderFirstRunGatekeeper } = await import('./modals/firstRunSetupModal.js');
        renderFirstRunGatekeeper(this.rootEl, {
          currentName: setupStatus.shop_name || '',
          currentLogoUrl: setupStatus.logo_url || '/assets/logo.png',
          onUnlock: async (configuredName, configuredLogoUrl) => {
            this.shopName = configuredName;
            this.logoUrl = configuredLogoUrl || '/assets/logo.png';
            localStorage.setItem('app_shop_name', configuredName);
            localStorage.setItem('app_logo_url', this.logoUrl);
            // Boot main app after setup
            try {
              const me = await api.getMe();
              if (me && me.user) this.currentUser = me.user;
            } catch (_) {}
            await this.loadArticles();
            await this.launchMainApp();
          }
        });
        return;
      }

      // Desktop Flow — setup already done
      try {
        const me = await api.getMe();
        if (me && me.user) {
          this.currentUser = me.user;
        }
      } catch (_) {}

      // Load settings (shop name, logo)
      await this.loadSettings();

      // --- License Activation Check (Supabase) ---
      const licenseStatus = await api.getLicenseStatus().catch(() => ({ allowed: true }));
      if (!licenseStatus.allowed) {
        this._showLicenseLockScreen(licenseStatus.message, licenseStatus.shop_name);
        return;
      }

      // Open app
      await this.launchMainApp();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      if (this.rootEl) {
        const sn = this.shopName || 'Your Studio';
        this.rootEl.innerHTML = `
          <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; font-family: -apple-system, sans-serif;">
            <div style="font-size: 38px; margin-bottom: 12px;">👗</div>
            <h2 style="font-size: 18px; color: #4A0E17; margin: 0 0 8px;">${sn}</h2>
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
      initSmsQueueWidget();

      // Automatic check for 1-day pickup & return reminders on app open
      setTimeout(async () => {
        try {
          const res = await api.checkReminders();
          if (res && res.total_sent > 0) {
            showToast(`🔔 Auto-Dispatched ${res.total_sent} reminder(s): ${res.pickup_reminders_sent} pickup, ${res.return_reminders_sent} return`, 'success', 6000);
          }
        } catch (_) {}
      }, 2000);
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
   * Fetches shop name, logo, and branding settings.
   */
  async loadSettings() {
    const storedName = localStorage.getItem('app_shop_name');
    const storedLogo = localStorage.getItem('app_logo_url');
    if (storedName) this.shopName = storedName;
    if (storedLogo) this.logoUrl = storedLogo;

    // 1. Public branding endpoint: works seamlessly without login on mobile capture phones
    try {
      const publicRes = await api.getSetupStatus();
      if (publicRes && publicRes.success) {
        if (publicRes.shop_name) {
          this.shopName = publicRes.shop_name;
          localStorage.setItem('app_shop_name', this.shopName);
        }
        if (publicRes.logo_url) {
          this.logoUrl = publicRes.logo_url;
          localStorage.setItem('app_logo_url', this.logoUrl);
        }
      }
    } catch (_) {}

    // 2. Also try full settings if authenticated
    try {
      const res = await api.getSettings();
      if (res.success && res.settings?.shop_name) {
        this.shopName = res.settings.shop_name;
        localStorage.setItem('app_shop_name', res.settings.shop_name);
      }
      if (res.success && res.settings?.shop_logo_url) {
        this.logoUrl = res.settings.shop_logo_url;
        localStorage.setItem('app_logo_url', this.logoUrl);
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
        logoUrl: this.logoUrl,
        currentUser: this.currentUser,
        onBookingCreated: (newArticle) => {
          this.articles = [newArticle, ...this.articles];
        }
      });
    } else {
      this.activeViewController = createDesktopDashboard(this.rootEl, {
        articles: this.articles,
        shopName: this.shopName,
        logoUrl: this.logoUrl,
        currentUser: this.currentUser,
        onStateChange: (delta) => {
          if (delta.shopName) this.shopName = delta.shopName;
          if (delta.logoUrl) this.logoUrl = delta.logoUrl;
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
   * Subscribes to backend SSE stream (/api/events) and BroadcastChannel for zero-latency live sync.
   */
  initRealtimeSync() {
    if (this.sseUnsubscribe) {
      this.sseUnsubscribe();
      this.sseUnsubscribe = null;
    }
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }

    this.sseUnsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'SYNC_CONNECTED') {
        if (this.activeViewController?.setSyncStatus) {
          this.activeViewController.setSyncStatus('connected');
        }
      } else if (event.type === 'SYNC_DISCONNECTED') {
        if (this.activeViewController?.setSyncStatus) {
          this.activeViewController.setSyncStatus('disconnected');
        }
      } else if (event.type === 'NEW_ARTICLE' && event.article) {
        if (!this.articles.some((a) => a.id === event.article.id)) {
          this.articles = [event.article, ...this.articles];
          playLiveSyncChime();
          showToast(
            `✨ New Mobile Booking: ${event.article.article_id} (${event.article.customer_name || 'Guest'})`,
            'success'
          );

          if (this.activeViewController?.addNewArticle) {
            this.activeViewController.addNewArticle(event.article);
          } else if (this.activeViewController?.updateArticles) {
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
      } else if (event.type === 'SMS_SENT' && event.data) {
        const d = event.data;
        playMessageSentChime();
        const typeStr = d.type || 'SMS Message';
        const recipStr = d.recipient ? ` to ${d.recipient}` : '';
        const phoneStr = d.phone ? ` (${d.phone})` : '';
        showToast(`📱 SMS Sent: ${typeStr}${recipStr}${phoneStr}`, 'success', 5000);
        refreshSmsQueue();
      } else if (event.type === 'SMS_QUEUE_UPDATE') {
        refreshSmsQueue();
      } else if (event.type === 'SETTINGS_UPDATED' && event.settings?.shop_name) {
        this.shopName = event.settings.shop_name;
        localStorage.setItem('app_shop_name', this.shopName);
        if (event.settings.shop_logo_url) {
          this.logoUrl = event.settings.shop_logo_url;
          localStorage.setItem('app_logo_url', this.logoUrl);
        }
        if (this.activeViewController?.updateShopName) {
          this.activeViewController.updateShopName(this.shopName);
        }
        if (this.activeViewController?.updateLogoUrl) {
          this.activeViewController.updateLogoUrl(this.logoUrl);
        }
      }
    });

    // Fail-safe background polling every 4 seconds in case of local network drops
    this.fallbackPollTimer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await api.getArticles();
        if (res.success && Array.isArray(res.articles)) {
          const knownIds = new Set(this.articles.map((a) => a.id));
          const incoming = res.articles.filter((a) => !knownIds.has(a.id));
          if (incoming.length > 0) {
            this.articles = res.articles;
            incoming.forEach((art) => {
              if (this.activeViewController?.addNewArticle) {
                this.activeViewController.addNewArticle(art);
              }
            });
          }
        }
      } catch (_) {}
    }, 4000);
  }

  /**
   * Renders a full-screen "License Inactive" lock screen.
   * The app is completely inaccessible until the vendor activates the license in Supabase.
   */
  _showLicenseLockScreen(message, shopName) {
    const sn = shopName || this.shopName || 'Your Studio';
    const logo = this.logoUrl || '/assets/logo.png';
    if (this.rootEl) {
      this.rootEl.innerHTML = `
        <div style="
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: radial-gradient(ellipse at 50% 0%, #1a0308 0%, #0e0105 100%);
          padding: 28px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
        ">
          <style>
            @keyframes lockPulse { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.04);opacity:1} }
          </style>

          <div style="
            width: 84px; height: 84px;
            border-radius: 18px;
            background: #fff;
            border: 2px solid rgba(212,160,23,0.3);
            display: flex; align-items: center; justify-content: center;
            margin-bottom: 18px; padding: 8px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.55);
            animation: lockPulse 2.5s ease-in-out infinite;
          ">
            <img src="${logo}" alt="${sn}" style="width:100%;height:100%;object-fit:contain;"
              onerror="this.parentElement.innerHTML='<span style=font-size:40px>🔒</span>'" />
          </div>

          <div style="font-size: 32px; margin-bottom: 10px;">🔒</div>

          <h1 style="font-size: 20px; font-weight: 800; color: #F5E6C8; margin: 0 0 6px;">
            ${sn}
          </h1>

          <div style="
            display: inline-block;
            background: rgba(220,38,38,0.15);
            border: 1px solid rgba(220,38,38,0.35);
            border-radius: 8px;
            padding: 6px 14px;
            font-size: 11px;
            font-weight: 700;
            color: #FCA5A5;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            margin-bottom: 18px;
          ">License Inactive</div>

          <p style="font-size: 14px; color: rgba(245,230,200,0.6); max-width: 340px; line-height: 1.65; margin: 0 0 28px;">
            ${message || 'Your license is not active. Contact your vendor to activate this installation.'}
          </p>

          <div style="display:flex; flex-direction:column; gap:10px; width:100%; max-width:260px;">
            <button onclick="location.reload(true)" style="
              padding: 12px 24px;
              background: linear-gradient(135deg, #C9920A, #D4A017);
              color: #1a0308; border: none; border-radius: 10px;
              font-weight: 700; font-size: 14px; cursor: pointer; letter-spacing: 0.03em;
            ">🔄 Retry Connection</button>
            <div style="font-size: 11px; color: rgba(245,230,200,0.28); line-height: 1.6;">
              Store: <strong style="color:rgba(245,230,200,0.45);">${sn}</strong><br>
              Ask your vendor to activate this store in the dashboard.
            </div>
          </div>
        </div>
      `;
    }
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
