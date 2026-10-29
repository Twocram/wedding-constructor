import type { InvitationRow, LeadRow, RsvpRow } from '../db/schema'
import {
  attendingLabels,
  breakdownTotal,
  contactMethodLabels,
  contactUrl,
  estimateAmount,
  eventTypeLabels,
  leadSourceLabels,
  productLabels,
  rsvpSummary,
  rub,
  themes,
} from '@saywed/shared'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { invitationChats, rsvps, tgSubscribers } from '../db/schema'
import { env } from '../env'

// в ошибке сетевого сбоя Bun лежит адрес запроса с токеном бота — в лог только текст
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export class TelegramError extends Error {
  // fromTelegram — ответ самого Bot API, а не отказ воркера или Cloudflare с тем же HTTP-кодом
  constructor(readonly status: number, readonly description: string, readonly fromTelegram: boolean) {
    super(`Telegram ${status}: ${description}`)
  }
}

const chatGone = /bot was blocked|bot was kicked|user is deactivated|not a member/i
export const isChatGone = (err: unknown) => err instanceof TelegramError && err.fromTelegram && err.status === 403 && chatGone.test(err.description)

export async function callBot<T>(method: string, payload: object, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(`${env.tgApiUrl}/bot${env.tgBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(env.tgRelayKey && { 'X-Relay-Key': env.tgRelayKey }) },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => null) as { ok: boolean, result: T, description?: string } | null
  if (!res.ok || !data?.ok)
    throw new TelegramError(res.status, data?.description ?? res.statusText, data !== null)
  return data.result
}

export function sendMessage(chatId: number | string, html: string) {
  return callBot('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
}

// основной чат из настроек получает всё всегда, подписчики бота — после одобрения в админке
function recipients() {
  const active = db.select({ chatId: tgSubscribers.chatId }).from(tgSubscribers).where(eq(tgSubscribers.status, 'active')).all()
  return [...new Set([env.tgChatId, ...active.map(s => String(s.chatId))].filter(Boolean))]
}

// чат заблокировал бота или удалил его из группы — больше ему не пишем
function forgetChat(chatId: string) {
  db.delete(tgSubscribers).where(and(eq(tgSubscribers.chatId, Number(chatId)), eq(tgSubscribers.status, 'active'))).run()
  db.delete(invitationChats).where(eq(invitationChats.chatId, Number(chatId))).run()
}

async function deliver(chatIds: string[], html: string) {
  const errors: string[] = []
  await Promise.all(chatIds.map(chatId => sendMessage(chatId, html).catch((err) => {
    if (chatId !== env.tgChatId && isChatGone(err))
      forgetChat(chatId)
    else
      errors.push(`чат ${chatId}: ${errorMessage(err)}`)
  })))
  if (errors.length)
    throw new Error(errors.join('; '))
}

export async function sendTelegram(html: string) {
  if (env.tgBotToken)
    await deliver(recipients(), html)
}

export async function notifyNewLead(lead: LeadRow) {
  const theme = lead.themeSlug ? themes[lead.themeSlug]?.name ?? lead.themeSlug : undefined
  const estimate = estimateAmount(lead.product, lead.namedLinks)
  const total = estimate && breakdownTotal(estimate)
  const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ')
  const contacts = env.tgNotifyContacts
    ? [
        `<b>${escape(lead.name)}</b>`,
        `${contactMethodLabels[lead.contactMethod]}: <a href="${contactUrl(lead.contactMethod, lead.contact)}">${escape(lead.contact)}</a>`,
      ]
    : [`Связь: ${contactMethodLabels[lead.contactMethod]} — контакт в админке`]
  const lines = [
    `🆕 <b>Заявка #${lead.id}</b>`,
    '',
    ...contacts,
    '',
    `${productLabels[lead.product]}${theme ? ` · ${escape(theme)}` : ''}`,
    `${eventTypeLabels[lead.eventType]}${lead.eventDate ? `, ${lead.eventDate}` : ''}`,
    lead.namedLinks ? `Именных ссылок: ${lead.namedLinks}` : '',
    total ? `Ориентир: ${rub(total)}` : '',
    lead.message ? (env.tgNotifyContacts ? `\n💬 ${escape(lead.message)}` : '\n💬 Есть комментарий') : '',
    '',
    `Источник: ${leadSourceLabels[lead.source]}${lead.sourcePath ? ` (${escape(lead.sourcePath)})` : ''}`,
    utm ? `UTM: ${escape(utm)}` : '',
    `<a href="${env.adminUrl}/leads/${lead.id}">Открыть в админке</a>`,
  ]
  return sendTelegram(lines.filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n'))
}

// паре — без имён гостей: имя в Telegram было бы передачей персональных данных за границу;
// напитки тоже не шлём — сервер принимает в них любой текст, а пара не должна получать от нашего бота чужие ссылки
function coupleMessage(invitationId: number, rsvp: RsvpRow) {
  const all = db
    .select()
    .from(rsvps)
    .where(eq(rsvps.invitationId, invitationId))
    .orderBy(desc(rsvps.createdAt), desc(rsvps.id))
    .all()
    .map(r => ({ ...r, createdAt: r.createdAt.toISOString() }))
  const { people, no } = rsvpSummary(all)
  return [
    `💌 <b>Новый ответ гостя</b>`,
    `${attendingLabels[rsvp.attending]}${rsvp.attending === 'yes' && rsvp.plusOne ? ' · с парой' : ''}`,
    '',
    `Всего: придут ${people} чел., не смогут ${no}`,
    'Имена и пожелания — на вашей странице с ответами.',
  ].join('\n')
}

export async function notifyNewRsvp(invitation: InvitationRow, rsvp: RsvpRow) {
  if (!env.tgBotToken)
    return
  const details = rsvp.attending === 'yes'
    ? [rsvp.plusOne ? 'с парой' : '', rsvp.drinks.join(', ')].filter(Boolean).join(' · ')
    : ''
  const answer = `${attendingLabels[rsvp.attending]}${details ? ` · ${escape(details)}` : ''}`
  const lines = [
    `💌 <b>Ответ гостя</b> · ${env.tgNotifyContacts ? escape(invitation.title) : `приглашение #${invitation.id}`}`,
    `${env.tgNotifyContacts ? `${escape(rsvp.name)}: ` : ''}${answer}`,
    `<a href="${env.adminUrl}/invitations/${invitation.id}">Открыть в админке</a>`,
  ]
  const team = recipients()
  const couple = db
    .select({ chatId: invitationChats.chatId })
    .from(invitationChats)
    .where(eq(invitationChats.invitationId, invitation.id))
    .all()
    .map(c => String(c.chatId))
    .filter(chatId => !team.includes(chatId))
  const results = await Promise.allSettled([
    deliver(team, lines.join('\n')),
    couple.length ? deliver(couple, coupleMessage(invitation.id, rsvp)) : undefined,
  ])
  const failed = results.flatMap(r => (r.status === 'rejected' ? [errorMessage(r.reason)] : []))
  if (failed.length)
    throw new Error(failed.join('; '))
}
