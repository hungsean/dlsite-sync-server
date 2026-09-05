import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dlsiteAccount, dlsiteSession } from '../db/schema.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { deserializeJar, serializeJar } from '../lib/dlsite/client.js';
import { login } from '../lib/dlsite/login.js';
import { validateSession } from '../lib/dlsite/session.js';
import type { CookieJar } from 'tough-cookie';

export interface AuthStatus {
  configured: boolean; // 是否已設定 DLsite 帳號
  loginId: string | null;
  sessionValid: boolean;
  lastValidatedAt: string | null;
}

// 讀目前(唯一)帳號。本次只支援單一帳號。
export function getAccount() {
  return db.select().from(dlsiteAccount).limit(1).get();
}

// 登入 DLsite 並保存加密帳密 + cookie jar。
export async function saveAccountAndLogin(loginId: string, password: string): Promise<AuthStatus> {
  const jar = await login(loginId, password);
  const now = new Date();

  const account = db
    .insert(dlsiteAccount)
    .values({ loginId, passwordEnc: encrypt(password), createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: dlsiteAccount.loginId,
      set: { passwordEnc: encrypt(password), updatedAt: now },
    })
    .returning()
    .get();

  db.insert(dlsiteSession)
    .values({
      accountId: account.id,
      cookieJar: serializeJar(jar),
      isValid: true,
      lastValidatedAt: now,
    })
    .onConflictDoUpdate({
      target: dlsiteSession.accountId,
      set: { cookieJar: serializeJar(jar), isValid: true, lastValidatedAt: now },
    })
    .run();

  return buildStatus();
}

// 確保 session 有效, 需要時用存好的帳密自動重登, 回傳可用的 CookieJar。
export async function ensureValidSession(accountId: number): Promise<CookieJar> {
  const account = db.select().from(dlsiteAccount).where(eq(dlsiteAccount.id, accountId)).get();
  if (!account) {
    throw new Error('尚未設定 DLsite 帳號');
  }
  const session = db
    .select()
    .from(dlsiteSession)
    .where(eq(dlsiteSession.accountId, accountId))
    .get();

  // 先試現有 cookie
  if (session) {
    const jar = deserializeJar(session.cookieJar);
    if (await validateSession(jar)) {
      touchSession(accountId, jar);
      return jar;
    }
  }

  // 失效 -> 用帳密自動重登
  const jar = await login(account.loginId, decrypt(account.passwordEnc));
  touchSession(accountId, jar);
  return jar;
}

function touchSession(accountId: number, jar: CookieJar) {
  const now = new Date();
  db.insert(dlsiteSession)
    .values({ accountId, cookieJar: serializeJar(jar), isValid: true, lastValidatedAt: now })
    .onConflictDoUpdate({
      target: dlsiteSession.accountId,
      set: { cookieJar: serializeJar(jar), isValid: true, lastValidatedAt: now },
    })
    .run();
}

// 回傳目前登入狀態, 絕不含密碼或 cookie。
export function buildStatus(): AuthStatus {
  const account = getAccount();
  if (!account) {
    return { configured: false, loginId: null, sessionValid: false, lastValidatedAt: null };
  }
  const session = db
    .select()
    .from(dlsiteSession)
    .where(eq(dlsiteSession.accountId, account.id))
    .get();
  return {
    configured: true,
    loginId: account.loginId,
    sessionValid: session?.isValid ?? false,
    lastValidatedAt: session?.lastValidatedAt?.toISOString() ?? null,
  };
}

// 手動觸發驗證/自動重登, 回傳最新狀態。
export async function revalidate(): Promise<AuthStatus> {
  const account = getAccount();
  if (!account) {
    throw new Error('尚未設定 DLsite 帳號');
  }
  await ensureValidSession(account.id);
  return buildStatus();
}
