// Скриншоты первого экрана каждой темы для витрины: public/previews/<slug>.webp
// Запуск: npm run build && npm run previews (поднимает astro preview сам)
import { spawn } from 'node:child_process';
import { readdir, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 4329;
const base = `http://localhost:${PORT}`;
const slugs = (await readdir('src/content/invitations')).filter((f) => f.endsWith('.yaml')).map((f) => f.replace('.yaml', ''));

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
try {
  for (let i = 0; i < 40; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await mkdir('public/previews', { recursive: true });
  // свой chromium Playwright может быть не скачан — тогда берём системный Chrome
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  for (const slug of slugs) {
    await page.goto(`${base}/${slug}`, { waitUntil: 'networkidle' });
    // «← все темы» — навигация демо, в превью ей не место
    await page.addStyleTag({ content: '.back-home{display:none!important}' });
    await page.waitForTimeout(3200); // интро-анимации hero
    const shot = await page.screenshot();
    await sharp(shot).resize(600).webp({ quality: 78 }).toFile(`public/previews/${slug}.webp`);
    console.log('✓', slug);
  }
  await browser.close();
} finally {
  server.kill();
}
