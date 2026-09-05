import { useEffect, useState } from 'react';
import { Login } from './Login';
import { Works } from './Works';
import { getHealth } from './lib/api/health';
import { useAccountStore } from './lib/store/account';

export function App() {
  const [health, setHealth] = useState('檢查中...');
  const refreshStatus = useAccountStore((s) => s.refreshStatus);

  useEffect(() => {
    getHealth()
      .then((data) => setHealth(`後端正常 (${data.time})`))
      .catch(() => setHealth('連不到後端'));
  }, []);

  useEffect(() => {
    void refreshStatus().catch(() => {
      // 狀態拉不到就先略過
    });
  }, [refreshStatus]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">DLsite Sync</h1>
      <p className="mt-1 text-sm text-muted-foreground">{health}</p>
      <Login />
      <Works />
    </main>
  );
}
