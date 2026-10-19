/**
 * salesStaffModal.js — Sales Team Management Modal
 * 
 * WHY:
 * Allows shop owners to manage who can log into studio phones to take booking photos.
 * Staff members are listed with their name, creation date, and an option to delete.
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
 * Opens the Sales Staff management modal.
 */
export function openSalesStaffModal() {
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop';

  modalEl.innerHTML = `
    <div class="modal-dialog" style="max-width: 520px;">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <span style="color: var(--gold-dark);">${renderIcon('users', { size: 20 })}</span>
          <span>Sales Staff Team</span>
        </div>
        <button type="button" class="btn btn-ghost btn-icon-only close-btn">
          ${renderIcon('x', { size: 18 })}
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Add Staff Form -->
        <form id="add-staff-form" style="background: var(--bg-main); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <h4 style="font-size: 0.86rem; font-weight: 700; color: var(--text-primary); margin: 0;">Add New Salesperson</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label class="input-label" for="staff-name-input">Staff Name</label>
              <input type="text" id="staff-name-input" class="input-field" placeholder="e.g. Rahul" required />
            </div>
            <div>
              <label class="input-label" for="staff-pass-input">PIN / Password (Optional)</label>
              <input type="password" id="staff-pass-input" class="input-field" placeholder="Optional" />
            </div>
          </div>
          <button type="submit" id="btn-add-staff" class="btn btn-gold btn-sm" style="align-self: flex-end;">
            ${renderIcon('userPlus', { size: 15 })} Add Staff
          </button>
        </form>

        <!-- Staff List Container -->
        <div>
          <label class="input-label">Registered Team Members</label>
          <div id="staff-list-container" style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto;">
            <p style="font-size: 0.84rem; color: var(--text-muted); text-align: center; padding: 20px;">Loading staff members...</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button type="button" class="btn btn-outline close-footer-btn">Close</button>
      </div>
    </div>
  `;

  const closeBtn = modalEl.querySelector('.close-btn');
  const closeFooterBtn = modalEl.querySelector('.close-footer-btn');
  closeBtn.addEventListener('click', closeModal);
  closeFooterBtn.addEventListener('click', closeModal);

  const staffContainer = modalEl.querySelector('#staff-list-container');
  const addForm = modalEl.querySelector('#add-staff-form');
  const nameInput = modalEl.querySelector('#staff-name-input');
  const passInput = modalEl.querySelector('#staff-pass-input');
  const addBtn = modalEl.querySelector('#btn-add-staff');

  // Load and render staff
  const loadStaff = async () => {
    try {
      const res = await api.getSalesmen();
      if (!res.success || !res.salesmen || res.salesmen.length === 0) {
        staffContainer.innerHTML = `
          <p style="font-size: 0.84rem; color: var(--text-muted); text-align: center; padding: 20px;">
            No staff accounts created yet. Add one above.
          </p>
        `;
        return;
      }

      staffContainer.innerHTML = '';
      res.salesmen.forEach((member) => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #FFFFFF; border: 1px solid var(--border-light); border-radius: var(--radius-sm);';
        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--gold-bg); border: 1px solid var(--gold-border); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--gold-dark); font-size: 0.82rem;">
              ${escapeHtml(member.name.charAt(0).toUpperCase())}
            </div>
            <div>
              <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(member.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Joined ${escapeHtml(member.created_at || 'Recently')}</div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm btn-icon-only delete-staff-btn" style="color: #DC2626;" title="Delete Staff Member">
            ${renderIcon('trash', { size: 15 })}
          </button>
        `;

        item.querySelector('.delete-staff-btn').addEventListener('click', async () => {
          if (!window.confirm(`Delete staff member "${member.name}"?`)) return;
          try {
            await api.deleteSalesman(member.id);
            showToast(`Staff member "${member.name}" removed`, 'neutral');
            loadStaff();
          } catch (err) {
            alert('Failed to delete staff: ' + err.message);
          }
        });

        staffContainer.appendChild(item);
      });
    } catch (err) {
      staffContainer.innerHTML = `<p style="color: #DC2626; font-size: 0.84rem; text-align: center; padding: 10px;">Failed to load staff list.</p>`;
    }
  };

  loadStaff();

  // Add staff submission
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const pass = passInput ? passInput.value.trim() : '';
    if (!name) return;

    addBtn.disabled = true;
    addBtn.innerHTML = `${renderIcon('loader', { size: 14, className: 'spinner-icon' })} Adding...`;

    try {
      const res = await api.createSalesman(name, pass);
      addBtn.disabled = false;
      addBtn.innerHTML = `${renderIcon('userPlus', { size: 15 })} Add Staff`;

      if (res.success) {
        showToast(`Staff member "${name}" created!`, 'success');
        nameInput.value = '';
        passInput.value = '';
        loadStaff();
      } else {
        alert(res.message || 'Failed to add staff');
      }
    } catch (err) {
      addBtn.disabled = false;
      addBtn.innerHTML = `${renderIcon('userPlus', { size: 15 })} Add Staff`;
      alert('Error: ' + err.message);
    }
  });

  openModal(modalEl);
}
