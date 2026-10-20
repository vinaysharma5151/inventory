/**
 * loginModal.js — Authentication Modal for Owner / Admin
 * 
 * WHY:
 * Provides a clean dialog for authenticating the shop owner with full administrative access.
 */

import { api } from '../api.js';
import { showToast } from '../toast.js';
import { renderIcon } from '../icons.js';
import { openModal } from '../modal.js';

export function openLoginModal(onSuccess) {
  const content = document.createElement('div');
  content.className = 'login-modal-content';
  content.style.maxWidth = '420px';
  content.style.margin = '0 auto';

  content.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 64px; height: 64px; border-radius: 12px; background: #FFFFFF; border: 1px solid var(--gold-border); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; box-shadow: 0 2px 10px rgba(158, 123, 59, 0.12); padding: 4px; overflow: hidden;">
        <img src="/assets/logo.png" alt="Mehak Bridal Studio" style="width: 100%; height: 100%; object-fit: contain;" />
      </div>
      <h2 style="font-family: var(--font-serif); font-size: 20px; color: var(--color-text); margin: 0 0 4px 0;">Owner Sign In</h2>
      <p style="font-size: 13px; color: var(--color-text-muted); margin: 0;">Access showroom inventory and administrative settings</p>
    </div>

    <form id="auth-login-form" style="display: flex; flex-direction: column; gap: 16px;">
      <div id="username-container">
        <label style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 6px;">
          Username
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
      </div>

      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted); margin-bottom: 6px;">
          Password
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

  const usernameInput = content.querySelector('#login-username');
  const passwordInput = content.querySelector('#login-password');
  const submitBtn = content.querySelector('#login-submit-btn');

  const form = content.querySelector('#auth-login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username) {
      showToast('Please enter a username.', 'error');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      const res = await api.login(username, password);
      const user = res.user;

      showToast(`Welcome back, ${user.username || 'Owner'}!`, 'success');
      closeModal();
      if (onSuccess) onSuccess(user);
    } catch (err) {
      showToast(err.message || 'Login failed.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
}
