import { API_BASE, apiFetch } from '.';

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'failed';

export interface WorksStats {
  total: number | null; // 擁有的作品數, 從未同步過為 null
  production: number | null;
  lastSyncedAt: string | null;
}

export interface Work {
  workno: string;
  title: string;
  makerName: string | null;
  workType: string | null;
  ageCategory: string | null;
  thumbnailUrl: string | null;
  registDate: string | null;
  updateDate: string | null;
  salesDate: string | null;
  contentSize: number | null; // 檔案大小 (bytes), 用來預估下載容量
  downloadable: boolean; // 是否可下載
  downloadStatus: DownloadStatus | null; // 未下載過為 null
  downloadedBytes: number | null;
}

export interface SyncResult {
  ok: boolean;
  stats: WorksStats;
  worksSynced: number; // 這次落地的作品清單筆數
}

export interface EstimateResult {
  count: number; // 可下載的作品數
  totalBytes: number; // 可下載作品的容量加總
  skipped: string[]; // 不可下載 / 找不到而略過的 workno
  items: Array<{ workno: string; title: string; bytes: number | null; downloadable: boolean }>;
}

export interface DownloadState {
  workno: string;
  status: DownloadStatus;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
}

export function getWorkStats(): Promise<WorksStats> {
  return apiFetch<WorksStats>('/api/works/stats');
}

export function getWorks(): Promise<Work[]> {
  return apiFetch<Work[]>('/api/works');
}

export function syncWorkCount(): Promise<SyncResult> {
  return apiFetch<SyncResult>('/api/works/sync', { method: 'POST' });
}

// 預估選取作品的下載容量
export function estimateDownload(worknos: string[]): Promise<EstimateResult> {
  return apiFetch<EstimateResult>('/api/works/download/estimate', {
    method: 'POST',
    body: JSON.stringify({ worknos }),
  });
}

// 把選取作品排入下載佇列
export function startDownload(worknos: string[]): Promise<{ ok: boolean; enqueued: string[] }> {
  return apiFetch<{ ok: boolean; enqueued: string[] }>('/api/works/download', {
    method: 'POST',
    body: JSON.stringify({ worknos }),
  });
}

// 讀所有作品目前的下載狀態 (前端載入時補初始狀態)
export function getDownloadStatus(): Promise<DownloadState[]> {
  return apiFetch<DownloadState[]>('/api/works/download/status');
}

// 訂閱下載進度 SSE。回傳取消訂閱函式。
export function subscribeDownloadEvents(onProgress: (e: DownloadState) => void): () => void {
  const source = new EventSource(`${API_BASE}/api/works/download/events`);
  source.addEventListener('progress', (ev) => {
    try {
      onProgress(JSON.parse((ev as MessageEvent).data) as DownloadState);
    } catch {
      // 壞掉的事件略過
    }
  });
  return () => source.close();
}
