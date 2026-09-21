import { defineConfig } from 'astro/config';

// ponytail: домен нужен для абсолютного og:image (мессенджеры игнорируют относительные).
// На деплое задать PUBLIC_SITE_URL; плейсхолдер — заменить на боевой домен.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://wedding-invite.example.com',
});
