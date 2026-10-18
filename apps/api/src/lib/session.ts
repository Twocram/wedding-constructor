import type { Cookie } from 'elysia'
import { Buffer } from 'node:buffer'
import { and, eq, gt, lt } from 'drizzle-orm'
import { Elysia } from 'elysia'
import { db } from '../db'
import { sessions, users } from '../db/schema'
import { env } from '../env'

const TTL_MS = 30 * 24 * 60 * 60 * 1000
const RENEW_BEFORE_MS = 15 * 24 * 60 * 60 * 1000

export interface SessionUser { id: number, login: string, name: string }
type SessionCookie = Cookie<string | undefined>

const hashToken = (token: string) => new Bun.CryptoHasher('sha256').update(token).digest('hex')

function writeCookie(cookie: SessionCookie, token: string, expires: Date) {
  return cookie.set({ value: token, httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/api', expires })
}

export function startSession(cookie: SessionCookie, userId: number) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL_MS)
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run()
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run()
  writeCookie(cookie, token, expiresAt)
}

export function endSession(cookie: SessionCookie) {
  if (typeof cookie.value === 'string')
    db.delete(sessions).where(eq(sessions.id, hashToken(cookie.value))).run()
  // remove() выставил бы Path=/, а cookie живёт на /api — браузер её бы не удалил
  writeCookie(cookie, '', new Date(0))
}

function findSession(token: string) {
  return db
    .select({ id: sessions.id, expiresAt: sessions.expiresAt, user: { id: users.id, login: users.login, name: users.name } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .get()
}

// { auth: true } на маршруте или в guard — в контексте появляется user, иначе 401
export const auth = new Elysia({ name: 'auth' }).macro({
  auth: {
    resolve({ cookie, status }) {
      const sessionCookie = cookie.saywed_session as SessionCookie
      // Elysia разбирает JSON в значении cookie: подделанное «{...}» придёт объектом, а не строкой
      const token = typeof sessionCookie.value === 'string' ? sessionCookie.value : undefined
      const session = token ? findSession(token) : undefined
      if (!token || !session)
        return status(401, { ok: false as const, error: 'unauthorized' })

      // скользящий срок: активная сессия продлевается, брошенная истекает через 30 дней
      if (session.expiresAt.getTime() - Date.now() < RENEW_BEFORE_MS) {
        const expiresAt = new Date(Date.now() + TTL_MS)
        db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id)).run()
        writeCookie(sessionCookie, token, expiresAt)
      }
      return { user: session.user as SessionUser }
    },
  },
})
