<script setup lang="ts">
import { computed } from 'vue'
import { singleSeriesColor } from '@/lib/chart'

export interface BarRow {
  key: string
  label: string
  value: number
  // дополнительные колонки справа: заказы, конверсия, выручка
  cells?: string[]
}

const props = defineProps<{
  rows: BarRow[]
  valueLabel: string
  columns?: string[]
  empty?: string
}>()

const max = computed(() => Math.max(1, ...props.rows.map(r => r.value)))
</script>

<template>
  <div v-if="!rows.length" class="py-8 text-center text-sm text-muted-foreground">
    {{ empty ?? 'Нет данных за период' }}
  </div>
  <!-- на телефоне колонки не влезают — таблица прокручивается внутри карточки, а не вся страница -->
  <div v-else class="-mx-1 overflow-x-auto px-1">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-muted-foreground">
          <th class="pb-2 font-normal" />
          <th class="pb-2 font-normal">
            {{ valueLabel }}
          </th>
          <th v-for="c in columns" :key="c" class="pb-2 pl-3 text-right font-normal whitespace-nowrap">
            {{ c }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key" class="border-t">
          <td class="max-w-40 min-w-24 truncate py-2 pr-3">
            {{ row.label }}
          </td>
          <td class="w-full min-w-28 py-2">
            <div class="flex items-center gap-2">
              <!-- тонкая полоска со скруглённым концом, начинается от нуля -->
              <div class="h-2 min-w-0.5 rounded-r-[4px]" :style="{ width: `${(row.value / max) * 100}%`, background: singleSeriesColor }" />
              <span class="tabular-nums">{{ row.value }}</span>
            </div>
          </td>
          <td v-for="(cell, i) in row.cells" :key="i" class="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
            {{ cell }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
