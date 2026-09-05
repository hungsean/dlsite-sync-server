import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appSetting, dlsiteAccount, dlsiteSession } from '../db/schema.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { deserializeJar, serializeJar } from '../lib/dlsite/client.js';
import { login } from '../lib/dlsite/login.js';
import { validateSession } from '../lib/dlsite/session.js';
import type { CookieJar } from 'tough-cookie';

const ACTIVE_ACCOUNT_KEY = 'active_account_id';

export interface AuthStatus {
  configured: boolean; // 是否有使用中的 DLsite 帳號
  loginId: string | null;
  sessionValid: boolean;
  lastValidatedAt: string | null;
}

export interface AccountSummary {
  id: number;
  loginId: string;
  sessionValid: boolean;
  lastValidatedAt: string | null;
  isActive: boolean;
}

// 讀使用中帳號 id, 沒有設定(登出/未設定)時為 null。
export function getActiveAccountId(): number | null {
  const row = db.select().from(appSetting).where(eq(appSetting.key, ACTIVE_ACCOUNT_KEY)).get();
  if (!row?.value) {
    return null;
  }
  const id = Number(row.value);
  return Number.isNaN(id) ? null : id;
}

// 設定使用中帳號; 傳 null 代表清空(登出後沒有使用中帳號)。
export function setActiveAccount(id: number | null) {
  if (id === null) {
    db.delete(appSetting).where(eq(appSetting.key, ACTIVE_ACCOUNT_KEY)).run();
    return;
  }
  db.insert(appSetting)
    .values({ key: ACTIVE_ACCOUNT_KEY, value: String(id) })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: String(id) } })
    .run();
}

// 讀使用中帳號, 沒有就回 undefined。
export function getActiveAccount() {
  const id = getActiveAccountId();
  if (id === null) {
    return undefined;
  }
  return db.select().from(dlsiteAccount).where(eq(dlsiteAccount.id, id)).get();
}

// 列出所有帳號 (含 session 有效性與是否使用中), 絕不含密碼或 cookie。
export function listAccounts(): AccountSummary[] {
  const activeId = getActiveAccountId();
  const accounts = db.select().from(dlsiteAccount).all();
  return accounts.map((account) => {
    const session = db
      .select()
      .from(dlsiteSession)
      .where(eq(dlsiteSession.accountId, account.id))
      .get();
    return {
      id: account.id,
      loginId: account.loginId,
      sessionValid: session?.isValid ?? false,
      lastValidatedAt: session?.lastValidatedAt?.toISOString() ?? null,
      isActive: account.id === activeId,
    };
  });
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

  setActiveAccount(account.id);

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

// 回傳目前使用中帳號狀態, 絕不含密碼或 cookie。
export function buildStatus(): AuthStatus {
  const account = getActiveAccount();
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
  const account = getActiveAccount();
  if (!account) {
    throw new Error('尚未設定 DLsite 帳號');
  }
  await ensureValidSession(account.id);
  return buildStatus();
}

// 免密碼切換使用中帳號 (不打 DLsite; session 失效時下次同步/驗證會自動重登)。
export function switchAccount(id: number): AuthStatus {
  const account = db.select().from(dlsiteAccount).where(eq(dlsiteAccount.id, id)).get();
  if (!account) {
    throw new Error('找不到這個帳號');
  }
  setActiveAccount(id);
  return buildStatus();
}

// 登出: 清掉使用中帳號的 session (保留帳號與加密帳密), 並清空使用中帳號。
export function logout(): AuthStatus {
  const id = getActiveAccountId();
  if (id !== null) {
    db.delete(dlsiteSession).where(eq(dlsiteSession.accountId, id)).run();
    setActiveAccount(null);
  }
  return buildStatus();
}

// 移除帳號 (cascade 連帶刪 session 與作品數量); 若移除的是使用中帳號則清空。
export function removeAccount(id: number): AuthStatus {
  if (getActiveAccountId() === id) {
    setActiveAccount(null);
  }
  db.delete(dlsiteAccount).where(eq(dlsiteAccount.id, id)).run();
  return buildStatus();
}
