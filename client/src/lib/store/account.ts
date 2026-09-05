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
    const status = await getAuthStatus();
    set({ status });
    // 未登入時 (剛開網頁 / 登出 / session 過期), 順手抓一次帳號清單,
    // 好確認是不是還有其他登入中的帳號可切換, 而不是以為全部都登出了。
    if (!status.configured) {
      await get().refreshAccounts();
    }
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
    // 登出只清掉目前帳號, 其他帳號可能還登入中, 重抓清單好讓 UI 顯示可切換的帳號。
    if (!status.configured) {
      await get().refreshAccounts();
    }
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
