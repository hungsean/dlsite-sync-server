import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import cron from 'node-cron';

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

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
