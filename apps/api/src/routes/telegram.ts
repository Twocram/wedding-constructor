import type { TgSubscriberRow } from '../db/schema'
import { desc, eq } from 'drizzle-orm'
import { Elysia } from 'elysia'
import * as z from 'zod'
import { db } from '../db'
import { tgSubscribers } from '../db/schema'
import { env } from '../env'
import { auth } from '../lib/session'
import { errorMessage, sendMessage } from '../lib/telegram'
import { getBotUsername } from '../lib/telegramBot'

const idParam = z.object({ id: z.coerce.number().int().positive() })
const notFound = { ok: false as const, error: 'Подписчик не найден' }

function publicSubscriber(row: TgSubscriberRow) {
  return { ...row, approvedAt: row.approvedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }
}

const findSubscriber = (id: number) => db.select().from(tgSubscribers).where(eq(tgSubscribers.id, id)).get()

export const telegramRoutes = new Elysia({ prefix: '/admin/telegram' }).use(auth).guard({ auth: true }, app =>
  app
    .get('/subscribers', () => {
      const items = db.select().from(tgSubscribers).orderBy(desc(tgSubscribers.createdAt)).all().map(publicSubscriber)
      return { ok: true as const, enabled: Boolean(env.tgBotToken), botUsername: getBotUsername() ?? null, items }
    })
    .post(
      '/subscribers/:id/approve',
      async ({ params: { id }, status }) => {
        const current = findSubscriber(id)
        if (!current)
          return status(404, notFound)
        if (current.status !== 'pending')
          return status(409, { ok: false as const, error: 'Запрос уже обработан' })
        const row = db.update(tgSubscribers).set({ status: 'active', approvedAt: new Date() }).where(eq(tgSubscribers.id, id)).returning().get()
        await sendMessage(row.chatId, 'Готово: сюда будут приходить новые заявки и ответы гостей. Отключить — /stop.')
          .catch(err => console.error(`[telegram] одобрение чата ${row.chatId}: ${errorMessage(err)}`))
        return { ok: true as const, subscriber: publicSubscriber(row) }
      },
      { params: idParam },
    )
    // повторный Start от заблокированного не вернёт его в список ожидающих
    .post(
      '/subscribers/:id/block',
      ({ params: { id }, status }) => {
        if (!findSubscriber(id))
          return status(404, notFound)
        const row = db.update(tgSubscribers).set({ status: 'blocked', approvedAt: null }).where(eq(tgSubscribers.id, id)).returning().get()
        return { ok: true as const, subscriber: publicSubscriber(row) }
      },
      { params: idParam },
    )
    .delete(
      '/subscribers/:id',
      ({ params: { id }, status }) => {
        if (!findSubscriber(id))
          return status(404, notFound)
        db.delete(tgSubscribers).where(eq(tgSubscribers.id, id)).run()
        return { ok: true as const }
      },
      { params: idParam },
    ))
