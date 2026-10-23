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
    const jToggle = containerEl.querySelector('#m-toggle-jewel');
    const jPrice = (jToggle?.checked ? (parseFloat(containerEl.querySelector('#m-jewel-price')?.value) || 0) : 0);
    const totalP = p + jPrice;

    const adv = parseFloat(advanceInput.value) || 0;
    const bal = Math.max(0, totalP - adv);

    if (num) num.textContent = formatINR(bal);

    if (badge && box && sub) {
      if (totalP <= 0) {
        badge.className = 'badge badge-neutral';
        badge.textContent = 'Enter Price';
        box.className = 'balance-result-box';
        sub.textContent = 'Enter price to calculate balance';
      } else if (adv > totalP) {
        badge.className = 'badge badge-warning';
        badge.textContent = 'Excess Advance';
        box.className = 'balance-result-box overpaid';
        sub.textContent = `Advance exceeds total price by ₹${formatINR(adv - totalP)}`;
      } else if (totalP > 0 && adv >= totalP) {
        badge.className = 'badge badge-success';
        badge.textContent = 'Fully Paid';
        box.className = 'balance-result-box paid';
        sub.textContent = 'Full payment received! Zero balance due at delivery.';
      } else {
        badge.className = 'badge badge-gold';
        badge.textContent = `₹${formatINR(bal)} Due`;
        box.className = 'balance-result-box pending';
        const jewelNote = (jToggle?.checked && jPrice > 0) ? ` (Includes ₹${formatINR(jPrice)} Jewellery)` : '';
        sub.textContent = `₹${formatINR(adv)} advance paid • ₹${formatINR(bal)} due at delivery${jewelNote}`;
      }
    }

    if (callbacks.onPaymentChange) {
      callbacks.onPaymentChange({ price: totalP, advance: adv, balance: bal, garmentPrice: p, jewelPrice: jPrice });
    }
  };

  priceInput.addEventListener('input', update);
  advanceInput.addEventListener('input', update);

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pct = parseInt(btn.dataset.pct, 10);
      const p = parseFloat(priceInput.value) || 0;
      const jToggle = containerEl.querySelector('#m-toggle-jewel');
      const jPrice = (jToggle?.checked ? (parseFloat(containerEl.querySelector('#m-jewel-price')?.value) || 0) : 0);
      const totalP = p + jPrice;

      if (pct === 0) {
        advanceInput.value = '0';
      } else if (totalP > 0) {
        advanceInput.value = String(Math.round((totalP * pct) / 100));
      }
      update();
    });
  });

  return {
    getValues() {
      const p = parseFloat(priceInput.value) || 0;
      const jToggle = containerEl.querySelector('#m-toggle-jewel');
      const jPrice = (jToggle?.checked ? (parseFloat(containerEl.querySelector('#m-jewel-price')?.value) || 0) : 0);
      const totalP = p + jPrice;
      const adv = parseFloat(advanceInput.value) || 0;
      return {
        price: totalP,
        advance: adv,
        balance: Math.max(0, totalP - adv),
        garmentPrice: p,
        jewelPrice: jPrice,
        hasJewellery: Boolean(jToggle?.checked),
      };
    },
    reset() {
      priceInput.value = '';
      advanceInput.value = '';
      update();
    },
    update,
  };
}
