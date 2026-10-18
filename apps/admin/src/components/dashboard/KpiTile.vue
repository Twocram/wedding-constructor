<script setup lang="ts">
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from '@lucide/vue'
import { computed } from 'vue'
import { formatPercent } from '@/lib/format'

const props = defineProps<{
  label: string
  value: string
  hint?: string
  // для дельты: текущее и прошлое значение; без прошлого — дельту не показываем
  current?: number | null
  previous?: number | null
}>()

const delta = computed(() => {
  if (props.current == null || props.previous == null)
    return null
  if (props.previous === 0)
    return props.current === 0 ? { dir: 'flat' as const, text: 'без изменений' } : { dir: 'up' as const, text: 'было 0' }
  const change = (props.current - props.previous) / props.previous
  if (Math.abs(change) < 0.005)
    return { dir: 'flat' as const, text: 'без изменений' }
  return { dir: change > 0 ? 'up' as const : 'down' as const, text: `${change > 0 ? '+' : '−'}${formatPercent(Math.abs(change))}` }
})
</script>

<template>
  <div class="flex flex-col gap-1 rounded-xl border bg-background p-4">
    <span class="text-sm text-muted-foreground">{{ label }}</span>
    <span class="text-2xl font-semibold tracking-tight tabular-nums">{{ value }}</span>
    <div class="flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
      <!-- знак и стрелка, а не только цвет: дельта читается и без цветового зрения -->
      <span
        v-if="delta"
        class="inline-flex items-center gap-0.5 font-medium"
        :class="{
          'text-[#006300]': delta.dir === 'up',
          'text-destructive': delta.dir === 'down',
          'text-muted-foreground': delta.dir === 'flat',
        }"
      >
        <ArrowUpRightIcon v-if="delta.dir === 'up'" class="size-3.5" />
        <ArrowDownRightIcon v-else-if="delta.dir === 'down'" class="size-3.5" />
        <MinusIcon v-else class="size-3.5" />
        {{ delta.text }}
      </span>
      <span v-if="hint" class="text-muted-foreground">{{ hint }}</span>
    </div>
  </div>
</template>
