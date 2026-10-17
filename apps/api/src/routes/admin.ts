import { zValidator } from '@hono/zod-validator';
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
  type LeadPatch,
  type LeadStatus,
} from '@saywed/shared';
import { and, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import * as z from 'zod';
import { db } from '../db';
import { leadEvents, leads, users, type LeadRow } from '../db/schema';
import { requireAuth, type AuthEnv } from '../lib/session';

const invalid = (result: { success: true } | { success: false; error: z.core.$ZodError }, c: Context) => {
  if (!result.success) return c.json({ ok: false as const, errors: z.flattenError(result.error) }, 422);
};

// без хеша IP: в админке он не нужен
const publicLead = (row: LeadRow) => {
  const { ipHash: _, ...lead } = row;
  return { ...lead, contactHref: contactUrl(row.contactMethod, row.contact) };
};

// даты фильтра — календарные дни по Москве
const dayStart = (d: string) => new Date(`${d}T00:00:00+03:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+03:00`);
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

const findLead = (id: number) => db.select().from(leads).where(eq(leads.id, id)).get();

const leadId = z.object({ id: z.coerce.number().int().positive() });
const notFound = (c: Context) => c.json({ ok: false as const, error: 'Заявка не найдена' }, 404);
const fieldError = (c: Context, field: string, message: string) =>
  c.json({ ok: false as const, errors: { formErrors: [], fieldErrors: { [field]: [message] } } }, 422);

// в истории для этих полей пишем новое значение: старый контакт или причина отказа иначе пропадают бесследно
const valueInHistory = new Set(['name', 'contact', 'lostReason', 'invitationSlug']);

export const adminRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get('/leads', zValidator('query', leadListQuery, invalid), (c) => {
    const { status, q, source, product, from, to, page, pageSize } = c.req.valid('query');

    const filters: SQL[] = [];
    if (q) {
      // ulower — нижний регистр с кириллицей (встроенный lower в SQLite понимает только латиницу)
      const pattern = `%${likeEscape(q.toLowerCase())}%`;
      const conditions = [
        sql`ulower(${leads.name}) like ${pattern} escape '\\'`,
        sql`ulower(${leads.contact}) like ${pattern} escape '\\'`,
        sql`ulower(coalesce(${leads.message}, '')) like ${pattern} escape '\\'`,
        sql`cast(${leads.id} as text) = ${q.replace(/^#/, '')}`,
      ];
      // телефоны хранятся как +7XXXXXXXXXX: «8 999 123» и «999-123» ищем по цифрам без ведущей 8/7
      const digits = q.replace(/\D/g, '').replace(/^[78](?=\d{3})/, '');
      if (digits.length >= 3) conditions.push(sql`${leads.contact} like ${`%${digits}%`}`);
      filters.push(sql`(${sql.join(conditions, sql` or `)})`);
    }
    if (source) filters.push(eq(leads.source, source));
    if (product) filters.push(eq(leads.product, product));
    if (from) filters.push(gte(leads.createdAt, dayStart(from)));
    if (to) filters.push(lte(leads.createdAt, dayEnd(to)));

    // счётчики по статусам — с теми же фильтрами, но без самого статуса: для бейджей вкладок
    const byStatus = db
      .select({ status: leads.status, n: count() })
      .from(leads)
      .where(and(...filters))
      .groupBy(leads.status)
      .all();
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Partial<Record<LeadStatus, number>>;

    const where = and(...filters, status === 'all' ? undefined : eq(leads.status, status));
    const total = db.select({ n: count() }).from(leads).where(where).get()?.n ?? 0;
    const items = db
      .select()
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all()
      .map(publicLead);

    return c.json({ ok: true as const, items, total, page, pageSize, counts });
  })
  .get('/leads/:id', zValidator('param', leadId, invalid), (c) => {
    const lead = findLead(c.req.valid('param').id);
    if (!lead) return notFound(c);
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
      .all();
    return c.json({ ok: true as const, lead: publicLead(lead), events });
  })
  .patch('/leads/:id', zValidator('param', leadId, invalid), zValidator('json', leadPatch, invalid), (c) => {
    const lead = findLead(c.req.valid('param').id);
    if (!lead) return notFound(c);
    const patch: LeadPatch = { ...c.req.valid('json') };
    const user = c.var.user;

    // способ связи и контакт проверяются только вместе: смена «Telegram → Телефон» без нового номера недопустима
    if (patch.contact !== undefined || patch.contactMethod !== undefined) {
      const method = patch.contactMethod ?? lead.contactMethod;
      const contact = patch.contact ?? lead.contact;
      const error = validateContact(method, contact);
      if (error) return fieldError(c, 'contact', error);
      patch.contact = normalizeContact(method, contact);
    }

    const nextStatus = patch.status ?? lead.status;
    const nextAmount = patch.amount !== undefined ? patch.amount : lead.amount;
    // завершённая заявка без суммы испортила бы выручку на дашборде
    if (nextStatus === 'done' && nextAmount == null) return fieldError(c, 'amount', 'Укажите сумму, чтобы завершить заявку');

    // разбивка, которая не сходится с суммой, вводит в заблуждение — сбрасываем
    const nextBreakdown = patch.amountBreakdown !== undefined ? patch.amountBreakdown : lead.amountBreakdown;
    if (nextBreakdown && breakdownTotal(nextBreakdown) !== nextAmount) patch.amountBreakdown = null;

    const statusChanged = patch.status !== undefined && patch.status !== lead.status;
    if (statusChanged && lead.status === 'lost' && patch.lostReason === undefined) patch.lostReason = null;
    const completedAt = statusChanged ? (patch.status === 'done' ? new Date() : null) : undefined;

    const notes: string[] = [];
    if (patch.amount !== undefined && patch.amount !== lead.amount) notes.push(`Сумма: ${patch.amount == null ? '—' : rub(patch.amount)}`);
    // причина отказа вместе со сменой статуса попадает в само событие статуса
    const reasonInStatus = statusChanged && patch.status === 'lost';
    const edited = (Object.keys(patch) as (keyof LeadPatch)[]).filter(
      (k) =>
        !['status', 'amount', 'amountBreakdown'].includes(k) &&
        !(k === 'lostReason' && (reasonInStatus || lead.status === 'lost' && statusChanged)) &&
        patch[k] !== lead[k as keyof LeadRow],
    );
    if (edited.length) {
      notes.push(
        `Изменено: ${edited.map((k) => (valueInHistory.has(k) ? `${leadFieldLabels[k]} — ${patch[k] ?? '—'}` : leadFieldLabels[k])).join(', ')}`,
      );
    }

    const updated = db.transaction((tx) => {
      const row = tx
        .update(leads)
        .set({ ...patch, ...(completedAt !== undefined && { completedAt }) })
        .where(eq(leads.id, lead.id))
        .returning()
        .get();
      if (statusChanged) {
        tx.insert(leadEvents)
          .values({
            leadId: lead.id,
            type: 'status',
            fromStatus: lead.status,
            toStatus: patch.status,
            text: reasonInStatus ? patch.lostReason ?? null : null,
            authorId: user.id,
          })
          .run();
      }
      if (notes.length) tx.insert(leadEvents).values({ leadId: lead.id, type: 'edit', text: notes.join('. '), authorId: user.id }).run();
      return row;
    });

    return c.json({ ok: true as const, lead: publicLead(updated) });
  })
  .post('/leads/:id/comments', zValidator('param', leadId, invalid), zValidator('json', commentInput, invalid), (c) => {
    const lead = findLead(c.req.valid('param').id);
    if (!lead) return notFound(c);
    const event = db
      .insert(leadEvents)
      .values({ leadId: lead.id, type: 'comment', text: c.req.valid('json').text, authorId: c.var.user.id })
      .returning()
      .get();
    return c.json({ ok: true as const, event: { ...event, authorName: c.var.user.name } }, 201);
  });
