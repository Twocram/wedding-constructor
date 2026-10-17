import type { LeadPatch, LeadSource, LeadStatus, Product } from '@saywed/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { api, unwrap } from '@/lib/api';

export type LeadFilters = {
  status: LeadStatus | 'all';
  q?: string;
  source?: LeadSource;
  product?: Product;
  from?: string;
  to?: string;
  page: number;
  pageSize?: number;
};

const fetchLeads = (f: LeadFilters) =>
  unwrap(
    api.admin.leads.$get({
      query: {
        status: f.status,
        page: String(f.page),
        ...(f.pageSize && { pageSize: String(f.pageSize) }),
        ...(f.q && { q: f.q }),
        ...(f.source && { source: f.source }),
        ...(f.product && { product: f.product }),
        ...(f.from && { from: f.from }),
        ...(f.to && { to: f.to }),
      },
    }),
  );

const fetchLead = (id: number) => unwrap(api.admin.leads[':id'].$get({ param: { id: String(id) } }));

export type LeadsPage = Awaited<ReturnType<typeof fetchLeads>>;
export type LeadItem = LeadsPage['items'][number];
export type LeadDetail = Awaited<ReturnType<typeof fetchLead>>;
export type LeadEvent = LeadDetail['events'][number];

export const useLeads = (filters: MaybeRefOrGetter<LeadFilters>) =>
  useQuery({
    queryKey: computed(() => ['leads', toValue(filters)] as const),
    queryFn: () => fetchLeads(toValue(filters)),
    placeholderData: keepPreviousData,
    // новые заявки появляются сами, без перезагрузки страницы
    refetchInterval: 60_000,
  });

// бейдж «новые» в навигации
export const useNewLeadsCount = () =>
  useQuery({
    queryKey: ['leads', 'new-count'] as const,
    queryFn: () => fetchLeads({ status: 'new', page: 1, pageSize: 1 }).then((r) => r.counts.new ?? 0),
    refetchInterval: 60_000,
  });

export const useLead = (id: MaybeRefOrGetter<number>) =>
  useQuery({
    queryKey: computed(() => ['lead', toValue(id)] as const),
    queryFn: () => fetchLead(toValue(id)),
  });

const useInvalidateLead = (id: MaybeRefOrGetter<number>) => {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['lead', toValue(id)] }),
      client.invalidateQueries({ queryKey: ['leads'] }),
    ]);
};

export const useUpdateLead = (id: MaybeRefOrGetter<number>) => {
  const invalidate = useInvalidateLead(id);
  return useMutation({
    mutationFn: (patch: LeadPatch) =>
      unwrap(api.admin.leads[':id'].$patch({ param: { id: String(toValue(id)) }, json: patch })),
    onSuccess: invalidate,
  });
};

export const useAddComment = (id: MaybeRefOrGetter<number>) => {
  const invalidate = useInvalidateLead(id);
  return useMutation({
    mutationFn: (text: string) =>
      unwrap(api.admin.leads[':id'].comments.$post({ param: { id: String(toValue(id)) }, json: { text } })),
    onSuccess: invalidate,
  });
};
