import { EventEmitter } from 'node:events';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dlsiteAccountWork, dlsiteDownload, dlsiteWork } from '../db/schema.js';
import { env } from '../env.js';
import { extractZip, isZip } from '../lib/archive.js';
import {
  parseSplitPage,
  resolveDownload,
  streamToFile,
} from '../lib/dlsite/download.js';
import { ensureValidSession, getActiveAccount } from './auth.js';

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'failed';

export interface DownloadState {
  workno: string;
  status: DownloadStatus;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
}

export interface EstimateItem {
  workno: string;
  title: string;
  bytes: number | null;
  downloadable: boolean;
}

export interface EstimateResult {
  count: number; // 可下載的作品數
  totalBytes: number; // 可下載作品的容量加總
  skipped: string[]; // 不屬於使用中帳號 / 不可下載 / 找不到而略過的 workno
  items: EstimateItem[];
}

// 下載進度事件匯流排, SSE 路由訂閱這個。
const bus = new EventEmitter();
bus.setMaxListeners(0); // 不限訂閱數 (每個 SSE 連線一個 listener)

export function onDownloadEvent(listener: (e: DownloadState) => void): () => void {
  bus.on('progress', listener);
  return () => bus.off('progress', listener);
}

function emit(state: DownloadState) {
  bus.emit('progress', state);
}

// 下載檔案根目錄 (絕對路徑)
const downloadRoot = path.resolve(env.DOWNLOAD_DIR);

// 記憶體循序佇列: 一次只跑一部, 其餘排隊。每個項目綁定發起下載的帳號,
// 之後即使切換使用中帳號, 這些工作仍用當初排入的帳號 session。
interface QueueItem {
  workno: string;
  accountId: number;
}
const queue: QueueItem[] = [];
let running = false;

// 預估「使用中帳號實際擁有」且可下載的作品容量。
// 不屬於該帳號 / 不可下載 / 查無資料的 workno 會被略過 (放進 skipped)。
export function estimate(worknos: string[]): EstimateResult {
  const empty: EstimateResult = { count: 0, totalBytes: 0, skipped: [...worknos], items: [] };
  if (worknos.length === 0) {
    return { count: 0, totalBytes: 0, skipped: [], items: [] };
  }
  const account = getActiveAccount();
  if (!account) {
    return empty; // 沒有使用中帳號, 全部略過
  }

  // 只查「使用中帳號擁有」的作品 (account_work join work), 天然擋掉別的帳號的 workno。
  const rows = db
    .select({
      workno: dlsiteWork.workno,
      title: dlsiteWork.title,
      contentSize: dlsiteWork.contentSize,
      downloadable: dlsiteWork.downloadable,
    })
    .from(dlsiteAccountWork)
    .innerJoin(dlsiteWork, eq(dlsiteAccountWork.workno, dlsiteWork.workno))
    .where(and(eq(dlsiteAccountWork.accountId, account.id), inArray(dlsiteWork.workno, worknos)))
    .all();

  const byWorkno = new Map(rows.map((r) => [r.workno, r]));
  const items: EstimateItem[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  for (const workno of worknos) {
    const row = byWorkno.get(workno);
    // 不屬於此帳號 (查無) 或不可下載 -> 略過
    if (!row || !row.downloadable) {
      skipped.push(workno);
      continue;
    }
    items.push({
      workno: row.workno,
      title: row.title,
      bytes: row.contentSize,
      downloadable: row.downloadable,
    });
    totalBytes += row.contentSize ?? 0;
  }

  return { count: items.length, totalBytes, skipped, items };
}

// 讀所有下載狀態 (前端載入時補初始狀態用)。
export function getDownloads(): DownloadState[] {
  return db
    .select()
    .from(dlsiteDownload)
    .all()
    .map((r) => ({
      workno: r.workno,
      status: r.status as DownloadStatus,
      downloadedBytes: r.downloadedBytes,
      totalBytes: r.totalBytes,
      error: r.error,
    }));
}

// 把選取作品排入下載佇列。只排「使用中帳號實際擁有且可下載」的作品 (由 estimate 過濾)。
// 已在下載中 / 佇列中的略過, 其餘 (含之前失敗 / 完成的) 重設為 queued 重跑。
// 下載工作固定綁定當下的使用中帳號, 切換帳號不影響已排入的工作。回傳實際排入的 workno。
export function enqueue(worknos: string[]): string[] {
  const account = getActiveAccount();
  if (!account) {
    return [];
  }
  const est = estimate(worknos);
  const now = new Date();
  const enqueued: string[] = [];

  for (const item of est.items) {
    const workno = item.workno;
    const existing = db
      .select()
      .from(dlsiteDownload)
      .where(eq(dlsiteDownload.workno, workno))
      .get();
    // 已在佇列 / 下載中就不重複排 (啟動恢復會把殘留工作放回記憶體 queue, 兩者保持一致)
    if (existing?.status === 'downloading' || existing?.status === 'queued') {
      continue;
    }
    const total = item.bytes;
    db.insert(dlsiteDownload)
      .values({
        workno,
        accountId: account.id,
        status: 'queued',
        totalBytes: total,
        downloadedBytes: 0,
        error: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dlsiteDownload.workno,
        set: {
          accountId: account.id,
          status: 'queued',
          totalBytes: total,
          downloadedBytes: 0,
          error: null,
          filePath: null,
          completedAt: null,
          updatedAt: now,
        },
      })
      .run();
    queue.push({ workno, accountId: account.id });
    enqueued.push(workno);
    emit({ workno, status: 'queued', downloadedBytes: 0, totalBytes: total, error: null });
  }

  void runQueue();
  return enqueued;
}

// 服務啟動時恢復下載佇列: 殘留的 downloading 重設成 queued (重跑整部),
// 再把所有 queued 重新放回記憶體 queue。缺少發起帳號 (accountId 為 null, 例如帳號已被移除)
// 的工作無法自動重登, 直接標成 failed。
export function recoverDownloads() {
  const now = new Date();
  // 上次沒跑完的 downloading -> queued
  db.update(dlsiteDownload)
    .set({ status: 'queued', downloadedBytes: 0, updatedAt: now })
    .where(eq(dlsiteDownload.status, 'downloading'))
    .run();

  const pending = db
    .select()
    .from(dlsiteDownload)
    .where(eq(dlsiteDownload.status, 'queued'))
    .all();

  for (const row of pending) {
    if (row.accountId === null) {
      db.update(dlsiteDownload)
        .set({ status: 'failed', error: '缺少發起帳號, 請重新排入下載', updatedAt: new Date() })
        .where(eq(dlsiteDownload.workno, row.workno))
        .run();
      continue;
    }
    queue.push({ workno: row.workno, accountId: row.accountId });
  }

  if (queue.length > 0) {
    void runQueue();
  }
}

// 佇列處理器: 循序把 queue 裡的作品一部一部下載完。
async function runQueue() {
  if (running) return;
  running = true;
  try {
    let item: QueueItem | undefined;
    while ((item = queue.shift()) !== undefined) {
      await processOne(item);
    }
  } finally {
    running = false;
  }
}

function updateRow(workno: string, patch: Partial<typeof dlsiteDownload.$inferInsert>) {
  db.update(dlsiteDownload)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(dlsiteDownload.workno, workno))
    .run();
}

