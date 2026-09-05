import { desc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db/index.js';
import { dlsiteAccountWork, dlsiteContentCount, dlsiteWork } from '../db/schema.js';
import { fetchContentCount, fetchSales, fetchWorks } from '../lib/dlsite/content.js';
import { ensureValidSession, getActiveAccount } from './auth.js';

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
  salesDate: string | null; // 購買日期 (帳號層)
}

export interface SyncResult {
  stats: WorksStats;
  worksSynced: number; // 這次落地的作品清單筆數
}

// 讀最後一次同步的作品數量 (從 DB)。從未同步過時各欄位為 null。
export function getWorkStats(): WorksStats {
  const account = getActiveAccount();
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

// 讀使用中帳號的作品清單: account_work join work, 依購買日期新到舊。
// 沒有使用中帳號時回空陣列。
export function getWorks(): Work[] {
  const account = getActiveAccount();
  if (!account) {
    return [];
  }
  const rows = db
    .select({
      workno: dlsiteWork.workno,
      title: dlsiteWork.title,
      makerName: dlsiteWork.makerName,
      workType: dlsiteWork.workType,
      ageCategory: dlsiteWork.ageCategory,
      thumbnailUrl: dlsiteWork.thumbnailUrl,
      registDate: dlsiteWork.registDate,
      updateDate: dlsiteWork.updateDate,
      salesDate: dlsiteAccountWork.salesDate,
    })
    .from(dlsiteAccountWork)
    .innerJoin(dlsiteWork, eq(dlsiteAccountWork.workno, dlsiteWork.workno))
    .where(eq(dlsiteAccountWork.accountId, account.id))
    .orderBy(desc(dlsiteAccountWork.salesDate))
    .all();
  return rows;
}

// 完整同步: 確保 session 有效後打 content/count (數量) + content/sales + content/works (清單),
// 把作品數量、作品 metadata、帳號擁有紀錄都落地。
export async function syncWorkCount(): Promise<SyncResult> {
  const account = getActiveAccount();
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

  // 抓購買清單 -> 依 workno 抓明細
  // 注意: sales 筆數會多於 works, 因為 sales 會把「漫畫系列作品」整個系列的兄弟作品都列進來,
  // 但帳號不見得買了系列全部。works 只回實際擁有的, 所以 details.length 才是真正的擁有數,
  // works 拿不到的 sales workno 當作「系列中未購買的兄弟作品」正常略過。
  const sales = await fetchSales(jar);
  const worknos = sales.map((s) => s.workno);
  const details = await fetchWorks(jar, worknos, count.pageLimit);
  const salesDateByWorkno = new Map(sales.map((s) => [s.workno, s.salesDate]));

  // 作品 metadata (全域) upsert by workno
  for (const w of details) {
    db.insert(dlsiteWork)
      .values({
        workno: w.workno,
        title: w.title,
        makerName: w.makerName,
        workType: w.workType,
        ageCategory: w.ageCategory,
        thumbnailUrl: w.thumbnailUrl,
        registDate: w.registDate,
        updateDate: w.updateDate,
        raw: w.raw,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dlsiteWork.workno,
        set: {
          title: w.title,
          makerName: w.makerName,
          workType: w.workType,
          ageCategory: w.ageCategory,
          thumbnailUrl: w.thumbnailUrl,
          registDate: w.registDate,
          updateDate: w.updateDate,
          raw: w.raw,
          updatedAt: now,
        },
      })
      .run();

    // 帳號擁有紀錄 upsert by (accountId, workno)
    const salesDate = salesDateByWorkno.get(w.workno) ?? null;
    db.insert(dlsiteAccountWork)
      .values({ accountId: account.id, workno: w.workno, salesDate, syncedAt: now })
      .onConflictDoUpdate({
        target: [dlsiteAccountWork.accountId, dlsiteAccountWork.workno],
        set: { salesDate, syncedAt: now },
      })
      .run();
  }

  return {
    stats: {
      total: count.user,
      production: count.production,
      lastSyncedAt: now.toISOString(),
    },
    worksSynced: details.length,
  };
}
