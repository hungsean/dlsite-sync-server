import { apiFetch } from '.';

export interface WorksStats {
  total: number | null; // 擁有的作品數, 從未同步過為 null
  production: number | null;
  lastSyncedAt: string | null;
}

export interface SyncResult extends WorksStats {
  ok: boolean;
}

export function getWorkStats(): Promise<WorksStats> {
  return apiFetch<WorksStats>('/api/works/stats');
}

export function syncWorkCount(): Promise<SyncResult> {
  return apiFetch<SyncResult>('/api/works/sync', { method: 'POST' });
}
