/**
 * licenseService.js — Dynamic Subscription & License Verification System
 * 
 * WHY:
 * Implements client-side license verification against the central license checker API:
 * 1. Reads shop identifier (SHOP_ID or SHOP_NAME) from local config / settings / storage.
 * 2. Fetches all shop statuses from GET https://darshan-seq.onrender.com/shops/status.
 * 3. Finds this shop in data.data by matching id === config.SHOP_ID or shop_name.toLowerCase() === config.SHOP_NAME.toLowerCase().
 * 4. Access Control:
 *    - Active (is_active: true): Grants full access.
 *    - Inactive / Expired (is_active: false or not found): Locks interface and displays renewal modal.
 * 5. Payment Initiation & Auto-Unlock:
 *    - Clicks "Pay Now & Renew" -> POST https://darshan-seq.onrender.com/shops/${shop.id}/pay.
 *    - Retrieves checkoutUrl from response.payment_data.checkoutUrl.
 *    - Opens checkoutUrl in browser for UPI QR code scanning.
 *    - Polls GET https://darshan-seq.onrender.com/shops/status every 4 seconds.
 *    - Auto-unlocks and reloads the app the moment is_active becomes true.
 */

const CENTRAL_API_DEFAULT = 'https://darshan-seq.onrender.com';
const POLL_INTERVAL_MS = 4000;

/**
 * Retrieves the local configuration for shop identification.
 * Priority: window.APP_CONFIG -> localStorage -> Backend /api/license/config
 * @returns {Promise<{SHOP_ID: number|null, SHOP_NAME: string, LICENSE_API_BASE: string}>}
 */
export async function getLocalConfig() {
  let shopId = localStorage.getItem('SHOP_ID') || localStorage.getItem('app_shop_id');
  let shopName = localStorage.getItem('SHOP_NAME') || localStorage.getItem('app_shop_name');
  let apiBase = CENTRAL_API_DEFAULT;

  // 1. Check window.APP_CONFIG override
  if (typeof window !== 'undefined' && window.APP_CONFIG) {
    if (window.APP_CONFIG.SHOP_ID != null) shopId = window.APP_CONFIG.SHOP_ID;
    if (window.APP_CONFIG.SHOP_NAME) shopName = window.APP_CONFIG.SHOP_NAME;
    if (window.APP_CONFIG.LICENSE_API_BASE) apiBase = window.APP_CONFIG.LICENSE_API_BASE;
  }

  // 2. Query local backend /api/license/config if any key is missing
  if (!shopId || !shopName) {
    try {
      const res = await fetch('/api/license/config');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.config) {
          if (!shopId && json.config.SHOP_ID != null) shopId = json.config.SHOP_ID;
          if (!shopName && json.config.SHOP_NAME) shopName = json.config.SHOP_NAME;
          if (json.config.LICENSE_API_BASE) apiBase = json.config.LICENSE_API_BASE;
        }
      }
    } catch (_) {
      // Backend config query error, proceed with local fallbacks
    }
  }

  const numericId = (shopId != null && !isNaN(shopId)) ? Number(shopId) : null;

  return {
    SHOP_ID: numericId,
    SHOP_NAME: shopName ? String(shopName).trim() : '',
    LICENSE_API_BASE: (apiBase || CENTRAL_API_DEFAULT).replace(/\/+$/, ''),
  };
}

/**
 * Fetches all shop statuses from central API (with graceful fallback to backend proxy if CORS/offline).
 * @param {string} apiBase
 * @returns {Promise<{success: boolean, data: Array<any>}>}
 */
