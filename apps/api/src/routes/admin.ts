import type { LeadPatch, LeadStatus } from '@saywed/shared'
import type { SQL } from 'drizzle-orm'
import type { LeadRow } from '../db/schema'
import {
  breakdownTotal,
  commentInput,
  contactUrl,
  leadFieldLabels,
  leadListQuery,
  leadPatch,

  normalizeContact,
  rub,
  validateContact,
} from '@saywed/shared'
import { and, count, desc, eq, gte, like, lte, sql } from 'drizzle-orm'
import { Elysia } from 'elysia'
import * as z from 'zod'
import { db } from '../db'
import { leadEvents, leads, users } from '../db/schema'
import { fieldError } from '../lib/http'
import { leadSearchText } from '../lib/search'
import { auth } from '../lib/session'

// даты отдаём ISO-строками явно: типы для Eden совпадают с тем, что реально лежит в JSON
const iso = (d: Date) => d.toISOString()

// без хеша IP и служебной колонки поиска: в админке они не нужны
function publicLead(row: LeadRow) {
  const { ipHash: _ip, search: _search, ...lead } = row
  return {
    ...lead,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    consentAt: iso(row.consentAt),
    completedAt: row.completedAt && iso(row.completedAt),
    contactHref: contactUrl(row.contactMethod, row.contact),
  }
}

