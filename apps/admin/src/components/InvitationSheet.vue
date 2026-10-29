<script setup lang="ts">
import type { InvitationPatch } from '@saywed/shared'
import { CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, PencilIcon, RefreshCwIcon, SendIcon, Trash2Icon } from '@lucide/vue'
import { answeredForOther, attendingLabels, latestAnswers, rsvpCsv, rsvpSummary } from '@saywed/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  coupleUrl,
  invitationHost,
  invitationUrl,
  useDeleteInvitation,
  useDeleteInvitationChat,
  useDeleteRsvp,
  useRegenerateToken,
  useRsvps,
  useUpdateInvitation,
} from '@/composables/useInvitations'
import { ApiError } from '@/lib/api'
import { formatAgo, formatDateTime } from '@/lib/format'

const props = defineProps<{ id: string }>()
const router = useRouter()

const invitationId = computed(() => Number(props.id))
const { data, isPending, isError } = useRsvps(invitationId)
const invitation = computed(() => data.value?.invitation)
const items = computed(() => data.value?.items ?? [])
const summary = computed(() => rsvpSummary(items.value))
// старые ответы гостя, ответившего повторно: в сводку и выгрузку не входят
const currentIds = computed(() => new Set(latestAnswers(items.value).map(i => i.id)))

const update = useUpdateInvitation(invitationId)
const regenerate = useRegenerateToken(invitationId)
const removeInvitation = useDeleteInvitation(invitationId)
const removeRsvp = useDeleteRsvp(invitationId)
const removeChat = useDeleteInvitationChat(invitationId)

const open = ref(true)
watch(open, (value) => {
  if (value)
    return
  // пришли из списка — «назад»: история не растёт, и кнопка Back не откроет панель снова
  const back = (window.history.state as { back?: string } | null)?.back
  if (back === '/invitations')
    router.back()
  else void router.replace({ name: 'invitations' })
})

const stats = computed(() => [
  { label: 'Придут', value: summary.value.people, hint: 'с парами' },
  { label: 'Не смогут', value: summary.value.no, hint: 'ответов' },
  { label: 'Всего ответов', value: summary.value.total, hint: 'анкет' },
])

// ── ссылки для пары ──
const coupleLink = computed(() => (invitation.value ? coupleUrl(invitation.value.token) : ''))
const notifyLink = computed(() => data.value?.notifyLink ?? null)
const chats = computed(() => data.value?.chats ?? [])
const copied = ref<'answers' | 'bot' | null>(null)
async function copyLink(kind: 'answers' | 'bot') {
  try {
    await navigator.clipboard.writeText(kind === 'answers' ? coupleLink.value : notifyLink.value ?? '')
  }
  catch {
    toast.error('Не удалось скопировать — выделите ссылку вручную')
    return
  }
  copied.value = kind
  toast.success(kind === 'answers' ? 'Ссылка для пары скопирована' : 'Ссылка на бота скопирована')
  setTimeout(() => (copied.value = null), 1500)
}

