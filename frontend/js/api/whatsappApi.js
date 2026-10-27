/**
 * whatsappApi.js — Meta WhatsApp Business Cloud API & Direct Messaging calls.
 */

import { API_BASE, request } from './client.js';

export const whatsappApi = {
  /**
   * Checks overall WhatsApp configuration (Meta Cloud API credentials presence & mode).
   * @returns {Promise<{success: boolean, mode: string, is_meta_configured: boolean, phone_number_id?: string, masked_token?: string, shop_name?: string}>}
   */
  async getWhatsAppStatus() {
    try {
      const res = await request(`${API_BASE}/whatsapp/status`);
      return await res.json();
    } catch (e) {
      return { success: false, mode: 'direct', is_meta_configured: false };
    }
  },

  /**
   * Saves Meta WhatsApp Business Cloud API credentials.
   * @param {{phone_number_id: string, access_token: string, mode?: string, template_name?: string}} payload
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
   * Sends a test ping via Meta WhatsApp Cloud API.
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
   * Gets formatted e-bill text and wa.me link for an article.
   * @param {number|string} articleId - Article database ID
   * @returns {Promise<{success: boolean, ebill_text: string, customer_phone: string, whatsapp_url: string}>}
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
   * Dispatches e-bill via official Meta Cloud API or generates direct wa.me link.
   * @param {number|string} articleId - Article database ID
   * @param {string|null} [phoneOverride] - Optional phone override
   * @param {string|null} [mode] - Optional explicit mode ('meta' | 'direct')
   * @param {boolean} [autoOpenBrowser=false] - Whether to automatically pop open wa.me in browser
   * @returns {Promise<{success: boolean, direct_sent?: boolean, sent_via?: string, whatsapp_url?: string, ebill_text?: string, message?: string, error?: string}>}
   */
  async sendWhatsAppBill(articleId, phoneOverride = null, mode = null, autoOpenBrowser = false) {
    const res = await request(`${API_BASE}/whatsapp/send-article/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_override: phoneOverride, mode }),
    });
    const data = await res.json();

    if (autoOpenBrowser && data.whatsapp_url) {
      window.open(data.whatsapp_url, '_blank');
    }
    return data;
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
   * Sends outfit pickup reminder to customer 1 day before pickup date.
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
};


