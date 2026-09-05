import type { CookieJar } from 'tough-cookie';
import { createClient } from './client.js';

// Play v3 的 content/count: 回傳帳號擁有的作品數等資訊。
// session.ts 也打這支, 但只看 status code; 這裡要 parse body 拿數量。
export const CONTENT_COUNT = 'https://play.dlsite.com/api/v3/content/count';
export const CONTENT_SALES = 'https://play.dlsite.com/api/v3/content/sales';
export const CONTENT_WORKS = 'https://play.dlsite.com/api/v3/content/works';

export interface ContentCount {
  user: number; // 擁有的作品數
  production: number;
  pageLimit: number; // content/works 的動態批次上限提示
  concurrency: number;
}

// 打 content/count 並解析數量。session 失效時會是 401, 交給呼叫端處理。
export async function fetchContentCount(jar: CookieJar): Promise<ContentCount> {
  const client = createClient(jar);
  const res = await client.get(CONTENT_COUNT, { followRedirect: false });
  if (res.statusCode !== 200) {
    throw new Error(`content/count 回傳非預期狀態: ${res.statusCode}`);
  }
  const body = JSON.parse(res.body) as {
    user?: number;
    production?: number;
    page_limit?: number;
    concurrency?: number;
  };
  return {
    user: body.user ?? 0,
    production: body.production ?? 0,
    pageLimit: body.page_limit ?? 50,
    concurrency: body.concurrency ?? 0,
  };
}

export interface SalesEntry {
  workno: string;
  salesDate: string | null; // 購買日期, 可能缺
}

// content/sales: 帳號的購買清單, 用來取得要餵給 content/works 的 workno 集合。
export async function fetchSales(jar: CookieJar): Promise<SalesEntry[]> {
  const client = createClient(jar);
  const res = await client.get(CONTENT_SALES, { followRedirect: false });
  if (res.statusCode !== 200) {
    throw new Error(`content/sales 回傳非預期狀態: ${res.statusCode}`);
  }
  const body = JSON.parse(res.body) as unknown;
  // 回應可能是陣列, 也可能包在 { works: [...] } 之類的容器裡; 都容忍。
  const rows: Array<Record<string, unknown>> = Array.isArray(body)
    ? (body as Array<Record<string, unknown>>)
    : Array.isArray((body as { works?: unknown }).works)
      ? ((body as { works: Array<Record<string, unknown>> }).works)
      : [];

  const out: SalesEntry[] = [];
  for (const row of rows) {
    const workno = typeof row.workno === 'string' ? row.workno : null;
    if (!workno) continue;
    const salesDate =
      typeof row.sales_date === 'string' ? row.sales_date : null;
    out.push({ workno, salesDate });
  }
  return out;
}

export interface DlsiteWorkDetail {
  workno: string;
  title: string;
  makerName: string | null;
  workType: string | null;
  ageCategory: string | null; // 例 r18 / general (content/works 是字串)
  thumbnailUrl: string | null;
  registDate: string | null;
  updateDate: string | null;
  contentSize: number | null; // 檔案總大小 (bytes)
  downloadable: boolean; // 是否可下載
  raw: string; // 整包原始 JSON, 保留未知欄位
}

// 從 localized map ({ ja_JP, en_US, ... }) 挑一個字串 (ja_JP 優先, 否則取任一非空字串)。
// 值本身就是字串時直接回傳。
function pickLocalized(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    const map = value as Record<string, unknown>;
    if (typeof map.ja_JP === 'string' && map.ja_JP) return map.ja_JP;
    for (const v of Object.values(map)) {
      if (typeof v === 'string' && v) return v;
    }
  }
  return null;
}

function pickString(work: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = work[key];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

// content/works: POST 一個 workno 陣列, 回傳作品明細。
// 依 batchLimit 分批循序送出並串接結果。回應可能是「子集」(少於請求的 id), 容忍。
export async function fetchWorks(
  jar: CookieJar,
  worknos: string[],
  batchLimit = 50,
): Promise<DlsiteWorkDetail[]> {
  const client = createClient(jar);
  const limit = batchLimit > 0 ? batchLimit : 50;
  const out: DlsiteWorkDetail[] = [];

  for (let i = 0; i < worknos.length; i += limit) {
    const batch = worknos.slice(i, i + limit);
    const res = await client.post(CONTENT_WORKS, {
      json: batch,
      followRedirect: false,
    });
    if (res.statusCode !== 200) {
      throw new Error(`content/works 回傳非預期狀態: ${res.statusCode}`);
    }
    const body = JSON.parse(res.body) as unknown;
    // 實測回應是 { works: [...] }; 也容忍純陣列。
    const rows: Array<Record<string, unknown>> = Array.isArray(body)
      ? (body as Array<Record<string, unknown>>)
      : Array.isArray((body as { works?: unknown })?.works)
        ? ((body as { works: Array<Record<string, unknown>> }).works)
        : [];

    for (const work of rows) {
      const workno = typeof work.workno === 'string' ? work.workno : null;
      if (!workno) continue;
      const maker = work.maker as Record<string, unknown> | undefined;
      const workFiles = work.work_files as Record<string, unknown> | undefined;
      out.push({
        workno,
        title: pickLocalized(work.name) ?? workno,
        makerName: maker ? pickLocalized(maker.name) : null,
        workType: pickString(work, 'work_type'),
        ageCategory: pickString(work, 'age_category'),
        thumbnailUrl: workFiles
          ? pickString(workFiles, 'main', 'sam') ?? null
          : pickString(work, 'work_image'),
        registDate: pickString(work, 'regist_date'),
        updateDate: pickString(work, 'upgrade_date', 'update_date'),
        contentSize: typeof work.content_size === 'number' ? work.content_size : null,
        downloadable: work.downloadable !== false, // 預設可下載, 明確為 false 才不可
        raw: JSON.stringify(work),
      });
    }
  }

  return out;
}
