/**
 * loginModal.js — Authentication Modal for Owner and Staff Members
 * 
 * WHY:
 * Provides an elegant dialog for authenticating both the shop owner (full admin rights)
 * and sales staff (inventory viewing & customer booking) without disrupting current state.
 */

import { api } from '../api.js';
import { showToast } from '../toast.js';
import { renderIcon } from '../icons.js';
import { openModal } from '../modal.js';

export function openLoginModal(onSuccess, defaultRole = 'owner') {
  const content = document.createElement('div');
  content.className = 'login-modal-content';
  content.style.maxWidth = '420px';
  content.style.margin = '0 auto';

  content.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--color-burgundy-light); color: var(--color-burgundy); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 10px;">
        ${renderIcon('lock', { size: 20, className: 'icon-md' })}
      </div>
      <h2 style="font-family: var(--font-serif); font-size: 20px; color: var(--color-text); margin: 0 0 4px 0;">Sign In</h2>
      <p style="font-size: 13px; color: var(--color-text-muted); margin: 0;">Access showroom inventory and booking system</p>
    </div>

    <!-- Role Tabs -->
    <div style="display: flex; background: var(--color-bg-secondary); border-radius: 8px; padding: 4px; margin-bottom: 20px;">
      <button 
        type="button" 
        id="tab-owner" 
        class="role-tab ${defaultRole === 'owner' ? 'active' : ''}" 
        style="flex: 1; padding: 8px 12px; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;"
      >
        👑 Owner / Admin
      </button>
      <button 
        type="button" 
        id="tab-staff" 
        class="role-tab ${defaultRole === 'staff' ? 'active' : ''}" 
        style="flex: 1; padding: 8px 12px; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;"
      >
        👤 Sales Staff
      </button>
    </div>

    <form id="auth-login-form" style="display: flex; flex-direction: column; gap: 16px;">
      <div id="username-container">
        <label style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 6px;">
          <span id="username-label">Owner Username</span>
        </label>
        <input 
          type="text" 
          id="login-username" 
          class="input-field" 
          placeholder="Enter username" 
          required 
          autocomplete="username"
          style="width: 100%; box-sizing: border-box;"
        />
        <select 
          id="login-staff-select" 
          class="input-field" 
          style="width: 100%; box-sizing: border-box; display: none;"
        >
          <option value="">Select staff member...</option>
        </select>
      </div>

      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 6px;">
          Password / PIN
        </label>
        <input 
          type="password" 
          id="login-password" 
          class="input-field" 
          placeholder="••••••••" 
          required 
          autocomplete="current-password"
          style="width: 100%; box-sizing: border-box;"
        />
      </div>

      <div style="margin-top: 10px;">
        <button 
          type="submit" 
          id="login-submit-btn" 
          class="btn btn-primary" 
          style="width: 100%; justify-content: center; padding: 12px; font-size: 14px;"
        >
          Sign In
        </button>
      </div>
    </form>
  `;

  const closeModal = openModal(content, {
    title: 'Showroom Login',
    icon: 'lock',
  });

  let currentTab = defaultRole;
  const tabOwner = content.querySelector('#tab-owner');
  const tabStaff = content.querySelector('#tab-staff');
  const usernameLabel = content.querySelector('#username-label');
  const usernameInput = content.querySelector('#login-username');
  const staffSelect = content.querySelector('#login-staff-select');
  const passwordInput = content.querySelector('#login-password');
  const submitBtn = content.querySelector('#login-submit-btn');

  function updateTabStyles() {
    if (currentTab === 'owner') {
      tabOwner.style.background = 'var(--color-surface)';
      tabOwner.style.color = 'var(--color-burgundy)';
      tabOwner.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      tabStaff.style.background = 'transparent';
      tabStaff.style.color = 'var(--color-text-muted)';
      tabStaff.style.boxShadow = 'none';

      usernameLabel.textContent = 'Owner Username';
      usernameInput.style.display = 'block';
      usernameInput.required = true;
      staffSelect.style.display = 'none';
      staffSelect.required = false;
      passwordInput.placeholder = '••••••••';
    } else {
      tabStaff.style.background = 'var(--color-surface)';
      tabStaff.style.color = 'var(--color-burgundy)';
      tabStaff.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      tabOwner.style.background = 'transparent';
      tabOwner.style.color = 'var(--color-text-muted)';
      tabOwner.style.boxShadow = 'none';

      usernameLabel.textContent = 'Staff Member';
      passwordInput.placeholder = 'Enter staff PIN';
      // Load salesmen into dropdown
      loadStaffList();
    }
  }

  async function loadStaffList() {
    try {
      const res = await api.getSalesmen();
      if (res.salesmen && res.salesmen.length > 0) {
        staffSelect.innerHTML = '<option value="">Select staff member...</option>' +
          res.salesmen.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
        staffSelect.style.display = 'block';
        staffSelect.required = true;
        usernameInput.style.display = 'none';
        usernameInput.required = false;
      } else {
        // Fallback to text input if staff list empty or not yet seeded
        staffSelect.style.display = 'none';
        staffSelect.required = false;
        usernameInput.style.display = 'block';
        usernameInput.required = true;
        usernameInput.placeholder = 'Enter staff name';
      }
    } catch (_) {
      staffSelect.style.display = 'none';
      staffSelect.required = false;
      usernameInput.style.display = 'block';
      usernameInput.required = true;
    }
  }

  tabOwner.addEventListener('click', () => {
    currentTab = 'owner';
    updateTabStyles();
  });

  tabStaff.addEventListener('click', () => {
    currentTab = 'staff';
    updateTabStyles();
  });

  updateTabStyles();

  const form = content.querySelector('#auth-login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = currentTab === 'staff' && staffSelect.style.display !== 'none'
      ? staffSelect.value
      : usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username) {
      showToast('Please enter or select a username.', 'error');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      let user;
      if (currentTab === 'staff') {
        const res = await api.loginSalesman(username, password);
        user = res.user || res.salesman;
      } else {
        const res = await api.login(username, password);
        user = res.user;
      }

      showToast(`Welcome back, ${user.username || user.name}!`, 'success');
      closeModal();
      if (onSuccess) onSuccess(user);
    } catch (err) {
      showToast(err.message || 'Login failed.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
}
