import { serve } from '@hono/node-server';
import { app } from './app.js';
import { sqlite } from './db/index.js';
import { env } from './env.js';
import { recoverDownloads } from './services/download.js';

// 恢復上次未完成的下載: 殘留的 downloading 重設成 queued 並重新排入記憶體佇列
recoverDownloads();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`伺服器啟動: http://localhost:${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      sqlite.close();
      process.exit(0);
    });
  });
}
