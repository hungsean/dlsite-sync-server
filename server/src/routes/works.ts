import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { enqueue, estimate, getDownloads, onDownloadEvent } from '../services/download.js';
import { getWorkStats, getWorks, syncWorkCount } from '../services/works.js';

export const worksRoutes = new Hono();

const worknosSchema = z.object({
  worknos: z.array(z.string().min(1)).min(1),
});

// 作品數量統計 (讀最後一次同步的結果)
worksRoutes.get('/stats', (c) => c.json(getWorkStats()));

// 完整同步: 打 DLsite content/count + sales + works 並落地 (數量 + 清單)
worksRoutes.post('/sync', async (c) => {
  const result = await syncWorkCount();
  return c.json({ ok: true, ...result });
});

// 預估選取作品的下載容量
worksRoutes.post('/download/estimate', zValidator('json', worknosSchema), (c) => {
  const { worknos } = c.req.valid('json');
  return c.json(estimate(worknos));
});

// 把選取作品排入下載佇列
worksRoutes.post('/download', zValidator('json', worknosSchema), (c) => {
  const { worknos } = c.req.valid('json');
  const enqueued = enqueue(worknos);
  return c.json({ ok: true, enqueued });
});

// 所有作品的下載狀態 (前端載入時補初始狀態)
worksRoutes.get('/download/status', (c) => c.json(getDownloads()));

// 下載進度 SSE 串流
worksRoutes.get('/download/events', (c) =>
  streamSSE(c, async (stream) => {
    const unsub = onDownloadEvent((e) => {
      stream.writeSSE({ event: 'progress', data: JSON.stringify(e) }).catch(() => {
        // 連線已關就忽略
      });
    });
    stream.onAbort(unsub);
    // 保持連線, 定期送心跳避免 proxy 斷線
    while (!c.req.raw.signal.aborted) {
      await stream.sleep(15000);
      await stream.writeSSE({ event: 'ping', data: 'ping' });
    }
    unsub();
  }),
);

// 作品清單 (讀最後一次同步落地的結果) — 放最後, 避免蓋掉上面的具名子路徑
worksRoutes.get('/', (c) => c.json(getWorks()));
