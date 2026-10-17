import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { contactMethods, eventTypes, leadSources, leadStatuses, products, type AmountBreakdown } from '@saywed/shared';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () => timestamp('created_at').notNull().$defaultFn(() => new Date());

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  login: text('login').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    // sha256 от токена из cookie: утёкшая база не даёт войти
    id: text('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
    name: text('name').notNull(),
    contactMethod: text('contact_method', { enum: contactMethods }).notNull(),
    contact: text('contact').notNull(),
    product: text('product', { enum: products }).notNull().default('unsure'),
    eventType: text('event_type', { enum: eventTypes }).notNull().default('wedding'),
    eventDate: text('event_date'),
    themeSlug: text('theme_slug'),
    namedLinks: integer('named_links'),
    message: text('message'),
    source: text('source', { enum: leadSources }).notNull().default('other'),
    sourcePath: text('source_path'),
    referrer: text('referrer'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    status: text('status', { enum: leadStatuses }).notNull().default('new'),
    amount: integer('amount'),
    amountBreakdown: text('amount_breakdown', { mode: 'json' }).$type<AmountBreakdown>(),
    completedAt: timestamp('completed_at'),
    lostReason: text('lost_reason'),
    invitationSlug: text('invitation_slug'),
    consentAt: timestamp('consent_at').notNull(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    // имя, контакт и комментарий в нижнем регистре: lower() в SQLite не знает кириллицу, поэтому считаем в приложении
    search: text('search').notNull().default(''),
  },
  (t) => [
    index('leads_status_idx').on(t.status),
    index('leads_created_idx').on(t.createdAt),
    index('leads_completed_idx').on(t.completedAt),
  ],
);

export const leadEventTypes = ['created', 'status', 'comment', 'edit'] as const;

export const leadEvents = sqliteTable(
  'lead_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    leadId: integer('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    type: text('type', { enum: leadEventTypes }).notNull(),
    fromStatus: text('from_status', { enum: leadStatuses }),
    toStatus: text('to_status', { enum: leadStatuses }),
    text: text('text'),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('lead_events_lead_idx').on(t.leadId)],
);

export type LeadRow = typeof leads.$inferSelect;
export type UserRow = typeof users.$inferSelect;
