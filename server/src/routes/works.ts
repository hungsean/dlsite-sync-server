import { Hono } from 'hono';
import { getWorkStats, syncWorkCount } from '../services/works.js';

export const worksRoutes = new Hono();

// 作品數量統計 (讀最後一次同步的結果)
worksRoutes.get('/stats', (c) => c.json(getWorkStats()));

// 同步作品數量: 打 DLsite content/count 並落地
worksRoutes.post('/sync', async (c) => {
  const stats = await syncWorkCount();
  return c.json({ ok: true, ...stats });
});
