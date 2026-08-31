import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function App() {
  const [health, setHealth] = useState('檢查中...');

  // 只是確認前後端有接起來, 之後可以整段換掉
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { time: string }) => setHealth(`後端正常 (${data.time})`))
      .catch(() => setHealth('連不到後端'));
  }, []);

  return (
    <main className="page">
      <h1>DLsite Sync</h1>
      <p className="muted">{health}</p>
    </main>
  );
}
