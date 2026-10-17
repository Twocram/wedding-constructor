import { env } from '../env'

type Server = { requestIP: (request: Request) => { address: string } | null } | null

// API слушает только 127.0.0.1, поэтому X-Real-IP выставляет наш nginx, а не клиент
export function clientIp(request: Request, server: Server) {
  return request.headers.get('x-real-ip') ?? server?.requestIP(request)?.address ?? 'unknown'
}

export function ipHash(request: Request, server: Server) {
  return new Bun.CryptoHasher('sha256').update(env.ipSalt + clientIp(request, server)).digest('hex').slice(0, 32)
}

// процесс один, поэтому счётчики в памяти; nginx limit_req — первый рубеж
export function rateLimit({ name, windowMs, max }: { name: string, windowMs: number, max: number }) {
  const hits = new Map<string, number[]>()
  setInterval(() => {
    const now = Date.now()
    for (const [key, times] of hits) {
      if (times.every(t => now - t > windowMs))
        hits.delete(key)
    }
  }, windowMs).unref()

  return ({ request, server, set }: { request: Request, server: Server, set: { status?: number | string, headers: Record<string, string | number> } }) => {
    const key = `${name}:${clientIp(request, server)}`
    const now = Date.now()
    const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs)
    if (recent.length >= max) {
      set.status = 429
      set.headers['retry-after'] = String(Math.ceil((windowMs - (now - recent[0])) / 1000))
      return { ok: false as const, error: 'too_many_requests' }
    }
    recent.push(now)
    hits.set(key, recent)
  }
}
