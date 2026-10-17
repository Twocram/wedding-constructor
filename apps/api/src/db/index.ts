import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { env } from '../env';
import { leadSearchText } from '../lib/search';
import * as schema from './schema';

mkdirSync(dirname(env.databasePath), { recursive: true });

export const sqlite = new Database(env.databasePath, { create: true, strict: true });
sqlite.run('PRAGMA journal_mode = WAL');
sqlite.run('PRAGMA foreign_keys = ON');
sqlite.run('PRAGMA busy_timeout = 5000');

export const db = drizzle({ client: sqlite, schema });

export const runMigrations = () => {
  migrate(db, { migrationsFolder: env.migrationsDir });
  // заявки до появления колонки search: заполняем один раз
  const stale = db.select().from(schema.leads).where(eq(schema.leads.search, '')).all();
  for (const lead of stale) db.update(schema.leads).set({ search: leadSearchText(lead) }).where(eq(schema.leads.id, lead.id)).run();
};
