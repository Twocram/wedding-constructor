import * as z from 'zod';
import { prices } from './catalog';
import {
  contactMethods,
  eventTypes,
  leadSources,
  leadStatuses,
  products,
  themeSlugSchema,
  type AmountBreakdown,
  type Product,
} from './lead';

export const leadListQuery = z.object({
  status: z.enum([...leadStatuses, 'all']).default('all'),
  q: z.string().trim().max(100).optional(),
  source: z.enum(leadSources).optional(),
  product: z.enum(products).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type LeadListQuery = z.input<typeof leadListQuery>;

const money = z.number().int('Целое число рублей').min(0, 'Не меньше нуля').max(10_000_000, 'Слишком большая сумма');

export const amountBreakdownSchema = z.object({
  base: money,
  namedLinks: money,
  extras: money,
  discount: money,
});

// пустая строка и null — одно и то же «пусто»; храним всегда null
const nullableText = (max: number) =>
  z.string().trim().max(max).transform((s) => s || null).nullable().optional();

// правка заявки из админки: любое подмножество полей
export const leadPatch = z
  .object({
    status: z.enum(leadStatuses).optional(),
    amount: money.nullable().optional(),
    amountBreakdown: amountBreakdownSchema.nullable().optional(),
    lostReason: nullableText(500),
    invitationSlug: nullableText(80),
    name: z.string().trim().min(2, 'Минимум 2 символа').max(80, 'Не длиннее 80 символов').optional(),
    contactMethod: z.enum(contactMethods).optional(),
    contact: z.string().trim().min(3, 'Укажите контакт').max(80, 'Не длиннее 80 символов').optional(),
    product: z.enum(products).optional(),
    eventType: z.enum(eventTypes).optional(),
    eventDate: z.iso.date('Неверная дата').nullable().optional(),
    themeSlug: themeSlugSchema.nullable().optional(),
    namedLinks: z.number().int('Целое число').min(0, 'Не меньше нуля').max(1000, 'Не больше 1000').nullable().optional(),
    message: nullableText(2000),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Нет изменений');
export type LeadPatch = z.input<typeof leadPatch>;

export const leadFieldLabels: Record<keyof z.input<typeof leadPatch>, string> = {
  status: 'Статус',
  amount: 'Сумма',
  amountBreakdown: 'Разбивка суммы',
  lostReason: 'Причина отказа',
  invitationSlug: 'Приглашение',
  name: 'Имя',
  contactMethod: 'Способ связи',
  contact: 'Контакт',
  product: 'Продукт',
  eventType: 'Событие',
  eventDate: 'Дата события',
  themeSlug: 'Дизайн',
  namedLinks: 'Именные ссылки',
  message: 'Комментарий клиента',
};

export const commentInput = z.object({ text: z.string().trim().min(1, 'Пустой комментарий').max(2000) });

// подсказка суммы по прайсу: в карточке заявки её можно поправить вручную
export const estimateAmount = (product: Product, namedLinks: number | null | undefined): AmountBreakdown | null => {
  const base = product === 'custom' ? prices.custom : product === 'template' ? prices.template : 0;
  if (!base) return null;
  return { base, namedLinks: (namedLinks ?? 0) * prices.named, extras: 0, discount: 0 };
};

export const breakdownTotal = (b: AmountBreakdown) => Math.max(0, b.base + b.namedLinks + b.extras - b.discount);
