import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '../env.js';
import * as schema from './schema.js';

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

export const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// 啟動時自動套用 drizzle/ 底下的 migration
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
if (existsSync(migrationsFolder)) {
  migrate(db, { migrationsFolder });
}

export { schema };
