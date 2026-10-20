/**
 * salesmenApi.js — Sales Staff API stubs (Staff functions disabled).
 */

export const salesmenApi = {
  async loginSalesman() {
    return { success: true, salesman: { id: 1, name: 'Studio', role: 'owner' } };
  },

  async quickLoginSalesman() {
    return { success: true, salesman: { id: 1, name: 'Studio', role: 'owner' }, token: 'open-studio-session' };
  },

  async getSalesmen() {
    return { success: true, salesmen: [] };
  },

  async createSalesman() {
    return { success: true, message: 'Staff functions are disabled.' };
  },

  async deleteSalesman() {
    return { success: true, message: 'Staff functions are disabled.' };
  }
};
