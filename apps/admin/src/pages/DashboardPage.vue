<script setup lang="ts">
import type { LeadStatus, StatsPeriod } from '@saywed/shared'
import type { BarRow } from '@/components/dashboard/BarTable.vue'
import { leadSourceLabels, leadStatuses, leadStatusLabels, rub, statsPeriodLabels, statsPeriods, themes } from '@saywed/shared'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BarTable from '@/components/dashboard/BarTable.vue'
import KpiTile from '@/components/dashboard/KpiTile.vue'
import RevenueChart from '@/components/dashboard/RevenueChart.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useStats } from '@/composables/useStats'
import { formatPercent } from '@/lib/format'

const route = useRoute()
const router = useRouter()

const period = computed<StatsPeriod>(() =>
  (statsPeriods as readonly string[]).includes(route.query.period as string) ? (route.query.period as StatsPeriod) : 'month',
)
const setPeriod = (p: StatsPeriod) => void router.replace({ query: p === 'month' ? {} : { period: p } })

const { data, isPending, isError, isFetching, refetch } = useStats(period)

const kpi = computed(() => data.value?.kpi)
const prev = computed(() => data.value?.previous ?? null)
const compareHint = computed(() => (prev.value ? 'к прошлому периоду' : undefined))

function days(n: number) {
  const rounded = n < 1 ? Math.round(n * 24) : Math.round(n)
  if (n < 1)
    return `${Math.max(1, rounded)} ч`
  return `${rounded} дн.`
}

const conversion = (orders: number, leads: number) => (leads ? formatPercent(orders / leads) : '—')

const sourceRows = computed<BarRow[]>(() =>
  (data.value?.sources ?? []).map(s => ({
    key: s.source,
    label: leadSourceLabels[s.source],
    value: s.leads,
    cells: [String(s.orders), conversion(s.orders, s.leads), s.revenue ? rub(s.revenue) : '—'],
  })),
)

const themeRows = computed<BarRow[]>(() =>
  (data.value?.themes ?? []).slice(0, 8).map(t => ({
    key: t.theme,
    label: themes[t.theme]?.name ?? t.theme,
    value: t.leads,
    cells: [String(t.orders), t.revenue ? rub(t.revenue) : '—'],
  })),
)

const statusRows = computed<BarRow[]>(() =>
  leadStatuses
    .map((s: LeadStatus) => ({ key: s, label: leadStatusLabels[s], value: data.value?.statuses[s] ?? 0 }))
    .filter(r => r.value > 0),
)

const lostRows = computed<BarRow[]>(() =>
  (data.value?.lostReasons ?? []).map(r => ({ key: r.reason || '—', label: r.reason || 'Не указана', value: r.n })),
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Дашборд
        </h1>
        <p class="text-sm text-muted-foreground">
          Выручка — по завершённым заказам, по дате завершения
        </p>
      </div>
      <!-- фильтр периода — один ряд над всеми графиками -->
      <div class="-mx-4 max-w-[100vw] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div class="inline-flex gap-1 rounded-lg bg-muted p-1" :class="{ 'opacity-70': isFetching && !isPending }">
          <button
            v-for="p in statsPeriods"
            :key="p"
            type="button"
            class="h-8 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm"
            :data-active="period === p"
            @click="setPeriod(p)"
          >
            {{ statsPeriodLabels[p] }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="isPending" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Skeleton v-for="i in 8" :key="i" class="h-28 rounded-xl" />
    </div>

    <div v-else-if="isError || !data || !kpi" class="rounded-xl border bg-background p-10 text-center">
      <p class="mb-3 text-sm text-muted-foreground">
        Не удалось загрузить статистику
      </p>
      <Button variant="outline" size="sm" @click="refetch()">
        Повторить
      </Button>
    </div>

    <template v-else>
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Выручка" :value="rub(kpi.revenue)" :current="kpi.revenue" :previous="prev?.revenue" :hint="prev?.revenue != null ? compareHint : undefined" />
        <KpiTile label="Заказов завершено" :value="String(kpi.orders)" :current="kpi.orders" :previous="prev?.orders" :hint="prev?.orders != null ? compareHint : undefined" />
        <KpiTile label="Средний чек" :value="kpi.avgCheck == null ? '—' : rub(kpi.avgCheck)" :current="kpi.avgCheck" :previous="prev?.avgCheck" :hint="prev?.avgCheck != null ? compareHint : undefined" />
        <KpiTile label="Новые заявки" :value="String(kpi.leads)" :current="kpi.leads" :previous="prev?.leads" :hint="prev?.leads != null ? compareHint : undefined" />
        <KpiTile label="Конверсия в заказ" :value="kpi.conversion == null ? '—' : formatPercent(kpi.conversion)" hint="из заявок этого периода" />
        <KpiTile label="До закрытия" :value="kpi.avgCloseDays == null ? '—' : days(kpi.avgCloseDays)" hint="в среднем от заявки до заказа" />
        <KpiTile label="В работе сейчас" :value="String(kpi.pipelineCount)" :hint="kpi.pipelineAmount ? `на ${rub(kpi.pipelineAmount)}` : 'связались или делаем'" />
        <KpiTile label="Отказы" :value="String(data.statuses.lost ?? 0)" :hint="kpi.leads ? `${formatPercent((data.statuses.lost ?? 0) / kpi.leads)} заявок периода` : undefined" />
      </section>

      <section class="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
        <h2 class="mb-3 text-sm font-medium">
          Выручка по месяцам · 12 мес.
        </h2>
        <RevenueChart :months="data.months" />
      </section>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section class="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
          <h2 class="text-sm font-medium">
            Откуда приходят заявки
          </h2>
          <p class="mb-3 text-xs text-muted-foreground">
            Заявки периода и сколько из них уже стали заказами
          </p>
          <BarTable :rows="sourceRows" value-label="Заявки" :columns="['Заказы', 'Конв.', 'Выручка']" />
        </section>

        <section class="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
          <h2 class="text-sm font-medium">
            Популярные дизайны
          </h2>
          <p class="mb-3 text-xs text-muted-foreground">
            По заявкам, где выбрана тема
          </p>
          <BarTable :rows="themeRows" value-label="Заявки" :columns="['Заказы', 'Выручка']" empty="В заявках этого периода тема не выбиралась" />
        </section>

        <section class="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
          <h2 class="mb-3 text-sm font-medium">
            Статусы заявок периода
          </h2>
          <BarTable :rows="statusRows" value-label="Заявки" />
        </section>

        <section class="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
          <h2 class="mb-3 text-sm font-medium">
            Причины отказов
          </h2>
          <BarTable :rows="lostRows" value-label="Отказы" empty="Отказов в этом периоде нет" />
        </section>
      </div>
    </template>
  </div>
</template>
