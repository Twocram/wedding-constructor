<script setup lang="ts">
import type { TgSubscriberItem } from '@/composables/useTelegram'
import { BellIcon } from '@lucide/vue'
import { tgSubscriberStatusLabels } from '@saywed/shared'
import { computed } from 'vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useApproveSubscriber, useBlockSubscriber, useDeleteSubscriber, useTgSubscribers } from '@/composables/useTelegram'
import { formatAgo, formatDateTime } from '@/lib/format'

const { data, isPending, isFetching, isError, refetch } = useTgSubscribers()
const approve = useApproveSubscriber()
const block = useBlockSubscriber()
const remove = useDeleteSubscriber()

const botUrl = computed(() => data.value?.botUsername ? `https://t.me/${data.value.botUsername}` : null)
const pendingCount = computed(() => data.value?.items.filter(s => s.status === 'pending').length ?? 0)
const busy = computed(() => approve.isPending.value || block.isPending.value || remove.isPending.value)

async function run(action: typeof approve, item: TgSubscriberItem, done: string) {
  try {
    await action.mutateAsync(item.id)
    toast.success(done)
  }
  catch (error) {
    toast.error((error as Error).message)
  }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">
        Уведомления
      </h1>
      <p class="text-sm text-muted-foreground">
        Бот присылает новые заявки и ответы гостей.
        <template v-if="botUrl">
          Чтобы подключиться, откройте <a :href="botUrl" target="_blank" rel="noopener" class="text-foreground underline underline-offset-4">@{{ data?.botUsername }}</a> и нажмите Start — запрос появится здесь.
        </template>
      </p>
    </div>

    <p v-if="data && !data.enabled" class="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
      Бот не настроен на сервере: нет TG_BOT_TOKEN.
    </p>

    <div class="overflow-hidden rounded-xl border bg-background" :class="{ 'opacity-70 transition-opacity': isFetching && !isPending }">
      <div v-if="isPending" class="divide-y">
        <div v-for="i in 3" :key="i" class="flex items-center gap-4 p-4">
          <Skeleton class="h-4 w-40" />
          <Skeleton class="ml-auto h-4 w-24" />
        </div>
      </div>

      <Empty v-else-if="isError" class="py-14">
        <EmptyHeader>
          <EmptyTitle>Не удалось загрузить подписчиков</EmptyTitle>
          <EmptyDescription>Проверьте соединение и попробуйте ещё раз</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" @click="refetch()">
          Повторить
        </Button>
      </Empty>

      <Empty v-else-if="!data?.items.length" class="py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellIcon />
          </EmptyMedia>
          <EmptyTitle>Запросов пока нет</EmptyTitle>
          <EmptyDescription>Когда кто-то нажмёт Start в боте, он появится здесь и будет ждать одобрения.</EmptyDescription>
        </EmptyHeader>
      </Empty>

      <ul v-else class="divide-y">
        <li v-for="item in data.items" :key="item.id" class="flex flex-wrap items-center gap-x-4 gap-y-3 p-4" :class="{ 'bg-sky-50/60 dark:bg-sky-950/20': item.status === 'pending' }">
          <div class="w-full min-w-0 space-y-1 sm:w-auto sm:flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium break-words">{{ item.name }}</span>
              <span v-if="item.username" class="min-w-0 text-sm break-all text-muted-foreground">@{{ item.username }}</span>
              <Badge :variant="item.status === 'active' ? 'default' : item.status === 'blocked' ? 'destructive' : 'secondary'">
                {{ tgSubscriberStatusLabels[item.status] }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground" :title="formatDateTime(item.createdAt)">
              Запрос {{ formatAgo(item.createdAt) }}
            </p>
          </div>
          <div class="flex gap-2">
            <template v-if="item.status === 'pending'">
              <Button size="sm" :disabled="busy" @click="run(approve, item, 'Уведомления включены')">
                Одобрить
              </Button>
              <Button size="sm" variant="ghost" :disabled="busy" @click="run(block, item, 'Запрос отклонён')">
                Отклонить
              </Button>
            </template>
            <Button v-else-if="item.status === 'active'" size="sm" variant="outline" :disabled="busy" @click="run(remove, item, 'Уведомления отключены')">
              Отключить
            </Button>
            <Button v-else size="sm" variant="ghost" :disabled="busy" @click="run(remove, item, 'Блокировка снята')">
              Разблокировать
            </Button>
          </div>
        </li>
      </ul>
    </div>

    <p v-if="pendingCount" class="text-xs text-muted-foreground">
      Отклонённые не смогут отправить запрос повторно, пока их не разблокировать.
    </p>
  </div>
</template>
