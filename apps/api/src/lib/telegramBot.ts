import { setTimeout as sleep } from 'node:timers/promises'
import { count, eq } from 'drizzle-orm'
import { db } from '../db'
import { tgSubscribers } from '../db/schema'
import { env } from '../env'
import { callBot, errorMessage, escape, sendMessage } from './telegram'

interface TgChat { id: number, title?: string, username?: string, first_name?: string, last_name?: string }
interface TgUpdate { update_id: number, message?: { chat: TgChat, text?: string } }

// чужие Start не должны раздувать список в админке
const MAX_PENDING = 20

let botUsername: string | undefined
export const getBotUsername = () => botUsername

function chatName(chat: TgChat) {
  return (chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ')) || chat.username || String(chat.id)
}

function reply(chatId: number, text: string) {
  return sendMessage(chatId, text).catch(err => console.error(`[telegram] ответ в чат ${chatId}: ${errorMessage(err)}`))
}

// /start и /stop, в группах — /start@наш_бот; обычные сообщения и служебные события группы бот не замечает
function parseCommand(text: string) {
  const [command, mention] = (text.split(/\s/)[0] ?? '').split('@')
  if (mention && mention.toLowerCase() !== botUsername?.toLowerCase())
    return null
  return command === '/start' || command === '/stop' ? command : null
}

async function handleMessage(chat: TgChat, text: string) {
  const command = parseCommand(text)
  if (!command)
    return
  if (String(chat.id) === env.tgChatId)
    return reply(chat.id, 'Это основной чат: уведомления приходят сюда всегда.')

  const row = db.select().from(tgSubscribers).where(eq(tgSubscribers.chatId, chat.id)).get()
  if (command === '/stop') {
    if (row && row.status !== 'blocked') {
      db.delete(tgSubscribers).where(eq(tgSubscribers.id, row.id)).run()
      await reply(chat.id, 'Уведомления отключены. Включить снова — /start.')
    }
    return
  }
  if (row?.status === 'blocked')
    return
  if (row?.status === 'active')
    return reply(chat.id, 'Уведомления уже включены. Отключить — /stop.')
  if (row)
    return reply(chat.id, 'Запрос ещё ждёт одобрения в админке.')

  const pending = db.select({ n: count() }).from(tgSubscribers).where(eq(tgSubscribers.status, 'pending')).get()?.n ?? 0
  if (pending >= MAX_PENDING)
    return

  const name = chatName(chat).slice(0, 100)
  db.insert(tgSubscribers).values({ chatId: chat.id, name, username: chat.username ?? null }).onConflictDoNothing().run()
  console.log(`[telegram] запрос на подписку от чата ${chat.id}`)
  await reply(chat.id, 'Запрос отправлен. Как только его одобрят в админке saywed, сюда начнут приходить новые заявки и ответы гостей.')
  // только в основной чат: чужие Start не должны рассылаться всем подписчикам
  if (env.tgChatId) {
    await sendMessage(
      env.tgChatId,
      `🔔 <b>Запрос на уведомления</b>\n${escape(name)}${chat.username ? ` (@${escape(chat.username)})` : ''}\n<a href="${env.adminUrl}/notifications">Одобрить в админке</a>`,
    ).catch(err => console.error(`[telegram] запрос на подписку: ${errorMessage(err)}`))
  }
}

// входящие забираем long polling через тот же воркер: webhook требовал бы, чтобы Telegram достучался до сервера в РФ
export function startBotPolling() {
  if (!env.tgBotToken)
    return
  void (async () => {
    let offset = 0
    for (;;) {
      try {
        botUsername ??= (await callBot<{ username: string }>('getMe', {})).username
        const updates = await callBot<TgUpdate[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 40_000)
        for (const update of updates) {
          offset = update.update_id + 1
          if (update.message)
            await handleMessage(update.message.chat, update.message.text ?? '')
        }
      }
      catch (err) {
        console.error(`[telegram] getUpdates: ${errorMessage(err)}`)
        await sleep(30_000)
      }
    }
  })()
}
