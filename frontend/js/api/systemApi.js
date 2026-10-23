/**
 * systemApi.js — System Settings, Network Info, Backups & Real-Time SSE.
 */

import { API_BASE, request } from './client.js';

export const systemApi = {
  /**
   * Fetches local network IP and pairing QR data URL for mobile camera pairing.
   * @param {number} [port] - Optional server port override
   * @returns {Promise<{success: boolean, ip: string, networkCaptureUrl: string, qrCodeDataUrl: string}>}
   */
  async getNetworkInfo(port) {
    const url = port ? `${API_BASE}/network-info?port=${port}` : `${API_BASE}/network-info`;
    const res = await request(url);
    if (!res.ok) throw new Error('Failed to fetch network pairing info');
    return res.json();
  },

  /**
   * Retrieves application settings (shop name, WhatsApp configuration, etc.).
   * @returns {Promise<{success: boolean, settings: object}>}
   */
  async getSettings() {
    try {
      const res = await request(`${API_BASE}/settings`);
      if (!res.ok) return { success: false, settings: {} };
      return res.json();
    } catch (_) {
      return { success: false, settings: {} };
    }
  },

  /**
   * Updates application settings (restricted to Owner).
   * @param {object} settings - Key-value settings map
   * @returns {Promise<{success: boolean}>}
   */
  async updateSettings(settings) {
    try {
      const res = await request(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) return { success: false };
      return res.json();
    } catch (_) {
      return { success: false };
    }
  },

  /**
   * Triggers an immediate manual database snapshot/backup.
   * @returns {Promise<{success: boolean, backup_name: string, message: string}>}
   */
  async backupNow() {
    const res = await request(`${API_BASE}/backup-now`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || 'Backup failed');
    }
    return data;
  },

  /**
   * Subscribes to real-time Server-Sent Events (SSE) broadcasted by the FastAPI backend.
   * Enables zero-latency live sync between phones and desktop laptops.
   * @param {function} onMessage - Callback receiving event objects ({ type, article, data })
   * @param {function} [onError] - Callback on connection error
   * @returns {function} - Unsubscribe function to close the EventSource
   */
  subscribeEvents(onMessage, onError) {
    let eventSource = null;
    let isTerminated = false;
    let reconnectTimer = null;
    let bc = null;

    // Listen to local same-origin BroadcastChannel for 0ms same-laptop sync
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        bc = new BroadcastChannel('studio_live_sync');
        bc.onmessage = (e) => {
          if (e.data && onMessage) {
            onMessage(e.data);
          }
        };
      }
    } catch (_) {}

    const connectSSE = () => {
      if (isTerminated) return;
      try {
        eventSource = new EventSource(`${API_BASE}/events`);

        eventSource.onopen = () => {
          onMessage({ type: 'SYNC_CONNECTED' });
        };

        eventSource.addEventListener('NEW_ARTICLE', (e) => {
          try {
            const article = JSON.parse(e.data);
            onMessage({ type: 'NEW_ARTICLE', article });
          } catch (err) {
            console.error('SSE JSON error:', err);
          }
        });

        eventSource.addEventListener('UPDATE_ARTICLE', (e) => {
          try {
            const article = JSON.parse(e.data);
            onMessage({ type: 'UPDATE_ARTICLE', article });
          } catch (err) {
            console.error('SSE JSON error:', err);
          }
        });

        eventSource.addEventListener('DELETE_ARTICLE', (e) => {
          try {
            const data = JSON.parse(e.data);
            onMessage({ type: 'DELETE_ARTICLE', data });
          } catch (err) {
            console.error('SSE JSON error:', err);
          }
        });

        eventSource.addEventListener('SETTINGS_UPDATED', (e) => {
          try {
            const payload = JSON.parse(e.data);
            onMessage({ type: 'SETTINGS_UPDATED', settings: payload.settings || payload });
          } catch (err) {
            console.error('SSE JSON error on settings:', err);
          }
        });

        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            onMessage(data);
          } catch (_) {}
        };

        eventSource.onerror = (err) => {
          onMessage({ type: 'SYNC_DISCONNECTED' });
          if (onError) onError(err);
          if (eventSource && eventSource.readyState === EventSource.CLOSED && !isTerminated) {
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectSSE, 2000);
          }
        };
      } catch (err) {
        onMessage({ type: 'SYNC_DISCONNECTED' });
        if (!isTerminated) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectSSE, 3000);
        }
      }
    };

    connectSSE();

    const cleanup = () => {
      isTerminated = true;
      clearTimeout(reconnectTimer);
      if (eventSource) {
        try { eventSource.close(); } catch (_) {}
      }
      if (bc) {
        try { bc.close(); } catch (_) {}
      }
    };

    window.addEventListener('beforeunload', cleanup, { once: true });
    window.addEventListener('pagehide', cleanup, { once: true });

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', cleanup);
      window.removeEventListener('pagehide', cleanup);
    };
  },

  /**
   * Retrieves list of installed OS printers and the active thermal printer.
   * @returns {Promise<{success: boolean, printers: string[], active_printer: string|null}>}
   */
  async getPrinters() {
    try {
      const res = await request(`${API_BASE}/system/printers`);
      if (!res.ok) return { success: false, printers: [], active_printer: null };
      return res.json();
    } catch (_) {
      return { success: false, printers: [], active_printer: null };
    }
  },

  /**
   * Sets preferred thermal printer for direct ESC/POS printing.
   * @param {string} printerName - Target printer name
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async selectPrinter(printerName) {
    const res = await request(`${API_BASE}/system/printers/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer_name: printerName })
    });
    return res.json();
  },

  /**
   * Prints an 80mm diagnostic ticket with paper feed and cut test.
   * @param {string} [printerName] - Target printer name (optional)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testPrintPrinter(printerName) {
    const res = await request(`${API_BASE}/system/printers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer_name: printerName || '' })
    });
    return res.json();
  }
};
