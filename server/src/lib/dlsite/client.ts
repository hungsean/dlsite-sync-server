import got, { type Got } from 'got';
import { CookieJar } from 'tough-cookie';

// 這個模組只負責 DLsite 的 login / cookie / session, 不碰 storage 與 UI。

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function createJar(): CookieJar {
  return new CookieJar();
}

// 把 CookieJar 序列化成字串存進資料庫
export function serializeJar(jar: CookieJar): string {
  return JSON.stringify(jar.serializeSync());
}

// 從資料庫的字串還原成 CookieJar
export function deserializeJar(raw: string): CookieJar {
  return CookieJar.deserializeSync(JSON.parse(raw));
}

// 產生一個帶指定 cookie jar 的 got instance。
// followRedirect 預設開啟 (登入收尾需要跟著 redirect chain 走);
// 需要檢查 Location 時 (例如未來的下載解析) 再個別關掉。
export function createClient(jar: CookieJar): Got {
  return got.extend({
    cookieJar: jar,
    followRedirect: true,
    throwHttpErrors: false,
    headers: {
      'user-agent': USER_AGENT,
    },
  });
}
