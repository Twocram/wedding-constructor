import type { InvitationInput, InvitationPatch } from '@saywed/shared'
import type { MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { api, unwrap } from '@/lib/api'

export const siteOrigin = 'https://saywed.ru'
export const invitationUrl = (slug: string) => `${siteOrigin}/${slug}`
export const coupleUrl = (token: string) => `${siteOrigin}/answers#${token}`

const fetchInvitations = () => unwrap(api.admin.invitations.get())
const fetchRsvps = (id: number) => unwrap(api.admin.invitations({ id }).rsvps.get())

export type InvitationItem = Awaited<ReturnType<typeof fetchInvitations>>['items'][number]
export type RsvpItem = Awaited<ReturnType<typeof fetchRsvps>>['items'][number]
export type InvitationChatItem = Awaited<ReturnType<typeof fetchRsvps>>['chats'][number]

export function useInvitations() {
  return useQuery({
    queryKey: ['invitations'] as const,
    queryFn: fetchInvitations,
    // новые ответы гостей появляются сами
    refetchInterval: 60_000,
  })
}

export function useRsvps(id: MaybeRefOrGetter<number>) {
  return useQuery({
    queryKey: computed(() => ['rsvps', toValue(id)] as const),
    queryFn: () => fetchRsvps(toValue(id)),
    refetchInterval: 60_000,
  })
}

function useInvalidate() {
  const client = useQueryClient()
  return (id?: number) =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['invitations'] }),
      id == null ? undefined : client.invalidateQueries({ queryKey: ['rsvps', id] }),
    ])
}

export function useCreateInvitation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: InvitationInput) => unwrap(api.admin.invitations.post(input)),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateInvitation(id: MaybeRefOrGetter<number>) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (patch: InvitationPatch) => unwrap(api.admin.invitations({ id: toValue(id) }).patch(patch)),
    onSuccess: () => invalidate(toValue(id)),
  })
}

export function useRegenerateToken(id: MaybeRefOrGetter<number>) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.admin.invitations({ id: toValue(id) }).token.post()),
    onSuccess: () => invalidate(toValue(id)),
  })
}

export function useDeleteInvitation(id: MaybeRefOrGetter<number>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.admin.invitations({ id: toValue(id) }).delete()),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['rsvps', toValue(id)] })
      return client.invalidateQueries({ queryKey: ['invitations'] })
    },
  })
}

export function useDeleteRsvp(invitationId: MaybeRefOrGetter<number>) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.admin.rsvps({ id }).delete()),
    onSuccess: () => invalidate(toValue(invitationId)),
  })
}

export function useDeleteInvitationChat(invitationId: MaybeRefOrGetter<number>) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => unwrap(api.admin['invitation-chats']({ id }).delete()),
    onSuccess: () => invalidate(toValue(invitationId)),
  })
}
