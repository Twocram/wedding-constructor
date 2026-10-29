import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { api, unwrap } from '@/lib/api'

const fetchSubscribers = () => unwrap(api.admin.telegram.subscribers.get())

export type TgSubscriberItem = Awaited<ReturnType<typeof fetchSubscribers>>['items'][number]

export function useTgSubscribers() {
  return useQuery({
    queryKey: ['tg-subscribers'] as const,
    queryFn: fetchSubscribers,
    // новые запросы из бота появляются сами
    refetchInterval: 60_000,
  })
}

function useSubscriberMutation(action: (id: number) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: action,
    onSuccess: () => client.invalidateQueries({ queryKey: ['tg-subscribers'] }),
  })
}

export const useApproveSubscriber = () => useSubscriberMutation(id => unwrap(api.admin.telegram.subscribers({ id }).approve.post()))
export const useBlockSubscriber = () => useSubscriberMutation(id => unwrap(api.admin.telegram.subscribers({ id }).block.post()))
export const useDeleteSubscriber = () => useSubscriberMutation(id => unwrap(api.admin.telegram.subscribers({ id }).delete()))
