/**
 * whatsappApi.js — WhatsApp Gateway & E-Bill API calls.
 */

import { API_BASE, request } from './client.js';

export const whatsappApi = {
  /**
   * Checks whether the official WhatsApp Cloud API is configured and active.
   * @returns {Promise<{success: boolean, enabled: boolean}>}
   */
  async getWhatsAppStatus() {
    try {
      const res = await request(`${API_BASE}/whatsapp/status`);
      if (!res.ok) return { success: false, enabled: false };
      return res.json();
    } catch (_) {
      return { success: false, enabled: false };
    }
  },

  /**
   * Sends a test WhatsApp message to verify API credentials (restricted to Owner).
   * @param {object} payload - { phone, message }
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async testWhatsApp(payload) {
    const res = await request(`${API_BASE}/whatsapp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  /**
   * Sends an automated booking e-bill to the customer's WhatsApp number.
   * @param {number|string} articleId - Article database ID
   * @param {string|null} [phoneOverride] - Optional phone override
   * @param {string|null} [mode] - Optional template or text mode
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async sendWhatsAppBill(articleId, phoneOverride = null, mode = null) {
    const res = await request(`${API_BASE}/whatsapp/send-article/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_override: phoneOverride, mode })
    });
    return res.json();
  }
};
