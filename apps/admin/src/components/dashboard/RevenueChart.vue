<script setup lang="ts">
import type { MonthRevenue } from '@/composables/useStats'
import { rub } from '@saywed/shared'
import { useElementSize } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import { chartChrome, niceScale, productSeries } from '@/lib/chart'
import { formatCompact, formatMonthLong, formatMonthShort } from '@/lib/format'

const props = defineProps<{ months: MonthRevenue[] }>()

const PAD = { top: 22, right: 8, bottom: 26, left: 48 }
const HEIGHT = 240
const GAP = 2
const RADIUS = 4

const root = useTemplateRef<HTMLDivElement>('root')
const { width } = useElementSize(root)
const showTable = ref(false)
const active = ref<number | null>(null)

const totals = computed(() => props.months.map(m => m.template + m.custom + m.unsure))
const scale = computed(() => niceScale(Math.max(...totals.value)))
const hasData = computed(() => totals.value.some(Boolean))

const innerW = computed(() => Math.max(0, width.value - PAD.left - PAD.right))
const innerH = HEIGHT - PAD.top - PAD.bottom
const band = computed(() => innerW.value / Math.max(1, props.months.length))
const barW = computed(() => Math.min(28, band.value * 0.56))
// на узком экране подписываем каждый второй месяц, текущий (последний) — всегда
const labelEvery = computed(() => (band.value < 36 ? 2 : 1))
const showLabel = (i: number) => (props.months.length - 1 - i) % labelEvery.value === 0
const y = (v: number) => PAD.top + innerH - (v / scale.value.max) * innerH

const ticks = computed(() => {
  const out: number[] = []
  for (let v = 0; v <= scale.value.max; v += scale.value.step) out.push(v)
  return out
})

// сегменты снизу вверх в фиксированном порядке серий; 2px просвета между сегментами,
// у верхнего — скруглённые верхние углы (конец значения), низ стоит на базовой линии
const bars = computed(() => props.months.map((m, i) => {
  const x = PAD.left + band.value * i + (band.value - barW.value) / 2
  let acc = 0
  const parts = productSeries
    .map(s => ({ ...s, value: m[s.key] }))
    .filter(s => s.value > 0)
  const segments = parts.map((s, idx) => {
    const top = y(acc + s.value)
    const bottom = y(acc) - (idx > 0 ? GAP : 0)
    acc += s.value
    return { key: s.key, color: s.color, top, height: Math.max(0, bottom - top), last: idx === parts.length - 1 }
  })
  return { x, month: m, total: totals.value[i], segments }
}))

function segmentPath(x: number, w: number, top: number, h: number, rounded: boolean) {
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0
  return `M${x},${top + h}V${top + r}${r ? `Q${x},${top} ${x + r},${top}` : ''}H${x + w - r}${r ? `Q${x + w},${top} ${x + w},${top + r}` : ''}V${top + h}Z`
}

const tooltip = computed(() => {
  if (active.value == null)
    return null
  const bar = bars.value[active.value]
  const left = Math.min(Math.max(bar.x + barW.value / 2, 116), width.value - 116)
  return { bar, left }
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li v-for="s in productSeries" :key="s.key" class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-[3px]" :style="{ background: s.color }" />
          {{ s.label }}
        </li>
      </ul>
      <button type="button" class="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" @click="showTable = !showTable">
        {{ showTable ? 'Графиком' : 'Таблицей' }}
      </button>
    </div>

    <table v-if="showTable" class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-muted-foreground">
          <th class="pb-2 font-normal">
            Месяц
          </th>
          <th v-for="s in productSeries" :key="s.key" class="pb-2 pl-3 text-right font-normal">
            {{ s.label }}
          </th>
          <th class="pb-2 pl-3 text-right font-normal">
            Всего
          </th>
          <th class="pb-2 pl-3 text-right font-normal">
            Заказов
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, i) in months" :key="m.month" class="border-t">
          <td class="py-1.5 capitalize">
            {{ formatMonthLong(m.month) }}
          </td>
          <td v-for="s in productSeries" :key="s.key" class="py-1.5 pl-3 text-right tabular-nums">
            {{ m[s.key] ? rub(m[s.key]) : '—' }}
          </td>
          <td class="py-1.5 pl-3 text-right font-medium tabular-nums">
            {{ totals[i] ? rub(totals[i]) : '—' }}
          </td>
          <td class="py-1.5 pl-3 text-right tabular-nums">
            {{ m.orders || '—' }}
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else ref="root" class="relative" @mouseleave="active = null">
      <svg v-if="width" :width="width" :height="HEIGHT" role="img" :aria-label="`Выручка по месяцам: ${months.map((m, i) => `${formatMonthLong(m.month)} ${rub(totals[i])}`).join(', ')}`">
        <!-- сетка и подписи оси: тонкие и приглушённые -->
        <g v-for="t in ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" :stroke="t === 0 ? chartChrome.baseline : chartChrome.grid" stroke-width="1" />
          <text :x="PAD.left - 8" :y="y(t)" text-anchor="end" dominant-baseline="middle" font-size="11" :fill="chartChrome.muted">{{ t === 0 ? '0' : formatCompact(t) }}</text>
        </g>

        <g v-for="(bar, i) in bars" :key="bar.month.month">
          <rect v-if="active === i" :x="PAD.left + band * i + 2" :y="PAD.top" :width="band - 4" :height="innerH" rx="6" fill="currentColor" class="text-muted" />
          <path
            v-for="seg in bar.segments"
            :key="seg.key"
            :d="segmentPath(bar.x, barW, seg.top, seg.height, seg.last)"
            :fill="seg.color"
          />
          <text v-if="showLabel(i)" :x="bar.x + barW / 2" :y="HEIGHT - 8" text-anchor="middle" font-size="11" :fill="chartChrome.muted">{{ formatMonthShort(bar.month.month) }}</text>
          <!-- прямая подпись только у текущего месяца — остальное в подсказке -->
          <text v-if="i === bars.length - 1 && bar.total" :x="bar.x + barW / 2" :y="y(bar.total) - 6" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">{{ formatCompact(bar.total) }}</text>
          <!-- зона наведения шире столбика -->
          <rect
            :x="PAD.left + band * i"
            :y="PAD.top"
            :width="band"
            :height="innerH + PAD.bottom"
            fill="transparent"
            tabindex="0"
            class="cursor-default outline-none"
            :aria-label="`${formatMonthLong(bar.month.month)}: ${rub(bar.total)}`"
            @mouseenter="active = i"
            @focus="active = i"
            @blur="active = null"
          />
        </g>
      </svg>

      <p v-if="width && !hasData" class="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-muted-foreground">
        Пока нет завершённых заказов
      </p>

      <div
        v-if="tooltip"
        class="pointer-events-none absolute top-0 z-10 w-56 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
        :style="{ left: `${tooltip.left}px` }"
      >
        <div class="mb-1 font-medium capitalize">
          {{ formatMonthLong(tooltip.bar.month.month) }}
        </div>
        <div v-for="s in productSeries" :key="s.key" class="flex items-center justify-between gap-3">
          <span class="flex items-center gap-1.5 text-muted-foreground"><span class="size-2 rounded-[2px]" :style="{ background: s.color }" />{{ s.label }}</span>
          <span class="whitespace-nowrap tabular-nums">{{ rub(tooltip.bar.month[s.key]) }}</span>
        </div>
        <div class="mt-1 flex justify-between border-t pt-1 font-medium">
          <span>Всего · {{ tooltip.bar.month.orders }} зак.</span>
          <span class="whitespace-nowrap tabular-nums">{{ rub(tooltip.bar.total) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
