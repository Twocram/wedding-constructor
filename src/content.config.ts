import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// ponytail: все поля кроме names/date опциональны — шаблон рендерит только заполненные секции
const invitations = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/invitations' }),
  schema: z.object({
    theme: z.enum(['cover', 'editorial', 'amalfi', 'deco']).default('cover'),
    groom: z.string(),
    bride: z.string(),
    date: z.string(), // "3 октября 2026"
    city: z.string().optional(), // город для первого экрана
    heroPhoto: z.string().optional(),
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
    })).optional(),
    dressCode: z.object({
      text: z.string(),
      colors: z.array(z.string()).optional(), // hex-палитра
    }).optional(),
    wishes: z.array(z.string()).optional(),
    transfer: z.string().optional(),
    telegramChat: z.object({
      url: z.string(),
      text: z.string(),
    }).optional(),
    rsvp: z.object({
      deadline: z.string(),
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
