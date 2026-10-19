/**
 * qrPairingModal.js — Phone Camera Pairing QR Code Modal
 * 
 * WHY:
 * Instead of having salesmen type long local IP addresses (like http://192.168.1.34:8000/capture),
 * this modal displays a QR code that phones can scan with their native camera to instantly
 * open the mobile studio.
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
 * Opens the Mobile Phone Camera Pairing modal.
 */
export function openQrPairingModal() {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog qr-dialog">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: var(--gold);">${renderIcon('qrcode', { size: 20 })}</span>
          <span>Mobile Phone Pairing</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body qr-modal-body">
        <p class="qr-guide-text">
          Scan this QR code with any phone connected to the studio Wi-Fi to open the mobile booking camera studio.
        </p>

        <div class="qr-code-frame" id="qr-frame-box">
          <div class="qr-placeholder" id="qr-placeholder">
            ${renderIcon('qrcode', { size: 56, color: '#8C6A2A' })}
            <span>Detecting Network & Generating QR...</span>
          </div>
        </div>

        <div class="network-details-box">
          <div class="network-detail-row">
            <span class="net-label">
              ${renderIcon('wifi', { size: 14 })} Studio Wi-Fi IP:
            </span>
            <span class="net-value font-mono" id="net-ip-val">Detecting...</span>
          </div>

          <div class="network-detail-row">
            <span class="net-label">Direct URL:</span>
            <span class="net-value font-mono" id="net-url-val">Detecting...</span>
            <button type="button" class="btn btn-sm btn-outline copy-link-btn" id="copy-qr-link-btn" style="display: none;">
              ${renderIcon('copy', { size: 14 })} Copy
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <a href="/capture" target="_blank" rel="noopener noreferrer" class="btn btn-outline" id="open-tab-link">
          ${renderIcon('externalLink', { size: 15 })} Open Mobile View in New Tab
        </a>
        <button type="button" class="btn btn-gold close-footer-btn">Done</button>
      </div>
    </div>
  `;

  const closeBtn = modalEl.querySelector('.close-btn');
  const closeFooterBtn = modalEl.querySelector('.close-footer-btn');
  closeBtn.addEventListener('click', closeModal);
  closeFooterBtn.addEventListener('click', closeModal);

  const qrFrame = modalEl.querySelector('#qr-frame-box');
  const netIpVal = modalEl.querySelector('#net-ip-val');
  const netUrlVal = modalEl.querySelector('#net-url-val');
  const copyBtn = modalEl.querySelector('#copy-qr-link-btn');
  const openTabLink = modalEl.querySelector('#open-tab-link');

  let captureUrl = '';

  copyBtn.addEventListener('click', () => {
    if (!captureUrl) return;
    navigator.clipboard.writeText(captureUrl).then(() => {
      copyBtn.innerHTML = `${renderIcon('check', { size: 14, color: '#059669' })} Copied`;
      showToast('Copied pairing URL to clipboard', 'success');
      setTimeout(() => {
        copyBtn.innerHTML = `${renderIcon('copy', { size: 14 })} Copy`;
      }, 2000);
    });
  });

  const currentPort = window.location.port ? parseInt(window.location.port, 10) : undefined;
  api.getNetworkInfo(currentPort)
    .then((res) => {
      if (res.success) {
        captureUrl = res.networkCaptureUrl;
        netIpVal.textContent = res.ip || 'Local';
        netUrlVal.textContent = res.networkCaptureUrl;
        openTabLink.href = res.networkCaptureUrl || '/capture';
        copyBtn.style.display = 'inline-flex';

        if (res.qrCodeDataUrl) {
          qrFrame.innerHTML = `
            <img src="${res.qrCodeDataUrl}" alt="Scan to pair phone" class="qr-img" />
          `;
        }
      } else {
        qrFrame.innerHTML = `<p style="color: #DC2626; font-size: 0.82rem; padding: 10px;">Failed to detect network IP.</p>`;
      }
    })
    .catch((err) => {
      qrFrame.innerHTML = `<p style="color: #DC2626; font-size: 0.82rem; padding: 10px;">Network pairing error: ${escapeHtml(err.message)}</p>`;
    });

  openModal(modalEl);
}
