/**
 * paymentCalculator.js — Payment Calculation & Preset Handler for Mobile Studio.
 * 
 * WHY:
 * Encapsulates rental pricing math, advance deposit deduction, quick 25%/50%/100%
 * presets, and live visual state badges (due vs fully paid).
 */

const formatINR = (val) => Number(val || 0).toLocaleString('en-IN');

/**
 * Initializes and binds payment calculation events.
 * @param {HTMLElement} containerEl
 * @param {object} callbacks - { onPaymentChange }
 * @returns {object} - { getValues(), reset(), update() }
 */
export function initPaymentCalculator(containerEl, callbacks = {}) {
  const priceInput = containerEl.querySelector('#m-price-input');
  const advanceInput = containerEl.querySelector('#m-advance-input');
  const badge = containerEl.querySelector('#m-calc-badge');
  const box = containerEl.querySelector('#m-balance-box');
  const sub = containerEl.querySelector('#m-balance-sub');
  const num = containerEl.querySelector('#m-balance-num');
  const presetBtns = containerEl.querySelectorAll('.preset-btn');

  const update = () => {
    const p = parseFloat(priceInput.value) || 0;
    const adv = parseFloat(advanceInput.value) || 0;
    const bal = Math.max(0, p - adv);

    if (num) num.textContent = formatINR(bal);

    if (badge && box && sub) {
      if (p <= 0) {
        badge.className = 'badge badge-neutral';
        badge.textContent = 'Enter Price';
        box.className = 'balance-result-box';
        sub.textContent = 'Enter price to calculate balance';
      } else if (adv > p) {
        badge.className = 'badge badge-warning';
        badge.textContent = 'Excess Advance';
        box.className = 'balance-result-box overpaid';
        sub.textContent = `Advance exceeds price by ₹${formatINR(adv - p)}`;
      } else if (p > 0 && adv >= p) {
        badge.className = 'badge badge-success';
        badge.textContent = 'Fully Paid';
        box.className = 'balance-result-box paid';
        sub.textContent = 'Full payment received! Zero balance due at delivery.';
      } else {
        badge.className = 'badge badge-gold';
        badge.textContent = `₹${formatINR(bal)} Due`;
        box.className = 'balance-result-box pending';
        sub.textContent = `₹${formatINR(adv)} advance paid • ₹${formatINR(bal)} due at delivery`;
      }
    }

    if (callbacks.onPaymentChange) {
      callbacks.onPaymentChange({ price: p, advance: adv, balance: bal });
    }
  };

  priceInput.addEventListener('input', update);
  advanceInput.addEventListener('input', update);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pct = parseInt(btn.dataset.pct, 10);
      const p = parseFloat(priceInput.value) || 0;
      if (pct === 0) {
        advanceInput.value = '0';
      } else if (p > 0) {
        advanceInput.value = String(Math.round((p * pct) / 100));
      }
      update();
    });
  });

  return {
    getValues() {
      const p = parseFloat(priceInput.value) || 0;
      const adv = parseFloat(advanceInput.value) || 0;
      return { price: p, advance: adv, balance: Math.max(0, p - adv) };
    },
    reset() {
      priceInput.value = '';
      advanceInput.value = '';
      update();
    },
    update,
  };
}
