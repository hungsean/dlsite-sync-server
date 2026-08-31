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

export function getAuthStatus(): Promise<AuthStatus> {
  return apiFetch<AuthStatus>("/api/auth/status");
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
