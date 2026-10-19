/**
 * tag.js — Printable Garment Hanger Tag / 80mm Thermal Receipt Generator
 * 
 * WHY:
 * Physical bridal boutiques attach 80mm thermal receipts to garment hangers
 * and provide duplicates to customers. Formatted specifically for 80mm slip
 * printers with high-contrast text, clear borders, and dashed dividers.
 */

const formatINR = (val) => Number(val || 0).toLocaleString('en-IN');

/**
 * Prepares the DOM with garment & booking details and triggers the browser print dialog.
 * @param {object} article - Article data model
 * @param {string} [shopName='MEHAK BRIDAL STUDIO'] - Boutique name
 */
export function printGarmentTag(article, shopName = '') {
  const storeBrand = (shopName && shopName.trim()) ? shopName.trim().toUpperCase() : 'BRIDAL STUDIO';
  if (!article) return;

  const numPrice = Number(article.price) || 0;
  const numAdvance = Number(article.advance_amount) || 0;
  const numSecurity = Number(article.security_deposit) || 0;
  const numBalance = article.balance_amount !== undefined && article.balance_amount !== null
    ? Number(article.balance_amount)
    : Math.max(0, numPrice - numAdvance);

  const printTimestamp = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  let tagContainer = document.getElementById('printable-hanger-tag');
  if (!tagContainer) {
    tagContainer = document.createElement('div');
    tagContainer.id = 'printable-hanger-tag';
    tagContainer.className = 'printable-tag-wrapper';
    document.body.appendChild(tagContainer);
  }

  tagContainer.innerHTML = `
    <div class="tag-inner-card">
      <div class="tag-header">
        <div class="tag-brand">${escapeHtml(storeBrand)}</div>
        <div class="tag-sub">Bridal Studio & Haute Couture</div>
        <div class="tag-timestamp">Date: ${printTimestamp}</div>
      </div>

      <div class="tag-divider"></div>

      <div class="tag-id-box font-mono">
        <span class="tag-id-title">ARTICLE CODE</span>
        <span>${escapeHtml(article.article_id || '0001')}</span>
      </div>

      <div class="tag-details-table">
        <div class="tag-row">
          <span class="tag-label">ITEM:</span>
          <span class="tag-val">${escapeHtml(article.title || 'Designer Lehenga')}</span>
        </div>
        <div class="tag-row">
          <span class="tag-label">CATEGORY:</span>
          <span class="tag-val">${escapeHtml(article.category || 'Bridal')}</span>
        </div>
        ${article.color || article.size ? `
          <div class="tag-row">
            <span class="tag-label">COLOR / SIZE:</span>
            <span class="tag-val">${escapeHtml([article.color, article.size].filter(Boolean).join(' / '))}</span>
          </div>
        ` : ''}
        <div class="tag-row">
          <span class="tag-label">CUSTOMER:</span>
          <span class="tag-val bold">${escapeHtml(article.customer_name || 'N/A')}</span>
        </div>
        ${article.customer_phone ? `
          <div class="tag-row">
            <span class="tag-label">PHONE:</span>
            <span class="tag-val bold">${escapeHtml(article.customer_phone)}</span>
          </div>
        ` : ''}

        <div class="tag-dates-section">
          <div class="tag-row">
            <span class="tag-label">PICKUP DATE:</span>
            <span class="tag-val bold">${escapeHtml(article.pickup_date || 'N/A')}</span>
          </div>
          <div class="tag-row">
            <span class="tag-label">RETURN DATE:</span>
            <span class="tag-val bold">${escapeHtml(article.return_date || 'N/A')}</span>
          </div>
        </div>

        <div class="tag-divider"></div>

        <div class="tag-row">
          <span class="tag-label">TOTAL PRICE:</span>
          <span class="tag-val bold">₹${formatINR(numPrice)}</span>
        </div>
        <div class="tag-row">
          <span class="tag-label">ADVANCE PAID:</span>
          <span class="tag-val">₹${formatINR(numAdvance)}</span>
        </div>
        ${numSecurity > 0 ? `
          <div class="tag-row">
            <span class="tag-label">SECURITY DEPOSIT:</span>
            <span class="tag-val">₹${formatINR(numSecurity)}</span>
          </div>
        ` : ''}

        <div class="highlight-due">
          <span class="tag-label">BALANCE DUE:</span>
          <span class="tag-val">₹${formatINR(numBalance)}</span>
        </div>

        <div class="tag-row" style="margin-top: 4px;">
          <span class="tag-label">BOOKED BY:</span>
          <span class="tag-val">${escapeHtml(article.salesman_name || 'Studio Staff')}</span>
        </div>
      </div>

      <div class="tag-footer">
        <div>* Please produce this receipt for Pickup & Return</div>
        <div>* Verify garment condition before leaving studio</div>
        <div class="tag-cut-indicator">- - - - - THANK YOU - - - - -</div>
      </div>
    </div>
  `;

  // Brief timeout to ensure DOM layout settles before print
  setTimeout(() => {
    window.print();
  }, 100);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
