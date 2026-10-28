import type { InvitationRow } from '../db/schema'
import { Buffer } from 'node:buffer'
import { invitationInput, invitationPatch, rsvpSummary } from '@saywed/shared'
import { and, desc, eq, ne } from 'drizzle-orm'
import { Elysia } from 'elysia'
import * as z from 'zod'
import { db } from '../db'
import { invitations, leads, rsvps } from '../db/schema'
import { fieldError } from '../lib/http'
import { auth } from '../lib/session'

const iso = (d: Date) => d.toISOString()
const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url')

const idParam = z.object({ id: z.coerce.number().int().positive() })
const notFound = { ok: false as const, error: 'Приглашение не найдено' }

// drizzle заворачивает ошибку SQLite в свою, код лежит в cause
function isUniqueViolation(e: unknown) {
  const err = e as { code?: string, cause?: { code?: string } } | undefined
  return (err?.code ?? err?.cause?.code) === 'SQLITE_CONSTRAINT_UNIQUE'
}

const findInvitation = (id: number) => db.select().from(invitations).where(eq(invitations.id, id)).get()

function publicInvitation(row: InvitationRow) {
  return { ...row, createdAt: iso(row.createdAt) }
}

// адрес и заявка проверяются одинаково при создании и правке
function checkRefs(data: { slug?: string, leadId?: number | null }, selfId?: number) {
  if (data.slug) {
    const taken = db
      .select({ id: invitations.id })
      .from(invitations)
      .where(selfId ? and(eq(invitations.slug, data.slug), ne(invitations.id, selfId)) : eq(invitations.slug, data.slug))
      .get()
    if (taken)
      return fieldError('slug', 'Этот адрес уже занят другим приглашением')
  }
  if (data.leadId && !db.select({ id: leads.id }).from(leads).where(eq(leads.id, data.leadId)).get())
    return fieldError('leadId', 'Нет такой заявки')
}

export const invitationRoutes = new Elysia({ prefix: '/admin' }).use(auth).guard({ auth: true }, app =>
  app
    .get('/invitations', () => {
      // сводку считаем тем же rsvpSummary, что у пары: повторный ответ гостя заменяет прежний
      const answers = db.select().from(rsvps).orderBy(desc(rsvps.createdAt)).all()
      const byInvitation = new Map<number, typeof answers>()
      for (const answer of answers) byInvitation.set(answer.invitationId, [...(byInvitation.get(answer.invitationId) ?? []), answer])
      const items = db
        .select()
        .from(invitations)
        .orderBy(desc(invitations.createdAt))
        .all()
        .map((invitation) => {
          const own = (byInvitation.get(invitation.id) ?? []).map(a => ({ ...a, createdAt: iso(a.createdAt) }))
          const { total, yes, no, people } = rsvpSummary(own)
          return {
            ...publicInvitation(invitation),
            counts: { total, yes, no, people },
            lastAnswerAt: own[0]?.createdAt ?? null,
          }
        })
      return { ok: true as const, items }
    })
    .post(
      '/invitations',
      ({ body, status }) => {
        const error = checkRefs(body)
        if (error)
          return status(422, error)
        try {
          const row = db
            .insert(invitations)
            .values({ ...body, leadId: body.leadId ?? null, token: newToken() })
            .returning()
            .get()
          return status(201, { ok: true as const, invitation: publicInvitation(row) })
        }
        catch (e) {
          // два одновременных создания с одним адресом: проверка выше прошла у обоих
          if (isUniqueViolation(e))
            return status(422, fieldError('slug', 'Этот адрес уже занят другим приглашением'))
          throw e
        }
      },
      { body: invitationInput },
    )
    .patch(
      '/invitations/:id',
      ({ params: { id }, body, status }) => {
        if (!findInvitation(id))
          return status(404, notFound)
        const error = checkRefs(body, id)
        if (error)
          return status(422, error)
        if (!Object.values(body).some(v => v !== undefined))
          return { ok: true as const, invitation: publicInvitation(findInvitation(id)!) }
        try {
          const row = db.update(invitations).set(body).where(eq(invitations.id, id)).returning().get()
          return { ok: true as const, invitation: publicInvitation(row) }
        }
        catch (e) {
          if (isUniqueViolation(e))
            return status(422, fieldError('slug', 'Этот адрес уже занят другим приглашением'))
          throw e
        }
      },
      { params: idParam, body: invitationPatch },
    )
    // новая ссылка для пары: старая перестаёт работать, если её переслали не тем людям
    .post(
      '/invitations/:id/token',
      ({ params: { id }, status }) => {
        if (!findInvitation(id))
          return status(404, notFound)
        const row = db.update(invitations).set({ token: newToken() }).where(eq(invitations.id, id)).returning().get()
        return { ok: true as const, invitation: publicInvitation(row) }
      },
      { params: idParam },
    )
    .delete(
      '/invitations/:id',
      ({ params: { id }, status }) => {
        if (!findInvitation(id))
          return status(404, notFound)
        db.delete(invitations).where(eq(invitations.id, id)).run()
        return { ok: true as const }
      },
      { params: idParam },
    )
    .get(
      '/invitations/:id/rsvps',
      ({ params: { id }, status }) => {
        const invitation = findInvitation(id)
        if (!invitation)
          return status(404, notFound)
        const items = db
          .select()
          .from(rsvps)
          .where(eq(rsvps.invitationId, id))
          .orderBy(desc(rsvps.createdAt))
          .all()
          .map(({ ipHash: _ip, userAgent: _ua, ...row }) => ({ ...row, createdAt: iso(row.createdAt) }))
        return { ok: true as const, invitation: publicInvitation(invitation), items }
      },
      { params: idParam },
    )
    // дубли и спам из анкеты
    .delete(
      '/rsvps/:id',
      ({ params: { id }, status }) => {
        const deleted = db.delete(rsvps).where(eq(rsvps.id, id)).returning({ id: rsvps.id }).get()
        if (!deleted)
          return status(404, { ok: false as const, error: 'Ответ не найден' })
        return { ok: true as const }
      },
      { params: idParam },
    ))
