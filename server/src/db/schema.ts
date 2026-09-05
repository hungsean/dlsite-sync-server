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