async function processOne({ workno, accountId }: QueueItem) {
  const row = db.select().from(dlsiteDownload).where(eq(dlsiteDownload.workno, workno)).get();
  const totalBytes = row?.totalBytes ?? null;

  updateRow(workno, { status: 'downloading', downloadedBytes: 0 });
  emit({ workno, status: 'downloading', downloadedBytes: 0, totalBytes, error: null });

  try {
    // 用排入時綁定的帳號 session, 不讀當下的使用中帳號 (使用者可能已切換)
    const jar = await ensureValidSession(accountId);

    const resolution = await resolveDownload(jar, workno);
    if (resolution.kind === 'serial') {
      throw new Error('此作品需要序號下載, 目前不支援');
    }
    if (resolution.kind === 'unknown') {
      throw new Error(`無法辨識的下載型態: ${resolution.location}`);
    }
    if (resolution.kind === 'unavailable') {
      throw new Error(resolution.reason);
    }

    const workDir = path.join(downloadRoot, workno);
    const fileUrls =
      resolution.kind === 'split'
        ? await parseSplitPage(jar, resolution.location)
        : [resolution.location];
    if (fileUrls.length === 0) {
      throw new Error('分割頁面找不到任何下載連結');
    }

    // 進度: 已完成檔案的 bytes 加上目前檔案的即時 transferred, 並節流廣播 / 落地避免洗頻。
    let baseBytes = 0;
    let lastEmit = 0;
    const downloadedPaths: string[] = [];
    for (const url of fileUrls) {
      const file = await streamToFile(jar, url, workDir, (transferred) => {
        const current = baseBytes + transferred;
        const now = Date.now();
        if (now - lastEmit >= 500) {
          lastEmit = now;
          updateRow(workno, { downloadedBytes: current });
          emit({ workno, status: 'downloading', downloadedBytes: current, totalBytes, error: null });
        }
      });
      baseBytes += file.bytes;
      downloadedPaths.push(file.filePath);
    }

    // 下載完成後解壓縮 zip (保留原壓縮檔, 解到專屬子目錄)。
    // best-effort: 解壓失敗不影響「下載完成」狀態 (原檔已安全在磁碟上, 可手動處理),
    // 但把失敗原因記進 error 欄位讓前端 / 狀態看得到。
    let extractError: string | null = null;
    for (const filePath of downloadedPaths) {
      if (!isZip(filePath)) continue;
      try {
        await extractZip(filePath, workDir, {
          fallbackEncoding: env.ZIP_FALLBACK_ENCODING,
          maxRatio: env.ZIP_MAX_RATIO,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[download] ${workno} 解壓縮失敗 (${filePath}):`, msg);
        extractError = extractError ? `${extractError}; ${msg}` : msg;
      }
    }

    const lastFilePath = downloadedPaths.at(-1) ?? workDir;
    const finalPath = path.relative(downloadRoot, fileUrls.length > 1 ? workDir : lastFilePath);
    updateRow(workno, {
      status: 'done',
      downloadedBytes: baseBytes,
      totalBytes: baseBytes,
      filePath: finalPath,
      completedAt: new Date(),
      error: extractError, // 下載成功; 若解壓有問題記在這裡供參考 (狀態仍是 done)
    });
    emit({
      workno,
      status: 'done',
      downloadedBytes: baseBytes,
      totalBytes: baseBytes,
      error: extractError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '下載失敗';
    updateRow(workno, { status: 'failed', error: message });
    emit({ workno, status: 'failed', downloadedBytes: 0, totalBytes, error: message });
  }
}
