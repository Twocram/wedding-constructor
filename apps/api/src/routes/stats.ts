import { statsQuery, type LeadSource, type LeadStatus, type Product, type StatsPeriod } from '@saywed/shared';
import { and, avg, count, eq, gte, inArray, isNotNull, lte, sql, sum } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '../db';
import { leads } from '../db/schema';
import { auth } from '../lib/session';

// Москва без перехода на летнее время с 2014 года — сдвиг постоянный
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const mskParts = (d: Date) => {
  const shifted = new Date(d.getTime() + MSK_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
};
// начало месяца по Москве, со сдвигом на n месяцев
const monthStart = (d: Date, shift = 0) => {
  const { year, month } = mskParts(d);
  return new Date(Date.UTC(year, month + shift, 1) - MSK_OFFSET_MS);
};
const shiftMonths = (d: Date, n: number) => {
  const { year, month, day } = mskParts(d);
  const target = new Date(Date.UTC(year, month + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const msInDay = (d.getTime() + MSK_OFFSET_MS) % DAY_MS;
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)) + msInDay - MSK_OFFSET_MS);
};

const periodMonths: Record<Exclude<StatsPeriod, 'all'>, number> = { month: 1, quarter: 3, year: 12 };

// прошлый период — такой же отрезок назад: 1–17 число этого месяца сравниваем с 1–17 прошлого, а не с целым месяцем
const ranges = (period: StatsPeriod, now: Date) => {
  if (period === 'all') return { current: { from: new Date(0), to: now }, previous: null };
  const n = periodMonths[period];
  const from = monthStart(now, 1 - n);
  return { current: { from, to: now }, previous: { from: shiftMonths(from, -n), to: shiftMonths(now, -n) } };
};

type Range = { from: Date; to: Date };

const completedIn = (r: Range) => and(eq(leads.status, 'done'), gte(leads.completedAt, r.from), lte(leads.completedAt, r.to));
const createdIn = (r: Range) => and(gte(leads.createdAt, r.from), lte(leads.createdAt, r.to));

const totals = (r: Range) => {
  const done = db.select({ revenue: sum(leads.amount), orders: count() }).from(leads).where(completedIn(r)).get();
  const created = db.select({ n: count() }).from(leads).where(createdIn(r)).get();
  return { revenue: Number(done?.revenue ?? 0), orders: done?.orders ?? 0, leads: created?.n ?? 0 };
};

export const statsRoutes = new Elysia({ prefix: '/admin' }).use(auth).get(
  '/stats',
  ({ query: { period } }) => {
  const now = new Date();
  const { current, previous } = ranges(period, now);

  const cur = totals(current);
  const prev = previous ? totals(previous) : null;

  // конверсия — по заявкам, пришедшим в период: сколько из них уже стали заказами
  const cohortDone = db.select({ n: count() }).from(leads).where(and(createdIn(current), eq(leads.status, 'done'))).get()?.n ?? 0;
  const closeDays = db
    .select({ days: avg(sql<number>`(${leads.completedAt} - ${leads.createdAt}) / cast(${DAY_MS} as real)`) })
    .from(leads)
    .where(completedIn(current))
    .get()?.days;

  // текущая воронка не зависит от периода: что в работе прямо сейчас
  const pipeline = db
    .select({ n: count(), amount: sum(leads.amount) })
    .from(leads)
    .where(inArray(leads.status, ['contacted', 'in_progress']))
    .get();

  // 12 последних месяцев по Москве — для графика выручки
  const monthKey = sql<string>`strftime('%Y-%m', (${leads.completedAt} + ${MSK_OFFSET_MS}) / 1000, 'unixepoch')`;
  const chartFrom = monthStart(now, -11);
  const byMonth = db
    .select({ month: monthKey, product: leads.product, revenue: sum(leads.amount), orders: count() })
    .from(leads)
    .where(completedIn({ from: chartFrom, to: now }))
    .groupBy(monthKey, leads.product)
    .all();
  const months = Array.from({ length: 12 }, (_, i) => {
    const { year, month } = mskParts(monthStart(now, i - 11));
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const rows = byMonth.filter((r) => r.month === key);
    const of = (p: Product) => Number(rows.find((r) => r.product === p)?.revenue ?? 0);
    return { month: key, template: of('template'), custom: of('custom'), unsure: of('unsure'), orders: rows.reduce((s, r) => s + r.orders, 0) };
  });

  const doneRevenue = sql<number>`coalesce(sum(case when ${leads.status} = 'done' then ${leads.amount} end), 0)`;
  const doneCount = sql<number>`sum(case when ${leads.status} = 'done' then 1 else 0 end)`;

  const sources = db
    .select({ source: leads.source, leads: count(), orders: doneCount, revenue: doneRevenue })
    .from(leads)
    .where(createdIn(current))
    .groupBy(leads.source)
    .all()
    .map((r) => ({ ...r, source: r.source as LeadSource, orders: Number(r.orders), revenue: Number(r.revenue) }))
    .sort((a, b) => b.leads - a.leads);

  const themes = db
    .select({ theme: leads.themeSlug, leads: count(), orders: doneCount, revenue: doneRevenue })
    .from(leads)
    .where(and(createdIn(current), isNotNull(leads.themeSlug)))
    .groupBy(leads.themeSlug)
    .all()
    .map((r) => ({ theme: r.theme as string, leads: r.leads, orders: Number(r.orders), revenue: Number(r.revenue) }))
    .sort((a, b) => b.leads - a.leads);

  const statuses = Object.fromEntries(
    db.select({ status: leads.status, n: count() }).from(leads).where(createdIn(current)).groupBy(leads.status).all().map((r) => [r.status, r.n]),
  ) as Partial<Record<LeadStatus, number>>;

  const reasonKey = sql<string>`coalesce(nullif(trim(${leads.lostReason}), ''), '')`;
  const lostReasons = db
    .select({ reason: reasonKey, n: count() })
    .from(leads)
    .where(and(createdIn(current), eq(leads.status, 'lost')))
    .groupBy(reasonKey)
    .all()
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  return {
    ok: true as const,
    period,
    range: { from: current.from.toISOString(), to: current.to.toISOString() },
    kpi: {
      revenue: cur.revenue,
      orders: cur.orders,
      avgCheck: cur.orders ? Math.round(cur.revenue / cur.orders) : null,
      leads: cur.leads,
      conversion: cur.leads ? cohortDone / cur.leads : null,
      avgCloseDays: closeDays == null ? null : Number(closeDays),
      pipelineCount: pipeline?.n ?? 0,
      pipelineAmount: Number(pipeline?.amount ?? 0),
    },
    previous: prev && {
      revenue: prev.revenue,
      orders: prev.orders,
      avgCheck: prev.orders ? Math.round(prev.revenue / prev.orders) : null,
      leads: prev.leads,
    },
    months,
    sources,
    themes,
    statuses,
    lostReasons,
  };
  },
  { auth: true, query: statsQuery },
);
