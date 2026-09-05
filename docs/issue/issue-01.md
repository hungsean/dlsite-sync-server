# Issue 1（P1）：服務重啟後，未完成的下載會永久卡住

狀態：已解決

下載 queue 只存在記憶體中，服務啟動時沒有恢復資料庫內狀態為 `queued` 或 `downloading` 的工作；同時，`enqueue()` 會略過這兩種狀態。

因此，只要服務在下載途中重啟，這些作品就不會再被處理，使用者也無法透過原本的下載操作重新排入，只能手動修改資料庫。

## 相關位置

- `server/src/services/download.ts:54`
- `server/src/services/download.ts:128`

## 建議修正

- 服務啟動時，將殘留的 `downloading` 重設成 `queued`，並把所有 `queued` 工作重新加入記憶體 queue；或
- 讓 `enqueue()` 根據實際執行中的記憶體 queue 判斷是否重複，而不是只依賴資料庫狀態。

[返回 issue index](./index.md)
