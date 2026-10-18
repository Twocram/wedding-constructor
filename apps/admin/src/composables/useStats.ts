import type { StatsPeriod } from '@saywed/shared'
import type { MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { api, unwrap } from '@/lib/api'

function fetchStats(period: StatsPeriod) {
  return unwrap(api.admin.stats.get({ query: { period } }))
}

export type Stats = Awaited<ReturnType<typeof fetchStats>>
export type MonthRevenue = Stats['months'][number]

export function useStats(period: MaybeRefOrGetter<StatsPeriod>) {
  return useQuery({
    queryKey: computed(() => ['stats', toValue(period)] as const),
    queryFn: () => fetchStats(toValue(period)),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
  })
}
