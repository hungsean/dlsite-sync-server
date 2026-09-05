# Issue 5（P1）：ZIP entry 可覆寫原始壓縮檔或同批下載檔

狀態：已解決

改為先解壓到 `workDir` 內獨立 staging 暫存目錄，全部成功才原子 rename 到以壓縮檔名命名的專屬子目錄；entry 寫入用排他建立 `flags: 'wx'`；絕不寫進 `workDir` 根，因此碰不到原壓縮檔與同批下載檔；任何失敗清掉本次 staging，不動原檔。已驗證：含同名 `work.zip` entry 的惡意壓縮檔解壓後，原壓縮檔內容不受影響。

解壓目的地直接使用存放下載檔的 `workDir`，而 entry 寫入時使用預設會截斷既有檔案的 `createWriteStream(target)`，沒有檢查目標是否已存在或是否就是目前讀取中的 ZIP。

因此，只要 `foo.zip` 內含名為 `foo.zip` 的 entry，解壓時就會把正在讀取的原始壓縮檔截斷；entry 也可覆寫同一作品目錄內的其他分割下載檔或先前下載留下的檔案。即使後續串流因 ZIP 被破壞而報錯，呼叫端仍把解壓視為 best-effort 並將工作標記為完成，與「保留原壓縮檔」的行為承諾不符，且會造成不可逆的下載資料損毀。

## 相關位置

- `server/src/lib/archive.ts:123`
- `server/src/services/download.ts:293`

## 建議修正

- 解壓到獨立的暫存目錄，全部成功後再以明確的衝突策略移入最終目錄；
- 至少使用排他建立（`flags: 'wx'`）並拒絕任何與原 ZIP 或同批下載檔相同的目標路徑；
- 解壓失敗時清理本次產生的部分檔案，且不可破壞已下載完成的原檔。

[返回 issue index](./index.md)
