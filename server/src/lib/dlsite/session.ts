import type { CookieJar } from 'tough-cookie';
import { createClient } from './client.js';

const CONTENT_COUNT = 'https://play.dlsite.com/api/v3/content/count';

// 用 Play v3 的 content/count 驗證 session 是否仍有效。
// 200 = 有效, 401 = 失效/過期。
export async function validateSession(jar: CookieJar): Promise<boolean> {
  const client = createClient(jar);
  const res = await client.get(CONTENT_COUNT, { followRedirect: false });
  return res.statusCode === 200;
}
