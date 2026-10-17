<script setup lang="ts">
import type { LeadStatus } from '@saywed/shared'
import type { LeadEvent } from '@/composables/useLeads'
import { ArrowRightIcon, MessageSquareIcon, PencilIcon, SparklesIcon } from '@lucide/vue'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAddComment } from '@/composables/useLeads'
import { formatAgo, formatDateTime } from '@/lib/format'

const props = defineProps<{ leadId: number, events: LeadEvent[] }>()

const text = ref('')
const add = useAddComment(() => props.leadId)
function submit() {
  if (!text.value.trim() || add.isPending.value)
    return
  add.mutate(text.value, {
    onSuccess: () => (text.value = ''),
    onError: error => toast.error(error.message),
  })
}

const icons = { created: SparklesIcon, status: ArrowRightIcon, comment: MessageSquareIcon, edit: PencilIcon }
</script>

<template>
  <section class="space-y-4">
    <h3 class="text-sm font-medium">
      История и заметки
    </h3>

    <form class="space-y-2" @submit.prevent="submit">
      <Textarea v-model="text" rows="2" placeholder="Заметка: о чём договорились, что прислать…" @keydown.meta.enter="submit" @keydown.ctrl.enter="submit" />
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Ctrl/⌘ + Enter</span>
        <Button type="submit" size="sm" :disabled="!text.trim() || add.isPending.value">
          Добавить
        </Button>
      </div>
    </form>

    <ol class="relative space-y-4 border-l pl-5">
      <li v-for="event in events" :key="event.id" class="relative">
        <span class="absolute top-0.5 -left-[29px] grid size-[17px] place-items-center rounded-full border bg-background text-muted-foreground">
          <component :is="icons[event.type]" class="size-2.5" />
        </span>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <template v-if="event.type === 'created'">
            Заявка с сайта
          </template>
          <template v-else-if="event.type === 'status' && event.toStatus">
            <StatusBadge v-if="event.fromStatus" :status="event.fromStatus as LeadStatus" />
            <ArrowRightIcon class="size-3.5 text-muted-foreground" />
            <StatusBadge :status="event.toStatus as LeadStatus" />
          </template>
          <template v-else-if="event.type === 'edit'">
            {{ event.text }}
          </template>
          <template v-else-if="event.type === 'comment'">
            Заметка
          </template>
          <span v-if="event.authorName" class="text-muted-foreground">· {{ event.authorName }}</span>
          <span class="text-xs text-muted-foreground" :title="formatDateTime(event.createdAt)">{{ formatAgo(event.createdAt) }}</span>
        </div>
        <p v-if="event.type === 'comment' || (event.type === 'status' && event.text)" class="mt-1.5 rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap">
          <span v-if="event.type === 'status'" class="text-muted-foreground">Причина: </span>{{ event.text }}
        </p>
      </li>
    </ol>
  </section>
</template>
