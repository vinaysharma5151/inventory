/**
 * whatsappApi.js — Direct WhatsApp & E-Bill API calls.
 */

import { API_BASE, request } from './client.js';

export const whatsappApi = {
  /**
   * Checks whether WhatsApp messaging is ready (direct click-to-chat).
   * @returns {Promise<{success: boolean, enabled: boolean, mode: string}>}
   */
  async getWhatsAppStatus() {
    return { success: true, enabled: true, mode: 'direct' };
  },

  /**
   * Gets the formatted e-bill text and wa.me link for an article.
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
   * Generates and opens the WhatsApp e-bill link for a specific article.
   * @param {number|string} articleId - Article database ID
   * @param {string|null} [phoneOverride] - Optional phone override
   * @returns {Promise<{success: boolean, whatsapp_url?: string, ebill_text?: string, message?: string}>}
   */
  async sendWhatsAppBill(articleId, phoneOverride = null) {
    const res = await request(`${API_BASE}/whatsapp/send-article/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_override: phoneOverride })
    });
    const data = await res.json();
    if (data.whatsapp_url) {
      window.open(data.whatsapp_url, '_blank');
    }
    return data;
  }
};
