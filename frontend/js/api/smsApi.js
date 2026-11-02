/**
 * smsApi.js — Android SMS Gateway Client for Mehak Bridal Studio.
 * 
 * WHY:
 * Communicates with the local backend routes (/api/sms/*) to dispatch SMS
 * via Android Phone (Capcom6 SMS Gateway), configure gateway settings, and
 * view sent history.
 */

import { API_BASE, request } from './client.js';

export const smsApi = {
  /**
   * Checks Android SMS Gateway status and configuration presence.
   * @returns {Promise<{success: boolean, is_configured: boolean, gateway_url: string, login: string, masked_password?: string}>}
   */
  async getSmsStatus() {
    try {
      const res = await request(`${API_BASE}/sms/status`);
      return await res.json();
    } catch (e) {
      return { success: false, is_configured: false, gateway_url: '' };
    }
  },

  /**
   * Saves Android SMS Gateway settings.
   * @param {{gateway_url: string, login?: string, password?: string, token?: string}} payload
   */
  async saveSmsSettings(payload) {
    const res = await request(`${API_BASE}/sms/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  },

  /**
   * Sends a test SMS ping to verify Android phone connection.
   * @param {string} phoneNumber
   * @param {string|null} [message]
   */
  async testSmsGateway(phoneNumber, message = null) {
    const res = await request(`${API_BASE}/sms/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phoneNumber, message }),
    });
    return await res.json();
  },

  /**
   * Gets formatted plain-text SMS e-bill.
   * @param {number|string} articleId
   */
  async getSmsBillText(articleId) {
    const res = await request(`${API_BASE}/sms/ebill-text/${articleId}`);
    return await res.json();
  },

  /**
   * Dispatches SMS e-bill via Android phone.
   * @param {number|string} articleId
   * @param {{phone_override?: string, custom_text?: string}} [options]
   */
  async sendSmsArticle(articleId, options = {}) {
    const res = await request(`${API_BASE}/sms/send-article/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return await res.json();
  },

  /**
   * Gets formatted pickup reminder SMS text.
   * @param {number|string} articleId
   */
  async getSmsReminderText(articleId) {
    const res = await request(`${API_BASE}/sms/reminder-text/${articleId}`);
    return await res.json();
  },

  /**
   * Dispatches pickup reminder SMS.
   * @param {number|string} articleId
   * @param {{phone_override?: string, custom_text?: string}} [options]
   */
  async sendSmsReminder(articleId, options = {}) {
    const res = await request(`${API_BASE}/sms/send-reminder/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return await res.json();
  },

  /**
   * Gets formatted 1-day return reminder SMS text.
   * @param {number|string} articleId
   */
  async getSmsReturnReminderText(articleId) {
    const res = await request(`${API_BASE}/sms/return-reminder-text/${articleId}`);
    return await res.json();
  },

  /**
   * Dispatches 1-day return reminder SMS.
   * @param {number|string} articleId
   * @param {{phone_override?: string, custom_text?: string}} [options]
   */
  async sendSmsReturnReminder(articleId, options = {}) {
    const res = await request(`${API_BASE}/sms/send-return-reminder/${articleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return await res.json();
  },

  /**
   * Retrieves dispatched SMS message history.
   * @param {number} [limit=50]
   */
  async getSmsHistory(limit = 50) {
    const res = await request(`${API_BASE}/sms/history?limit=${limit}`);
    return await res.json();
  },

  /**
   * Automatically checks and dispatches 1-day pickup and return reminders.
   */
  async checkReminders() {
    const res = await request(`${API_BASE}/sms/check-reminders`, {
      method: 'POST',
    });
    return await res.json();
  },

  /**
   * Retrieves all pending/failed SMS messages waiting in the outbox queue.
   */
  async getSmsQueue() {
    const res = await request(`${API_BASE}/sms/queue`);
    return await res.json();
  },

  /**
   * Retries all pending/failed messages in the queue.
   */
  async retrySmsQueue() {
    const res = await request(`${API_BASE}/sms/queue/retry`, {
      method: 'POST',
    });
    return await res.json();
  },

  /**
   * Dismisses a failed message from the queue.
   * @param {number|string} queueId
   */
  async dismissSmsQueueItem(queueId) {
    const res = await request(`${API_BASE}/sms/queue/${queueId}`, {
      method: 'DELETE',
    });
    return await res.json();
  },
};
