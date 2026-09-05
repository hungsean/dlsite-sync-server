import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from './lib/api';
import { type Work, type WorksStats, getWorkStats, getWorks, syncWorkCount } from './lib/api/works';
import { selectActiveAccountKey, useAccountStore } from './lib/store/account';

// DLsite work_type 代碼 -> 中文標籤。對不到的代碼直接顯示原碼。
const WORK_TYPE_LABELS: Record<string, string> = {
  MNG: '漫畫',
  ICG: 'CG 集',
  SOU: '音聲',
  MOV: '影片',
  ADV: '冒險遊戲',
  SLN: '模擬遊戲',
  RPG: 'RPG',
  ACN: '動作遊戲',
  STG: '射擊遊戲',
  TBL: '桌上遊戲',
  DNV: '數位小說',
  PZL: '益智遊戲',
  QIZ: '問答遊戲',
  ET3: '其他遊戲',
  ETC: '其他',
};

function workTypeLabel(code: string): string {
  return WORK_TYPE_LABELS[code] ?? code;
}

// 只取日期部分 (ISO 前 10 碼, 例 2026-08-06), 避免時區換算位移。
function toDate(iso: string): string {
  return iso.slice(0, 10);
}

// 作品縮圖: 沒有 URL 或圖片載入失敗 (例如已下架的圖) 時, 退回佔位方塊。
// shadcn 沒有 Image 元件 (只有頭像用的 Avatar), 作品縮圖是矩形, 自己做比較合適。
function WorkThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  // src 變了 (例如重新同步換了縮圖) 就重置失敗狀態, 重新嘗試載入
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-16 w-16 flex-shrink-0 rounded bg-muted object-cover"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
        <line x1="13.5" y1="13.5" x2="6" y2="21" />
        <line x1="18" y1="12" x2="21" y2="15" />
        <path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59" />
        <path d="M21 15V5a2 2 0 0 0-2-2H9" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </svg>
    </div>
  );
}

export function Works() {
  const [stats, setStats] = useState<WorksStats | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // 使用中帳號的識別鍵, 值一變就重抓 (取代原本 App 用 key 強制重掛載的做法)
  const activeAccountKey = useAccountStore(selectActiveAccountKey);

  useEffect(() => {
    // 切換帳號後先清掉舊資料, 避免畫面停留在前一個帳號的數字/清單
    setStats(null);
    setWorks([]);
    setMessage('');
    let cancelled = false;
    getWorkStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // 狀態拉不到就先略過
      });
    getWorks()
      .then((data) => {
        if (!cancelled) setWorks(data);
      })
      .catch(() => {
        // 清單拉不到就先略過
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
      setStats(result.stats);
      const list = await getWorks();
      setWorks(list);
      setMessage(`同步完成, 共 ${result.worksSynced} 件作品`);
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

        {works.length > 0 && (
          <ul className="mt-6 flex flex-col gap-3">
            {works.map((work) => (
              <li
                key={work.workno}
                className="flex items-center gap-3 rounded-md border p-2"
              >
                <WorkThumb src={work.thumbnailUrl} alt={work.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{work.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{work.workno}</span>
                    {work.makerName && <span>· {work.makerName}</span>}
                    {work.salesDate && <span>· 購入 {toDate(work.salesDate)}</span>}
                  </div>
                </div>
                {work.workType && (
                  <Badge variant="secondary">{workTypeLabel(work.workType)}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
