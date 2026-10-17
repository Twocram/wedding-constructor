<script setup lang="ts">
import type { AmountBreakdown, LeadPatch, LeadStatus } from '@saywed/shared'
import { CheckIcon, CopyIcon, ExternalLinkIcon, PencilIcon } from '@lucide/vue'
import {

  breakdownTotal,
  contactMethodLabels,
  estimateAmount,
  eventTypeLabels,

  leadSourceLabels,

  leadStatuses,
  leadStatusLabels,
  productLabels,
  rub,
  themes,
} from '@saywed/shared'
import { cn } from 'cn'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import LeadEditForm from '@/components/LeadEditForm.vue'
import LeadTimeline from '@/components/LeadTimeline.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useLead, useUpdateLead } from '@/composables/useLeads'
import { formatAgo, formatDateTime, formatEventDate } from '@/lib/format'
import { statusTone } from '@/lib/status'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()

const leadId = computed(() => Number(props.id))
const { data, isPending, isError } = useLead(leadId)
const lead = computed(() => data.value?.lead)
const update = useUpdateLead(leadId)

const open = ref(true)
watch(open, (value) => {
  if (value)
    return
  // пришли из списка — «назад»: история не растёт, и кнопка Back не откроет карточку снова
  const back = (window.history.state as { back?: string } | null)?.back
  if (back?.startsWith('/leads') && !/^\/leads\/\d/.test(back))
    router.back()
  else void router.replace({ name: 'leads', query: route.query })
})

const editing = ref(false)
watch(leadId, () => (editing.value = false))

function save(patch: LeadPatch, success?: string) {
  return update.mutateAsync(patch).then(
    () => success && toast.success(success),
    (error: Error) => {
      toast.error(error.message)
      throw error
    },
  )
}

// ── сделка: статус и сумма ──
// Input type="number" отдаёт в v-model число, после очистки — пустую строку
const amountInput = ref<string | number>('')
const breakdown = ref<AmountBreakdown | null>(null)
const amountError = ref('')
const amountField = useTemplateRef<InstanceType<typeof Input>>('amountField')
const amountValue = computed(() => {
  const raw = String(amountInput.value ?? '').trim()
  return raw === '' ? null : Math.max(0, Math.round(Number(raw)))
})
// сервер обновился (своё сохранение, чужая правка) — подтягиваем сумму, только если её не начали менять
watch(
  () => [leadId.value, lead.value?.amount ?? null, JSON.stringify(lead.value?.amountBreakdown ?? null)] as const,
  ([id, amount, saved], previous) => {
    const untouched = !previous || id !== previous[0] || amountValue.value === previous[1]
    if (!untouched)
      return
    amountInput.value = amount == null ? '' : String(amount)
    breakdown.value = JSON.parse(saved)
    amountError.value = ''
  },
  { immediate: true },
)

const estimate = computed(() => (lead.value ? estimateAmount(lead.value.product, lead.value.namedLinks) : null))
const amountDirty = computed(() => lead.value != null && amountValue.value !== lead.value.amount)

function applyEstimate() {
  if (!estimate.value)
    return
  breakdown.value = estimate.value
  amountInput.value = String(breakdownTotal(estimate.value))
  amountError.value = ''
}

function amountPatch(): LeadPatch {
  return {
    amount: amountValue.value,
    // разбивка имеет смысл, только пока сумма совпадает с ней
    amountBreakdown: breakdown.value && amountValue.value === breakdownTotal(breakdown.value) ? breakdown.value : null,
  }
}

const saveAmount = () => save(amountPatch(), 'Сумма сохранена').catch(() => {})

// отказ спрашивает причину до смены статуса — она уходит в то же событие истории
const askingLost = ref(false)
const lostDraft = ref('')

async function setStatus(status: LeadStatus) {
  if (!lead.value || status === lead.value.status)
    return
  if (status === 'lost') {
    askingLost.value = true
    lostDraft.value = ''
    return
  }
  askingLost.value = false
  if (status === 'done' && amountValue.value == null) {
    amountError.value = 'Укажите сумму, чтобы завершить заявку'
    await nextTick();
    (amountField.value?.$el as HTMLInputElement | undefined)?.focus()
    return
  }
  amountError.value = ''
  await save({ status, ...(status === 'done' && amountDirty.value ? amountPatch() : {}) }, `Статус: ${leadStatusLabels[status]}`).catch(() => {})
}

