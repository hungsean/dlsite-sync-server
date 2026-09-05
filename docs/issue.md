# Code Review Issues

## Issue 1（P1）：服務重啟後，未完成的下載會永久卡住

狀態：已解決

下載 queue 只存在記憶體中，服務啟動時沒有恢復資料庫內狀態為 `queued` 或 `downloading` 的工作；同時，`enqueue()` 會略過這兩種狀態。

因此，只要服務在下載途中重啟，這些作品就不會再被處理，使用者也無法透過原本的下載操作重新排入，只能手動修改資料庫。

相關位置：

- `server/src/services/download.ts:54`
- `server/src/services/download.ts:128`

建議修正：

- 服務啟動時，將殘留的 `downloading` 重設成 `queued`，並把所有 `queued` 工作重新加入記憶體 queue；或
- 讓 `enqueue()` 根據實際執行中的記憶體 queue 判斷是否重複，而不是只依賴資料庫狀態。

## Issue 2（P1）：排隊工作沒有綁定發起下載的帳號

狀態：已解決

作品排入 queue 時沒有保存帳號資訊。直到作品真正開始下載時，`processOne()` 才取得當下的 active account。

若使用者以帳號 A 排入多部作品，並在 queue 處理完之前切換到帳號 B，尚未開始的作品會改用 B 的 session。這可能造成下載失敗，且實際使用的下載帳號與使用者排入時的預期不一致。

相關位置：

- `server/src/services/download.ts:192`

建議修正：

- queue item 與下載資料表保存 `accountId`；
- 排入工作時固定發起帳號；
- 執行工作時使用保存的 `accountId` 取得 session，不再讀取當下的 active account。

## Issue 3（P2）：下載 API 沒有限制作品必須屬於 active account

狀態：已解決

`estimate()` 只查詢全域的 `dlsite_work`，沒有透過 `dlsite_account_work` 驗證作品是否屬於目前的 active account。

因此，呼叫端可以提交任何曾被其他帳號同步過的 `workno`。只要該作品存在於全域作品表並標示為可下載，系統就會將它納入估算並嘗試排入下載。

相關位置：

- `server/src/services/download.ts:63`

建議修正：

- 估算及排入下載時取得 active account；
- join `dlsite_account_work`，並以 `accountId` 過濾該帳號實際擁有的作品；
- 將不屬於該帳號的 `workno` 放入 `skipped`，或回傳明確的驗證錯誤。

## Issue 4（P1）：下載帳號外鍵的 migration 缺少 `ON DELETE SET NULL`

狀態：已解決（新增 migration `0006_flippant_lifeguard` 重建 `dlsite_download`，外鍵改為 `ON DELETE set null`。因 `0005` 已套用且 SQLite 無法修改既有外鍵，採整表重建並保留既有資料。已在 DB 備份副本上驗證：有下載紀錄的帳號可正常刪除，且 `account_id` 變為 `NULL`。）

`dlsiteDownload.accountId` 的 schema 宣告帳號刪除時執行 `ON DELETE SET NULL`，讓下載紀錄與檔案可以保留；但實際的 `0005_lumpy_slipstream.sql` 只加入一般外鍵，沒有 `ON DELETE SET NULL`。

資料庫已啟用 `foreign_keys = ON`，所以帳號只要存在下載紀錄，刪除帳號時就會觸發 foreign-key constraint，而不是把 `account_id` 設為 `NULL`。這會讓既有的移除帳號功能失敗，也與 schema 和註解描述不一致。

相關位置：

- `server/src/db/schema.ts:83`
- `server/drizzle/0005_lumpy_slipstream.sql:1`
- `server/src/db/index.ts:14`

建議修正：

- 修正尚未發布的 migration，讓外鍵包含 `ON DELETE SET NULL`；
- 如果 migration 已經在任何環境套用，應新增 migration 重建 `dlsite_download` 資料表，因為 SQLite 無法直接修改既有外鍵約束；
- 補上「已有下載紀錄時仍可移除帳號，且下載紀錄的 `account_id` 變成 `NULL`」測試。

## 驗證狀態

- Server TypeScript typecheck：通過
- Client TypeScript typecheck：通過
- 目前沒有涵蓋下載流程的自動測試

建議至少補上以下測試案例：

1. 服務在 queued／downloading 狀態重啟後，可以正確恢復 queue。
2. 帳號 A 排入作品後切換至帳號 B，既有工作仍使用帳號 A 的 session。
3. active account 無法估算或排入僅屬於其他帳號的作品。
