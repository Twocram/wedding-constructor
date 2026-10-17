import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as z from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../lib/password';
import { rateLimit } from '../lib/rateLimit';
import { endSession, requireAuth, startSession, type AuthEnv } from '../lib/session';

const credentials = z.object({
  login: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(256),
});

// сверяем и с несуществующим логином, чтобы по времени ответа нельзя было перебрать логины
const dummyHash = hashPassword('timing-equalizer');

export const authRoutes = new Hono<AuthEnv>()
  .post('/login', rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 10 }), zValidator('json', credentials), async (c) => {
    const { login, password } = c.req.valid('json');
    const user = db.select().from(users).where(eq(users.login, login)).get();
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) return c.json({ ok: false as const, error: 'Неверный логин или пароль' }, 401);

    startSession(c, user.id);
    return c.json({ ok: true as const, user: { id: user.id, login: user.login, name: user.name } });
  })
  .post('/logout', (c) => {
    endSession(c);
    return c.json({ ok: true as const });
  })
  .get('/me', requireAuth, (c) => c.json({ ok: true as const, user: c.var.user }));
