import type { Got } from 'got';
import type { CookieJar } from 'tough-cookie';
import { createClient, createJar } from './client.js';
import { InvalidCredentialsError, LoginFlowError } from './errors.js';
import { validateSession } from './session.js';

const LOGIN_INDEX = 'https://login.dlsite.com/login?user=self';
const LOGIN_POST = 'https://login.dlsite.com/login';
const HOME_SKIP_REGISTER = 'https://www.dlsite.com/home/login/=/skip_register/1';

// DLsite 回傳的帳密錯誤訊息
const INVALID_MESSAGE = 'ログインIDかパスワードが間違っています。';

const MAX_HOPS = 15;

// 從 cookie jar 取出 login.dlsite.com 的 XSRF-TOKEN (cookie 值是 URL-encoded)
async function readXsrfToken(jar: CookieJar): Promise<string> {
  const cookies = await jar.getCookies('https://login.dlsite.com/');
  const xsrf = cookies.find((c) => c.key === 'XSRF-TOKEN');
  if (!xsrf) {
    throw new LoginFlowError('拿不到 XSRF-TOKEN');
  }
  return decodeURIComponent(xsrf.value);
}

// 手動、有上限地跟著 3xx Location 走 (cookie 會累積進同一個 jar)。
// 手動處理是因為登入成功會跨網域 redirect, 帳密錯誤則可能無限 redirect 回登入頁,
// 交給 got 自動 follow 會撞上 MaxRedirectsError。
async function followChain(client: Got, startUrl: string): Promise<void> {
  let url = startUrl;
  for (let i = 0; i < MAX_HOPS; i++) {
    const res = await client.get(url, { followRedirect: false });
    const location = res.headers.location;
    if (res.statusCode < 300 || res.statusCode >= 400 || !location) {
      return;
    }
    url = new URL(location, url).toString();
  }
}

// 用 DLsite 帳號密碼登入, 成功回傳帶有效 session cookie 的 CookieJar。
// 密碼不會出現在任何 log: 任何網路層錯誤都轉成不含 request body 的 LoginFlowError。
export async function login(loginId: string, password: string): Promise<CookieJar> {
  const jar = createJar();
  const client = createClient(jar);

  try {
    // 1. 先打 login index 拿 XSRF-TOKEN cookie
    await client.get(LOGIN_INDEX);
    const token = await readXsrfToken(jar);

    // 2. 送出帳密登入 (不自動 follow, 需自行判讀結果)
    const res = await client.post(LOGIN_POST, {
      form: { login_id: loginId, password, _token: token },
      headers: { 'x-xsrf-token': token },
      followRedirect: false,
    });

    // 帳密錯誤時 DLsite 會回登入頁並帶錯誤訊息
    if (res.body?.includes(INVALID_MESSAGE)) {
      throw new InvalidCredentialsError();
    }

    // 3. 跟著登入後的 redirect chain 走完, 再走 home 端收尾
    if (res.headers.location) {
      await followChain(client, new URL(res.headers.location, LOGIN_POST).toString());
    }
    await followChain(client, HOME_SKIP_REGISTER);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) throw err;
    // 不讓 got 的原始錯誤 (內含 request body/密碼) 外流
    throw new LoginFlowError('DLsite 登入流程失敗');
  }

  // 4. 最終以 content/count 確認 session 真的建立成功
  if (!(await validateSession(jar))) {
    // 走到這裡通常是帳密錯誤 (未觸發訊息判讀) 或 DLsite 流程有變
    throw new InvalidCredentialsError('DLsite 登入未成功, 請確認帳號密碼');
  }

  return jar;
}
