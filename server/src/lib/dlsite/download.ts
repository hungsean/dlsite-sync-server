import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { CookieJar } from 'tough-cookie';
import { createClient } from './client.js';

// Play v3 下載端點: 帶 workno, 回應是 redirect, 從 Location 分類下載型態。
export const DOWNLOAD_ENDPOINT = 'https://play.dlsite.com/api/v3/download';

// 下載端點解析結果 (依 redirect Location 分類)。
// 用 typed union 而非 stringly-typed 旗標, 讓呼叫端一定要處理每一種。
export type DownloadResolution =
  | { kind: 'direct'; location: string } // 單一壓縮檔
  | { kind: 'split'; location: string } // 分割多檔, location 是分割頁面
  | { kind: 'serial'; location: string } // 需要序號, 目前不支援
  | { kind: 'unknown'; location: string } // 非預期 redirect
  | { kind: 'unavailable'; reason: string }; // 401 / 404 / 其他

// 打下載端點, 關掉 redirect 自動跟隨, 用 Location 判斷下載型態。
export async function resolveDownload(jar: CookieJar, workno: string): Promise<DownloadResolution> {
  const client = createClient(jar);
  const res = await client.get(DOWNLOAD_ENDPOINT, {
    searchParams: { workno },
    followRedirect: false,
  });

  if (res.statusCode === 401) {
    return { kind: 'unavailable', reason: '未授權 (session 失效或未擁有此作品)' };
  }
  if (res.statusCode === 404) {
    return { kind: 'unavailable', reason: '找不到作品或無法下載' };
  }
  if (res.statusCode < 300 || res.statusCode >= 400) {
    return { kind: 'unavailable', reason: `下載端點回傳非預期狀態: ${res.statusCode}` };
  }

  const location = res.headers.location ?? '';
  if (!location) {
    return { kind: 'unavailable', reason: '下載端點沒有回傳 Location' };
  }

  const pathPart = safePath(location);
  // 依 Location 路徑分類 (參考 dlsite skill 的 redirect 對照表)
  if (pathPart.includes('/download/split') || pathPart.startsWith('/home/split')) {
    return { kind: 'split', location };
  }
  if (pathPart.includes('/download/serial') || pathPart.startsWith('/home/serial')) {
    return { kind: 'serial', location };
  }
  if (pathPart.includes('/home/download')) {
    return { kind: 'direct', location };
  }
  return { kind: 'unknown', location };
}

// 分割頁面解析: 抓 HTML, 只收 host=www.dlsite.com 且 path 以 /home/download 開頭且含 product_id 的連結,
// 依 /number/{N}/ 的分割編號排序去重。解析器刻意保持狹窄, HTML 會漂移。
export async function parseSplitPage(jar: CookieJar, pageUrl: string): Promise<string[]> {
  const client = createClient(jar);
  const res = await client.get(pageUrl, { followRedirect: true });
  if (res.statusCode !== 200) {
    throw new Error(`分割頁面回傳非預期狀態: ${res.statusCode}`);
  }
  const html = res.body;
  const base = new URL(res.url ?? pageUrl);

  const found = new Map<string, { part: number; url: string }>();
  // 從引號內取值 (href="..." 或 href='...'), 保守解析
  const re = /["']([^"']*\/home\/download[^"']*product_id[^"']*)["']/g;
  for (const m of html.matchAll(re)) {
    const href = m[1];
    if (!href) continue;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.hostname !== 'www.dlsite.com') continue;
    if (!abs.pathname.startsWith('/home/download')) continue;
    const partMatch = abs.pathname.match(/\/number\/(\d+)\//);
    const part = partMatch ? Number(partMatch[1]) : 0;
    found.set(abs.toString(), { part, url: abs.toString() });
  }

  return [...found.values()].sort((a, b) => a.part - b.part).map((f) => f.url);
}

export interface DownloadedFile {
  filePath: string; // 最終檔案絕對路徑
  bytes: number;
}

// 串流下載單一檔案到 workDir 底下。先寫進 .partial 暫存, 完成才 rename 到正式檔名, 避免半截檔被當成完成。
// 回報進度用 onProgress(這個檔已下載的 bytes)。拒絕 HTML 回應 (避免把登入/錯誤頁存成壓縮檔)。
export async function streamToFile(
  jar: CookieJar,
  url: string,
  workDir: string,
  onProgress: (transferred: number) => void,
): Promise<DownloadedFile> {
  const client = createClient(jar);
  const partialDir = path.join(workDir, '.partial');
  await mkdir(partialDir, { recursive: true });

  const stream = client.stream(url, { followRedirect: true });

  let filename = '';
  let rejected: Error | null = null;
  stream.on('response', (res) => {
    const contentType = String(res.headers['content-type'] ?? '');
    // 回應是 HTML 幾乎都是登入頁 / 錯誤頁, 不是真的檔案
    if (/text\/html/i.test(contentType)) {
      rejected = new Error('下載回應是 HTML (可能未授權或連結失效)');
      stream.destroy(rejected);
      return;
    }
    filename = pickFilename(res.headers['content-disposition'], res.url ?? url);
  });
  stream.on('downloadProgress', (p: { transferred: number }) => {
    onProgress(p.transferred);
  });

  // 先寫到暫存檔名 (此時還不知道最終檔名, 用 workno 無關的暫存名)
  const tmpPath = path.join(partialDir, `download-${Date.now()}.part`);
  try {
    await pipeline(stream, createWriteStream(tmpPath));
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw rejected ?? err;
  }

  const safeName = sanitizeFilename(filename) || 'download.bin';
  const finalPath = path.join(workDir, safeName);
  await rename(tmpPath, finalPath);
  const { size } = await stat(finalPath);
  return { filePath: finalPath, bytes: size };
}

// 從 Content-Disposition 或 URL 的 /file/{filename}/ 段取檔名。
function pickFilename(contentDisposition: string | undefined, url: string): string {
  if (contentDisposition) {
    const star = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1].replace(/["']/g, ''));
      } catch {
        /* 落到下面 */
      }
    }
    const plain = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (plain?.[1]) return plain[1];
  }
  try {
    const u = new URL(url);
    const seg = u.pathname.match(/\/file\/([^/]+)/);
    if (seg?.[1]) return decodeURIComponent(seg[1]);
    const last = u.pathname.split('/').filter(Boolean).at(-1);
    if (last) return decodeURIComponent(last);
  } catch {
    /* 忽略 */
  }
  return '';
}

// 檔名防護: 去掉路徑分隔、NUL、parent traversal, 只留單一檔名。
function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  return base.replace(/\0/g, '').replace(/^\.+$/, '').trim();
}

// 從可能是完整 URL 或相對路徑的 Location 取 pathname, 失敗就回原字串。
function safePath(location: string): string {
  try {
    return new URL(location, 'https://www.dlsite.com').pathname;
  } catch {
    return location;
  }
}
