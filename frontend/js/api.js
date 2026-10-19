/**
 * api.js — Centralized API and Real-Time Event Connector (Vanilla ES Module)
 * 
 * WHY:
 * Provides a unified entry point connecting modular API services:
 * - ./api/client.js: Base HTTP request wrapper with credentials & 401 handling
 * - ./api/authApi.js: Studio setup, authentication, and audit logs
 * - ./api/articlesApi.js: Inventory, image uploads, dues clearout, and article CRUD
 * - ./api/salesmenApi.js: Staff accounts and instant login
 * - ./api/whatsappApi.js: WhatsApp cloud gateway and e-bill sending
 * - ./api/systemApi.js: Network discovery, settings, updates, backups, and live SSE sync
 */

import { API_BASE, request } from './api/client.js';
import { authApi } from './api/authApi.js';
import { articlesApi } from './api/articlesApi.js';
import { salesmenApi } from './api/salesmenApi.js';
import { whatsappApi } from './api/whatsappApi.js';
import { systemApi } from './api/systemApi.js';

// Unified composite API object preserving complete backward compatibility
export const api = {
  ...authApi,
  ...articlesApi,
  ...salesmenApi,
  ...whatsappApi,
  ...systemApi,
};

// Also export individual domain modules for modular imports
export {
  API_BASE,
  request,
  authApi,
  articlesApi,
  salesmenApi,
  whatsappApi,
  systemApi,
};
