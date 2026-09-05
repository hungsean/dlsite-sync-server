import { apiFetch } from '.';

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
}

export interface SyncResult {
  ok: boolean;
  stats: WorksStats;
  worksSynced: number; // 這次落地的作品清單筆數
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
