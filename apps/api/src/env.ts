import { randomBytes } from 'node:crypto'
import process from 'node:process'

function list(value: string | undefined, fallback: string) {
  return (value ?? fallback).split(',').map(s => s.trim()).filter(Boolean)
}

export const env = {
  isProd: process.env.NODE_ENV === 'production',
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? 'data/saywed.db',
  migrationsDir: process.env.MIGRATIONS_DIR ?? 'drizzle',
  tgBotToken: process.env.TG_BOT_TOKEN ?? '',
  tgChatId: process.env.TG_CHAT_ID ?? '',
  // из российского дата-центра api.telegram.org недоступен — ходим через воркер Cloudflare (deploy/tg-relay)
  tgApiUrl: (process.env.TG_API_URL || 'https://api.telegram.org').replace(/\/+$/, ''),
  // ключ нужен только воркеру — в сам Telegram его не шлём
  tgRelayKey: process.env.TG_API_URL ? process.env.TG_RELAY_KEY ?? '' : '',
  // имя и контакт в уведомлении = передача ПД на серверы Telegram за рубежом; по умолчанию только суть заявки
  tgNotifyContacts: process.env.TG_NOTIFY_CONTACTS === 'true',
  adminUrl: process.env.ADMIN_URL ?? 'https://admin.saywed.ru',
  allowedOrigins: list(process.env.ALLOWED_ORIGINS, 'https://saywed.ru,https://admin.saywed.ru'),
  // приглашения клиентов на поддоменах: <адрес>.saywed.ru — их не перечислить в ALLOWED_ORIGINS
  invitationDomain: process.env.INVITATION_DOMAIN ?? 'saywed.ru',
  // без постоянной соли хеши IP просто не сравнимы между перезапусками — для антиспама это не страшно
  ipSalt: process.env.IP_SALT || randomBytes(16).toString('hex'),
}
