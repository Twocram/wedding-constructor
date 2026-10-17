import * as z from 'zod'
import { themes } from './catalog'

// стандартные ошибки валидации — по-русски: их видят и клиенты на сайте, и мы в админке
z.config(z.locales.ru())

export const contactMethods = ['telegram', 'whatsapp', 'phone'] as const
export const products = ['template', 'custom', 'unsure'] as const
export const eventTypes = ['wedding', 'birthday', 'anniversary', 'corporate', 'other'] as const
export const leadSources = ['hero', 'catalog-card', 'demo-popup', 'named-block', 'custom-block', 'prices', 'final-cta', 'other'] as const
export const leadStatuses = ['new', 'contacted', 'in_progress', 'done', 'lost'] as const

export type ContactMethod = (typeof contactMethods)[number]
export type Product = (typeof products)[number]
export type EventType = (typeof eventTypes)[number]
export type LeadSource = (typeof leadSources)[number]
export type LeadStatus = (typeof leadStatuses)[number]

export const contactMethodLabels: Record<ContactMethod, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  phone: 'Телефон',
}

export const productLabels: Record<Product, string> = {
  template: 'Шаблон',
  custom: 'Индивидуальный дизайн',
  unsure: 'Пока не решили',
}

export const eventTypeLabels: Record<EventType, string> = {
  wedding: 'Свадьба',
  birthday: 'День рождения',
  anniversary: 'Юбилей',
  corporate: 'Корпоратив',
  other: 'Другое',
}

export const leadSourceLabels: Record<LeadSource, string> = {
  'hero': 'Первый экран',
  'catalog-card': 'Карточка темы',
  'demo-popup': 'Поп-ап в демо',
  'named-block': 'Блок именных ссылок',
  'custom-block': 'Блок индивидуального дизайна',
  'prices': 'Цены',
  'final-cta': 'Финальный блок',
  'other': 'Другое',
}

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: 'Новая',
  contacted: 'Связались',
  in_progress: 'В работе',
  done: 'Завершена',
  lost: 'Отказ',
}

const phoneDigits = (s: string) => s.replace(/\D/g, '')
const telegramHandle = /^@?[a-z]\w{3,31}$/i
const optionalText = (max: number) => z.string().trim().max(max).optional()
// служебные поля (UTM, адреса) обрезаем, а не отклоняем: длинная рекламная метка не должна ломать заявку
const trackingText = (max: number) => z.string().trim().transform(s => s.slice(0, max)).optional()

// российские номера к виду +7XXXXXXXXXX: «8 999…» и «999…» иначе дают ссылки на чужую страну
export function normalizePhone(s: string) {
  const d = phoneDigits(s)
  if (d.length === 11 && d.startsWith('8'))
    return `+7${d.slice(1)}`
  if (d.length === 10)
    return `+7${d}`
  return `+${d}`
}

export const themeSlugSchema = z.string().refine(s => Object.hasOwn(themes, s), 'Нет такой темы')

// null — контакт подходит к способу связи; иначе текст ошибки (общая проверка для сайта и админки)
export function validateContact(method: ContactMethod, contact: string) {
  const digits = phoneDigits(contact).length
  const phoneOk = digits >= 10 && digits <= 15
  if (method === 'telegram')
    return telegramHandle.test(contact) || phoneOk ? null : 'Укажите @ник или номер телефона'
  return phoneOk ? null : 'Укажите номер телефона'
}
export function normalizeContact(method: ContactMethod, contact: string) {
  return method === 'telegram' && telegramHandle.test(contact) ? `@${contact.replace(/^@/, '')}` : normalizePhone(contact)
}

// заявка с сайта; honeypot и время заполнения проверяет API, в базу они не попадают
export const leadInput = z
  .object({
    name: z.string().trim().min(2, 'Как к вам обращаться?').max(80),
    contactMethod: z.enum(contactMethods),
    contact: z.string().trim().min(3, 'Укажите контакт').max(80),
    product: z.enum(products).default('unsure'),
    eventType: z.enum(eventTypes).default('wedding'),
    eventDate: z.iso.date().optional(),
    themeSlug: themeSlugSchema.optional(),
    namedLinks: z.number().int().min(0).max(1000).optional(),
    message: optionalText(2000),
    source: z.enum(leadSources).default('other'),
    sourcePath: trackingText(300),
    referrer: trackingText(500),
    utmSource: trackingText(100),
    utmMedium: trackingText(100),
    utmCampaign: trackingText(100),
    consent: z.literal(true, 'Нужно согласие на обработку данных'),
    website: z.string().max(200).optional(),
    elapsedMs: z.number().int().min(0).optional(),
  })
  .superRefine((lead, ctx) => {
    const error = validateContact(lead.contactMethod, lead.contact)
    if (error)
      ctx.addIssue({ code: 'custom', path: ['contact'], message: error })
  })
  .transform(lead => ({ ...lead, contact: normalizeContact(lead.contactMethod, lead.contact) }))

export type LeadInput = z.input<typeof leadInput>
// разбивка суммы сделки: подставляется из цен, в админке правится вручную
export interface AmountBreakdown { base: number, namedLinks: number, extras: number, discount: number }
export type Lead = z.output<typeof leadInput>

// ссылка «написать» для карточки заявки и уведомления в Telegram
export function contactUrl(method: ContactMethod, contact: string) {
  if (method === 'telegram' && telegramHandle.test(contact))
    return `https://t.me/${contact.replace(/^@/, '')}`
  const phone = normalizePhone(contact)
  if (method === 'telegram')
    return `https://t.me/${phone}`
  if (method === 'whatsapp')
    return `https://wa.me/${phone.slice(1)}`
  return `tel:${phone}`
}
