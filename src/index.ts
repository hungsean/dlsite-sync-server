import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import cron from 'node-cron';
import { loginByPassword, loginStatus } from './lib/dlsite/login.js';
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

// #region init area
const app = new Hono()
let count = 0;
const crontask = cron.schedule("* * * * * *", () => {
  console.log("count: ", count);
  count += 1;
}, {
  name: "test"
})
crontask.stop();
// #endregion


app.get('/', (c) => {
  return c.text(`Hello Hono! count: ${count}`)
})

const loginSchema = z.object({
  loginId: z.string(),
  password: z.string()
})
app.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  await loginByPassword(body.loginId, body.password);
  const status = await loginStatus();
  return c.json({ ok: true, body: body, status: status });
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
