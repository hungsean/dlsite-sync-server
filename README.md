# DLsite Sync

專案骨架。分成兩個互相獨立的子專案, 各自有自己的 `package.json`, 可以分開開發與部署。

| 目錄      | 內容 | 技術                                   |
| --------- | ---- | -------------------------------------- |
| `server/` | 後端 | Hono + Drizzle ORM + better-sqlite3    |
| `client/` | 前端 | React 19 + Vite                        |

## 開發

需要 Node 22+ 與 pnpm。

```bash
# 後端 http://localhost:3000
cd server
cp .env.example .env
pnpm install
pnpm dev

# 前端 http://localhost:5173, 另開一個終端機
cd client
pnpm install
pnpm dev
```

前端 dev server 會把 `/api` 代理到後端, 開發時不用處理 CORS。
資料庫檔案預設在 `server/data/app.db`, 啟動時會自動套用 `server/drizzle/` 底下的 migration。

## Docker

```bash
docker compose up -d --build
```

前端 http://localhost:8080 (nginx 反代 `/api` 到 server), 後端 http://localhost:3000, DB 存在 `dlsite-data` volume。

## 加東西的時候

- 資料表: 寫在 `server/src/db/schema.ts`, 然後 `pnpm db:generate` 產生 migration
- 路由: 新增 `server/src/routes/*.ts`, 在 `server/src/app.ts` 掛上去
- 外部 API / 商業邏輯: 放 `server/src/lib/`、`server/src/services/`
- 前端畫面: `client/src/`

## 環境變數

server (`server/.env`):

| 變數            | 預設                    | 說明                     |
| --------------- | ----------------------- | ------------------------ |
| `PORT`          | `3000`                  | HTTP 埠號                |
| `CORS_ORIGIN`   | `http://localhost:5173` | 允許的前端來源, 逗號分隔 |
| `DATABASE_PATH` | `./data/app.db`         | SQLite 檔案路徑          |

client (`client/.env`): `VITE_API_PROXY` 改開發時代理的後端位址, `VITE_API_BASE` 改正式環境的 API base url。
