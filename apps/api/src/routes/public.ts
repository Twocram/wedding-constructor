import { leadInput, rsvpInput } from '@saywed/shared'
import { desc, eq } from 'drizzle-orm'
import { Elysia } from 'elysia'
import * as z from 'zod'
import { db } from '../db'
import { invitations, leadEvents, leads, rsvps } from '../db/schema'
import { ipHash, rateLimit } from '../lib/rateLimit'
import { leadSearchText } from '../lib/search'
import { errorMessage, notifyNewLead, notifyNewRsvp } from '../lib/telegram'

// живой человек не заполнит форму быстрее
const MIN_FILL_MS = 3000

// токен пары — в заголовке, а не в адресе: адреса запросов пишутся в логи nginx
const tokenHeaders = z.object({ 'x-rsvp-token': z.string().regex(/^[\w-]{20,64}$/) })
const noInvitation = { ok: false as const, error: 'not_found' }

export const publicRoutes = new Elysia({ prefix: '/public' })
  .post(
    '/leads',
    ({ body, request, server, status }) => {
      const { website, elapsedMs, consent: _consent, ...data } = body
      // бот: отвечаем как обычно, чтобы он не подбирал обход
      if (website || (elapsedMs !== undefined && elapsedMs < MIN_FILL_MS))
        return status(201, { ok: true as const })

      const lead = db.transaction((tx) => {
        const row = tx
          .insert(leads)
          .values({
            ...data,
            search: leadSearchText(data),
            consentAt: new Date(),
            ipHash: ipHash(request, server),
            userAgent: request.headers.get('user-agent')?.slice(0, 300),
          })
          .returning()
          .get()
        tx.insert(leadEvents).values({ leadId: row.id, type: 'created' }).run()
        return row
      })

      console.log(`[leads] новая заявка #${lead.id}`)
      notifyNewLead(lead).catch(err => console.error(`[telegram] заявка #${lead.id}: ${errorMessage(err)}`))
      return status(201, { ok: true as const })
    },
    {
      body: leadInput,
      // валидация в Elysia идёт раньше beforeHandle: исправление опечатки в контакте не съедает лимит
      beforeHandle: rateLimit({ name: 'leads', windowMs: 10 * 60 * 1000, max: 5 }),
    },
  )
  .post(
    '/rsvp',
    ({ body, request, server, status }) => {
      const { hp, slug, ...answer } = body
      if (hp) {
        console.warn(`[rsvp] сработала ловушка для ботов: ${slug.slice(0, 80)}`)
        return status(201, { ok: true as const })
      }

      // ответы принимаем только для приглашений, заведённых в админке: иначе любой мог бы засыпать базу по выдуманным адресам
      const invitation = db.select().from(invitations).where(eq(invitations.slug, slug.toLowerCase())).get()
      if (!invitation) {
        // реальное приглашение забыли завести в админке — гости не могут ответить, это должно быть видно в логах
        console.warn(`[rsvp] приглашение не заведено: ${slug.slice(0, 80)}`)
        return status(404, noInvitation)
      }

      // «не смогу» с парой и напитками бессмысленно: в сводке и выгрузке это только путает
      const declined = answer.attending === 'no'
      const rsvp = db
        .insert(rsvps)
        .values({
          ...answer,
          plusOne: declined ? false : answer.plusOne,
          drinks: declined ? [] : answer.drinks,
          notes: answer.notes || null,
          guest: answer.guest || null,
          invitationId: invitation.id,
          ipHash: ipHash(request, server),
          userAgent: request.headers.get('user-agent')?.slice(0, 300),
        })
        .returning()
        .get()
      console.log(`[rsvp] ответ гостя для ${slug}`)
      notifyNewRsvp(invitation, rsvp).catch(err => console.error(`[telegram] ответ гостя #${rsvp.id}: ${errorMessage(err)}`))
      return status(201, { ok: true as const })
    },
    {
      body: rsvpInput,
      // гость может переотправить анкету за себя и родственников, но не сотню раз
      beforeHandle: rateLimit({ name: 'rsvp', windowMs: 10 * 60 * 1000, max: 10 }),
    },
  )
  .get(
    '/rsvp',
    ({ headers, set, status }) => {
      set.headers['cache-control'] = 'no-store'
      const token = headers['x-rsvp-token']
      const invitation = db.select().from(invitations).where(eq(invitations.token, token)).get()
      if (!invitation)
        return status(404, noInvitation)
      const items = db
        .select({
          name: rsvps.name,
          attending: rsvps.attending,
          drinks: rsvps.drinks,
          plusOne: rsvps.plusOne,
          notes: rsvps.notes,
          guest: rsvps.guest,
          createdAt: rsvps.createdAt,
        })
        .from(rsvps)
        .where(eq(rsvps.invitationId, invitation.id))
        .orderBy(desc(rsvps.createdAt))
        .all()
        .map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))
      return { ok: true as const, invitation: { title: invitation.title, slug: invitation.slug }, items }
    },
    {
      headers: tokenHeaders,
      // токен случайный и длинный, подбор и так бесполезен; лимит — от лишней нагрузки
      beforeHandle: rateLimit({ name: 'rsvp-view', windowMs: 10 * 60 * 1000, max: 60 }),
    },
  )
