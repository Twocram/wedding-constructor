import { zValidator } from '@hono/zod-validator';
import { leadInput } from '@saywed/shared';
import { Hono } from 'hono';
import * as z from 'zod';
import { db } from '../db';
import { leadEvents, leads } from '../db/schema';
import { ipHash, rateLimit } from '../lib/rateLimit';
import { notifyNewLead } from '../lib/telegram';

// живой человек не заполнит форму быстрее
const MIN_FILL_MS = 3000;

export const publicRoutes = new Hono().post(
  '/leads',
  // сначала валидация: исправление опечатки в контакте не должно съедать лимит
  zValidator('json', leadInput, (result, c) => {
    if (!result.success) return c.json({ ok: false as const, errors: z.flattenError(result.error).fieldErrors }, 422);
  }),
  rateLimit({ name: 'leads', windowMs: 10 * 60 * 1000, max: 5 }),
  (c) => {
    const { website, elapsedMs, consent, ...data } = c.req.valid('json');
    // бот: отвечаем как обычно, чтобы он не подбирал обход
    if (website || (elapsedMs !== undefined && elapsedMs < MIN_FILL_MS)) return c.json({ ok: true as const }, 201);

    const lead = db.transaction((tx) => {
      const row = tx
        .insert(leads)
        .values({ ...data, consentAt: new Date(), ipHash: ipHash(c), userAgent: c.req.header('user-agent')?.slice(0, 300) })
        .returning()
        .get();
      tx.insert(leadEvents).values({ leadId: row.id, type: 'created' }).run();
      return row;
    });

    notifyNewLead(lead).catch((err) => console.error(`[telegram] заявка #${lead.id}:`, err));
    return c.json({ ok: true as const }, 201);
  },
);
