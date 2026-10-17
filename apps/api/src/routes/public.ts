import { leadInput } from '@saywed/shared';
import { Elysia } from 'elysia';
import { db } from '../db';
import { leadEvents, leads } from '../db/schema';
import { ipHash, rateLimit } from '../lib/rateLimit';
import { leadSearchText } from '../lib/search';
import { notifyNewLead } from '../lib/telegram';

// живой человек не заполнит форму быстрее
const MIN_FILL_MS = 3000;

export const publicRoutes = new Elysia({ prefix: '/public' }).post(
  '/leads',
  ({ body, request, server, status }) => {
    const { website, elapsedMs, consent: _consent, ...data } = body;
    // бот: отвечаем как обычно, чтобы он не подбирал обход
    if (website || (elapsedMs !== undefined && elapsedMs < MIN_FILL_MS)) return status(201, { ok: true as const });

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
        .get();
      tx.insert(leadEvents).values({ leadId: row.id, type: 'created' }).run();
      return row;
    });

    notifyNewLead(lead).catch((err) => console.error(`[telegram] заявка #${lead.id}:`, err));
    return status(201, { ok: true as const });
  },
  {
    body: leadInput,
    // валидация в Elysia идёт раньше beforeHandle: исправление опечатки в контакте не съедает лимит
    beforeHandle: rateLimit({ name: 'leads', windowMs: 10 * 60 * 1000, max: 5 }),
  },
);
