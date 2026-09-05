import type { CookieJar } from 'tough-cookie';
import { createClient } from './client.js';

// Play v3 的 content/count: 回傳帳號擁有的作品數等資訊。
// session.ts 也打這支, 但只看 status code; 這裡要 parse body 拿數量。
export const CONTENT_COUNT = 'https://play.dlsite.com/api/v3/content/count';

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
