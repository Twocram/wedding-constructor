import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// ponytail: все поля кроме names/date опциональны — шаблон рендерит только заполненные секции
const invitations = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/invitations' }),
  schema: z.object({
    theme: z.enum(['cover', 'botanical', 'editorial', 'watercolor', 'luxe', 'amalfi', 'deco', 'vogue', 'ticket', 'cinema', 'stories', 'coquette', 'toile']).default('cover'),
    groom: z.string(),
    bride: z.string(),
    date: z.string(), // "3 октября 2026"
    city: z.string().optional(), // город для первого экрана
    heroPhoto: z.string().optional(),
    heroVideo: z.string().optional(), // видео первого экрана вместо фото (muted loop)
    welcome: z.string().optional(),
    venue: z.object({
      name: z.string(),
      address: z.string(),
      mapIframe: z.string().optional(), // src iframe Яндекс.Карт
    }).optional(),
    timeline: z.array(z.object({
      time: z.string(),
      title: z.string(),
      text: z.string().optional(),
      icon: z.string().optional(), // ключ иконки из TimelineIcon: rings, glass, camera, cake, heart, car, music, dinner, dress, sunset
    })).optional(),
    dressCode: z.object({
      text: z.string(),
      colors: z.array(z.union([z.string(), z.object({ image: z.string() })])).optional(), // hex-палитра или фото ткани
      lookbook: z.array(z.string()).optional(), // образы гостей: карусель фото
    }).optional(),
    wishes: z.array(z.union([z.string(), z.object({ title: z.string(), text: z.string() })])).optional(),
    transfer: z.string().optional(),
    telegramChat: z.object({
      url: z.string(),
      text: z.string(),
    }).optional(),
    rsvp: z.object({
      deadline: z.string(),
      drinks: z.array(z.string()).optional(), // чекбоксы «что будете пить»
      plusOne: z.boolean().optional(), // чекбокс «приду с парой»
    }).optional(),
    countdown: z.string().optional(), // ISO-дата, напр. 2026-06-20T18:00:00
    gallery: z.array(z.string()).optional(),
    envelope: z.boolean().default(false), // экран-конверт «нажмите, чтобы открыть»
    envelopePhoto: z.string().optional(),
    organizer: z.object({
      name: z.string(),
      phone: z.string(),
    }).optional(),
    music: z.string().optional(), // путь к mp3
  }),
});

export const collections = { invitations };
