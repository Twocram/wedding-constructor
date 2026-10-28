import { Elysia } from 'elysia'
import { errorHandler, originGuard } from './lib/http'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { invitationRoutes } from './routes/invitations'
import { publicRoutes } from './routes/public'
import { statsRoutes } from './routes/stats'

export const app = new Elysia({ prefix: '/api' })
  .use(errorHandler)
  .use(originGuard)
  .get('/health', () => ({ ok: true as const }))
  .use(publicRoutes)
  .use(authRoutes)
  .use(adminRoutes)
  .use(invitationRoutes)
  .use(statsRoutes)

// типы маршрутов для Eden Treaty в админке: treaty<App>()
export type App = typeof app
