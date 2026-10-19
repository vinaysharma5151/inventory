/**
 * client.js — Universal HTTP fetch client and request wrapper.
 * 
 * WHY:
 * 1. Attaches credentials: 'include' to pass HttpOnly session cookies.
 * 2. Catches 401 Unauthorized responses and emits an 'auth:unauthorized' custom event
 *    so any view can automatically prompt for login.
 */

export const API_BASE = '/api';

/**
 * Universal request wrapper with credentials: 'include' and 401 handling.
 * @param {string} url - API endpoint URL
 * @param {RequestInit} [options] - Fetch options
 * @returns {Promise<Response>}
 */
export async function request(url, options = {}) {
  options.credentials = 'include';
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  return res;
}
