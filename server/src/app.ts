import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { corsOrigins } from './env.js';
import { authRoutes } from './routes/auth.js';
import { worksRoutes } from './routes/works.js';

export const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({ origin: corsOrigins, credentials: true }));

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.route('/api/auth', authRoutes);
app.route('/api/works', worksRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ message: err.message }, err.status);
  }
  console.error('未處理的錯誤:', err);
  return c.json({ message: '伺服器發生錯誤' }, 500);
});

app.notFound((c) => c.json({ message: '找不到這個路徑' }, 404));
