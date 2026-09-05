import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

// ZIP general purpose bit flag 的 bit 11 (0x800): 有設代表檔名是 UTF-8。
const FLAG_UTF8 = 0x800;
// Info-ZIP Unicode Path Extra Field 的 id: 部分工具 (例如 macOS 的 Info-ZIP) 會用 UTF-8 檔名
// 但不設 0x800 flag, 改把真正的 UTF-8 名放在這個擴充欄位裡。
const EF_UNICODE_PATH = 0x7075;
// 解壓後總量至少要留這個比例的剩餘磁碟空間 (避免剛好塞滿)。
const DISK_SAFETY = 1.05;

interface ExtraField {
  id: number;
  data: Buffer;
}

export interface ExtractOptions {
  fallbackEncoding?: string;
  maxRatio?: number; // 解壓後總量 / 壓縮檔總量 上限, 防 zip bomb
}

export interface ExtractResult {
  dir: string; // 解壓後的目錄 (相對 / 絕對同傳入)
  files: number;
  bytes: number; // 實際寫出的 uncompressed bytes
}

// 判斷是不是 zip 檔 (只看副檔名; DLsite direct 下載幾乎都是 .zip)。
export function isZip(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.zip');
}

// 從 Info-ZIP Unicode Path Extra Field 取 UTF-8 檔名。
// 格式: version(1) + nameCRC32(4) + UTF-8 name(其餘)。拿不到就回 null。
function unicodePathFromExtra(extraFields: ExtraField[] | undefined): string | null {
  const ef = extraFields?.find((f) => f.id === EF_UNICODE_PATH);
  if (!ef || ef.data.length <= 5 || ef.data[0] !== 1) {
    return null;
  }
  return ef.data.subarray(5).toString('utf8');
}

// 判斷一段 bytes 是不是合法 UTF-8 (用 fatal decoder 試解, 丟例外就不是)。
function isValidUtf8(raw: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
    return true;
  } catch {
    return false;
  }
}

// 解碼 zip entry 檔名。逐 entry 判斷, 同一個 zip 混編碼也能各自正確解。順序:
//  1. 有 UTF-8 flag -> UTF-8
//  2. Info-ZIP Unicode Path 擴充欄位 -> 其中的 UTF-8 名 (macOS/Info-ZIP 常見)
//  3. 純 ASCII -> 原樣
//  4. bytes 本身就是合法 UTF-8 -> UTF-8 (有些工具寫 UTF-8 卻不設 flag)
//  5. 都不是 -> 後備編碼 (DLsite 幾乎都是日文 Windows 的 Shift-JIS)
export function decodeEntryName(
  raw: Buffer,
  flags: number,
  fallbackEncoding: string,
  extraFields?: ExtraField[],
): string {
  if ((flags & FLAG_UTF8) !== 0) {
    return raw.toString('utf8');
  }
  const unicodePath = unicodePathFromExtra(extraFields);
  if (unicodePath !== null) {
    return unicodePath;
  }
  if (raw.every((b) => b < 0x80)) {
    return raw.toString('latin1'); // 純 ASCII, 不受後備編碼影響
  }
  if (isValidUtf8(raw)) {
    return raw.toString('utf8');
  }
  try {
    return new TextDecoder(fallbackEncoding, { fatal: false }).decode(raw);
  } catch {
    return raw.toString('utf8'); // 後備編碼名稱無效時退回 UTF-8
  }
}

// 一次讀完 central directory 的所有 entry (lazyEntries; 不開檔案串流, 很快)。
function readAllEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on('entry', (e: yauzl.Entry) => {
      entries.push(e);
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', reject);
    zip.readEntry();
  });
}

function openReadStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, rs) => {
      if (err || !rs) reject(err ?? new Error('openReadStream 失敗'));
      else resolve(rs);
    });
  });
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    // autoClose:false -> 讀完 entry 清單後檔案不自動關, 之後才能 openReadStream; 由 caller 手動 close
    yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false, autoClose: false }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error('無法開啟 zip'));
      else resolve(zip);
    });
  });
}

