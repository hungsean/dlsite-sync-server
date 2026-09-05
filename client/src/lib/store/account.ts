// 帳號相關狀態集中在這個 store: 登入狀態 (status) 與帳號清單 (accounts)。
// 元件不再各自持有帳號 state, 也不再靠 App 的 accountVersion + key 強制重掛載來同步;
// 使用中帳號變動時, 依賴 activeAccountKey 的區塊 (例如 Works) 會自動重抓資料。
import { create } from 'zustand';
import {
  type Account,
  type AuthStatus,
  getAuthStatus,
  listAccounts,
  login as apiLogin,
  logout as apiLogout,
  removeAccount as apiRemoveAccount,
  switchAccount as apiSwitchAccount,
  validateSession as apiValidateSession,
} from '@/lib/api/auth';

interface AccountState {
  status: AuthStatus | null;
  accounts: Account[];
  // 讀取目前登入狀態 / 帳號清單
  refreshStatus: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  // 以下動作會更新 status, 使用中帳號有變動時相依區塊自動刷新;
  // 失敗時往外拋, 由呼叫端 (元件) 處理 busy / 錯誤訊息 UI。
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchAccount: (id: number) => Promise<void>;
  removeAccount: (account: Account) => Promise<void>;
  validate: () => Promise<void>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  status: null,
  accounts: [],

  async refreshStatus() {
    set({ status: await getAuthStatus() });
  },

  async refreshAccounts() {
    set({ accounts: await listAccounts() });
  },

  async login(loginId, password) {
    const { status } = await apiLogin(loginId, password);
    set({ status });
  },

  async logout() {
    const { status } = await apiLogout();
    set({ status });
  },

  async switchAccount(id) {
    const { status } = await apiSwitchAccount(id);
    set({ status });
  },

  async removeAccount(account) {
    const { status } = await apiRemoveAccount(account.id);
    set({ status });
    await get().refreshAccounts();
  },

  async validate() {
    const { status } = await apiValidateSession();
    set({ status });
  },
}));

// 使用中帳號的識別鍵: 未登入為 null。相依帳號資料的區塊訂閱這個值,
// 值一變 (登入 / 登出 / 切換 / 移除使用中帳號) 就重抓自己的資料。
export const selectActiveAccountKey = (s: AccountState): string | null =>
  s.status?.configured ? s.status.loginId : null;
