// Служебные команды на сервере:
//   node cli.js create-user <login> <имя>   — создать, пароль сгенерируется и выведется один раз
//   node cli.js reset-password <login>      — новый пароль, все сессии пользователя сбрасываются
//   node cli.js list-users
//   node cli.js leads [N]                   — последние заявки с контактами (пока нет админки)
//   node cli.js backup <файл>               — консистентная копия базы на ходу, без остановки API
//   node cli.js purge-lost [месяцев]        — удалить отказные заявки старше N месяцев (по умолчанию 12)
import { and, desc, eq, lt } from 'drizzle-orm';
import { contactMethodLabels, leadStatusLabels, productLabels } from '@saywed/shared';
import { db, runMigrations, sqlite } from './db';
import { leads, sessions, users } from './db/schema';
import { generatePassword, hashPassword } from './lib/password';

const [command, arg, ...rest] = process.argv.slice(2);
const login = arg?.trim().toLowerCase();

const fail = (message: string) => {
  console.error(message);
  process.exitCode = 1;
};

// ночные задачи не трогают схему: таймер может сработать между выкладкой релиза и рестартом API
if (command !== 'backup' && command !== 'purge-lost') runMigrations();

if (command === 'create-user') {
  const name = rest.join(' ').trim();
  if (!login || !name) fail('Использование: create-user <login> <имя>');
  else if (db.select().from(users).where(eq(users.login, login)).get()) fail(`Пользователь ${login} уже есть`);
  else {
    const password = generatePassword();
    db.insert(users).values({ login, name, passwordHash: await hashPassword(password) }).run();
    console.log(`Создан ${login} (${name}). Пароль: ${password}`);
  }
} else if (command === 'reset-password') {
  const user = login ? db.select().from(users).where(eq(users.login, login)).get() : undefined;
  if (!user) fail('Использование: reset-password <login> — пользователь не найден');
  else {
    const password = generatePassword();
    db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id)).run();
    db.delete(sessions).where(eq(sessions.userId, user.id)).run();
    console.log(`Новый пароль для ${login}: ${password}`);
  }
} else if (command === 'list-users') {
  for (const u of db.select({ login: users.login, name: users.name }).from(users).all()) console.log(`${u.login}\t${u.name}`);
} else if (command === 'leads') {
  const limit = Number(arg) || 20;
  for (const l of db.select().from(leads).orderBy(desc(leads.id)).limit(limit).all()) {
    const when = l.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    console.log(`#${l.id}  ${when}  [${leadStatusLabels[l.status]}]  ${l.name} — ${contactMethodLabels[l.contactMethod]} ${l.contact}  · ${productLabels[l.product]}${l.themeSlug ? ` · ${l.themeSlug}` : ''}`);
    if (l.message) console.log(`      ${l.message.replace(/\s+/g, ' ')}`);
  }
} else if (command === 'backup') {
  if (!arg) fail('Использование: backup <файл>');
  else {
    await sqlite.backup(arg);
    console.log(`Копия базы: ${arg}`);
  }
} else if (command === 'purge-lost') {
  const months = Number(arg) || 12;
  const before = new Date();
  before.setMonth(before.getMonth() - months);
  const { changes } = db.delete(leads).where(and(eq(leads.status, 'lost'), lt(leads.updatedAt, before))).run();
  console.log(`Удалено отказных заявок старше ${months} мес.: ${changes}`);
} else {
  fail('Команды: create-user <login> <имя> | reset-password <login> | list-users | leads [N] | backup <файл> | purge-lost [месяцев]');
}

sqlite.close();