// 把 zip 解壓到 workDir 底下一個以壓縮檔名命名的專屬子目錄。
// 安全性:
//  - 先解到 staging 暫存目錄, 全部成功才原子搬到最終目錄; 絕不寫進 workDir 根,
//    因此碰不到原壓縮檔與同批下載檔 (Issue 5)。
//  - 解壓前依 central directory 檢查壓縮比 (防 zip bomb) 與剩餘磁碟空間 (Issue 6);
//    串流寫入時實際計數, 不只信任 metadata。
//  - 逐 entry 依 flag 決定檔名編碼、擋 zip-slip。
//  - 任何失敗都清掉本次 staging, 不動到已下載完成的原檔。
// 保留原始壓縮檔 (呼叫端不刪)。回傳解壓結果。
export async function extractZip(
  zipPath: string,
  workDir: string,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const fallbackEncoding = opts.fallbackEncoding ?? 'shift_jis';
  const maxRatio = opts.maxRatio ?? 100;

  const baseName = sanitizeSegment(path.basename(zipPath, path.extname(zipPath))) || 'extracted';
  const finalDir = path.join(workDir, baseName);
  const stagingDir = path.join(workDir, `.extract-${baseName}-${Date.now()}`);
  const stagingRoot = path.resolve(stagingDir);

  const zip = await openZip(zipPath);
  try {
    const entries = await readAllEntries(zip);
    const files = entries.filter((e) => !isDirEntry(e));

    // 壓縮比檢查 (防 zip bomb): 解壓後總量 / 壓縮總量
    const totalUncompressed = files.reduce((s, e) => s + e.uncompressedSize, 0);
    const totalCompressed = files.reduce((s, e) => s + e.compressedSize, 0);
    if (totalUncompressed / Math.max(totalCompressed, 1) > maxRatio) {
      throw new Error(
        `壓縮比過高 (${Math.round(totalUncompressed / Math.max(totalCompressed, 1))}x > ${maxRatio}x), 疑似 zip bomb, 中止解壓`,
      );
    }

    // 剩餘磁碟空間檢查
    await mkdir(workDir, { recursive: true });
    const fsStat = await statfs(workDir);
    const freeBytes = fsStat.bavail * fsStat.bsize;
    if (totalUncompressed * DISK_SAFETY > freeBytes) {
      throw new Error(
        `解壓需要約 ${totalUncompressed} bytes, 但剩餘磁碟只有 ${freeBytes} bytes, 中止解壓`,
      );
    }

    await mkdir(stagingRoot, { recursive: true });

    let writtenBytes = 0;
    let count = 0;
    for (const entry of files) {
      const name = decodeEntryName(
        entry.fileName as unknown as Buffer,
        entry.generalPurposeBitFlag,
        fallbackEncoding,
        entry.extraFields as ExtraField[] | undefined,
      );
      const target = path.resolve(stagingRoot, name);
      // zip-slip: 解析後路徑必須仍在 staging 底下
      if (target !== stagingRoot && !target.startsWith(stagingRoot + path.sep)) {
        throw new Error(`zip 內含非法路徑 (zip-slip): ${name}`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      const rs = await openReadStream(zip, entry);
      // 串流時實際計數, entry 大小若超過 metadata 宣告 (+slack) 視為說謊, 中止
      const limit = entry.uncompressedSize + 4096;
      const counter = countingGuard(() => writtenBytes, (n) => (writtenBytes = n), limit, name);
      // 'wx': 排他建立, staging 內不該撞名; 撞到代表 zip 內有重複路徑, 直接失敗
      await pipeline(rs, counter, createWriteStream(target, { flags: 'wx' }));
      count += 1;
    }

    // 全部成功: 原子換上最終目錄 (先移除舊的解壓結果再 rename)
    await rm(finalDir, { recursive: true, force: true });
    await rename(stagingRoot, finalDir);
    return { dir: finalDir, files: count, bytes: writtenBytes };
  } catch (err) {
    await rm(stagingRoot, { recursive: true, force: true }); // 清掉本次部分解壓, 不碰原檔
    throw err;
  } finally {
    zip.close();
  }
}

// 一個 Transform: 邊過邊累計 bytes, 超過該 entry 上限就報錯 (防 metadata 說謊的 zip bomb)。
function countingGuard(
  get: () => number,
  set: (n: number) => void,
  entryLimit: number,
  name: string,
): NodeJS.ReadWriteStream {
  let entryBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      entryBytes += chunk.length;
      if (entryBytes > entryLimit) {
        cb(new Error(`entry 實際大小超過宣告值, 疑似 zip bomb: ${name}`));
        return;
      }
      set(get() + chunk.length);
      cb(null, chunk);
    },
  });
}

function isDirEntry(entry: yauzl.Entry): boolean {
  const raw = entry.fileName as unknown as Buffer;
  const last = raw[raw.length - 1];
  return last === 0x2f || last === 0x5c; // '/' or '\'
}

// 目錄名片段清理 (給壓縮檔名當子目錄用): 去掉路徑分隔與非法字元。
function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|\0]/g, '_').replace(/^\.+/, '').trim();
}
