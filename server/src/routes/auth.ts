import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { InvalidCredentialsError } from '../lib/dlsite/errors.js';
import {
  buildStatus,
  listAccounts,
  logout,
  removeAccount,
  revalidate,
  saveAccountAndLogin,
  switchAccount,
} from '../services/auth.js';

export const authRoutes = new Hono();

const loginSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
});

const switchSchema = z.object({
  id: z.number().int().positive(),
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

// 目前使用中帳號狀態 (不含密碼/cookie)
authRoutes.get('/status', (c) => c.json(buildStatus()));

// 列出所有帳號 (不含密碼/cookie)
authRoutes.get('/accounts', (c) => c.json(listAccounts()));

// 免密碼切換使用中帳號
authRoutes.post('/switch', zValidator('json', switchSchema), (c) => {
  const { id } = c.req.valid('json');
  try {
    const status = switchAccount(id);
    return c.json({ ok: true, status });
  } catch {
    throw new HTTPException(404, { message: '找不到這個帳號' });
  }
});

// 登出: 清掉使用中帳號 session, 保留帳密
authRoutes.post('/logout', (c) => c.json({ ok: true, status: logout() }));

// 移除帳號
authRoutes.delete('/accounts/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(400, { message: '無效的帳號 id' });
  }
  return c.json({ ok: true, status: removeAccount(id) });
});

// 手動觸發驗證/自動重登
authRoutes.post('/validate', async (c) => {
  const status = await revalidate();
  return c.json({ ok: true, status });
});
