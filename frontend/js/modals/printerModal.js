/**
 * printerModal.js — Thermal Printer Hardware Configuration & Diagnostic Modal
 * 
 * WHY:
 * Bridal studios using the PIXEL DP82 (or compatible 80mm ESC/POS printers) need
 * an effortless way to select their USB thermal printer and run hardware test cuts
 * without opening browser print dialogs.
 */

import { openModal, closeModal } from '../modal.js';
import { renderIcon } from '../icons.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens the Thermal Printer setup & diagnostic modal.
 */
export async function openPrinterModal() {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 480px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: var(--gold);">${renderIcon('printer', { size: 20 })}</span>
          <span>PIXEL DP82 Thermal Printer Setup</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
        <div style="background: rgba(184, 134, 11, 0.08); border: 1px solid rgba(184, 134, 11, 0.25); border-radius: 8px; padding: 12px 14px; font-size: 0.85rem; line-height: 1.45; color: var(--text-main);">
          <strong style="color: var(--gold); display: block; margin-bottom: 2px;">⚡ Direct 1-Click ESC/POS Silent Printing</strong>
          When printing from this studio, bills bypass the browser print dialog and send raw ESC/POS commands directly to your <strong>PIXEL DP82</strong> with auto-feed &amp; clean cut.
        </div>

        <!-- Printer Selector -->
        <div>
          <label class="input-label" for="printer-select" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Connected Thermal Printer</span>
            <button type="button" id="btn-refresh-printers" class="btn btn-ghost btn-sm" style="padding: 2px 6px; font-size: 0.76rem;" title="Refresh list of Windows printers">
              ${renderIcon('rotateCcw', { size: 12 })} Refresh
            </button>
          </label>
          <select id="printer-select" class="input-field" style="width: 100%;">
            <option value="">Scanning installed printers...</option>
          </select>
          <div id="printer-status-text" style="font-size: 0.78rem; color: var(--text-muted); margin-top: 5px;"></div>
        </div>

        <!-- Hardware Specs Pill -->
        <div style="background: #F8F9FA; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; font-size: 0.82rem; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <div><strong style="color: #4B5563;">Model:</strong> PIXEL DP82</div>
          <div><strong style="color: #4B5563;">Paper Width:</strong> 80mm roll</div>
          <div><strong style="color: #4B5563;">Print Area:</strong> 72mm (576 dots)</div>
          <div><strong style="color: #4B5563;">Cutter Feed:</strong> 35mm (6 lines)</div>
        </div>

        <!-- Diagnostic Actions -->
        <div style="display: flex; gap: 10px; margin-top: 4px;">
          <button type="button" id="btn-test-print" class="btn btn-outline btn-sm" style="flex: 1; display: inline-flex; justify-content: center; align-items: center; gap: 6px;">
            ${renderIcon('printer', { size: 14 })} Test Print &amp; Cut
          </button>
          <button type="button" id="btn-save-printer" class="btn btn-gold btn-sm" style="flex: 1; display: inline-flex; justify-content: center; align-items: center; gap: 6px;">
            ${renderIcon('check', { size: 14 })} Save as Default
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer" style="display: flex; justify-content: flex-end;">
        <button type="button" class="btn btn-outline btn-sm btn-close-modal">Done</button>
      </div>
    </div>
  `;

  const closeBtn = modalEl.querySelector('.close-btn');
  const btnCloseModal = modalEl.querySelector('.btn-close-modal');
  closeBtn.addEventListener('click', closeModal);
  btnCloseModal.addEventListener('click', closeModal);

  const printerSelect = modalEl.querySelector('#printer-select');
  const statusText = modalEl.querySelector('#printer-status-text');
  const btnRefresh = modalEl.querySelector('#btn-refresh-printers');
  const btnTest = modalEl.querySelector('#btn-test-print');
  const btnSave = modalEl.querySelector('#btn-save-printer');

  async function loadPrinters() {
    printerSelect.innerHTML = `<option value="">Scanning installed printers...</option>`;
    statusText.textContent = '';
    try {
      const data = await api.getPrinters();
      const list = data.printers || [];
      const active = data.active_printer || '';

      if (list.length === 0) {
        printerSelect.innerHTML = `<option value="">No printers detected (Check USB cable)</option>`;
        statusText.innerHTML = `<span style="color: #DC2626;">⚠ No Windows printers found. Please ensure the PIXEL DP82 USB driver is installed.</span>`;
        return;
      }

      printerSelect.innerHTML = list.map(p => {
        const isSelected = (p.toLowerCase() === active.toLowerCase());
        const isPixel = p.toLowerCase().includes('pixel') || p.toLowerCase().includes('dp82') || p.toLowerCase().includes('pos');
        const label = `${p}${isPixel ? ' ★ (Recommended)' : ''}`;
        return `<option value="${escapeHtml(p)}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      }).join('');

      if (active) {
        statusText.innerHTML = `<span style="color: #059669;">✓ Active: <strong>${escapeHtml(active)}</strong></span>`;
      }
    } catch (err) {
      printerSelect.innerHTML = `<option value="">Failed to query printers</option>`;
      statusText.textContent = 'Error connecting to printer spooler.';
    }
  }

  btnRefresh.addEventListener('click', loadPrinters);

  btnSave.addEventListener('click', async () => {
    const selected = printerSelect.value;
    if (!selected) {
      showToast('Please select a printer', 'error');
      return;
    }
    btnSave.disabled = true;
    try {
      const res = await api.selectPrinter(selected);
      showToast(`✓ Active thermal printer set to ${selected}`, 'success');
      statusText.innerHTML = `<span style="color: #059669;">✓ Active: <strong>${escapeHtml(selected)}</strong></span>`;
    } catch (err) {
      showToast(`Failed to save printer: ${err.message}`, 'error');
    } finally {
      btnSave.disabled = false;
    }
  });

  btnTest.addEventListener('click', async () => {
    const selected = printerSelect.value;
    btnTest.disabled = true;
    showToast('Sending test ticket and cutter test to printer...', 'neutral', 3000);
    try {
      const res = await api.testPrintPrinter(selected);
      showToast(`✓ Test ticket & cutter test sent to ${selected || 'printer'}!`, 'success', 4000);
    } catch (err) {
      showToast(`Test print failed: ${err.message}`, 'error', 5000);
    } finally {
      btnTest.disabled = false;
    }
  });

  openModal(modalEl);
  loadPrinters();
}
