import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { db } from '../db';
import { sessions, users } from '../db/schema';
import { env } from '../env';

const COOKIE = 'saywed_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_BEFORE_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: number; login: string; name: string };
export type AuthEnv = { Variables: { user: SessionUser } };

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const writeCookie = (c: Context, token: string, expiresAt: Date) =>
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'Strict',
    path: '/api',
    expires: expiresAt,
  });

export const startSession = (c: Context, userId: number) => {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS);
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
  writeCookie(c, token, expiresAt);
};

export const endSession = (c: Context) => {
  const token = getCookie(c, COOKIE);
  if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
  deleteCookie(c, COOKIE, { path: '/api' });
};

const findSession = (token: string) =>
  db
    .select({ id: sessions.id, expiresAt: sessions.expiresAt, user: { id: users.id, login: users.login, name: users.name } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .get();

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE);
  const session = token ? findSession(token) : undefined;
  if (!token || !session) return c.json({ ok: false, error: 'unauthorized' }, 401);

  // скользящий срок: активная сессия продлевается, брошенная истекает через 30 дней
  if (session.expiresAt.getTime() - Date.now() < RENEW_BEFORE_MS) {
    const expiresAt = new Date(Date.now() + TTL_MS);
    db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id)).run();
    writeCookie(c, token, expiresAt);
  }
  c.set('user', session.user);
  await next();
});
