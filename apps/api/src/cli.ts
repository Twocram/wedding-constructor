import { Buffer } from 'node:buffer'
import { rm } from 'node:fs/promises'
import process from 'node:process'
import { contactMethodLabels, leadStatusLabels, productLabels } from '@saywed/shared'
// Служебные команды на сервере:
//   saywed-api create-user <login> <имя>   — создать, пароль сгенерируется и выведется один раз
//   saywed-api reset-password <login>      — новый пароль, все сессии пользователя сбрасываются
//   saywed-api list-users
//   saywed-api leads [N]                   — последние заявки с контактами (пока нет админки)
//   saywed-api backup <файл>               — консистентная копия базы на ходу, без остановки API
//   saywed-api purge-lost [месяцев]        — удалить отказные заявки старше N месяцев (по умолчанию 12)
import { and, desc, eq, lt } from 'drizzle-orm'
import { db, runMigrations, sqlite } from './db'
import { leads, sessions, users } from './db/schema'

// пароль выводится один раз; хеш — argon2id из Bun.password
const generatePassword = () => Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url')

function fail(message: string) {
  console.error(message)
  process.exitCode = 1
}

export async function runCli([command, arg, ...rest]: string[]) {
  const login = arg?.trim().toLowerCase()

  // ночные задачи не трогают схему: таймер может сработать между выкладкой релиза и рестартом API
  if (command !== 'backup' && command !== 'purge-lost')
    runMigrations()

  if (command === 'create-user') {
    const name = rest.join(' ').trim()
    if (!login || !name) {
      fail('Использование: create-user <login> <имя>')
    }
    else if (db.select().from(users).where(eq(users.login, login)).get()) {
      fail(`Пользователь ${login} уже есть`)
    }
    else {
      const password = generatePassword()
      db.insert(users).values({ login, name, passwordHash: await Bun.password.hash(password) }).run()
      console.log(`Создан ${login} (${name}). Пароль: ${password}`)
    }
  }
  else if (command === 'reset-password') {
    const user = login ? db.select().from(users).where(eq(users.login, login)).get() : undefined
    if (!user) {
      fail('Использование: reset-password <login> — пользователь не найден')
    }
    else {
      const password = generatePassword()
      db.update(users).set({ passwordHash: await Bun.password.hash(password) }).where(eq(users.id, user.id)).run()
      db.delete(sessions).where(eq(sessions.userId, user.id)).run()
      console.log(`Новый пароль для ${login}: ${password}`)
    }
  }
  else if (command === 'list-users') {
    for (const u of db.select({ login: users.login, name: users.name }).from(users).all()) console.log(`${u.login}\t${u.name}`)
  }
  else if (command === 'leads') {
    const limit = Number(arg) || 20
    for (const l of db.select().from(leads).orderBy(desc(leads.id)).limit(limit).all()) {
      const when = l.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
      console.log(`#${l.id}  ${when}  [${leadStatusLabels[l.status]}]  ${l.name} — ${contactMethodLabels[l.contactMethod]} ${l.contact}  · ${productLabels[l.product]}${l.themeSlug ? ` · ${l.themeSlug}` : ''}`)
      if (l.message)
        console.log(`      ${l.message.replace(/\s+/g, ' ')}`)
    }
  }
  else if (command === 'backup') {
    if (!arg) {
      fail('Использование: backup <файл>')
    }
    else {
      // VACUUM INTO — целостная копия на ходу, API можно не останавливать; в существующий файл писать отказывается
      await rm(arg, { force: true })
      sqlite.run('VACUUM INTO ?', [arg])
      console.log(`Копия базы: ${arg}`)
    }
  }
  else if (command === 'purge-lost') {
    const months = arg === undefined ? 12 : Number(arg)
    if (!Number.isInteger(months) || months < 1)
      return fail('Использование: purge-lost [месяцев], целое число от 1')
    // месяц считаем как 30 дней: точности до дня здесь не нужно, а setMonth переполняется в конце месяца
    const before = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000)
    const removed = db.delete(leads).where(and(eq(leads.status, 'lost'), lt(leads.updatedAt, before))).returning({ id: leads.id }).all()
    console.log(`Удалено отказных заявок старше ${months} мес.: ${removed.length}`)
  }
  else {
    fail('Команды: create-user <login> <имя> | reset-password <login> | list-users | leads [N] | backup <файл> | purge-lost [месяцев]')
  }

  sqlite.close()
}
