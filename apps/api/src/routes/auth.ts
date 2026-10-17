import type { Cookie } from 'elysia'
import { eq } from 'drizzle-orm'
import { Elysia } from 'elysia'
import * as z from 'zod'
import { db } from '../db'
import { users } from '../db/schema'
import { rateLimit } from '../lib/rateLimit'
import { auth, endSession, startSession } from '../lib/session'

const credentials = z.object({
  login: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(256),
})

// сверяем и с несуществующим логином, чтобы по времени ответа нельзя было перебрать логины
const dummyHash = await Bun.password.hash('timing-equalizer')

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(auth)
  .post(
    '/login',
    async ({ body: { login, password }, cookie, status }) => {
      const user = db.select().from(users).where(eq(users.login, login)).get()
      const ok = await Bun.password.verify(password, user?.passwordHash ?? dummyHash)
      if (!user || !ok)
        return status(401, { ok: false as const, error: 'Неверный логин или пароль' })

      startSession(cookie.saywed_session as Cookie<string | undefined>, user.id)
      return { ok: true as const, user: { id: user.id, login: user.login, name: user.name } }
    },
    { body: credentials, beforeHandle: rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 10 }) },
  )
  .post('/logout', ({ cookie }) => {
    endSession(cookie.saywed_session as Cookie<string | undefined>)
    return { ok: true as const }
  })
  .get('/me', ({ user }) => ({ ok: true as const, user }), { auth: true })
