import { type SyntheticEvent, useEffect, useState } from 'react';
import { ApiError } from './lib/api';
import { type AuthStatus, getAuthStatus, login, validateSession } from './lib/api/auth';

const inputClass =
  'rounded-md border border-neutral-300 px-2.5 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900';
const buttonClass =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';

export function Login() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    try {
      setStatus(await getAuthStatus());
    } catch {
      // 狀態拉不到就先略過
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
      setPassword('');
      setStatus(status);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : '連不到後端');
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
      setMessage(err instanceof ApiError ? err.message : '連不到後端');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-neutral-300 p-5 dark:border-neutral-700">
      <h2 className="text-lg font-semibold">DLsite 登入</h2>

      {status?.configured ? (
        <p className="mt-1 text-sm text-neutral-500">
          目前帳號: {status.loginId} · session{' '}
          <span className={status.sessionValid ? 'text-green-600' : 'text-red-600'}>
            {status.sessionValid ? '有效' : '失效'}
          </span>
          {status.lastValidatedAt ? ` · 最後驗證 ${new Date(status.lastValidatedAt).toLocaleString()}` : ''}
        </p>
      ) : (
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
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? '處理中...' : '登入'}
        </button>
      </form>

      {status?.configured && (
        <button
          type="button"
          onClick={onValidate}
          disabled={busy}
          className="mt-2.5 rounded-md border border-neutral-300 px-3 py-2 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          重新驗證 session
        </button>
      )}

      {message && <p className="mt-3 text-sm text-neutral-500">{message}</p>}
    </section>
  );
}
