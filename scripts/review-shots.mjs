// Полные скриншоты тем для ревью дизайна: tmp/shots/<slug>-<n>.webp (мобайл) + -desk.webp
import { spawn } from 'node:child_process';
import { readdir, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 4331;
const base = `http://localhost:${PORT}`;
const slugs = (await readdir('src/content/invitations')).filter((f) => f.endsWith('.yaml')).map((f) => f.replace('.yaml', ''));

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
try {
  for (let i = 0; i < 40; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await mkdir('tmp/shots', { recursive: true });
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));

  const shot = async (page, name, w = 480) => {
    const buf = await page.screenshot();
    await sharp(buf).resize(w).webp({ quality: 72 }).toFile(`tmp/shots/${name}.webp`);
  };

  for (const slug of slugs) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(`${base}/${slug}`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '.back-home{display:none!important}' });
    // раскрыть конверт, если есть
    await page.evaluate(() => document.querySelector('.envelope')?.click());
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // триггер all IO-анимаций
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    const h = await page.evaluate(() => document.body.scrollHeight);
    const screens = Math.min(Math.ceil(h / 844), 6);
    for (let i = 0; i < screens; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 844);
      await page.waitForTimeout(500);
      await shot(page, `${slug}-${i}`);
    }
    // десктоп: первый и средний экран
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(700);
    await shot(page, `${slug}-desk`, 800);
    await page.close();
    console.log('✓', slug, screens, 'screens, h=', h);
  }
  await browser.close();
} finally {
  server.kill();
}
