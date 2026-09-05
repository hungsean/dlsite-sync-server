# Issue 6（P1）：自動解壓沒有任何輸出大小限制，可能耗盡伺服器磁碟

狀態：已解決

解壓前依 central directory 累計 uncompressed / compressed size，檢查壓縮比上限 `ZIP_MAX_RATIO`（預設 100x，防 zip bomb）與剩餘磁碟空間（需留 5% 餘裕）；串流寫入時同步計數，單一 entry 超過宣告大小即中止，不只信任 metadata；超限或失敗時清掉本次 staging，並把原因寫入下載狀態的 `error` 欄位（狀態仍為 done，因原壓縮檔已安全落地）。已驗證：1030x 高壓縮比 zip 被正確擋下且無殘留。

目前會自動解壓 ZIP 內的所有 entry，但沒有檢查單一 entry 大小、累計 uncompressed size、壓縮比或剩餘磁碟空間。下載進度與資料庫中的大小只計算壓縮檔 bytes，也無法反映解壓額外占用的空間。

作品提供者只需提供高壓縮比 ZIP，就能讓伺服器在下載完成後寫出遠大於下載估算的資料量並耗盡磁碟；由於錯誤被 best-effort 捕捉，工作仍會顯示完成，留下大量部分解壓檔。

## 相關位置

- `server/src/lib/archive.ts:99`
- `server/src/lib/archive.ts:123`
- `server/src/services/download.ts:293`

## 建議修正

- 在開始解壓前累計 central directory 宣告的 `uncompressedSize`，設定合理的單檔、總量及壓縮比上限；
- 串流寫入時同步計數，避免只信任 ZIP metadata；
- 超限或失敗時中止並清理本次部分輸出，將原因呈現在下載狀態中。

[返回 issue index](./index.md)
