# Code Review Issues

| 編號 | 優先級 | 狀態 | 摘要 |
| --- | --- | --- | --- |
| [Issue 1](./issue-01.md) | P1 | 已解決 | 服務重啟後，未完成的下載會永久卡住 |
| [Issue 2](./issue-02.md) | P1 | 已解決 | 排隊工作沒有綁定發起下載的帳號 |
| [Issue 3](./issue-03.md) | P2 | 已解決 | 下載 API 沒有限制作品必須屬於 active account |
| [Issue 4](./issue-04.md) | P1 | 已解決 | 下載帳號外鍵的 migration 缺少 `ON DELETE SET NULL` |
| [Issue 5](./issue-05.md) | P1 | 已解決 | ZIP entry 可覆寫原始壓縮檔或同批下載檔 |
| [Issue 6](./issue-06.md) | P1 | 已解決 | 自動解壓沒有輸出大小限制，可能耗盡伺服器磁碟 |

## 驗證狀態

- Server TypeScript typecheck：通過
- Client TypeScript typecheck：通過
- 目前沒有涵蓋下載流程的自動測試

建議至少補上以下測試案例：

1. 服務在 queued／downloading 狀態重啟後，可以正確恢復 queue。
2. 帳號 A 排入作品後切換至帳號 B，既有工作仍使用帳號 A 的 session。
3. active account 無法估算或排入僅屬於其他帳號的作品。
