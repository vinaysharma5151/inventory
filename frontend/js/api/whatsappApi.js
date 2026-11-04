/**
 * whatsappApi.js — OpenWA Gateway Direct Messaging calls.
 */

import { API_BASE, request } from './client.js';

export const whatsappApi = {
  /**
   * Checks overall WhatsApp configuration (OpenWA connection & active session status).
   * @returns {Promise<{success: boolean, mode: string, gateway: string, server_url: string, has_api_key: boolean, masked_key: string, session_id: string, session_name: string, session_status: string, connected_phone: string, push_name: string, is_ready: boolean, shop_name: string}>}
   */
  async getWhatsAppStatus() {
    try {
      const res = await request(`${API_BASE}/whatsapp/status`);
      return await res.json();
    } catch (e) {
      return { success: false, mode: 'openwa', is_ready: false };
    }
  },

  /**
   * Saves OpenWA Gateway credentials.
   * @param {{server_url: string, api_key: string, session_id?: string}} payload
   */
  async saveWhatsAppSettings(payload) {
    const res = await request(`${API_BASE}/whatsapp/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  },

  /**
   * Sends a test ping via OpenWA.
   * @param {string} phoneNumber - 10-digit mobile number
   * @param {string|null} [message] - Optional custom message
   */
  async testWhatsAppApi(phoneNumber, message = null) {
    const res = await request(`${API_BASE}/whatsapp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phoneNumber, message }),
    });
    return await res.json();
  },

  /**
   * Gets formatted e-bill text for an article.
   * @param {number|string} articleId - Article database ID
   * @returns {Promise<{success: boolean, ebill_text: string, customer_phone: string}>}
   */
  async getEbill(articleId) {
    try {
      const res = await request(`${API_BASE}/whatsapp/ebill-text/${articleId}`);
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Dispatches e-bill directly via OpenWA Gateway.
   * @param {number|string} articleId - Article database ID
   * @param {string|null} [phoneOverride] - Optional phone override
   * @returns {Promise<{success: boolean, direct_sent?: boolean, sent_via?: string, ebill_text?: string, message?: string, error?: string}>}
   */
  async sendWhatsAppBill(articleId, phoneOverride = null) {
    const res = await request(`${API_BASE}/whatsapp/send-article/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_override: phoneOverride }),
    });
    return await res.json();
  },

  /**
   * Retrieves pickup reminder text and details for an article.
   * @param {number|string} articleId
   */
  async getPickupReminder(articleId) {
    try {
      const res = await request(`${API_BASE}/whatsapp/pickup-reminder-text/${articleId}`);
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Sends outfit pickup reminder to customer via OpenWA.
   * @param {number|string} articleId
   * @param {string|null} [phoneOverride]
   */
  async sendPickupReminder(articleId, phoneOverride = null) {
    const res = await request(`${API_BASE}/whatsapp/send-pickup-reminder/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_override: phoneOverride }),
    });
    return await res.json();
  },

  /**
   * Scans bookings scheduled for tomorrow and auto-dispatches pickup reminders.
   */
  async checkPickupReminders() {
    try {
      const res = await request(`${API_BASE}/whatsapp/check-pickup-reminders`, {
        method: 'POST',
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Retrieves return reminder text and details for an article.
   * @param {number|string} articleId
   */
  async getReturnReminder(articleId) {
    try {
      const res = await request(`${API_BASE}/whatsapp/return-reminder-text/${articleId}`);
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Sends outfit return reminder to customer via OpenWA.
   * @param {number|string} articleId
   * @param {string|null} [phoneOverride]
   */
  async sendReturnReminder(articleId, phoneOverride = null) {
    const res = await request(`${API_BASE}/whatsapp/send-return-reminder/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_override: phoneOverride }),
    });
    return await res.json();
  },

  /**
   * Scans bookings scheduled for return tomorrow and auto-dispatches return reminders.
   */
  async checkReturnReminders() {
    try {
      const res = await request(`${API_BASE}/whatsapp/check-return-reminders`, {
        method: 'POST',
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Scans bookings scheduled for pickup OR return tomorrow and auto-dispatches reminders.
   */
  async checkAllReminders() {
    try {
      const res = await request(`${API_BASE}/whatsapp/check-all-reminders`, {
        method: 'POST',
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
};
