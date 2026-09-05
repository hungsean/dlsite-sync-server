import { apiFetch } from ".";

export interface AuthStatus {
  configured: boolean;
  loginId: string | null;
  sessionValid: boolean;
  lastValidatedAt: string | null;
}

export interface AuthResult {
  ok: boolean;
  status: AuthStatus;
}

export interface Account {
  id: number;
  loginId: string;
  sessionValid: boolean;
  lastValidatedAt: string | null;
  isActive: boolean;
}

export function getAuthStatus(): Promise<AuthStatus> {
  return apiFetch<AuthStatus>("/api/auth/status");
}

export function listAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>("/api/auth/accounts");
}

export function switchAccount(id: number): Promise<AuthResult> {
  return apiFetch<AuthResult>("/api/auth/switch", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function logout(): Promise<AuthResult> {
  return apiFetch<AuthResult>("/api/auth/logout", { method: "POST" });
}

export function removeAccount(id: number): Promise<AuthResult> {
  return apiFetch<AuthResult>(`/api/auth/accounts/${id}`, { method: "DELETE" });
}

export function login(loginId: string, password: string): Promise<AuthResult> {
  return apiFetch<AuthResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password }),
  });
}

export function validateSession(): Promise<AuthResult> {
  return apiFetch<AuthResult>("/api/auth/validate", { method: "POST" });
}
