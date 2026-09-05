import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// DLsite 帳號: 密碼以 AES-256-GCM 加密後存 password_enc, 絕不明文
export const dlsiteAccount = sqliteTable('dlsite_account', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loginId: text('login_id').notNull().unique(),
  passwordEnc: text('password_enc').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// DLsite session: 保存序列化後的 tough-cookie CookieJar, session 過期時後端用帳密自動重登
export const dlsiteSession = sqliteTable('dlsite_session', {
  accountId: integer('account_id')
    .primaryKey()
    .references(() => dlsiteAccount.id, { onDelete: 'cascade' }),
  cookieJar: text('cookie_jar').notNull(),
  isValid: integer('is_valid', { mode: 'boolean' }).notNull().default(false),
  lastValidatedAt: integer('last_validated_at', { mode: 'timestamp' }),
});

// DLsite 作品數量: 最後一次同步時 content/count 回傳的擁有作品數, 單一帳號一列
export const dlsiteContentCount = sqliteTable('dlsite_content_count', {
  accountId: integer('account_id')
    .primaryKey()
    .references(() => dlsiteAccount.id, { onDelete: 'cascade' }),
  userCount: integer('user_count').notNull(), // 實際擁有的作品數 (content/works 抓到明細的筆數)
  productionCount: integer('production_count').notNull().default(0), // content/count.production
  syncedAt: integer('synced_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// DLsite 作品 metadata: 以 workno 為主鍵的全域資料表, 不綁帳號。
// 不同帳號擁有同一作品共用同一列, 由 dlsite_account_work 記錄「誰擁有」。
export const dlsiteWork = sqliteTable('dlsite_work', {
  workno: text('workno').primaryKey(), // 例 RJ123456
  title: text('title').notNull(),
  makerName: text('maker_name'),
  workType: text('work_type'),
  ageCategory: text('age_category'), // 例 r18 / general
  thumbnailUrl: text('thumbnail_url'),
  registDate: text('regist_date'),
  updateDate: text('update_date'),
  contentSize: integer('content_size'), // 檔案總大小 (bytes), 來自 content/works, 用來預估下載容量
  downloadable: integer('downloadable', { mode: 'boolean' }).notNull().default(true), // 是否可下載
  raw: text('raw').notNull(), // content/works 原始 JSON, 保留未知欄位
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// 帳號擁有某作品的紀錄 (accountId + workno)。未來的觀看紀錄等帳號層資料掛在這裡。
export const dlsiteAccountWork = sqliteTable(
  'dlsite_account_work',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => dlsiteAccount.id, { onDelete: 'cascade' }),
    workno: text('workno')
      .notNull()
      .references(() => dlsiteWork.workno),
    salesDate: text('sales_date'), // 來自 content/sales
    syncedAt: integer('synced_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.workno] })],
);

// 作品下載狀態: 檔案是存在伺服器磁碟上, 以 workno 為主鍵的全域資料表 (不綁帳號)。
// 同一作品不同帳號共用同一份下載檔案。
export const dlsiteDownload = sqliteTable('dlsite_download', {
  workno: text('workno')
    .primaryKey()
    .references(() => dlsiteWork.workno),
  // 發起下載的帳號: 排入時固定, 之後即使切換使用中帳號, 仍用這個帳號的 session 下載。
  // 帳號被移除時設為 null (下載紀錄與檔案保留, 但無法再自動重登)。
  accountId: integer('account_id').references(() => dlsiteAccount.id, { onDelete: 'set null' }),
  // queued: 已排入佇列; downloading: 下載中; done: 完成; failed: 失敗
  status: text('status').notNull().default('queued'),
  kind: text('kind'), // direct / split, 解析下載端點後才知道
  totalBytes: integer('total_bytes'), // 預期總大小 (bytes)
  downloadedBytes: integer('downloaded_bytes').notNull().default(0), // 已下載大小
  filePath: text('file_path'), // 完成後檔案 / 資料夾路徑 (相對 DOWNLOAD_DIR)
  error: text('error'), // 失敗原因
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// 應用層設定 key-value 表。目前用來存 active_account_id (使用中帳號), 沒有列 = 目前沒有使用中帳號
export const appSetting = sqliteTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value'),
});

export type DlsiteAccount = typeof dlsiteAccount.$inferSelect;
export type DlsiteSession = typeof dlsiteSession.$inferSelect;
export type DlsiteContentCount = typeof dlsiteContentCount.$inferSelect;
export type DlsiteWork = typeof dlsiteWork.$inferSelect;
export type DlsiteAccountWork = typeof dlsiteAccountWork.$inferSelect;
export type DlsiteDownload = typeof dlsiteDownload.$inferSelect;