export async function fetchShopsStatus(apiBase = CENTRAL_API_DEFAULT) {
  // 1. Attempt direct fetch to central license checker API
  try {
    const res = await fetch(`${apiBase}/shops/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        return { success: true, data: json.data };
      }
    }
  } catch (directErr) {
    console.warn('[LICENSE] Direct central API fetch blocked or failed (CORS/network), falling back to local proxy:', directErr.message);
  }

  // 2. Fallback to local server proxy (/api/license/shops)
  try {
    const proxyRes = await fetch('/api/license/shops');
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json && Array.isArray(json.data)) {
        return { success: true, data: json.data };
      }
    }
  } catch (proxyErr) {
    console.warn('[LICENSE] Local proxy fetch failed:', proxyErr.message);
  }

  // 3. Fallback to /api/license/status
  try {
    const statusRes = await fetch('/api/license/status');
    if (statusRes.ok) {
      const json = await statusRes.json();
      if (json && json.shop) {
        return { success: true, data: [json.shop] };
      }
    }
  } catch (_) {}

  return { success: false, data: [] };
}

/**
 * Helper to ensure a shop object has its ID populated.
 * If /shops/status omits id, resolves id from /shops or config.
 */
async function resolveShopId(shop, config) {
  if (shop && shop.id != null) return shop.id;
  if (config.SHOP_ID != null) return config.SHOP_ID;

  // Attempt to query /shops to resolve id by shop_name
  try {
    const res = await fetch(`${config.LICENSE_API_BASE}/shops`).catch(() => null);
    if (res && res.ok) {
      const json = await res.json();
      const allShops = json?.data || [];
      const match = allShops.find(s => s.shop_name && s.shop_name.toLowerCase() === shop.shop_name.toLowerCase());
      if (match && match.id != null) {
        shop.id = match.id;
        return match.id;
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Verifies app license against central API using config.SHOP_ID or config.SHOP_NAME.
 * @returns {Promise<{allowed: boolean, is_active: boolean, shop: any, message: string}>}
 */
export async function verifyLicense() {
  const config = await getLocalConfig();
  const statusResult = await fetchShopsStatus(config.LICENSE_API_BASE);

  if (!statusResult.success || !statusResult.data || statusResult.data.length === 0) {
    // Central server unreachable — query local SQLite cached license via backend
    try {
      const cachedRes = await fetch('/api/license/status');
      if (cachedRes.ok) {
        const cached = await cachedRes.json();
        return {
          allowed: !!cached.allowed,
          is_active: !!cached.is_active,
          shop: cached.shop || { shop_name: config.SHOP_NAME, amount: 3000, expires_at: 'Offline' },
          message: cached.message || (cached.allowed ? 'Offline grace mode' : 'License check offline failed'),
          offline: true,
        };
      }
    } catch (_) {}

    return {
      allowed: false,
      is_active: false,
      shop: { shop_name: config.SHOP_NAME, amount: 3000, expires_at: 'Offline / Unreachable' },
      message: 'Could not connect to license verification server.',
      offline: true,
    };
  }

  const shops = statusResult.data;

  // Find shop by matching either id === config.SHOP_ID or shop_name.toLowerCase() === config.SHOP_NAME.toLowerCase()
  const matched = shops.find(s => {
    const idMatches = config.SHOP_ID != null && s.id != null && (s.id === config.SHOP_ID || String(s.id) === String(config.SHOP_ID));
    const nameMatches = config.SHOP_NAME && s.shop_name && (String(s.shop_name).trim().toLowerCase() === String(config.SHOP_NAME).trim().toLowerCase());
    return idMatches || nameMatches;
  });

  if (!matched) {
    return {
      allowed: false,
      is_active: false,
      shop: {
        id: config.SHOP_ID,
        shop_name: config.SHOP_NAME || 'Your Studio',
        amount: 3000.0,
        expires_at: 'Not Registered',
      },
      message: `Shop '${config.SHOP_NAME || config.SHOP_ID}' is not registered in the central system.`,
      offline: false,
    };
  }

  // Populate id on shop object if missing
  if (matched.id == null) {
    matched.id = await resolveShopId(matched, config);
  }

  let isActive = !!matched.is_active;

  // Check expiration if expires_at is present
  if (isActive && matched.expires_at) {
    try {
      const expDate = new Date(matched.expires_at);
      if (!isNaN(expDate.getTime()) && expDate < new Date()) {
        isActive = false;
        matched.is_active = false;
      }
    } catch (_) {}
  }

  return {
    allowed: isActive,
    is_active: isActive,
    shop: matched,
    message: isActive ? 'License is active.' : `Subscription for '${matched.shop_name}' is inactive or expired.`,
    offline: false,
  };
}

/**
 * Initiates payment via POST https://darshan-seq.onrender.com/shops/${shop.id}/pay
 * (with fallback to local backend proxy if CORS blocks the browser).
 * @param {number|string} shopId
 * @param {string} apiBase
 * @returns {Promise<{success: boolean, checkoutUrl?: string, message?: string}>}
 */
export async function initiatePayment(shopId, apiBase = CENTRAL_API_DEFAULT) {
  // 1. Direct POST to central API
  try {
    const res = await fetch(`${apiBase}/shops/${shopId}/pay`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const checkoutUrl = data?.payment_data?.checkoutUrl || data?.checkoutUrl;
      if (checkoutUrl) {
        return { success: true, checkoutUrl, data };
      }
    }
  } catch (err) {
    console.warn('[LICENSE] Direct payment initiation failed (CORS/network), trying local proxy:', err.message);
  }

  // 2. Fallback to local server proxy
  try {
    const proxyRes = await fetch(`/api/license/${shopId}/pay`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
    });
    const proxyData = await proxyRes.json();
    const checkoutUrl = proxyData?.payment_data?.checkoutUrl || proxyData?.checkoutUrl;
    if (proxyRes.ok && checkoutUrl) {
      return { success: true, checkoutUrl, data: proxyData };
    }
    return {
      success: false,
      message: proxyData?.message || 'Payment initiation failed. Please check network.',
    };
  } catch (proxyErr) {
    return {
      success: false,
      message: `Failed to initiate payment: ${proxyErr.message}`,
    };
  }
}

/**
 * Formats ISO date into human-readable string (e.g., "23 Nov 2026, 02:31 PM").
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Not Registered' || dateStr === 'Offline') {
    return dateStr || 'N/A';
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (_) {
    return dateStr;
  }
}

/**
 * Locks the interface and renders the renewal modal.
 * Starts 4-second polling when user clicks "Pay Now & Renew".
 * Auto-unlocks and reloads when is_active flips to true.
 * 
 * @param {object} shop - The shop object containing shop_name, expires_at, amount, id
 * @param {object} [options] - Optional settings { onUnlock, rootEl }
 */
export function showRenewalModal(shop, options = {}) {
  // Remove any existing renewal overlay
  const existing = document.getElementById('license-lock-overlay');
  if (existing) existing.remove();

  let pollIntervalId = null;

  const overlay = document.createElement('div');
  overlay.id = 'license-lock-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100vw; height: 100vh;
    z-index: 999999;
    background: radial-gradient(ellipse at 50% 15%, rgba(26, 3, 8, 0.96) 0%, rgba(10, 1, 4, 0.98) 100%);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  `;

  const shopName = shop?.shop_name || 'Your Studio';
  const expiresAtFormatted = formatDate(shop?.expires_at);
  const amount = (shop?.amount != null && !isNaN(shop.amount)) ? Number(shop.amount) : 3000;
  const logoUrl = localStorage.getItem('app_logo_url') || '/assets/logo.png';

  overlay.innerHTML = `
    <style>
      @keyframes modalSlideUp {
        from { opacity: 0; transform: translateY(24px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes pulseGlow {
        0%, 100% { box-shadow: 0 0 25px rgba(220, 38, 38, 0.25), 0 10px 40px rgba(0,0,0,0.6); }
        50% { box-shadow: 0 0 45px rgba(220, 38, 38, 0.45), 0 14px 50px rgba(0,0,0,0.8); }
      }
      @keyframes spinLoader {
        to { transform: rotate(360deg); }
      }
      @keyframes pulseDot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.85); }
      }
    </style>

    <div style="
      background: #FFFFFF;
      width: 100%;
      max-width: 480px;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 60px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(212, 160, 23, 0.25);
      animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1), pulseGlow 4s infinite ease-in-out;
      display: flex;
      flex-direction: column;
    ">
      <!-- Modal Header -->
      <div style="
        background: linear-gradient(135deg, #2A080C 0%, #4A0E17 100%);
        padding: 26px 24px 22px;
        text-align: center;
        color: #FFFFFF;
        position: relative;
        border-bottom: 2px solid #D4A017;
      ">
        <div style="
          width: 68px; height: 68px;
          border-radius: 16px;
          background: #FFFFFF;
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
          <img src="${logoUrl}" alt="${shopName}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.parentElement.innerHTML='<span style=font-size:32px>👗</span>'" />
        </div>

        <div style="
          display: inline-block;
          background: rgba(220, 38, 38, 0.25);
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: #FECACA;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 4px 12px;
          border-radius: 999px;
          margin-bottom: 8px;
        ">
          Subscription Inactive
        </div>

        <h2 style="
          font-size: 21px;
          font-weight: 800;
          margin: 0 0 4px 0;
          color: #FFFDF9;
          letter-spacing: -0.01em;
        ">${shopName}</h2>
        <p style="
          font-size: 13px;
          color: rgba(255, 253, 249, 0.75);
          margin: 0;
        ">Your license has expired. Renew your plan to continue using the studio.</p>
      </div>

      <!-- Modal Body / Details -->
      <div style="padding: 24px; background: #FAFAFA;">
        <div style="
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F3F4F6; padding-bottom: 10px;">
            <span style="font-size: 13px; color: #6B7280; font-weight: 500;">Shop Name</span>
            <span style="font-size: 14px; color: #111827; font-weight: 700;">${shopName}</span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F3F4F6; padding-bottom: 10px;">
            <span style="font-size: 13px; color: #6B7280; font-weight: 500;">Expiry Date</span>
            <span style="font-size: 14px; color: #DC2626; font-weight: 600;">${expiresAtFormatted}</span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 2px;">
            <span style="font-size: 13px; color: #6B7280; font-weight: 500;">Renewal Fee</span>
            <span style="font-size: 19px; color: #047857; font-weight: 800;">₹${amount}</span>
          </div>
        </div>

        <!-- Polling & Action Container -->
        <div id="renewal-action-area">
          <button id="pay-renew-btn" style="
            width: 100%;
            padding: 14px 20px;
            background: linear-gradient(135deg, #9E7B3B 0%, #D4A017 100%);
            color: #FFFFFF;
            font-size: 15px;
            font-weight: 700;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(158, 123, 59, 0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
          ">
            <span>Pay Now & Renew</span>
            <span style="font-size: 17px;">💳</span>
          </button>
        </div>

        <!-- Live Status / Message Container -->
        <div id="renewal-status-box" style="
          display: none;
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          font-size: 12px;
          color: #1E40AF;
          text-align: center;
          line-height: 1.5;
        ">
        </div>

        <!-- Offline / Secondary Action Buttons -->
        <div style="display: flex; gap: 10px; margin-top: 14px;">
          <button id="retry-status-btn" style="
            flex: 1;
            padding: 9px 12px;
            background: #F3F4F6;
            color: #4B5563;
            border: 1px solid #D1D5DB;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">🔄 Refresh Status</button>

          <button id="help-admin-btn" style="
            flex: 1;
            padding: 9px 12px;
            background: #F3F4F6;
            color: #4B5563;
            border: 1px solid #D1D5DB;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">📞 Contact Support</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const payBtn = overlay.querySelector('#pay-renew-btn');
  const statusBox = overlay.querySelector('#renewal-status-box');
  const retryBtn = overlay.querySelector('#retry-status-btn');
  const helpBtn = overlay.querySelector('#help-admin-btn');

  function updateStatus(message, type = 'info', htmlContent = null) {
    if (!statusBox) return;
    statusBox.style.display = 'block';
    if (htmlContent) {
      statusBox.innerHTML = htmlContent;
    } else {
      statusBox.textContent = message;
    }
    if (type === 'error') {
      statusBox.style.background = '#FEF2F2';
      statusBox.style.border = '1px solid #FECACA';
      statusBox.style.color = '#B91C1C';
    } else if (type === 'success') {
      statusBox.style.background = '#ECFDF5';
      statusBox.style.border = '1px solid #A7F3D0';
      statusBox.style.color = '#047857';
    } else {
      statusBox.style.background = '#EFF6FF';
      statusBox.style.border = '1px solid #BFDBFE';
      statusBox.style.color = '#1E40AF';
    }
  }

  // Auto-Unlock Handler
  async function unlockAndReload() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    updateStatus('🎉 Payment confirmed! Subscription activated. Launching showroom...', 'success');
    
    setTimeout(() => {
      overlay.style.transition = 'opacity 0.4s ease';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        if (typeof options.onUnlock === 'function') {
          options.onUnlock();
        } else {
          window.location.reload(true);
        }
      }, 400);
    }, 1200);
  }

  // Start polling GET /shops/status every 4 seconds
  function startStatusPolling(targetShopId, targetShopName, config) {
    if (pollIntervalId) clearInterval(pollIntervalId);

    pollIntervalId = setInterval(async () => {
      try {
        const res = await fetchShopsStatus(config.LICENSE_API_BASE);
        if (res && res.success && Array.isArray(res.data)) {
          const matched = res.data.find(s => {
            const idMatches = targetShopId != null && s.id != null && (s.id === targetShopId || String(s.id) === String(targetShopId));
            const nameMatches = targetShopName && s.shop_name && (String(s.shop_name).trim().toLowerCase() === String(targetShopName).trim().toLowerCase());
            return idMatches || nameMatches;
          });

          if (matched && matched.is_active) {
            // Check expiry hasn't already lapsed
            let active = true;
            if (matched.expires_at) {
              const exp = new Date(matched.expires_at);
              if (!isNaN(exp.getTime()) && exp < new Date()) active = false;
            }
            if (active) {
              await unlockAndReload();
            }
          }
        }
      } catch (err) {
        console.warn('[LICENSE] Error during auto-unlock poll:', err);
      }
    }, POLL_INTERVAL_MS);
  }

  // "Pay Now & Renew" Click Handler
  payBtn?.addEventListener('click', async () => {
    payBtn.disabled = true;
    payBtn.innerHTML = `
      <div style="width: 18px; height: 18px; border: 2px solid #FFFFFF; border-top-color: transparent; border-radius: 50%; animation: spinLoader 0.7s linear infinite;"></div>
      <span>Opening Payment Gateway...</span>
    `;

    updateStatus('Connecting to secure payment gateway. Please wait...');

    try {
      const config = await getLocalConfig();
      const shopIdToPay = shop?.id || config.SHOP_ID || await resolveShopId(shop, config);

      if (!shopIdToPay) {
        updateStatus('Cannot initiate payment: Missing Shop ID. Please contact support.', 'error');
        payBtn.disabled = false;
        payBtn.innerHTML = `<span>Pay Now & Renew</span><span style="font-size:17px;">💳</span>`;
        return;
      }

      // 1. Send POST /shops/${shop.id}/pay
      const paymentRes = await initiatePayment(shopIdToPay, config.LICENSE_API_BASE);

      if (!paymentRes.success || !paymentRes.checkoutUrl) {
        updateStatus(paymentRes.message || 'Payment initiation failed. Please retry.', 'error');
        payBtn.disabled = false;
        payBtn.innerHTML = `<span>Pay Now & Renew</span><span style="font-size:17px;">💳</span>`;
        return;
      }

      const checkoutUrl = paymentRes.checkoutUrl;

      // 2. Open checkoutUrl in browser so customer can scan UPI QR code
      const popup = window.open(checkoutUrl, '_blank');
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Pop-up was blocked by browser — provide direct link
        window.location.href = checkoutUrl;
      }

      // Update button & status box to active polling state
      payBtn.disabled = false;
      payBtn.innerHTML = `
        <span>Reopen Payment Link</span>
        <span style="font-size: 15px;">🔗</span>
      `;
      payBtn.onclick = () => window.open(checkoutUrl, '_blank');

      updateStatus(
        '',
        'info',
        `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; margin-bottom: 4px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #2563EB; animation: pulseDot 1.4s infinite;"></span>
          <span>Awaiting UPI Confirmation...</span>
        </div>
        <div style="font-size: 11px; opacity: 0.85;">
          Scan the QR code in the opened payment tab.<br>
          This screen will automatically unlock once payment is detected.
        </div>
        <div style="margin-top: 6px;">
          <a href="${checkoutUrl}" target="_blank" style="color: #1D4ED8; font-weight: 700; text-decoration: underline;">
            Click here if payment tab did not open
          </a>
        </div>
        `
      );

      // 3. Poll GET /shops/status every 4 seconds
      startStatusPolling(shopIdToPay, shop?.shop_name || config.SHOP_NAME, config);

    } catch (err) {
      updateStatus(`Payment error: ${err.message}`, 'error');
      payBtn.disabled = false;
      payBtn.innerHTML = `<span>Pay Now & Renew</span><span style="font-size:17px;">💳</span>`;
    }
  });

  // "Refresh Status" button
  retryBtn?.addEventListener('click', async () => {
    retryBtn.textContent = 'Checking...';
    try {
      const check = await verifyLicense();
      if (check.allowed) {
        await unlockAndReload();
      } else {
        updateStatus(check.message || 'Status verified: License is still inactive.', 'error');
      }
    } catch (e) {
      updateStatus(`Could not check license: ${e.message}`, 'error');
    } finally {
      retryBtn.textContent = '🔄 Refresh Status';
    }
  });

  // "Contact Support" button
  helpBtn?.addEventListener('click', () => {
    alert(`Please contact your software administrator to activate license for '${shopName}' (ID: ${shop?.id || 'N/A'}).`);
  });
}
