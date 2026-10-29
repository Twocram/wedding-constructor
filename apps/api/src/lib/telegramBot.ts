import { setTimeout as sleep } from 'node:timers/promises'
import { invitationHost } from '@saywed/shared'
import { and, count, eq } from 'drizzle-orm'
import { db } from '../db'
import { invitationChats, invitations, tgSubscribers } from '../db/schema'
import { env } from '../env'
import { callBot, errorMessage, escape, sendMessage } from './telegram'

interface TgChat { id: number, title?: string, username?: string, first_name?: string, last_name?: string }
interface TgUpdate { update_id: number, message?: { chat: TgChat, text?: string, migrate_to_chat_id?: number } }

// чужие Start не должны раздувать список в админке
const MAX_PENDING = 20
// пара и родственники; больше — похоже, что ссылку переслали всем
const MAX_INVITATION_CHATS = 10

let botUsername: string | undefined
export const getBotUsername = () => botUsername

function chatName(chat: TgChat) {
  return (chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ')) || chat.username || String(chat.id)
}

function reply(chatId: number, text: string) {
  return sendMessage(chatId, text).catch(err => console.error(`[telegram] ответ в чат ${chatId}: ${errorMessage(err)}`))
}

// /start и /stop, в группах — /start@наш_бот; payload — секрет из ссылки t.me/бот?start=…
function parseCommand(text: string) {
  const [head = '', payload] = text.trim().split(/\s+/)
  const [command, mention] = head.split('@')
  if (mention && mention.toLowerCase() !== botUsername?.toLowerCase())
    return null
  return command === '/start' || command === '/stop' ? { command, payload } : null
}

function stop(chatId: number) {
  const row = db.select().from(tgSubscribers).where(eq(tgSubscribers.chatId, chatId)).get()
  if (row && row.status !== 'blocked')
    db.delete(tgSubscribers).where(eq(tgSubscribers.id, row.id)).run()
  const couple = db.delete(invitationChats).where(eq(invitationChats.chatId, chatId)).returning({ id: invitationChats.id }).all()
  if (couple.length)
    return reply(chatId, 'Уведомления отключены. Включить снова — по ссылке от saywed.')
  if (row && row.status !== 'blocked')
    return reply(chatId, 'Уведомления отключены. Включить снова — /start.')
}

// пара открыла ссылку из карточки приглашения: одобрение не нужно, секрет и есть разрешение
async function linkInvitation(chat: TgChat, token: string) {
  const invitation = /^[\w-]{20,64}$/.test(token)
    ? db.select({ id: invitations.id, slug: invitations.slug }).from(invitations).where(eq(invitations.notifyToken, token)).get()
    : undefined
  if (!invitation)
    return reply(chat.id, 'Ссылка устарела. Попросите новую у saywed.')
  const site = invitationHost(invitation.slug)
  const linked = db
    .select({ id: invitationChats.id })
    .from(invitationChats)
    .where(and(eq(invitationChats.invitationId, invitation.id), eq(invitationChats.chatId, chat.id)))
    .get()
  if (linked)
    return reply(chat.id, `Уведомления об ответах гостей на ${site} уже включены. Отключить — /stop.`)
  const chats = db.select({ n: count() }).from(invitationChats).where(eq(invitationChats.invitationId, invitation.id)).get()?.n ?? 0
  if (chats >= MAX_INVITATION_CHATS)
    return reply(chat.id, 'К этому приглашению подключено слишком много чатов. Напишите в saywed.')

  const name = chatName(chat).slice(0, 100)
  db.insert(invitationChats).values({ invitationId: invitation.id, chatId: chat.id, name, username: chat.username ?? null }).onConflictDoNothing().run()
  console.log(`[telegram] чат ${chat.id} подключён к приглашению #${invitation.id}`)
  await reply(chat.id, `Готово: сюда будут приходить ответы гостей на ${site}. Отключить — /stop.`)
  if (env.tgChatId) {
    await sendMessage(
      env.tgChatId,
      `🔗 <b>Пара подключила уведомления</b> · приглашение #${invitation.id}\n${escape(name)}${chat.username ? ` (@${escape(chat.username)})` : ''}\n<a href="${env.adminUrl}/invitations/${invitation.id}">Открыть в админке</a>`,
    ).catch(err => console.error(`[telegram] подключение пары: ${errorMessage(err)}`))
  }
}

// Telegram сам превращает группу в супергруппу, и у чата меняется id — переносим подписки, иначе уведомления молча пропадут
function migrateChat(from: number, to: number) {
  db.update(tgSubscribers).set({ chatId: to }).where(eq(tgSubscribers.chatId, from)).run()
  db.update(invitationChats).set({ chatId: to }).where(eq(invitationChats.chatId, from)).run()
  console.log(`[telegram] чат ${from} стал супергруппой ${to}`)
}

async function handleMessage(chat: TgChat, text: string) {
  const parsed = parseCommand(text)
  if (!parsed)
    return
  if (String(chat.id) === env.tgChatId)
    return reply(chat.id, 'Это основной чат: уведомления приходят сюда всегда.')
  if (parsed.command === '/stop')
    return stop(chat.id)
  if (parsed.payload)
    return linkInvitation(chat, parsed.payload)
  // пара повторно набрала /start — это не запрос в команду
  if (db.select({ id: invitationChats.id }).from(invitationChats).where(eq(invitationChats.chatId, chat.id)).get())
    return reply(chat.id, 'Уведомления об ответах гостей уже включены. Отключить — /stop.')

  const row = db.select().from(tgSubscribers).where(eq(tgSubscribers.chatId, chat.id)).get()
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
          if (update.message?.migrate_to_chat_id)
            migrateChat(update.message.chat.id, update.message.migrate_to_chat_id)
          else if (update.message)
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
