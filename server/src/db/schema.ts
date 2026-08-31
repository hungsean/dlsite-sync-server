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

export type DlsiteAccount = typeof dlsiteAccount.$inferSelect;
export type DlsiteSession = typeof dlsiteSession.$inferSelect;
