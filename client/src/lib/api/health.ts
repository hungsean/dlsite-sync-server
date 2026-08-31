import { apiFetch } from ".";

export interface Health {
  ok: boolean;
  time: string;
}

export function getHealth(): Promise<Health> {
  return apiFetch<Health>("/api/health");
}
