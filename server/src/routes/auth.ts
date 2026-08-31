import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { InvalidCredentialsError } from '../lib/dlsite/errors.js';
import { buildStatus, revalidate, saveAccountAndLogin } from '../services/auth.js';

export const authRoutes = new Hono();

const loginSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
});

// 用 DLsite 帳密登入, 保存加密帳密 + session
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { loginId, password } = c.req.valid('json');
  try {
    const status = await saveAccountAndLogin(loginId, password);
    return c.json({ ok: true, status });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      throw new HTTPException(401, { message: err.message });
    }
    throw err;
  }
});

// 目前登入狀態 (不含密碼/cookie)
authRoutes.get('/status', (c) => c.json(buildStatus()));

// 手動觸發驗證/自動重登
authRoutes.post('/validate', async (c) => {
  const status = await revalidate();
  return c.json({ ok: true, status });
});
