# Issue 4（P1）：下載帳號外鍵的 migration 缺少 `ON DELETE SET NULL`

狀態：已解決

新增 migration `0006_flippant_lifeguard` 重建 `dlsite_download`，外鍵改為 `ON DELETE set null`。因 `0005` 已套用且 SQLite 無法修改既有外鍵，採整表重建並保留既有資料。已在 DB 備份副本上驗證：有下載紀錄的帳號可正常刪除，且 `account_id` 變為 `NULL`。

`dlsiteDownload.accountId` 的 schema 宣告帳號刪除時執行 `ON DELETE SET NULL`，讓下載紀錄與檔案可以保留；但實際的 `0005_lumpy_slipstream.sql` 只加入一般外鍵，沒有 `ON DELETE SET NULL`。

資料庫已啟用 `foreign_keys = ON`，所以帳號只要存在下載紀錄，刪除帳號時就會觸發 foreign-key constraint，而不是把 `account_id` 設為 `NULL`。這會讓既有的移除帳號功能失敗，也與 schema 和註解描述不一致。

## 相關位置

- `server/src/db/schema.ts:83`
- `server/drizzle/0005_lumpy_slipstream.sql:1`
- `server/src/db/index.ts:14`

## 建議修正

- 修正尚未發布的 migration，讓外鍵包含 `ON DELETE SET NULL`；
- 如果 migration 已經在任何環境套用，應新增 migration 重建 `dlsite_download` 資料表，因為 SQLite 無法直接修改既有外鍵約束；
- 補上「已有下載紀錄時仍可移除帳號，且下載紀錄的 `account_id` 變成 `NULL`」測試。

[返回 issue index](./index.md)
