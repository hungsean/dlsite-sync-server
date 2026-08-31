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
