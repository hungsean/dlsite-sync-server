import { useEffect, useState } from 'react';
import { Login } from './Login';
import { getHealth } from './lib/api/health';

export function App() {
  const [health, setHealth] = useState('檢查中...');

  useEffect(() => {
    getHealth()
      .then((data) => setHealth(`後端正常 (${data.time})`))
      .catch(() => setHealth('連不到後端'));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">DLsite Sync</h1>
      <p className="mt-1 text-sm text-neutral-500">{health}</p>
      <Login />
    </main>
  );
}
