# Issue 2（P1）：排隊工作沒有綁定發起下載的帳號

狀態：已解決

作品排入 queue 時沒有保存帳號資訊。直到作品真正開始下載時，`processOne()` 才取得當下的 active account。

若使用者以帳號 A 排入多部作品，並在 queue 處理完之前切換到帳號 B，尚未開始的作品會改用 B 的 session。這可能造成下載失敗，且實際使用的下載帳號與使用者排入時的預期不一致。

## 相關位置

- `server/src/services/download.ts:192`

## 建議修正

- queue item 與下載資料表保存 `accountId`；
- 排入工作時固定發起帳號；
- 執行工作時使用保存的 `accountId` 取得 session，不再讀取當下的 active account。

[返回 issue index](./index.md)
