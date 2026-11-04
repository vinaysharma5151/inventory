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
 * Returns or creates the singleton AudioContext.
 * Ensures the context is resumed from suspended state.
 */
function getAudioContext() {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return null;
      sharedAudioCtx = new AudioCtxClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (_) {
    return null;
  }
}

// Unlocks browser audio on first user gesture anywhere on the window
if (typeof window !== 'undefined') {
  const unlockAudioContext = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (_) {}
    window.removeEventListener('click', unlockAudioContext);
    window.removeEventListener('keydown', unlockAudioContext);
    window.removeEventListener('pointerdown', unlockAudioContext);
    window.removeEventListener('touchstart', unlockAudioContext);
  };
  window.addEventListener('click', unlockAudioContext, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudioContext, { once: true, passive: true });
  window.addEventListener('pointerdown', unlockAudioContext, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudioContext, { once: true, passive: true });
}

/**
 * Helper to play a harmonic bell note with fundamental and overtone.
 */
function playHarmonicBell(ctx, destination, freq, startTime, duration, volume = 0.4) {
  // Fundamental tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, startTime);

  gain1.gain.setValueAtTime(0.0001, startTime);
  gain1.gain.linearRampToValueAtTime(volume, startTime + 0.015);
  gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc1.connect(gain1);
  gain1.connect(destination);
  osc1.start(startTime);
  osc1.stop(startTime + duration);

  // Subtle overtone (sparkle harmonic at 2x frequency)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, startTime);

  gain2.gain.setValueAtTime(0.0001, startTime);
  gain2.gain.linearRampToValueAtTime(volume * 0.25, startTime + 0.012);
  gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + (duration * 0.55));

  osc2.connect(gain2);
  gain2.connect(destination);
  osc2.start(startTime);
  osc2.stop(startTime + (duration * 0.55));
}

/**
 * Plays a rich, pleasant luxury chime (E5 -> A5 ascending notes)
 * when new data / booking is captured on a phone.
 */
export function playLiveSyncChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.55, now);
    master.connect(ctx.destination);

    // Note 1: E5 (659.25 Hz)
    playHarmonicBell(ctx, master, 659.25, now, 0.42, 0.35);

    // Note 2: A5 (880.00 Hz) — arrives 140ms later with lingering ring
    playHarmonicBell(ctx, master, 880.00, now + 0.14, 0.65, 0.40);
  } catch (_) {
    // Graceful ignore if audio unavailable
  }
}

/**
 * Plays a swift, cheerful confirmation chime (ascending swoosh + high C6 ping)
 * when a message (SMS / bill notification) is sent.
 */
export function playMessageSentChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.50, now);
    master.connect(ctx.destination);

    // 1. Upward whoosh tone (G5 -> C6)
    const oscGlide = ctx.createOscillator();
    const gainGlide = ctx.createGain();
    oscGlide.type = 'sine';
    oscGlide.frequency.setValueAtTime(783.99, now); // G5
    oscGlide.frequency.exponentialRampToValueAtTime(1046.50, now + 0.08); // C6

    gainGlide.gain.setValueAtTime(0.0001, now);
    gainGlide.gain.linearRampToValueAtTime(0.32, now + 0.03);
    gainGlide.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);

    oscGlide.connect(gainGlide);
    gainGlide.connect(master);
    oscGlide.start(now);
    oscGlide.stop(now + 0.10);

    // 2. High confirmation bell ping at C6 (1046.50 Hz)
    playHarmonicBell(ctx, master, 1046.50, now + 0.07, 0.45, 0.40);
  } catch (_) {
    // Graceful ignore if audio unavailable
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
