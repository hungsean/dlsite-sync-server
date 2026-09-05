import { type SyntheticEvent, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError } from './lib/api';
import type { Account } from './lib/api/auth';
import { useAccountStore } from './lib/store/account';

type Mode = 'view' | 'switch' | 'add';

function toApiMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : '連不到後端';
}

export function Login() {
  const status = useAccountStore((s) => s.status);
  const accounts = useAccountStore((s) => s.accounts);
  const refreshAccounts = useAccountStore((s) => s.refreshAccounts);
  const login = useAccountStore((s) => s.login);
  const logout = useAccountStore((s) => s.logout);
  const switchAccount = useAccountStore((s) => s.switchAccount);
  const removeAccount = useAccountStore((s) => s.removeAccount);
  const validate = useAccountStore((s) => s.validate);

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('view');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await login(loginId, password);
      setMessage('登入成功');
      setLoginId('');
      setPassword('');
      setMode('view');
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
      await validate();
      setMessage('session 有效');
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
      await logout();
      setMode('view');
      setMessage('已登出');
    } catch (err) {
      setMessage(toApiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openSwitch() {
    setMessage('');
    setMode('switch');
    try {
      await refreshAccounts();
    } catch {
      // 清單拉不到就先略過
    }
  }

  async function onSwitch(id: number) {
    setBusy(true);
    setMessage('');
    try {
      await switchAccount(id);
      setMode('view');
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
      await removeAccount(account);
    } catch (err) {
      setMessage(toApiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const sessionBadge = (valid: boolean) => (
    <Badge variant={valid ? 'secondary' : 'destructive'}>{valid ? '有效' : '失效'}</Badge>
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>DLsite 登入</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 已登入 + view 模式: 顯示目前帳號與操作按鈕 */}
        {status?.configured && mode === 'view' && (
          <>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              目前帳號: {status.loginId} · session {sessionBadge(status.sessionValid)}
              {status.lastValidatedAt
                ? ` · 最後驗證 ${new Date(status.lastValidatedAt).toLocaleString()}`
                : ''}
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button type="button" variant="outline" onClick={openSwitch} disabled={busy}>
                切換帳號
              </Button>
              <Button type="button" variant="outline" onClick={onValidate} disabled={busy}>
                重新驗證 session
              </Button>
              <Button type="button" variant="outline" onClick={onLogout} disabled={busy}>
                登出
              </Button>
            </div>
          </>
        )}

        {/* 切換帳號模式: 列出所有帳號 */}
        {mode === 'switch' && (
          <div>
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">目前沒有已登入的帳號</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      {account.loginId}
                      {account.isActive && (
                        <span className="text-xs text-muted-foreground">(使用中)</span>
                      )}
                      <span className="text-xs">session {sessionBadge(account.sessionValid)}</span>
                    </span>
                    <span className="flex gap-2">
                      {!account.isActive && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSwitch(account.id)}
                          disabled={busy}
                        >
                          切換
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onRemove(account)}
                        disabled={busy}
                      >
                        移除
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2.5">
              <Button type="button" onClick={() => setMode('add')} disabled={busy}>
                新增帳號
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode(status?.configured ? 'view' : 'add')}
                disabled={busy}
              >
                返回
              </Button>
            </div>
          </div>
        )}

        {/* 帳密登入表單: 未登入, 或在切換模式按下新增帳號 */}
        {(mode === 'add' || (!status?.configured && mode === 'view')) && (
          <>
            {!status?.configured && mode === 'view' && (
              <p className="text-sm text-muted-foreground">尚未設定 DLsite 帳號</p>
            )}
            <form onSubmit={onSubmit} className="mt-4 flex max-w-xs flex-col gap-2.5">
              <Input
                type="text"
                placeholder="DLsite 帳號"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
              />
              <Input
                type="password"
                placeholder="密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <div className="flex gap-2.5">
                <Button type="submit" disabled={busy}>
                  {busy ? '處理中...' : '登入'}
                </Button>
                {mode === 'add' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLoginId('');
                      setPassword('');
                      void openSwitch();
                    }}
                    disabled={busy}
                  >
                    返回
                  </Button>
                )}
              </div>
            </form>
          </>
        )}

        {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
