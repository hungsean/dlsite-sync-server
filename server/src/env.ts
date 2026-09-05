import { existsSync } from 'node:fs';
import { z } from 'zod';

// 載入 .env (若存在)。正式環境 (docker) 直接用 compose 帶進來的環境變數, 不需要 .env。
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('./data/app.db'),
  // 從 DLsite 下載的作品檔案存放目錄
  DOWNLOAD_DIR: z.string().default('./data/downloads'),
  // 解壓縮時, zip 檔名沒有標記 UTF-8 flag 時的後備編碼。
  // DLsite 作品幾乎都是日文 Windows 打包的 Shift-JIS (CP932); 若清單多為繁中可改 big5, 簡中可改 gbk。
  ZIP_FALLBACK_ENCODING: z.string().default('shift_jis'),
  // 解壓縮的壓縮比上限 (解壓後總量 / 壓縮檔總量): 防 zip bomb。
  // DLsite 多為已壓縮的音檔 / 圖檔, 比例接近 1; 設 100 可擋惡意高壓縮比又不誤傷正常作品。
  ZIP_MAX_RATIO: z.coerce.number().positive().default(100),
  // 用來加密資料庫裡的 DLsite 密碼, 至少 32 字元
  APP_SECRET: z.string().min(32, 'APP_SECRET 至少需要 32 個字元'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('環境變數設定錯誤:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
