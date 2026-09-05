import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from './lib/api';
import { type WorksStats, getWorkStats, syncWorkCount } from './lib/api/works';
import { selectActiveAccountKey, useAccountStore } from './lib/store/account';

export function Works() {
  const [stats, setStats] = useState<WorksStats | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // 使用中帳號的識別鍵, 值一變就重抓 (取代原本 App 用 key 強制重掛載的做法)
  const activeAccountKey = useAccountStore(selectActiveAccountKey);

  useEffect(() => {
    // 切換帳號後先清掉舊資料, 避免畫面停留在前一個帳號的數字
    setStats(null);
    setMessage('');
    let cancelled = false;
    getWorkStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // 狀態拉不到就先略過
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccountKey]);

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
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>作品數量</CardTitle>
      </CardHeader>
      <CardContent>
        {synced ? (
          <div>
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              擁有作品數
              {stats.lastSyncedAt
                ? ` · 最後同步 ${new Date(stats.lastSyncedAt).toLocaleString()}`
                : ''}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            尚未同步, 按下方按鈕從 DLsite 取得作品數量
          </p>
        )}

        <Button type="button" onClick={onSync} disabled={busy} className="mt-4">
          {busy ? '同步中...' : '同步作品數量'}
        </Button>

        {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