// даты фильтра — календарные дни по Москве
const dayStart = (d: string) => new Date(`${d}T00:00:00+03:00`)
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+03:00`)
const likeEscape = (s: string) => s.replace(/[\\%_]/g, ch => `\\${ch}`)

const findLead = (id: number) => db.select().from(leads).where(eq(leads.id, id)).get()

const leadId = z.object({ id: z.coerce.number().int().positive() })
const notFound = { ok: false as const, error: 'Заявка не найдена' }

// в истории для этих полей пишем новое значение: старый контакт или причина отказа иначе пропадают бесследно
const valueInHistory = new Set(['name', 'contact', 'lostReason', 'invitationSlug'])

export const adminRoutes = new Elysia({ prefix: '/admin' }).use(auth).guard({ auth: true }, app =>
  app
    .get(
      '/leads',
      ({ query: { status, q, source, product, from, to, page, pageSize } }) => {
        const filters: SQL[] = []
        if (q) {
          const conditions = [
            sql`${leads.search} like ${`%${likeEscape(q.toLowerCase())}%`} escape '\\'`,
            sql`cast(${leads.id} as text) = ${q.replace(/^#/, '')}`,
          ]
          // телефоны хранятся как +7XXXXXXXXXX: «8 999 123» и «999-123» ищем по цифрам без ведущей 8/7
          const digits = q.replace(/\D/g, '').replace(/^[78](?=\d{3})/, '')
          if (digits.length >= 3)
            conditions.push(like(leads.contact, `%${digits}%`))
          filters.push(sql`(${sql.join(conditions, sql` or `)})`)
        }
        if (source)
          filters.push(eq(leads.source, source))
        if (product)
          filters.push(eq(leads.product, product))
        if (from)
          filters.push(gte(leads.createdAt, dayStart(from)))
        if (to)
          filters.push(lte(leads.createdAt, dayEnd(to)))

        // счётчики по статусам — с теми же фильтрами, но без самого статуса: для бейджей вкладок
        const counts = Object.fromEntries(
          db
            .select({ status: leads.status, n: count() })
            .from(leads)
            .where(and(...filters))
            .groupBy(leads.status)
            .all()
            .map(r => [r.status, r.n]),
        ) as Partial<Record<LeadStatus, number>>

        const where = and(...filters, status === 'all' ? undefined : eq(leads.status, status))
        const total = db.select({ n: count() }).from(leads).where(where).get()?.n ?? 0
        const items = db
          .select()
          .from(leads)
          .where(where)
          .orderBy(desc(leads.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all()
          .map(publicLead)

        return { ok: true as const, items, total, page, pageSize, counts }
      },
      { query: leadListQuery },
    )
    .get(
      '/leads/:id',
      ({ params, status }) => {
        const lead = findLead(params.id)
        if (!lead)
          return status(404, notFound)
        const events = db
          .select({
            id: leadEvents.id,
            type: leadEvents.type,
            fromStatus: leadEvents.fromStatus,
            toStatus: leadEvents.toStatus,
            text: leadEvents.text,
            createdAt: leadEvents.createdAt,
            authorName: users.name,
          })
          .from(leadEvents)
          .leftJoin(users, eq(users.id, leadEvents.authorId))
          .where(eq(leadEvents.leadId, lead.id))
          .orderBy(desc(leadEvents.createdAt), desc(leadEvents.id))
          .all()
          .map(e => ({ ...e, createdAt: iso(e.createdAt) }))
        return { ok: true as const, lead: publicLead(lead), events }
      },
      { params: leadId },
    )
    .patch(
      '/leads/:id',
      ({ params, body, user, status }) => {
        const lead = findLead(params.id)
        if (!lead)
          return status(404, notFound)
        const patch: LeadPatch = { ...body }

        // способ связи и контакт проверяются только вместе: смена «Telegram → Телефон» без нового номера недопустима
        if (patch.contact !== undefined || patch.contactMethod !== undefined) {
          const method = patch.contactMethod ?? lead.contactMethod
          const contact = patch.contact ?? lead.contact
          const error = validateContact(method, contact)
          if (error)
            return status(422, fieldError('contact', error))
          patch.contact = normalizeContact(method, contact)
        }

        const nextStatus = patch.status ?? lead.status
        const nextAmount = patch.amount !== undefined ? patch.amount : lead.amount
        // завершённая заявка без суммы испортила бы выручку на дашборде
        if (nextStatus === 'done' && nextAmount == null)
          return status(422, fieldError('amount', 'Укажите сумму, чтобы завершить заявку'))

        // разбивка, которая не сходится с суммой, вводит в заблуждение — сбрасываем
        const nextBreakdown = patch.amountBreakdown !== undefined ? patch.amountBreakdown : lead.amountBreakdown
        if (nextBreakdown && breakdownTotal(nextBreakdown) !== nextAmount)
          patch.amountBreakdown = null

        const statusChanged = patch.status !== undefined && patch.status !== lead.status
        if (statusChanged && lead.status === 'lost' && patch.lostReason === undefined)
          patch.lostReason = null
        const completedAt = statusChanged ? (patch.status === 'done' ? new Date() : null) : undefined

        const notes: string[] = []
        if (patch.amount !== undefined && patch.amount !== lead.amount)
          notes.push(`Сумма: ${patch.amount == null ? '—' : rub(patch.amount)}`)
        // причина отказа вместе со сменой статуса попадает в само событие статуса
        const reasonInStatus = statusChanged && patch.status === 'lost'
        const edited = (Object.keys(patch) as (keyof LeadPatch)[]).filter(
          k =>
            !['status', 'amount', 'amountBreakdown'].includes(k)
            && !(k === 'lostReason' && statusChanged && (reasonInStatus || lead.status === 'lost'))
            && patch[k] !== lead[k as keyof LeadRow],
        )
        if (edited.length) {
          notes.push(
            `Изменено: ${edited.map(k => (valueInHistory.has(k) ? `${leadFieldLabels[k]} — ${patch[k] ?? '—'}` : leadFieldLabels[k])).join(', ')}`,
          )
        }

        const merged = { ...lead, ...patch }
        const updated = db.transaction((tx) => {
          const row = tx
            .update(leads)
            .set({ ...patch, search: leadSearchText(merged), ...(completedAt !== undefined && { completedAt }) })
            .where(eq(leads.id, lead.id))
            .returning()
            .get()
          if (statusChanged) {
            tx.insert(leadEvents)
              .values({
                leadId: lead.id,
                type: 'status',
                fromStatus: lead.status,
                toStatus: patch.status,
                text: reasonInStatus ? (patch.lostReason ?? null) : null,
                authorId: user.id,
              })
              .run()
          }
          if (notes.length)
            tx.insert(leadEvents).values({ leadId: lead.id, type: 'edit', text: notes.join('. '), authorId: user.id }).run()
          return row
        })

        return { ok: true as const, lead: publicLead(updated) }
      },
      { params: leadId, body: leadPatch },
    )
    .post(
      '/leads/:id/comments',
      ({ params, body, user, status }) => {
        const lead = findLead(params.id)
        if (!lead)
          return status(404, notFound)
        const event = db.insert(leadEvents).values({ leadId: lead.id, type: 'comment', text: body.text, authorId: user.id }).returning().get()
        return status(201, { ok: true as const, event: { ...event, createdAt: iso(event.createdAt), authorName: user.name } })
      },
      { params: leadId, body: commentInput },
    ))
