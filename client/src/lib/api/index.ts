// 所有跟後端 API 交互的函數都放在 lib/api/ 底下, 元件只呼叫這裡, 不直接 fetch。

export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}
