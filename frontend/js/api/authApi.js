/**
 * authApi.js — Authentication, First-Run Setup & Audit Log API calls.
 */

import { API_BASE, request } from './client.js';

export const authApi = {
  /**
   * Checks if first-time studio setup has already been completed.
   * @returns {Promise<{success: boolean, is_completed: boolean, shop_name: string}>}
   */
  async getSetupStatus() {
    try {
      const res = await request(`${API_BASE}/setup-status`);
      if (!res.ok) return { success: false, is_completed: true, shop_name: 'Mehak Bridal Studio' };
      return res.json();
    } catch (_) {
      return { success: false, is_completed: true, shop_name: 'Mehak Bridal Studio' };
    }
  },

  /**
   * Completes one-time first run setup (verifies password and sets studio name).
   * @param {string} shop_name - Studio name
   * @param {string} password - Setup password (must match 'open it')
   * @returns {Promise<{success: boolean, shop_name: string, is_completed: boolean}>}
   */
  async completeSetup(shop_name, password) {
    const res = await request(`${API_BASE}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_name, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || 'Setup failed');
    }
    return data;
  },

  /**
   * Logs in as Owner or Staff member.
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<{success: boolean, user: object, token: string}>}
   */
  async login(username, password) {
    const res = await request(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || 'Invalid username or password');
    }
    return data;
  },

  /**
   * Logs out the current session and clears cookies.
   * @returns {Promise<{success: boolean}>}
   */
  async logout() {
    try {
      const res = await request(`${API_BASE}/auth/logout`, { method: 'POST' });
      return res.json();
    } catch (_) {
      return { success: true };
    }
  },

  /**
   * Returns current user identity and role ('owner', 'staff', or null).
   * @returns {Promise<{success: boolean, logged_in: boolean, user: object|null}>}
   */
  async getMe() {
    try {
      const res = await request(`${API_BASE}/auth/me`);
      if (!res.ok) return { success: false, logged_in: false, user: null };
      return res.json();
    } catch (_) {
      return { success: false, logged_in: false, user: null };
    }
  },

  /**
   * Fetches recent showroom audit logs (restricted to Owner).
   * @param {number} [limit=100]
   * @returns {Promise<{success: boolean, count: number, audit_logs: Array}>}
   */
  async getAuditLogs(limit = 100) {
    const res = await request(`${API_BASE}/auth/audit-logs?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return res.json();
  }
};
