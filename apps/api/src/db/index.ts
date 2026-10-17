import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '../env';
import * as schema from './schema';

mkdirSync(dirname(env.databasePath), { recursive: true });

export const sqlite = new Database(env.databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');
// lower() в SQLite не знает кириллицу — для поиска по заявкам
sqlite.function('ulower', { deterministic: true }, (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v));

export const db = drizzle({ client: sqlite, schema });

export const runMigrations = () => migrate(db, { migrationsFolder: env.migrationsDir });
