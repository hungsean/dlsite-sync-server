import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('./data/app.db'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('環境變數設定錯誤:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
