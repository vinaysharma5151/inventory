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
 * - ./api/systemApi.js: Network discovery, settings, backups, and live SSE sync
 */

import { API_BASE, request } from './api/client.js?v=11';
import { authApi } from './api/authApi.js?v=11';
import { articlesApi } from './api/articlesApi.js?v=11';
import { salesmenApi } from './api/salesmenApi.js?v=11';
import { whatsappApi } from './api/whatsappApi.js?v=11';
import { systemApi } from './api/systemApi.js?v=11';

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
