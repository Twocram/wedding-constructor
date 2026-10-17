import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { env } from './env';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { publicRoutes } from './routes/public';

export const app = new Hono()
  .basePath('/api')
  .use(csrf({ origin: env.allowedOrigins }))
  .get('/health', (c) => c.json({ ok: true as const }))
  .route('/public', publicRoutes)
  .route('/auth', authRoutes)
  .route('/admin', adminRoutes);

app.notFound((c) => c.json({ ok: false, error: 'not_found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(`[api] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ ok: false, error: 'internal_error' }, 500);
});

// типы маршрутов для RPC-клиента админки: hc<AppType>
export type AppType = typeof app;
