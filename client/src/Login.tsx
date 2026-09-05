import { type SyntheticEvent, useEffect, useState } from 'react';
import { ApiError } from './lib/api';
import {
  type Account,
  type AuthStatus,
  getAuthStatus,
  listAccounts,
  login,
  logout,
  removeAccount,
  switchAccount,
  validateSession,
} from './lib/api/auth';

const inputClass =
  'rounded-md border border-neutral-300 px-2.5 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900';
const buttonClass =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';
const secondaryButtonClass =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800';

type Mode = 'view' | 'switch' | 'add';

function toApiMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : '連不到後端';
}

interface LoginProps {
  // 使用中帳號有變動 (登入 / 登出 / 切換 / 移除) 時呼叫, 讓上層刷新相依帳號的區塊
  onAccountChange?: () => void;
}

export function Login({ onAccountChange }: Readonly<LoginProps>) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mode, setMode] = useState<Mode>('view');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    try {
      setStatus(await getAuthStatus());
    } catch {
      // 狀態拉不到就先略過
    }
  }

  async function refreshAccounts() {
    try {
      setAccounts(await listAccounts());
    } catch {
      // 清單拉不到就先略過
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { status } = await login(loginId, password);
      setMessage('登入成功');
      setLoginId('');
      setPassword('');
      setStatus(status);
      setMode('view');
      onAccountChange?.();
    } catch (err) {
      setMessage(toApiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onValidate() {
    setBusy(true);
    setMessage('');
    try {
      const { status } = await validateSession();
      setMessage('session 有效');
      setStatus(status);
    } catch (err) {
      setMessage(toApiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    setMessage('');
    try {
      const { status } = await logout();
      setStatus(status);
      setMode('view');
      setMessage('已登出');
      onAccountChange?.();
    } catch (err) {
      setMessage(toApiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openSwitch() {
    setMessage('');
    setMode('switch');
    await refreshAccounts();
  }

  async function onSwitch(id: number) {
    setBusy(true);
    setMessage('');
    try {
      const { status } = await switchAccount(id);
      setStatus(status);
      setMode('view');
      onAccountChange?.();
    } catch (err) {
      setMessage(toApiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(account: Account) {
    if (!window.confirm(`確定要移除帳號 ${account.loginId}?`)) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { status } = await removeAccount(account.id);
      setStatus(status);
      await refreshAccounts();
      // 移除的是使用中帳號才需要刷新相依區塊
      if (account.isActive) {
        onAccountChange?.();
      }
    } catch (err) {
      setMessage(toApiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const sessionBadge = (valid: boolean) => (
    <span className={valid ? 'text-green-600' : 'text-red-600'}>{valid ? '有效' : '失效'}</span>
  );

  return (
    <section className="mt-6 rounded-lg border border-neutral-300 p-5 dark:border-neutral-700">
      <h2 className="text-lg font-semibold">DLsite 登入</h2>

      {/* 已登入 + view 模式: 顯示目前帳號與操作按鈕 */}
      {status?.configured && mode === 'view' && (
        <>
          <p className="mt-1 text-sm text-neutral-500">
            目前帳號: {status.loginId} · session {sessionBadge(status.sessionValid)}
            {status.lastValidatedAt
              ? ` · 最後驗證 ${new Date(status.lastValidatedAt).toLocaleString()}`
              : ''}
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button type="button" onClick={openSwitch} disabled={busy} className={secondaryButtonClass}>
              切換帳號
            </button>
            <button type="button" onClick={onValidate} disabled={busy} className={secondaryButtonClass}>
              重新驗證 session
            </button>
            <button type="button" onClick={onLogout} disabled={busy} className={secondaryButtonClass}>
              登出
            </button>
          </div>
        </>
      )}

      {/* 切換帳號模式: 列出所有帳號 */}
      {mode === 'switch' && (
        <div className="mt-3">
          {accounts.length === 0 ? (
            <p className="text-sm text-neutral-500">目前沒有已登入的帳號</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700"
                >
                  <span>
                    {account.loginId}
                    {account.isActive && (
                      <span className="ml-2 text-xs text-neutral-500">(使用中)</span>
                    )}
                    <span className="ml-2 text-xs">session {sessionBadge(account.sessionValid)}</span>
                  </span>
                  <span className="flex gap-2">
                    {!account.isActive && (
                      <button
                        type="button"
                        onClick={() => onSwitch(account.id)}
                        disabled={busy}
                        className={secondaryButtonClass}
                      >
                        切換
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(account)}
                      disabled={busy}
                      className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950"
                    >
                      移除
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setMode('add')} disabled={busy} className={buttonClass}>
              新增帳號
            </button>
            <button
              type="button"
              onClick={() => setMode(status?.configured ? 'view' : 'add')}
              disabled={busy}
              className={secondaryButtonClass}
            >
              返回
            </button>
          </div>
        </div>
      )}

      {/* 帳密登入表單: 未登入, 或在切換模式按下新增帳號 */}
      {(mode === 'add' || (!status?.configured && mode === 'view')) && (
        <>
          {!status?.configured && mode === 'view' && (
            <p className="mt-1 text-sm text-neutral-500">尚未設定 DLsite 帳號</p>
          )}
          <form onSubmit={onSubmit} className="mt-4 flex max-w-xs flex-col gap-2.5">
            <input
              type="text"
              placeholder="DLsite 帳號"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              className={inputClass}
            />
            <input
              type="password"
              placeholder="密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={inputClass}
            />
            <div className="flex gap-2.5">
              <button type="submit" disabled={busy} className={buttonClass}>
                {busy ? '處理中...' : '登入'}
              </button>
              {mode === 'add' && (
                <button
                  type="button"
                  onClick={() => {
                    setLoginId('');
                    setPassword('');
                    void openSwitch();
                  }}
                  disabled={busy}
                  className={secondaryButtonClass}
                >
                  返回
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {message && <p className="mt-3 text-sm text-neutral-500">{message}</p>}
    </section>
  );
}
