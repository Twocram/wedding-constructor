// прокси Bot API: из российского дата-центра api.telegram.org недоступен, а Cloudflare открывается
// только отправка и приём сообщений: утёкший ключ не даст перенастроить бота, но позволит читать входящие — менять сразу
const botMethod = /^\/bot\d+:[\w-]+\/(?:sendMessage|getUpdates|getMe)$/

async function sameKey(a, b) {
  const encoder = new TextEncoder()
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s))))
  return crypto.subtle.timingSafeEqual(x, y)
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (request.method !== 'POST' || !botMethod.test(pathname))
      return new Response('Not found', { status: 404 })
    // без ключа воркер стал бы открытым прокси к Telegram для чужих ботов
    if (!env.RELAY_KEY || !(await sameKey(request.headers.get('x-relay-key') ?? '', env.RELAY_KEY)))
      // не 403: API принял бы его за «пользователь заблокировал бота»
      return new Response('Unauthorized', { status: 401 })
    return fetch(`https://api.telegram.org${pathname}`, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
      body: request.body,
    })
  },
}
