import { useEffect, useState } from 'react';
import { ApiError } from './lib/api';
import { type WorksStats, getWorkStats, syncWorkCount } from './lib/api/works';

const buttonClass =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';

export function Works() {
  const [stats, setStats] = useState<WorksStats | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshStats() {
    try {
      setStats(await getWorkStats());
    } catch {
      // 狀態拉不到就先略過
    }
  }

  useEffect(() => {
    void refreshStats();
  }, []);

  async function onSync() {
    setBusy(true);
    setMessage('');
    try {
      const result = await syncWorkCount();
      setStats(result);
      setMessage('同步完成');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : '連不到後端');
    } finally {
      setBusy(false);
    }
  }

  const synced = stats && stats.total !== null;

  return (
    <section className="mt-6 rounded-lg border border-neutral-300 p-5 dark:border-neutral-700">
      <h2 className="text-lg font-semibold">作品數量</h2>

      {synced ? (
        <div className="mt-2">
          <p className="text-3xl font-bold">{stats.total}</p>
          <p className="mt-1 text-sm text-neutral-500">
            擁有作品數
            {stats.lastSyncedAt
              ? ` · 最後同步 ${new Date(stats.lastSyncedAt).toLocaleString()}`
              : ''}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">尚未同步, 按下方按鈕從 DLsite 取得作品數量</p>
      )}

      <button type="button" onClick={onSync} disabled={busy} className={`${buttonClass} mt-4`}>
        {busy ? '同步中...' : '同步作品數量'}
      </button>

      {message && <p className="mt-3 text-sm text-neutral-500">{message}</p>}
    </section>
  );
}
