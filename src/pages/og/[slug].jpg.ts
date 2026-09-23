import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';

// карточка-превью ссылки 1200×630: первое, что гость видит в Telegram/WhatsApp до открытия приглашения
const W = 1200;
const H = 630;
const PHOTO_W = 470;

type Theme = CollectionEntry<'invitations'>['data']['theme'];
type Look = { bg: string; text: string; muted: string; accent: string; font: string; italic?: boolean; upper?: boolean };

// цвета — те же токены, что в Base.astro; у Marcellus нет кириллицы, для deco берём Prata
const looks: Record<Theme, Look> = {
  cover: { bg: '#f6f2ea', text: '#2a2823', muted: '#6f6a5f', accent: '#78865a', font: 'Playfair Display', italic: true },
  editorial: { bg: '#f4efe6', text: '#1f1c18', muted: '#6e675c', accent: '#7a6a57', font: 'Cormorant Garamond', italic: true },
  amalfi: { bg: '#0c1520', text: '#ece5d8', muted: '#7f8a96', accent: '#d2a552', font: 'Prata' },
  deco: { bg: '#141311', text: '#efe9da', muted: '#878072', accent: '#c9a227', font: 'Prata', upper: true },
  ticket: { bg: '#f3efe6', text: '#25303c', muted: '#77808c', accent: '#c2452d', font: 'Playfair Display', italic: true },
  cinema: { bg: '#0b0a09', text: '#f2ece1', muted: '#91887b', accent: '#e0b36a', font: 'Oswald', upper: true },
};

const fontDir = (pkg: string) => join(process.cwd(), 'node_modules/@fontsource', pkg, 'files');
const load = async (pkg: string, name: string, weight: 400 | 500, style: 'normal' | 'italic') =>
  Promise.all(['latin', 'cyrillic'].map(async (subset) => ({
    // satori хранит шрифты по имени — одно имя на два сабсета затирает первый
    name: subset === 'latin' ? name : `${name} Cyr`,
    weight,
    style,
    data: await readFile(join(fontDir(pkg), `${pkg}-${subset}-${weight}-${style}.woff`)),
  })));

const fonts = (await Promise.all([
  load('jost', 'Jost', 400, 'normal'),
  load('jost', 'Jost', 500, 'normal'),
  load('playfair-display', 'Playfair Display', 400, 'italic'),
  load('cormorant-garamond', 'Cormorant Garamond', 400, 'italic'),
  load('prata', 'Prata', 400, 'normal'),
  load('oswald', 'Oswald', 400, 'normal'),
])).flat();

export const getStaticPaths = (async () => {
  const invitations = await getCollection('invitations');
  return invitations.map((inv) => ({ params: { slug: inv.id }, props: { inv: inv.data } }));
}) satisfies GetStaticPaths;

const family = (name: string) => `'${name}', '${name} Cyr'`;

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El =>
  ({ type, props: { style, children, ...extra } });

export const GET: APIRoute = async ({ props }) => {
  const { inv } = props as { inv: CollectionEntry<'invitations'>['data'] };
  const look = looks[inv.theme];
  const photo = inv.heroPhoto ?? inv.gallery?.[0];

  const photoEl = photo
    ? h('img', { width: PHOTO_W, height: H, objectFit: 'cover' }, undefined, {
        src: `data:image/jpeg;base64,${(await sharp(join(process.cwd(), 'public', photo))
          .resize(PHOTO_W, H, { fit: 'cover' })
          .jpeg({ quality: 82 })
          .toBuffer()).toString('base64')}`,
        width: PHOTO_W,
        height: H,
      })
    : null;

  const nameStyle = {
    fontFamily: family(look.font),
    fontStyle: look.italic ? 'italic' : 'normal',
    fontSize: look.upper ? 76 : 92,
    lineHeight: 1.05,
    letterSpacing: look.upper ? 4 : 0,
    textTransform: look.upper ? 'uppercase' : 'none',
    color: look.text,
  };
  const small = { fontFamily: family('Jost'), fontWeight: 500, fontSize: 22, letterSpacing: 5, textTransform: 'uppercase' };

  const text = h('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    flex: 1,
    padding: '0 72px',
    margin: 28,
    border: `1px solid ${look.accent}55`,
  }, [
    h('div', { ...small, color: look.accent, marginBottom: 34 }, 'Приглашение на свадьбу'),
    h('div', nameStyle, inv.groom),
    h('div', { ...nameStyle, color: look.accent, fontSize: nameStyle.fontSize * 0.7, margin: '6px 0' }, '&'),
    h('div', nameStyle, inv.bride),
    h('div', { width: 64, height: 1, background: look.accent, margin: '38px 0 26px' }),
    h('div', { fontFamily: family('Jost'), fontSize: 30, color: look.text }, inv.date),
    inv.city ? h('div', { ...small, fontWeight: 400, fontSize: 18, color: look.muted, marginTop: 10 }, inv.city) : null,
  ].filter(Boolean));

  const svg = await satori(
    h('div', { display: 'flex', width: W, height: H, background: look.bg }, [photoEl, text].filter(Boolean)) as never,
    { width: W, height: H, fonts },
  );
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg' } });
};
