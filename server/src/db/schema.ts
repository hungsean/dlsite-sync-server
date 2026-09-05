import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  userCount: integer('user_count').notNull(), // content/count.user, 擁有的作品數
  productionCount: integer('production_count').notNull().default(0), // content/count.production
  syncedAt: integer('synced_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type DlsiteAccount = typeof dlsiteAccount.$inferSelect;
export type DlsiteSession = typeof dlsiteSession.$inferSelect;
export type DlsiteContentCount = typeof dlsiteContentCount.$inferSelect;
