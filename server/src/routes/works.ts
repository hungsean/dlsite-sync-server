import { Hono } from 'hono';
import { getWorkStats, getWorks, syncWorkCount } from '../services/works.js';

export const worksRoutes = new Hono();

// 作品數量統計 (讀最後一次同步的結果)
worksRoutes.get('/stats', (c) => c.json(getWorkStats()));

// 作品清單 (讀最後一次同步落地的結果)
worksRoutes.get('/', (c) => c.json(getWorks()));

// 完整同步: 打 DLsite content/count + sales + works 並落地 (數量 + 清單)
worksRoutes.post('/sync', async (c) => {
  const result = await syncWorkCount();
  return c.json({ ok: true, ...result });
});
