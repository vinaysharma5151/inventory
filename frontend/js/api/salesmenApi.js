/**
 * salesmenApi.js — Sales Staff & Salesmen Management API calls.
 */

import { API_BASE, request } from './client.js';

export const salesmenApi = {
  /**
   * Authenticates a salesman with name and password/PIN.
   * @param {string} name - Staff member name
   * @param {string} password - Staff password/PIN
   * @returns {Promise<{success: boolean, salesman: object, message?: string}>}
   */
  async loginSalesman(name, password) {
    const res = await request(`${API_BASE}/salesman/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || 'Login failed');
    }
    return data;
  },

  /**
   * 1-Click instant mobile studio login (auto-provisions staff session).
   * @returns {Promise<{success: boolean, salesman: object, token: string}>}
   */
  async quickLoginSalesman() {
    const res = await request(`${API_BASE}/salesman/quick-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || 'Quick login failed');
    }
    return data;
  },

  /**
   * Retrieves the list of all registered salesmen.
   * @returns {Promise<{success: boolean, salesmen: Array}>}
   */
  async getSalesmen() {
    const res = await request(`${API_BASE}/salesmen`);
    if (!res.ok) throw new Error('Failed to fetch staff list');
    return res.json();
  },

  /**
   * Creates a new salesman account (restricted to Owner).
   * @param {string} name - Staff member name
   * @param {string} password - Staff password/PIN
   * @returns {Promise<{success: boolean, salesman: object, message?: string}>}
   */
  async createSalesman(name, password) {
    const res = await request(`${API_BASE}/salesmen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || 'Failed to add staff');
    }
    return data;
  },

  /**
   * Deletes a salesman account (restricted to Owner).
   * @param {number|string} id - Salesman ID
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async deleteSalesman(id) {
    const res = await request(`${API_BASE}/salesmen/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete staff member');
    }
    return res.json();
  }
};
