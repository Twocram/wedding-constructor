import { createHash } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { env } from '../env';

// API слушает только 127.0.0.1, поэтому X-Real-IP выставляет наш nginx, а не клиент
export const clientIp = (c: Context) => c.req.header('x-real-ip') ?? getConnInfo(c).remote.address ?? 'unknown';

export const ipHash = (c: Context) => createHash('sha256').update(env.ipSalt + clientIp(c)).digest('hex').slice(0, 32);

// процесс один, поэтому счётчики в памяти; nginx limit_req — первый рубеж
export const rateLimit = ({ name, windowMs, max }: { name: string; windowMs: number; max: number }) => {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, times] of hits) if (times.every((t) => now - t > windowMs)) hits.delete(key);
  }, windowMs).unref();

  return createMiddleware(async (c, next) => {
    const key = `${name}:${clientIp(c)}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      c.header('Retry-After', String(Math.ceil((windowMs - (now - recent[0])) / 1000)));
      return c.json({ ok: false, error: 'too_many_requests' }, 429);
    }
    recent.push(now);
    hits.set(key, recent);
    await next();
  });
};
