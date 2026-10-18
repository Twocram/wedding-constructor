import type { LeadPatch, LeadSource, LeadStatus, Product } from '@saywed/shared'
import type { MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { api, unwrap } from '@/lib/api'

export interface LeadFilters {
  status: LeadStatus | 'all'
  q?: string
  source?: LeadSource
  product?: Product
  from?: string
  to?: string
  page: number
  pageSize?: number
}

function fetchLeads(f: LeadFilters) {
  return unwrap(
    api.admin.leads.get({
      query: {
        status: f.status,
        page: f.page,
        pageSize: f.pageSize ?? 50,
        ...(f.q && { q: f.q }),
        ...(f.source && { source: f.source }),
        ...(f.product && { product: f.product }),
        ...(f.from && { from: f.from }),
        ...(f.to && { to: f.to }),
      },
    }),
  )
}

const fetchLead = (id: number) => unwrap(api.admin.leads({ id }).get())

export type LeadsPage = Awaited<ReturnType<typeof fetchLeads>>
export type LeadItem = LeadsPage['items'][number]
export type LeadDetail = Awaited<ReturnType<typeof fetchLead>>
export type LeadEvent = LeadDetail['events'][number]

export function useLeads(filters: MaybeRefOrGetter<LeadFilters>) {
  return useQuery({
    queryKey: computed(() => ['leads', toValue(filters)] as const),
    queryFn: () => fetchLeads(toValue(filters)),
    placeholderData: keepPreviousData,
    // новые заявки появляются сами, без перезагрузки страницы
    refetchInterval: 60_000,
  })
}

// бейдж «новые» в навигации
export function useNewLeadsCount() {
  return useQuery({
    queryKey: ['leads', 'new-count'] as const,
    queryFn: () => fetchLeads({ status: 'new', page: 1, pageSize: 1 }).then(r => r.counts.new ?? 0),
    refetchInterval: 60_000,
  })
}

export function useLead(id: MaybeRefOrGetter<number>) {
  return useQuery({
    queryKey: computed(() => ['lead', toValue(id)] as const),
    queryFn: () => fetchLead(toValue(id)),
  })
}

function useInvalidateLead(id: MaybeRefOrGetter<number>) {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['lead', toValue(id)] }),
      client.invalidateQueries({ queryKey: ['leads'] }),
      client.invalidateQueries({ queryKey: ['stats'] }),
    ])
}

export function useUpdateLead(id: MaybeRefOrGetter<number>) {
  const invalidate = useInvalidateLead(id)
  return useMutation({
    mutationFn: (patch: LeadPatch) =>
      unwrap(api.admin.leads({ id: toValue(id) }).patch(patch)),
    onSuccess: invalidate,
  })
}

export function useAddComment(id: MaybeRefOrGetter<number>) {
  const invalidate = useInvalidateLead(id)
  return useMutation({
    mutationFn: (text: string) =>
      unwrap(api.admin.leads({ id: toValue(id) }).comments.post({ text })),
    onSuccess: invalidate,
  })
}
