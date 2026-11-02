import type { Bot } from './telegram'
import { setTimeout as sleep } from 'node:timers/promises'
import { answersUrl, invitationHost } from '@saywed/shared'
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

const usernames: Partial<Record<Bot, string>> = {}
export const getBotUsername = (bot: Bot) => usernames[bot]

function chatName(chat: TgChat) {
  return (chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ')) || chat.username || String(chat.id)
}

function reply(bot: Bot, chatId: number, text: string) {
  return sendMessage(bot, chatId, text).catch(err => console.error(`[telegram] ответ в чат ${chatId}: ${errorMessage(err)}`))
}

// /start и /stop, в группах — /start@наш_бот; payload — секрет из ссылки t.me/бот?start=…; /guests — только у пар
function parseCommand(bot: Bot, text: string) {
  const [head = '', payload] = text.trim().split(/\s+/)
  const [command, mention] = head.split('@')
  if (mention && mention.toLowerCase() !== usernames[bot]?.toLowerCase())
    return null
  return command === '/start' || command === '/stop' || (bot === 'couple' && command === '/guests') ? { command, payload } : null
}

// токен берём из базы при каждом запросе: после перевыпуска в админке пара сразу получит рабочую ссылку
function guestLinks(chatId: number) {
  const rows = db
    .select({ slug: invitations.slug, token: invitations.token })
    .from(invitationChats)
    .innerJoin(invitations, eq(invitationChats.invitationId, invitations.id))
    .where(eq(invitationChats.chatId, chatId))
    .all()
  return rows.map(r => `<a href="${answersUrl(r.token)}">Гости и ответы${rows.length > 1 ? ` · ${invitationHost(r.slug)}` : ''}</a>`).join('\n')
}

function stopCouple(chatId: number) {
  const couple = db.delete(invitationChats).where(eq(invitationChats.chatId, chatId)).returning({ id: invitationChats.id }).all()
  if (couple.length)
    return reply('couple', chatId, 'Уведомления отключены. Включить снова — по ссылке от saywed.')
}

// пара открыла ссылку из карточки приглашения: одобрение не нужно, секрет и есть разрешение
async function linkInvitation(chat: TgChat, token: string) {
  const invitation = /^[\w-]{20,64}$/.test(token)
    ? db.select({ id: invitations.id, slug: invitations.slug, token: invitations.token }).from(invitations).where(eq(invitations.notifyToken, token)).get()
    : undefined
  if (!invitation)
    return reply('couple', chat.id, 'Ссылка устарела. Попросите новую у saywed.')
  const site = invitationHost(invitation.slug)
  const answers = `<a href="${answersUrl(invitation.token)}">Гости и ответы</a>`
  const linked = db
    .select({ id: invitationChats.id })
    .from(invitationChats)
    .where(and(eq(invitationChats.invitationId, invitation.id), eq(invitationChats.chatId, chat.id)))
    .get()
  if (linked)
    return reply('couple', chat.id, `Уведомления об ответах гостей на ${site} уже включены. Ссылка всегда по команде /guests, отключить — /stop.\n${answers}`)
  const chats = db.select({ n: count() }).from(invitationChats).where(eq(invitationChats.invitationId, invitation.id)).get()?.n ?? 0
  if (chats >= MAX_INVITATION_CHATS)
    return reply('couple', chat.id, 'К этому приглашению подключено слишком много чатов. Напишите в saywed.')

  const name = chatName(chat).slice(0, 100)
  db.insert(invitationChats).values({ invitationId: invitation.id, chatId: chat.id, name, username: chat.username ?? null }).onConflictDoNothing().run()
  console.log(`[telegram] чат ${chat.id} подключён к приглашению #${invitation.id}`)
  await reply('couple', chat.id, `Готово: сюда будут приходить ответы гостей на ${site}. Ссылка на гостей всегда по команде /guests, отключить — /stop.\n${answers}`)
  if (env.tgChatId) {
    await sendMessage(
      'team',
      env.tgChatId,
      `🔗 <b>Пара подключила уведомления</b> · приглашение #${invitation.id}\n${escape(name)}${chat.username ? ` (@${escape(chat.username)})` : ''}\n<a href="${env.adminUrl}/invitations/${invitation.id}?tab=couple">Открыть в админке</a>`,
    ).catch(err => console.error(`[telegram] подключение пары: ${errorMessage(err)}`))
  }
}

// Telegram сам превращает группу в супергруппу, и у чата меняется id — переносим подписки, иначе уведомления молча пропадут
function migrateChat(bot: Bot, from: number, to: number) {
  if (bot === 'team')
    db.update(tgSubscribers).set({ chatId: to }).where(eq(tgSubscribers.chatId, from)).run()
  else
    db.update(invitationChats).set({ chatId: to }).where(eq(invitationChats.chatId, from)).run()
  console.log(`[telegram] чат ${from} стал супергруппой ${to}`)
}

async function handleCouple(chat: TgChat, text: string) {
  const parsed = parseCommand('couple', text)
  if (!parsed)
    return
  if (parsed.command === '/stop')
    return stopCouple(chat.id)
  if (parsed.command === '/start' && parsed.payload)
    return linkInvitation(chat, parsed.payload)
  const links = guestLinks(chat.id)
  if (!links)
    return reply('couple', chat.id, 'Чтобы получать ответы гостей, откройте ссылку от saywed.')
  if (parsed.command === '/guests')
    return reply('couple', chat.id, links)
  return reply('couple', chat.id, `Уведомления об ответах гостей уже включены. Ссылка всегда по команде /guests, отключить — /stop.\n${links}`)
}

async function handleTeam(chat: TgChat, text: string) {
  const parsed = parseCommand('team', text)
  if (!parsed)
    return
  if (String(chat.id) === env.tgChatId)
    return reply('team', chat.id, 'Это основной чат: уведомления приходят сюда всегда.')
  // пара открыла ссылку, выданную до появления отдельного бота — это не запрос в команду
  if (parsed.payload) {
    const couple = usernames.couple && /^[\w-]{20,64}$/.test(parsed.payload) ? `https://t.me/${usernames.couple}?start=${parsed.payload}` : null
    return reply('team', chat.id, couple ? `Уведомления для пар теперь в отдельном боте: ${couple}` : 'Это бот команды saywed. Попросите новую ссылку на уведомления у saywed.')
  }

  const row = db.select().from(tgSubscribers).where(eq(tgSubscribers.chatId, chat.id)).get()
  if (parsed.command === '/stop') {
    if (!row || row.status === 'blocked')
      return
    db.delete(tgSubscribers).where(eq(tgSubscribers.id, row.id)).run()
    return reply('team', chat.id, 'Уведомления отключены. Включить снова — /start.')
  }
  if (row?.status === 'blocked')
    return
  if (row?.status === 'active')
    return reply('team', chat.id, 'Уведомления уже включены. Отключить — /stop.')
  if (row)
    return reply('team', chat.id, 'Запрос ещё ждёт одобрения в админке.')

  const pending = db.select({ n: count() }).from(tgSubscribers).where(eq(tgSubscribers.status, 'pending')).get()?.n ?? 0
  if (pending >= MAX_PENDING)
    return

  const name = chatName(chat).slice(0, 100)
  db.insert(tgSubscribers).values({ chatId: chat.id, name, username: chat.username ?? null }).onConflictDoNothing().run()
  console.log(`[telegram] запрос на подписку от чата ${chat.id}`)
  await reply('team', chat.id, 'Запрос отправлен. Как только его одобрят в админке saywed, сюда начнут приходить новые заявки.')
  // только в основной чат: чужие Start не должны рассылаться всем подписчикам
  if (env.tgChatId) {
    await sendMessage(
      'team',
      env.tgChatId,
      `🔔 <b>Запрос на уведомления</b>\n${escape(name)}${chat.username ? ` (@${escape(chat.username)})` : ''}\n<a href="${env.adminUrl}/notifications">Одобрить в админке</a>`,
    ).catch(err => console.error(`[telegram] запрос на подписку: ${errorMessage(err)}`))
  }
}

// входящие забираем long polling через тот же воркер: webhook требовал бы, чтобы Telegram достучался до сервера в РФ
function poll(bot: Bot, handle: (chat: TgChat, text: string) => Promise<unknown>) {
  void (async () => {
    let offset = 0
    for (;;) {
      try {
        usernames[bot] ??= (await callBot<{ username: string }>(bot, 'getMe', {})).username
        const updates = await callBot<TgUpdate[]>(bot, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 40_000)
        for (const update of updates) {
          offset = update.update_id + 1
          if (update.message?.migrate_to_chat_id)
            migrateChat(bot, update.message.chat.id, update.message.migrate_to_chat_id)
          else if (update.message)
            await handle(update.message.chat, update.message.text ?? '')
        }
      }
      catch (err) {
        console.error(`[telegram] getUpdates (${bot}): ${errorMessage(err)}`)
        await sleep(30_000)
      }
    }
  })()
}

export function startBotPolling() {
  if (env.tgBotToken)
    poll('team', handleTeam)
  if (env.tgCoupleBotToken)
    poll('couple', handleCouple)
}