const confirmChatId = ref<number | null>(null)
function deleteChat(id: number) {
  if (confirmChatId.value !== id) {
    confirmChatId.value = id
    return
  }
  removeChat.mutate(id, {
    onSuccess: () => toast.success('Чат отключён'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => (confirmChatId.value = null),
  })
}

const confirmRegenerate = ref(false)
function regenerateToken() {
  regenerate.mutate(undefined, {
    onSuccess: () => toast.success('Новые ссылки созданы, старые больше не работают'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => (confirmRegenerate.value = false),
  })
}

// ── правка ──
const editing = ref(false)
const form = reactive({ title: '', slug: '', leadId: '' })
const errors = ref<Record<string, string[] | undefined>>({})

function startEdit() {
  if (!invitation.value)
    return
  Object.assign(form, { title: invitation.value.title, slug: invitation.value.slug, leadId: invitation.value.leadId?.toString() ?? '' })
  errors.value = {}
  editing.value = true
}

async function saveEdit() {
  errors.value = {}
  const raw = form.leadId.trim().replace(/^#/, '')
  const leadId = raw === '' ? null : Number(raw)
  if (leadId !== null && !Number.isInteger(leadId)) {
    errors.value = { leadId: ['Введите номер заявки цифрами'] }
    return
  }
  const patch: InvitationPatch = { title: form.title, slug: form.slug, leadId }
  try {
    await update.mutateAsync(patch)
    editing.value = false
    toast.success('Сохранено')
  }
  catch (error) {
    if (error instanceof ApiError && Object.keys(error.fieldErrors).length)
      errors.value = error.fieldErrors
    else toast.error((error as Error).message)
  }
}
watch(invitationId, () => (editing.value = false))

// ── ответы ──
const confirmRsvpId = ref<number | null>(null)
function deleteRsvp(id: number) {
  if (confirmRsvpId.value !== id) {
    confirmRsvpId.value = id
    return
  }
  removeRsvp.mutate(id, {
    onSuccess: () => toast.success('Ответ удалён'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => (confirmRsvpId.value = null),
  })
}

function downloadCsv() {
  if (!invitation.value)
    return
  const url = URL.createObjectURL(new Blob([rsvpCsv(items.value)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${invitation.value.slug}-otvety.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ── удаление приглашения ──
const confirmDelete = ref(false)
function deleteInvitation() {
  removeInvitation.mutate(undefined, {
    onSuccess: () => {
      toast.success('Приглашение удалено')
      void router.replace({ name: 'invitations' })
    },
    onError: (error: Error) => toast.error(error.message),
  })
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
      <div v-if="isPending" class="space-y-4 p-6">
        <Skeleton class="h-6 w-40" />
        <Skeleton class="h-4 w-60" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <div v-else-if="isError || !invitation" class="p-6">
        <SheetHeader class="p-0">
          <SheetTitle>Приглашение не найдено</SheetTitle>
          <SheetDescription>Возможно, его удалили или ссылка неверная</SheetDescription>
        </SheetHeader>
      </div>

      <template v-else>
        <SheetHeader class="gap-2 border-b p-6 pr-12">
          <SheetTitle class="text-xl">
            {{ invitation.title }}
          </SheetTitle>
          <SheetDescription class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a :href="invitationUrl(invitation.slug)" target="_blank" rel="noopener" class="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:underline">
              <span class="truncate">{{ invitationHost(invitation.slug) }}</span>
              <ExternalLinkIcon class="size-3.5 shrink-0" />
            </a>
            <RouterLink v-if="invitation.leadId" :to="{ name: 'lead', params: { id: invitation.leadId } }" class="underline-offset-4 hover:underline">
              Заявка #{{ invitation.leadId }}
            </RouterLink>
          </SheetDescription>
        </SheetHeader>

        <div class="min-w-0 space-y-6 p-6">
          <section class="space-y-3">
            <div class="grid grid-cols-3 gap-2 sm:gap-3">
              <div v-for="stat in stats" :key="stat.label" class="min-w-0 rounded-lg border bg-muted/30 p-3">
                <div class="truncate text-xs text-muted-foreground">
                  {{ stat.label }}
                </div>
                <div class="text-2xl font-semibold tabular-nums">
                  {{ stat.value }}
                </div>
                <div class="truncate text-xs text-muted-foreground">
                  {{ stat.hint }}
                </div>
              </div>
            </div>
            <div v-if="summary.drinks.length" class="space-y-1.5">
              <h3 class="text-sm font-medium">
                Напитки
              </h3>
              <ul class="flex flex-wrap gap-1.5">
                <li v-for="[drink, count] in summary.drinks" :key="drink">
                  <Badge variant="secondary">
                    {{ drink }} · {{ count }}
                  </Badge>
                </li>
              </ul>
            </div>
          </section>

          <Separator />

          <section class="space-y-3">
            <h3 class="text-sm font-medium">
              Ссылки для пары
            </h3>
            <div class="space-y-1.5">
              <div class="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3 text-sm">
                <span class="truncate font-medium">{{ coupleLink }}</span>
                <Button variant="ghost" size="icon-xs" class="ml-auto" :aria-label="copied === 'answers' ? 'Скопировано' : 'Скопировать ссылку'" @click="copyLink('answers')">
                  <CheckIcon v-if="copied === 'answers'" class="text-emerald-600" />
                  <CopyIcon v-else />
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                Ответы гостей. Никому, кроме пары, её не отправляйте.
              </p>
            </div>
            <div class="space-y-1.5">
              <div v-if="notifyLink" class="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3 text-sm">
                <SendIcon class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate font-medium">{{ notifyLink }}</span>
                <Button variant="ghost" size="icon-xs" class="ml-auto" :aria-label="copied === 'bot' ? 'Скопировано' : 'Скопировать ссылку на бота'" @click="copyLink('bot')">
                  <CheckIcon v-if="copied === 'bot'" class="text-emerald-600" />
                  <CopyIcon v-else />
                </Button>
              </div>
              <p v-else class="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Ссылка на бота появится, когда сервер свяжется с Telegram.
              </p>
              <p class="text-xs text-muted-foreground">
                Уведомления в Telegram: пара открывает ссылку и жмёт Start. Приходят ответ и сводка, без имён гостей. Можно подключить обоих.
              </p>
            </div>
            <ul v-if="chats.length" class="divide-y rounded-lg border">
              <li v-for="chat in chats" :key="chat.id" class="flex min-w-0 items-center gap-2 py-1.5 pr-1.5 pl-3 text-sm">
                <div class="min-w-0 flex-1">
                  <span class="font-medium break-words">{{ chat.name }}</span>
                  <span v-if="chat.username" class="ml-1.5 break-all text-muted-foreground">@{{ chat.username }}</span>
                  <div class="text-xs text-muted-foreground" :title="formatDateTime(chat.createdAt)">
                    подключён {{ formatAgo(chat.createdAt) }}
                  </div>
                </div>
                <Button
                  :variant="confirmChatId === chat.id ? 'destructive' : 'ghost'"
                  size="sm"
                  :disabled="removeChat.isPending.value"
                  @click="deleteChat(chat.id)"
                  @blur="confirmChatId = null"
                >
                  {{ confirmChatId === chat.id ? 'Отключить?' : 'Отключить' }}
                </Button>
              </li>
            </ul>
            <div v-if="confirmRegenerate" class="space-y-2 rounded-lg border border-dashed p-3">
              <p class="text-sm">
                Обе ссылки перестанут работать — пришлите паре новые. Уже подключённые чаты останутся, лишние отключите выше.
              </p>
              <div class="flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click="confirmRegenerate = false">
                  Отмена
                </Button>
                <Button variant="destructive" size="sm" :disabled="regenerate.isPending.value" @click="regenerateToken">
                  Создать новые
                </Button>
              </div>
            </div>
            <Button v-else variant="outline" size="sm" @click="confirmRegenerate = true">
              <RefreshCwIcon />
              Новые ссылки
            </Button>
          </section>

          <Separator />

          <section class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-medium">
                Ответы гостей
              </h3>
              <Button variant="outline" size="sm" :disabled="!items.length" @click="downloadCsv">
                <DownloadIcon />
                Скачать Excel (CSV)
              </Button>
            </div>

            <p v-if="!items.length" class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Ответов пока нет
            </p>
            <div v-else class="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="pl-3">
                      Имя
                    </TableHead>
                    <TableHead>Ответ</TableHead>
                    <TableHead>С парой</TableHead>
                    <TableHead>Напитки</TableHead>
                    <TableHead>Пожелания</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead class="pr-3" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="item in items" :key="item.id" :class="!currentIds.has(item.id) && 'opacity-50'">
                    <TableCell class="pl-3">
                      <div class="font-medium">
                        {{ item.name }}
                      </div>
                      <div v-if="answeredForOther(item)" class="text-xs text-muted-foreground">
                        по ссылке: {{ item.guest }}
                      </div>
                      <div v-if="!currentIds.has(item.id)" class="text-xs text-muted-foreground">
                        заменён новым ответом
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge :variant="item.attending === 'yes' ? 'default' : 'secondary'">
                        {{ attendingLabels[item.attending] }}
                      </Badge>
                    </TableCell>
                    <TableCell>{{ item.plusOne ? 'да' : '—' }}</TableCell>
                    <TableCell class="max-w-44 whitespace-normal">
                      {{ item.drinks.join(', ') || '—' }}
                    </TableCell>
                    <TableCell class="max-w-56 break-words whitespace-pre-wrap">
                      {{ item.notes || '—' }}
                    </TableCell>
                    <TableCell class="text-muted-foreground" :title="formatAgo(item.createdAt)">
                      {{ formatDateTime(item.createdAt) }}
                    </TableCell>
                    <TableCell class="pr-3 text-right">
                      <Button
                        :variant="confirmRsvpId === item.id ? 'destructive' : 'ghost'"
                        size="sm"
                        :disabled="removeRsvp.isPending.value"
                        :aria-label="confirmRsvpId === item.id ? 'Подтвердить удаление' : 'Удалить ответ'"
                        @click="deleteRsvp(item.id)"
                        @blur="confirmRsvpId = null"
                      >
                        <template v-if="confirmRsvpId === item.id">
                          Удалить?
                        </template>
                        <Trash2Icon v-else />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          <Separator />

          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">
                О приглашении
              </h3>
              <Button v-if="!editing" variant="ghost" size="sm" @click="startEdit">
                <PencilIcon />
                Изменить
              </Button>
            </div>
            <form v-if="editing" class="space-y-3" @submit.prevent="saveEdit">
              <div class="min-w-0 space-y-1.5">
                <label for="edit-title" class="text-xs font-medium text-muted-foreground">Название</label>
                <Input id="edit-title" v-model="form.title" :aria-invalid="Boolean(errors.title)" />
                <p v-if="errors.title" class="text-sm text-destructive">
                  {{ errors.title[0] }}
                </p>
              </div>
              <div class="min-w-0 space-y-1.5">
                <label for="edit-slug" class="text-xs font-medium text-muted-foreground">Адрес</label>
                <div class="flex min-w-0 items-center gap-2">
                  <Input id="edit-slug" v-model="form.slug" autocomplete="off" :aria-invalid="Boolean(errors.slug)" />
                  <span class="text-sm text-muted-foreground">.saywed.ru</span>
                </div>
                <p v-if="errors.slug" class="text-sm text-destructive">
                  {{ errors.slug[0] }}
                </p>
              </div>
              <div class="min-w-0 space-y-1.5">
                <label for="edit-lead" class="text-xs font-medium text-muted-foreground">Номер заявки</label>
                <Input id="edit-lead" v-model="form.leadId" inputmode="numeric" placeholder="—" :aria-invalid="Boolean(errors.leadId)" />
                <p v-if="errors.leadId" class="text-sm text-destructive">
                  {{ errors.leadId[0] }}
                </p>
              </div>
              <div class="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" @click="editing = false">
                  Отмена
                </Button>
                <Button type="submit" size="sm" :disabled="update.isPending.value">
                  Сохранить
                </Button>
              </div>
            </form>
            <dl v-else class="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,9rem)_1fr]">
              <dt class="text-muted-foreground">
                Название
              </dt>
              <dd class="min-w-0 break-words">
                {{ invitation.title }}
              </dd>
              <dt class="text-muted-foreground">
                Адрес
              </dt>
              <dd class="min-w-0 break-words">
                {{ invitationHost(invitation.slug) }}
              </dd>
              <dt class="text-muted-foreground">
                Заявка
              </dt>
              <dd class="min-w-0">
                <RouterLink v-if="invitation.leadId" :to="{ name: 'lead', params: { id: invitation.leadId } }" class="underline-offset-4 hover:underline">
                  #{{ invitation.leadId }}
                </RouterLink>
                <span v-else class="text-muted-foreground">—</span>
              </dd>
              <dt class="text-muted-foreground">
                Создано
              </dt>
              <dd>{{ formatDateTime(invitation.createdAt) }}</dd>
            </dl>
          </section>

          <Separator />

          <section>
            <div v-if="confirmDelete" class="space-y-2 rounded-lg border border-dashed border-destructive/50 p-3">
              <p class="text-sm">
                Приглашение и все ответы гостей ({{ summary.total }}) будут удалены без возможности восстановления.
              </p>
              <div class="flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click="confirmDelete = false">
                  Отмена
                </Button>
                <Button variant="destructive" size="sm" :disabled="removeInvitation.isPending.value" @click="deleteInvitation">
                  Удалить навсегда
                </Button>
              </div>
            </div>
            <Button v-else variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="confirmDelete = true">
              <Trash2Icon />
              Удалить приглашение
            </Button>
          </section>
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>
