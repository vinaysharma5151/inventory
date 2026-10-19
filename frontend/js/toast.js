/**
 * toast.js — Toast Notification Stack & Web Audio Chime Helper
 * 
 * WHY:
 * 1. Audio chime provides instant auditory feedback to shop owners when staff
 *    take a photo on a phone, even if the desktop laptop is across the room.
 * 2. Web Audio API creates the sound purely in mathematical frequencies (D5 to A5),
 *    so no sound files need to be downloaded or loaded over the network.
 */

import { renderIcon } from './icons.js';

let sharedAudioCtx = null;

/**
 * Plays a pleasant luxury chime (D5 -> A5 ascending tones) using Web Audio API.
 * Uses a singleton AudioContext to prevent memory leaks or audio node exhaustion.
 */
export function playLiveSyncChime() {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      sharedAudioCtx = new AudioCtxClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    const ctx = sharedAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 (587.33 Hz)
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5 (880 Hz)

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {
    // Audio autoplays might be muted by browser until user interacts with page
  }
}

/**
 * Displays a toast notification in the bottom right corner of the screen.
 * @param {string} message - Notification text
 * @param {'success'|'neutral'|'error'} [type='success'] - Visual style of toast
 * @param {number} [duration=4000] - Duration in milliseconds before auto-removal
 */
export function showToast(message, type = 'success', duration = 4000) {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }

  const item = document.createElement('div');
  item.className = `toast-item ${type}`;

  const iconName = type === 'error' ? 'alertCircle' : 'checkCircle';
  const iconColor = type === 'error' ? '#DC2626' : type === 'neutral' ? '#6B7280' : '#10B981';

  item.innerHTML = `
    ${renderIcon(iconName, { size: 18, color: iconColor })}
    <span class="toast-message"></span>
  `;
  // Use textContent for safety against XSS
  item.querySelector('.toast-message').textContent = message;

  stack.appendChild(item);

  setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(8px)';
    item.style.transition = 'all 0.25s ease';
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 250);
  }, duration);
}

/**
 * Toast convenience object for direct toast.success() and toast.error() calls.
 */
export const toast = {
  success: (msg, duration) => showToast(msg, 'success', duration),
  error: (msg, duration) => showToast(msg, 'error', duration),
  info: (msg, duration) => showToast(msg, 'neutral', duration),
};
