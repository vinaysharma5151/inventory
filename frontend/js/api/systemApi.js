/**
 * systemApi.js — System Settings, Network Info, Backups, Updates & Real-Time SSE.
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
   * Checks if an application update is available.
   * @returns {Promise<{success: boolean, update_available: boolean, current_version: string, latest_version?: string, download_url?: string, release_notes?: string}>}
   */
  async checkUpdate() {
    try {
      const res = await request(`${API_BASE}/check-update`);
      return res.json();
    } catch (_) {
      return { success: false, update_available: false, offline: true };
    }
  },

  /**
   * Applies an update by downloading the new .exe and restarting.
   * @param {string} downloadUrl
   * @returns {Promise<{success: boolean, message: string, backup_created: string}>}
   */
  async applyUpdate(downloadUrl) {
    const res = await request(`${API_BASE}/apply-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ download_url: downloadUrl })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || 'Failed to apply update');
    }
    return data;
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
    const eventSource = new EventSource(`${API_BASE}/events`);

    const cleanup = () => {
      try {
        eventSource.close();
      } catch (_) {}
    };

    window.addEventListener('beforeunload', cleanup, { once: true });
    window.addEventListener('pagehide', cleanup, { once: true });

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
      if (onError) onError(err);
    };

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', cleanup);
      window.removeEventListener('pagehide', cleanup);
    };
  }
};
