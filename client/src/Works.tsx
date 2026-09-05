import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from './lib/api';
import {
  type DownloadState,
  type Work,
  type WorksStats,
  estimateDownload,
  getWorkStats,
  getWorks,
  startDownload,
  subscribeDownloadEvents,
  syncWorkCount,
} from './lib/api/works';
import { selectActiveAccountKey, useAccountStore } from './lib/store/account';

// DLsite work_type 代碼 -> 中文標籤。對不到的代碼直接顯示原碼。
const WORK_TYPE_LABELS: Record<string, string> = {
  MNG: '漫畫',
  ICG: 'CG 集',
  SOU: 'ASMR',
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

// bytes 轉人類可讀 (GB / MB / KB)。
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

// 作品縮圖: 沒有 URL 或圖片載入失敗 (例如已下架的圖) 時, 退回佔位方塊。
// shadcn 沒有 Image 元件 (只有頭像用的 Avatar), 作品縮圖是矩形, 自己做比較合適。
function WorkThumb({ src, alt }: Readonly<{ src: string | null; alt: string }>) {
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

// 下載狀態圖示: 下載中轉圈 (附百分比), 完成打勾, 失敗紅字, 排隊等待中。
function DownloadIndicator({ state }: Readonly<{ state: DownloadState | undefined }>) {
  if (!state) return null;
  if (state.status === 'done') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600" title="下載完成">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        已下載
      </span>
    );
  }
  if (state.status === 'failed') {
    return (
      <span className="text-xs text-destructive" title={state.error ?? '下載失敗'}>
        下載失敗
      </span>
    );
  }
  if (state.status === 'queued') {
    return <span className="text-xs text-muted-foreground">等待中</span>;
  }
  // downloading
  const pct =
    state.totalBytes && state.totalBytes > 0
      ? Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100))
      : null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title="下載中">
      <svg
        className="animate-spin"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      {pct !== null ? `${pct}%` : '下載中'}
    </span>
  );
}

export function Works() {
  const [stats, setStats] = useState<WorksStats | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // 選取要下載的 workno
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // workno -> 下載狀態, 由作品清單初始化, 再由 SSE 即時更新
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  // 使用中帳號的識別鍵, 值一變就重抓 (取代原本 App 用 key 強制重掛載的做法)
  const activeAccountKey = useAccountStore(selectActiveAccountKey);

  useEffect(() => {
    // 切換帳號後先清掉舊資料, 避免畫面停留在前一個帳號的數字/清單
    setStats(null);
    setWorks([]);
    setMessage('');
    setSelected(new Set());
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
        if (cancelled) return;
        setWorks(data);
        // 用清單裡的下載狀態初始化 downloads map
        const init: Record<string, DownloadState> = {};
        for (const w of data) {
          if (w.downloadStatus) {
            init[w.workno] = {
              workno: w.workno,
              status: w.downloadStatus,
              downloadedBytes: w.downloadedBytes ?? 0,
              totalBytes: w.contentSize,
              error: null,
            };
          }
        }
        setDownloads(init);
      })
      .catch(() => {
        // 清單拉不到就先略過
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccountKey]);

  // 訂閱下載進度 SSE (掛載一次)。事件進來就更新對應 workno 的狀態。
  useEffect(() => {
    return subscribeDownloadEvents((e) => {
      setDownloads((prev) => ({ ...prev, [e.workno]: e }));
    });
  }, []);

  async function onSync() {
    setBusy(true);
    setMessage('');
    try {
      const result = await syncWorkCount();
      setStats(result.stats);
      const list = await getWorks();
      setWorks(list);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : '連不到後端');
    } finally {
      setBusy(false);
    }
  }

  // 可下載的作品 (downloadable=true), 全選 / 判斷用
  const downloadableWorknos = works.filter((w) => w.downloadable).map((w) => w.workno);
  const allSelected =
    downloadableWorknos.length > 0 && downloadableWorknos.every((wn) => selected.has(wn));

  function toggleOne(workno: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workno)) next.delete(workno);
      else next.add(workno);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(downloadableWorknos));
  }

  async function onDownloadSelected() {
    const worknos = [...selected];
    if (worknos.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const est = await estimateDownload(worknos);
      const skippedNote = est.skipped.length > 0 ? ` (${est.skipped.length} 部不可下載, 已略過)` : '';
      const ok = window.confirm(
        `預估下載容量 ${formatBytes(est.totalBytes)}, 共 ${est.count} 部${skippedNote}。\n確定開始下載?`,
      );
      if (!ok) return;
      await startDownload(worknos);
      // 立刻把選取的作品標成等待中, 不必等第一個 SSE 事件
      setDownloads((prev) => {
        const next = { ...prev };
        for (const wn of est.items.map((i) => i.workno)) {
          next[wn] = {
            workno: wn,
            status: 'queued',
            downloadedBytes: 0,
            totalBytes: est.items.find((i) => i.workno === wn)?.bytes ?? null,
            error: null,
          };
        }
        return next;
      });
      setSelected(new Set());
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : '連不到後端');
    } finally {
      setBusy(false);
    }
  }

  const synced = stats && stats.total !== null;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>作品數量</CardTitle>
        <div className="flex flex-wrap gap-2.5">
          <Button
            type="button"
            onClick={onDownloadSelected}
            disabled={busy || selected.size === 0}
          >
            {`下載選取 (${selected.size})`}
          </Button>
          <Button type="button" variant="outline" onClick={onSync} disabled={busy}>
            {busy ? '同步中...' : '同步作品數量'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {synced ? (
          <div>
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats.lastSyncedAt
                ? `最後同步 ${new Date(stats.lastSyncedAt).toLocaleString()}`
                : ''}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            尚未同步, 按下方按鈕從 DLsite 取得作品數量
          </p>
        )}

        {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}

        {works.length > 0 && (
          <>
            <label className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4"
              />
              全選可下載 ({downloadableWorknos.length})
            </label>
            <ul className="mt-3 flex flex-col gap-3">
              {works.map((work) => (
                <li
                  key={work.workno}
                  className="flex items-center gap-3 rounded-md border p-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(work.workno)}
                    onChange={() => toggleOne(work.workno)}
                    disabled={!work.downloadable}
                    className="h-4 w-4 flex-shrink-0"
                    title={work.downloadable ? '' : '此作品不可下載'}
                  />
                  <WorkThumb src={work.thumbnailUrl} alt={work.title} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{work.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{work.workno}</span>
                      {work.makerName && <span>· {work.makerName}</span>}
                      {work.salesDate && <span>· 購入 {toDate(work.salesDate)}</span>}
                      {work.contentSize && <span>· {formatBytes(work.contentSize)}</span>}
                    </div>
                  </div>
                  <DownloadIndicator state={downloads[work.workno]} />
                  {work.workType && (
                    <Badge variant="secondary">{workTypeLabel(work.workType)}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
