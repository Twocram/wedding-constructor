import process from 'node:process'
import { defineConfig } from 'astro/config'

// домен нужен для абсолютного og:image (мессенджеры игнорируют относительные).
// PUBLIC_SITE_URL — свой домен; иначе Vercel сам отдаёт боевой адрес проекта при сборке.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? vercelUrl ?? 'https://saywed.ru',
  // аудит тулбара перекачивает каждую <img> на любую мутацию DOM — countdown тикает раз в секунду
  devToolbar: { enabled: false },
  // локально форма заявки ходит в apps/api (npm run dev:api)
  vite: { server: { proxy: { '/api': 'http://127.0.0.1:3000' } } },
})
