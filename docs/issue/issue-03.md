# Issue 3（P2）：下載 API 沒有限制作品必須屬於 active account

狀態：已解決

`estimate()` 只查詢全域的 `dlsite_work`，沒有透過 `dlsite_account_work` 驗證作品是否屬於目前的 active account。

因此，呼叫端可以提交任何曾被其他帳號同步過的 `workno`。只要該作品存在於全域作品表並標示為可下載，系統就會將它納入估算並嘗試排入下載。

## 相關位置

- `server/src/services/download.ts:63`

## 建議修正

- 估算及排入下載時取得 active account；
- join `dlsite_account_work`，並以 `accountId` 過濾該帳號實際擁有的作品；
- 將不屬於該帳號的 `workno` 放入 `skipped`，或回傳明確的驗證錯誤。

[返回 issue index](./index.md)
