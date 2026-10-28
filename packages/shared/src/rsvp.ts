import * as z from 'zod'
import { attendingValues } from './rsvpReport'

const reservedSlugs = new Set(['answers', 'privacy', 'api', 'og', 'ics', 'admin', 'previews', 'photos', 'music'])

// адрес приглашения на сайте: saywed.ru/<slug>
export const invitationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,79}$/, 'Латиница, цифры и дефис, от 2 символов')
  // эти адреса заняты страницами сайта и API
  .refine(s => !reservedSlugs.has(s), 'Этот адрес занят служебной страницей')

// ответ гостя из анкеты в приглашении
export const rsvpInput = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2, 'Минимум 2 символа').max(80, 'Не длиннее 80 символов'),
  attending: z.enum(attendingValues, 'Выберите ответ'),
  drinks: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  plusOne: z.boolean().default(false),
  notes: z.string().trim().max(1000, 'Не длиннее 1000 символов').optional(),
  // имя из именной ссылки ?g=: видно, по чьей ссылке ответили, даже если гость написал имя иначе
  guest: z.string().trim().transform(s => s.slice(0, 80)).optional(),
  // ловушка для ботов: поле скрыто от людей; имя без смысла, чтобы его не заполнял автозаполнитель браузера
  hp: z.string().optional(),
})
export type RsvpInput = z.input<typeof rsvpInput>

export const invitationInput = z.object({
  slug: invitationSlugSchema,
  title: z.string().trim().min(2, 'Минимум 2 символа').max(120, 'Не длиннее 120 символов'),
  leadId: z.number().int().positive().nullable().optional(),
})
export type InvitationInput = z.input<typeof invitationInput>

export const invitationPatch = invitationInput.partial()
export type InvitationPatch = z.input<typeof invitationPatch>
