import { and, eq, gt, lt } from 'drizzle-orm';
import { Elysia, type Cookie } from 'elysia';
import { db } from '../db';
import { sessions, users } from '../db/schema';
import { env } from '../env';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_BEFORE_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: number; login: string; name: string };
type SessionCookie = Cookie<string | undefined>;

const hashToken = (token: string) => new Bun.CryptoHasher('sha256').update(token).digest('hex');

const writeCookie = (cookie: SessionCookie, token: string, expires: Date) =>
  cookie.set({ value: token, httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/api', expires });

export const startSession = (cookie: SessionCookie, userId: number) => {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS);
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
  writeCookie(cookie, token, expiresAt);
};

export const endSession = (cookie: SessionCookie) => {
  if (cookie.value) db.delete(sessions).where(eq(sessions.id, hashToken(cookie.value))).run();
  cookie.remove();
};

const findSession = (token: string) =>
  db
    .select({ id: sessions.id, expiresAt: sessions.expiresAt, user: { id: users.id, login: users.login, name: users.name } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .get();

// { auth: true } на маршруте или в guard — в контексте появляется user, иначе 401
export const auth = new Elysia({ name: 'auth' }).macro({
  auth: {
    resolve({ cookie, status }) {
      const sessionCookie = cookie.saywed_session as SessionCookie;
      const token = sessionCookie.value;
      const session = token ? findSession(token) : undefined;
      if (!token || !session) return status(401, { ok: false as const, error: 'unauthorized' });

      // скользящий срок: активная сессия продлевается, брошенная истекает через 30 дней
      if (session.expiresAt.getTime() - Date.now() < RENEW_BEFORE_MS) {
        const expiresAt = new Date(Date.now() + TTL_MS);
        db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id)).run();
        writeCookie(sessionCookie, token, expiresAt);
      }
      return { user: session.user as SessionUser };
    },
  },
});
