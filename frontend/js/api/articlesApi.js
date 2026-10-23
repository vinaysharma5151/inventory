/**
 * articlesApi.js — Articles CRUD, Inventory Queries & Dues Clearout API calls.
 */

import { API_BASE, request } from './client.js';

export const articlesApi = {
  /**
   * Fetches the list of articles with optional search and category filters.
   * @param {object} [params] - Query parameters { search, category }
   * @returns {Promise<{success: boolean, articles: Array}>}
   */
  async getArticles(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.stage && params.stage !== 'all') query.set('stage', params.stage);

    const res = await request(`${API_BASE}/articles?${query.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch articles');
    }
    return res.json();
  },

  /**
   * Fetches full details of a single article by its numeric database ID.
   * @param {number|string} id - Article database ID
   * @returns {Promise<{success: boolean, article: object}>}
   */
  async getArticleById(id) {
    const res = await request(`${API_BASE}/articles/${id}`);
    if (!res.ok) throw new Error('Failed to fetch article');
    return res.json();
  },

  /**
   * Generates the next sequential formatted article ID (e.g. "0001", "0002").
   * @returns {Promise<{success: boolean, next_id: string}>}
   */
  async getNextArticleId() {
    const res = await request(`${API_BASE}/articles/next-id`);
    if (!res.ok) throw new Error('Failed to fetch next article ID');
    return res.json();
  },

  /**
   * Uploads a new article with its photo and metadata via multipart/form-data.
   * @param {FormData} formData - Multipart form containing photo blob and text fields
   * @returns {Promise<{success: boolean, article: object, message?: string}>}
   */
  async uploadArticle(formData) {
    const res = await request(`${API_BASE}/articles`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || data.error || 'Failed to save article');
    }
    // Instant same-origin cross-tab sync via BroadcastChannel
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel && data.article) {
        const bc = new BroadcastChannel('studio_live_sync');
        bc.postMessage({ type: 'NEW_ARTICLE', article: data.article });
        bc.close();
      }
    } catch (_) {}
    return data;
  },

  /**
   * Updates an existing article's metadata.
   * @param {number|string} id - Article database ID
   * @param {object} data - Fields to update
   * @returns {Promise<{success: boolean, article: object}>}
   */
  async updateArticle(id, data) {
    const res = await request(`${API_BASE}/articles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update article');
    }
    return res.json();
  },

  /**
   * Replaces an existing article's photo.
   * @param {number|string} id - Article database ID
   * @param {Blob|File} photoBlob - Raw photo file or compressed image blob
   * @returns {Promise<{success: boolean, article: object, message?: string}>}
   */
  async uploadArticlePhoto(id, photoBlob) {
    const formData = new FormData();
    formData.append('photo', photoBlob, 'photo.jpg');
    const res = await request(`${API_BASE}/articles/${id}/photo`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || 'Failed to update photo');
    }
    return data;
  },

  /**
   * Clears all remaining balance dues for an article (restricted to Owner).
   * @param {number|string} id - Article database ID
   * @param {string} [notes] - Optional note regarding payment
   * @returns {Promise<{success: boolean, message: string, article: object}>}
   */
  async clearDues(id, notes = '') {
    const res = await request(`${API_BASE}/articles/${id}/clear-dues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || 'Failed to clear dues');
    }
    return data;
  },

  /**
   * Stage 2: Marks an article as picked up by customer (settles balance to 0).
   * @param {number|string} id - Article database ID
   * @param {string} [notes] - Optional pickup remarks
   * @returns {Promise<{success: boolean, message: string, article: object}>}
   */
  async pickupArticle(id, notes = '') {
    const res = await request(`${API_BASE}/articles/${id}/pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || 'Failed to mark article as picked up');
    }
    return data;
  },

  /**
   * Stage 3: Marks an article as returned back to the shop catalog.
   * @param {number|string} id - Article database ID
   * @param {string} [notes] - Optional return remarks
   * @returns {Promise<{success: boolean, message: string, article: object}>}
   */
  async returnArticle(id, notes = '') {
    const res = await request(`${API_BASE}/articles/${id}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || 'Failed to mark article as returned');
    }
    return data;
  },

  /**
   * Stage 3 – Final return: Marks garment as returned, deletes its photo from
   * disk, and removes its DB record. Backup files are never touched.
   * @param {number|string} id - Article database ID
   * @param {string} [notes] - Optional return remarks
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async returnAndDelete(id, notes = '') {
    const res = await request(`${API_BASE}/articles/${id}/return-and-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || 'Failed to complete return');
    }
    return data;
  },

  /**
   * Deletes an article and removes its image from the server (restricted to Owner).
   * @param {number|string} id - Article database ID
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async deleteArticle(id) {
    const res = await request(`${API_BASE}/articles/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete article');
    }
    return res.json();
  },

  /**
   * Sends raw ESC/POS bill directly to Windows Print Spooler (PIXEL DP82).
   * @param {number|string} id - Article database ID
   * @param {string} [printerName] - Optional target printer name override
   * @returns {Promise<{success: boolean, printer: string, message: string}>}
   */
  async printThermalDirect(id, printerName = '') {
    const res = await request(`${API_BASE}/articles/${id}/print-thermal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer_name: printerName || '' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.detail || 'Direct thermal print failed');
    }
    return data;
  }
};
