import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db/index.js';
import { dlsiteContentCount } from '../db/schema.js';
import { fetchContentCount } from '../lib/dlsite/content.js';
import { ensureValidSession, getAccount } from './auth.js';

export interface WorksStats {
  total: number | null; // 擁有的作品數, 從未同步過為 null
  production: number | null;
  lastSyncedAt: string | null;
}

// 讀最後一次同步的作品數量 (從 DB)。從未同步過時各欄位為 null。
export function getWorkStats(): WorksStats {
  const account = getAccount();
  if (!account) {
    return { total: null, production: null, lastSyncedAt: null };
  }
  const row = db
    .select()
    .from(dlsiteContentCount)
    .where(eq(dlsiteContentCount.accountId, account.id))
    .get();
  if (!row) {
    return { total: null, production: null, lastSyncedAt: null };
  }
  return {
    total: row.userCount,
    production: row.productionCount,
    lastSyncedAt: row.syncedAt.toISOString(),
  };
}

// 同步作品數量: 確保 session 有效後打 content/count, 把數量落地。
export async function syncWorkCount(): Promise<WorksStats> {
  const account = getAccount();
  if (!account) {
    throw new HTTPException(400, { message: '尚未設定 DLsite 帳號' });
  }

  const jar = await ensureValidSession(account.id);
  const count = await fetchContentCount(jar);
  const now = new Date();

  db.insert(dlsiteContentCount)
    .values({
      accountId: account.id,
      userCount: count.user,
      productionCount: count.production,
      syncedAt: now,
    })
    .onConflictDoUpdate({
      target: dlsiteContentCount.accountId,
      set: { userCount: count.user, productionCount: count.production, syncedAt: now },
    })
    .run();

  return {
    total: count.user,
    production: count.production,
    lastSyncedAt: now.toISOString(),
  };
}