function confirmLost() {
  return save({ status: 'lost', lostReason: lostDraft.value.trim() || null }, 'Статус: Отказ')
    .then(() => (askingLost.value = false))
    .catch(() => {})
}
watch(leadId, () => (askingLost.value = false))

// ── поля, которые сохраняются при уходе с поля: подтягиваем с сервера, только если их не правили ──
const lostReason = ref('')
const invitationSlug = ref('')
watch(
  () => [leadId.value, lead.value?.lostReason ?? '', lead.value?.invitationSlug ?? ''] as const,
  ([id, reason, slug], previous) => {
    const fresh = !previous || id !== previous[0]
    if (fresh || lostReason.value === previous[1])
      lostReason.value = reason
    if (fresh || invitationSlug.value === previous[2])
      invitationSlug.value = slug
  },
  { immediate: true },
)
function saveOnBlur(field: 'lostReason' | 'invitationSlug', value: string) {
  const next = value.trim() || null
  if (!lead.value || next === (lead.value[field] ?? null))
    return
  void save({ [field]: next }, 'Сохранено').catch(() => {})
}

const copied = ref(false)
async function copyContact() {
  if (!lead.value)
    return
  await navigator.clipboard.writeText(lead.value.contact)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

const details = computed(() => {
  const l = lead.value
  if (!l)
    return []
  const utm = [l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(' / ')
  return [
    { label: 'Продукт', value: productLabels[l.product] },
    { label: 'Дизайн', value: l.themeSlug ? themes[l.themeSlug]?.name ?? l.themeSlug : null },
    { label: 'Событие', value: eventTypeLabels[l.eventType] },
    { label: 'Дата события', value: l.eventDate ? formatEventDate(l.eventDate) : null },
    { label: 'Именные ссылки', value: l.namedLinks ? String(l.namedLinks) : null },
    { label: 'Источник', value: `${leadSourceLabels[l.source]}${l.sourcePath ? ` · ${l.sourcePath}` : ''}` },
    { label: 'UTM', value: utm || null },
    { label: 'Переход с', value: l.referrer },
    { label: 'Завершена', value: l.completedAt ? formatDateTime(l.completedAt) : null },
  ].filter(row => row.value)
})
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
      <div v-if="isPending" class="space-y-4 p-6">
        <Skeleton class="h-6 w-40" />
        <Skeleton class="h-4 w-60" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <div v-else-if="isError || !lead" class="p-6">
        <SheetHeader class="p-0">
          <SheetTitle>Заявка не найдена</SheetTitle>
          <SheetDescription>Возможно, её удалили или ссылка неверная</SheetDescription>
        </SheetHeader>
      </div>

      <template v-else>
        <SheetHeader class="gap-3 border-b p-6 pr-12">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <span class="tabular-nums">#{{ lead.id }}</span>
            <span>·</span>
            <span :title="formatDateTime(lead.createdAt)">{{ formatAgo(lead.createdAt) }}</span>
            <StatusBadge :status="lead.status as LeadStatus" class="ml-auto" />
          </div>
          <SheetTitle class="text-xl">
            {{ lead.name }}
          </SheetTitle>
          <SheetDescription class="sr-only">
            Карточка заявки
          </SheetDescription>

          <div class="flex flex-wrap items-center gap-2">
            <div class="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3 text-sm">
              <span class="text-muted-foreground">{{ contactMethodLabels[lead.contactMethod] }}</span>
              <span class="truncate font-medium">{{ lead.contact }}</span>
              <Button variant="ghost" size="icon-xs" :aria-label="copied ? 'Скопировано' : 'Скопировать контакт'" @click="copyContact">
                <CheckIcon v-if="copied" class="text-emerald-600" />
                <CopyIcon v-else />
              </Button>
            </div>
            <Button size="sm" as-child>
              <a :href="lead.contactHref" target="_blank" rel="noopener">
                <ExternalLinkIcon />
                {{ lead.contactMethod === 'phone' ? 'Позвонить' : 'Написать' }}
              </a>
            </Button>
          </div>
        </SheetHeader>

        <div class="space-y-6 p-6">
          <!-- сделка -->
          <section class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Статус</label>
                <Select :model-value="askingLost ? 'lost' : lead.status" :disabled="update.isPending.value" @update:model-value="(v) => setStatus(v as LeadStatus)">
                  <SelectTrigger class="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="s in leadStatuses" :key="s" :value="s">
                      <span :class="cn('size-2 rounded-full', statusTone[s].dot)" />
                      {{ leadStatusLabels[s] }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="space-y-1.5">
                <label for="amount" class="text-xs font-medium text-muted-foreground">Сумма сделки, ₽</label>
                <div class="flex gap-2">
                  <Input
                    id="amount"
                    ref="amountField"
                    v-model="amountInput"
                    type="number"
                    min="0"
                    step="100"
                    inputmode="numeric"
                    placeholder="—"
                    :aria-invalid="Boolean(amountError)"
                    @keydown.enter="amountDirty && saveAmount()"
                  />
                  <Button v-if="amountDirty" size="default" :disabled="update.isPending.value" @click="saveAmount">
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>
            <p v-if="amountError" class="-mt-2 text-sm text-destructive">
              {{ amountError }}
            </p>
            <div v-if="estimate" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                По прайсу: {{ rub(breakdownTotal(estimate)) }}
                <template v-if="estimate.namedLinks"> ({{ rub(estimate.base) }} + {{ rub(estimate.namedLinks) }} за ссылки)</template>
              </span>
              <button v-if="amountValue !== breakdownTotal(estimate)" type="button" class="font-medium text-foreground underline-offset-4 hover:underline" @click="applyEstimate">
                Подставить
              </button>
            </div>

            <div v-if="askingLost" class="space-y-2 rounded-lg border border-dashed p-3">
              <label for="lost-draft" class="text-xs font-medium text-muted-foreground">Почему отказ? Необязательно, но пригодится в аналитике</label>
              <Input id="lost-draft" v-model="lostDraft" placeholder="Например: выбрали бумажные" autofocus @keydown.enter.prevent="confirmLost" />
              <div class="flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click="askingLost = false">
                  Отмена
                </Button>
                <Button size="sm" :disabled="update.isPending.value" @click="confirmLost">
                  Отметить отказ
                </Button>
              </div>
            </div>

            <div v-else-if="lead.status === 'lost'" class="space-y-1.5">
              <label for="lost" class="text-xs font-medium text-muted-foreground">Причина отказа</label>
              <Input id="lost" v-model="lostReason" placeholder="Например: выбрали бумажные" @blur="saveOnBlur('lostReason', lostReason)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            </div>
            <div v-if="lead.status === 'in_progress' || lead.status === 'done'" class="space-y-1.5">
              <label for="slug" class="text-xs font-medium text-muted-foreground">Адрес приглашения на сайте</label>
              <Input id="slug" v-model="invitationSlug" placeholder="anna-dmitry" @blur="saveOnBlur('invitationSlug', invitationSlug)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            </div>
          </section>

          <Separator />

          <!-- данные клиента -->
          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">
                О заказе
              </h3>
              <Button v-if="!editing" variant="ghost" size="sm" @click="editing = true">
                <PencilIcon />
                Изменить
              </Button>
            </div>

            <LeadEditForm v-if="editing" :lead="lead" @cancel="editing = false" @saved="editing = false" />
            <template v-else>
              <dl class="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,9rem)_1fr]">
                <template v-for="row in details" :key="row.label">
                  <dt class="text-muted-foreground">
                    {{ row.label }}
                  </dt>
                  <dd class="min-w-0 break-words">
                    {{ row.value }}
                  </dd>
                </template>
              </dl>
              <blockquote v-if="lead.message" class="rounded-lg border-l-2 border-[#78865a] bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
                {{ lead.message }}
              </blockquote>
            </template>
          </section>

          <Separator />

          <LeadTimeline :lead-id="lead.id" :events="data!.events" />
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>
