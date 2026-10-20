/**
 * desktopFilters.js — Search, Collection, Payment & Date Filtering Logic.
 * 
 * WHY:
 * Isolates inventory search and multi-condition filtering (collection, payment status,
 * pickup/return/booking date presets and custom date ranges) into a dedicated module.
 */

import { renderIcon } from '../../icons.js';

/**
 * Returns ISO date string (YYYY-MM-DD) with optional day offset.
 * @param {number} [offset=0]
 * @returns {string}
 */
export const getTodayISO = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Filters the list of articles according to the current filter state.
 * @param {Array} articles
 * @param {object} state - Current filter criteria
 * @returns {Array}
 */
export function filterArticles(articles, state) {
  const {
    searchQuery,
    selectedCategory,
    paymentFilter,
    dateField,
    datePreset,
    filterMonth,
    filterSpecificDate,
    filterRangeStart,
    filterRangeEnd,
  } = state;

  return articles.filter((item) => {
    // 1. Text Search Matching
    const q = (searchQuery || '').toLowerCase().trim();
    if (q) {
      const matchId = (item.article_id || '').toLowerCase().includes(q);
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchCustomer = (item.customer_name || '').toLowerCase().includes(q);
      const matchPhone = (item.customer_phone || '').toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchCustomer && !matchPhone) {
        return false;
      }
    }

    // 2. Category / Collection Filter
    if (selectedCategory && selectedCategory !== 'all') {
      const itemCat = (item.category || '').toLowerCase();
      const selCat = selectedCategory.toLowerCase();
      if (selCat === 'bridal') {
        if (!itemCat.includes('bridal')) return false;
      } else if (!itemCat.includes(selCat)) {
        return false;
      }
    }

    // 3. Payment Status Filter
    const p = Number(item.price) || 0;
    const adv = Number(item.advance_amount) || 0;
    const bal = item.balance_amount !== undefined && item.balance_amount !== null
      ? Number(item.balance_amount)
      : Math.max(0, p - adv);

    if (paymentFilter === 'due' && bal <= 0) return false;
    if (paymentFilter === 'paid' && bal > 0) return false;

    // 4. Date Filtering
    if (datePreset && datePreset !== 'all') {
      let targetDates = [];
      if (dateField === 'pickup_date') targetDates = [item.pickup_date];
      else if (dateField === 'return_date') targetDates = [item.return_date];
      else if (dateField === 'booking_date') targetDates = [item.booking_date];
      else targetDates = [item.pickup_date, item.return_date, item.booking_date].filter(Boolean);

      const today = getTodayISO(0);
      const tomorrow = getTodayISO(1);
      const next7Days = getTodayISO(7);

      if (datePreset === 'today') {
        if (!targetDates.some((d) => d === today)) return false;
      } else if (datePreset === 'tomorrow') {
        if (!targetDates.some((d) => d === tomorrow)) return false;
      } else if (datePreset === 'this_week') {
        if (!targetDates.some((d) => d && d >= today && d <= next7Days)) return false;
      } else if (datePreset === 'this_month') {
        const curMonth = today.slice(0, 7);
        if (!targetDates.some((d) => d && d.startsWith(curMonth))) return false;
      } else if (datePreset === 'by_month') {
        if (filterMonth && !targetDates.some((d) => d && d.startsWith(filterMonth))) return false;
      } else if (datePreset === 'by_date') {
        if (filterSpecificDate && !targetDates.some((d) => d === filterSpecificDate)) return false;
      } else if (datePreset === 'range') {
        const matchesRange = targetDates.some((d) => {
          if (filterRangeStart && d < filterRangeStart) return false;
          if (filterRangeEnd && d > filterRangeEnd) return false;
          return true;
        });
        if (!matchesRange) return false;
      }
    }

    return true;
  });
}
