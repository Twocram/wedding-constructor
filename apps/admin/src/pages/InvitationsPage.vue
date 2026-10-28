<script setup lang="ts">
import type { InvitationItem } from '@/composables/useInvitations'
import { LinkIcon, MailIcon, PlusIcon } from '@lucide/vue'
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { coupleUrl, useCreateInvitation, useInvitations } from '@/composables/useInvitations'
import { ApiError } from '@/lib/api'
import { formatAgo, formatDateTime } from '@/lib/format'

const router = useRouter()

const { data, isPending, isFetching, isError, refetch } = useInvitations()

const open = (item: InvitationItem) => void router.push({ name: 'invitation', params: { id: item.id } })

async function copyLink(item: InvitationItem) {
  try {
    await navigator.clipboard.writeText(coupleUrl(item.token))
    toast.success('Ссылка для пары скопирована')
  }
  catch {
    toast.error('Не удалось скопировать ссылку')
  }
}

const creating = ref(false)
const form = reactive({ slug: '', title: '', leadId: '' })
const errors = ref<Record<string, string[] | undefined>>({})
const create = useCreateInvitation()

function startCreate() {
  Object.assign(form, { slug: '', title: '', leadId: '' })
  errors.value = {}
  creating.value = true
}

const leadIdNumber = computed(() => {
  const raw = form.leadId.trim().replace(/^#/, '')
  return raw === '' ? null : Number(raw)
})

async function submit() {
  errors.value = {}
  if (leadIdNumber.value !== null && !Number.isInteger(leadIdNumber.value)) {
    errors.value = { leadId: ['Введите номер заявки цифрами'] }
    return
  }
  try {
    const { invitation } = await create.mutateAsync({ slug: form.slug, title: form.title, leadId: leadIdNumber.value })
    creating.value = false
    toast.success('Приглашение создано')
    void router.push({ name: 'invitation', params: { id: invitation.id } })
  }
  catch (error) {
    if (error instanceof ApiError && Object.keys(error.fieldErrors).length)
      errors.value = error.fieldErrors
    else toast.error((error as Error).message)
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Приглашения
        </h1>
        <p class="text-sm text-muted-foreground">
          <template v-if="data">
            Всего: {{ data.items.length }}
          </template>
          <template v-else>
&nbsp;
          </template>
        </p>
      </div>
      <Button v-if="!creating" @click="startCreate">
        <PlusIcon />
        Новое приглашение
      </Button>
    </div>

    <form v-if="creating" class="space-y-4 rounded-xl border bg-background p-4 sm:p-5" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="min-w-0 space-y-1.5">
          <label for="new-slug" class="text-xs font-medium text-muted-foreground">Адрес</label>
          <div class="flex min-w-0 items-center gap-2">
            <span class="text-sm text-muted-foreground">saywed.ru/</span>
            <Input id="new-slug" v-model="form.slug" placeholder="anna-dmitry" autocomplete="off" autofocus :aria-invalid="Boolean(errors.slug)" />
          </div>
          <p v-if="errors.slug" class="text-sm text-destructive">
            {{ errors.slug[0] }}
          </p>
          <p v-else class="text-xs text-muted-foreground">
            Как в ссылке saywed.ru/…: латиница, цифры и дефис
          </p>
        </div>
        <div class="min-w-0 space-y-1.5">
          <label for="new-title" class="text-xs font-medium text-muted-foreground">Название</label>
          <Input id="new-title" v-model="form.title" placeholder="Анна & Дмитрий" :aria-invalid="Boolean(errors.title)" />
          <p v-if="errors.title" class="text-sm text-destructive">
            {{ errors.title[0] }}
          </p>
        </div>
        <div class="min-w-0 space-y-1.5">
          <label for="new-lead" class="text-xs font-medium text-muted-foreground">Номер заявки (необязательно)</label>
          <Input id="new-lead" v-model="form.leadId" inputmode="numeric" placeholder="42" :aria-invalid="Boolean(errors.leadId)" />
          <p v-if="errors.leadId" class="text-sm text-destructive">
            {{ errors.leadId[0] }}
          </p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" @click="creating = false">
          Отмена
        </Button>
        <Button type="submit" :disabled="create.isPending.value">
          Создать
        </Button>
      </div>
    </form>

    <div class="overflow-hidden rounded-xl border bg-background" :class="{ 'opacity-70 transition-opacity': isFetching && !isPending }">
      <div v-if="isPending" class="divide-y">
        <div v-for="i in 4" :key="i" class="flex items-center gap-4 p-4">
          <Skeleton class="h-4 w-40" />
          <Skeleton class="ml-auto h-4 w-24" />
        </div>
      </div>

      <Empty v-else-if="isError" class="py-14">
        <EmptyHeader>
          <EmptyTitle>Не удалось загрузить приглашения</EmptyTitle>
          <EmptyDescription>Проверьте соединение и попробуйте ещё раз</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" @click="refetch()">
          Повторить
        </Button>
      </Empty>

      <Empty v-else-if="!data?.items.length" class="py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>Приглашений пока нет</EmptyTitle>
          <EmptyDescription>Заведите приглашение, чтобы анкета на его странице начала принимать ответы гостей.</EmptyDescription>
        </EmptyHeader>
        <Button v-if="!creating" variant="outline" size="sm" @click="startCreate">
          <PlusIcon />
          Новое приглашение
        </Button>
      </Empty>

      <template v-else>
        <!-- телефон: карточки -->
        <ul class="divide-y md:hidden">
          <li v-for="item in data.items" :key="item.id" class="flex items-center gap-1 pr-2">
            <button type="button" class="flex min-w-0 flex-1 flex-col gap-1 p-4 text-left active:bg-muted/60" @click="open(item)">
              <span class="truncate font-medium">{{ item.title }}</span>
              <span class="truncate text-sm text-muted-foreground">saywed.ru/{{ item.slug }}</span>
              <span class="text-xs text-muted-foreground">
                Придут: {{ item.counts.people }} · не смогут: {{ item.counts.no }} · ответов: {{ item.counts.total }}
                <template v-if="item.lastAnswerAt"> · {{ formatAgo(item.lastAnswerAt) }}</template>
              </span>
            </button>
            <Button variant="ghost" size="icon-sm" aria-label="Копировать ссылку для пары" @click="copyLink(item)">
              <LinkIcon />
            </Button>
          </li>
        </ul>

        <!-- компьютер: таблица -->
        <Table class="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead class="pl-4">
                Приглашение
              </TableHead>
              <TableHead>Придут</TableHead>
              <TableHead>Не смогут</TableHead>
              <TableHead>Всего ответов</TableHead>
              <TableHead>Последний ответ</TableHead>
              <TableHead class="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in data.items" :key="item.id" class="cursor-pointer" @click="open(item)">
              <TableCell class="pl-4">
                <div class="font-medium">
                  {{ item.title }}
                </div>
                <div class="text-xs text-muted-foreground">
                  saywed.ru/{{ item.slug }}
                </div>
              </TableCell>
              <TableCell class="tabular-nums">
                {{ item.counts.people }} <span class="text-xs text-muted-foreground">чел.</span>
              </TableCell>
              <TableCell class="tabular-nums">
                {{ item.counts.no }}
              </TableCell>
              <TableCell class="tabular-nums">
                {{ item.counts.total }}
              </TableCell>
              <TableCell class="text-muted-foreground" :title="item.lastAnswerAt ? formatDateTime(item.lastAnswerAt) : undefined">
                {{ item.lastAnswerAt ? formatAgo(item.lastAnswerAt) : '—' }}
              </TableCell>
              <TableCell class="pr-4 text-right">
                <Button variant="ghost" size="icon-sm" aria-label="Копировать ссылку для пары" title="Копировать ссылку для пары" @click.stop="copyLink(item)">
                  <LinkIcon />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </template>
    </div>

    <RouterView />
  </div>
</template>
