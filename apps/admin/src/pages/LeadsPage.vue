<script setup lang="ts">
import {
  contactMethodLabels,
  leadSourceLabels,
  leadSources,
  leadStatuses,
  leadStatusLabels,
  productLabels,
  products,
  rub,
  themes,
  type LeadSource,
  type LeadStatus,
  type Product,
} from '@saywed/shared';
import { ChevronLeftIcon, ChevronRightIcon, InboxIcon, SearchIcon, XIcon } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import StatusBadge from '@/components/StatusBadge.vue';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLeads, type LeadFilters, type LeadItem } from '@/composables/useLeads';
import { formatAgo, formatDateTime } from '@/lib/format';

const PAGE_SIZE = 50;
const ANY = 'any';

const route = useRoute();
const router = useRouter();

const pick = <T extends string>(value: unknown, allowed: readonly T[]) =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

// фильтры живут в адресе: ссылку на выборку можно переслать, и они не теряются при открытии карточки
const filters = computed<LeadFilters>(() => ({
  status: pick(route.query.status, leadStatuses) ?? 'all',
  q: text(route.query.q),
  source: pick(route.query.source, leadSources),
  product: pick(route.query.product, products),
  from: text(route.query.from),
  to: text(route.query.to),
  page: Math.max(1, Number(route.query.page) || 1),
}));

const setFilters = (patch: Partial<Record<keyof LeadFilters, string | number | undefined>>) => {
  const query: LocationQueryRaw = { ...route.query, page: undefined };
  for (const [key, value] of Object.entries(patch)) query[key] = value === undefined || value === '' || value === ANY ? undefined : String(value);
  if (query.status === 'all') query.status = undefined;
  void router.replace({ name: 'leads', query });
};

const search = ref(filters.value.q ?? '');
const searchDebounced = refDebounced(search, 300);
// адрес поменялся снаружи (ссылка в шапке, «назад») — поле поиска догоняет его
watch(
  () => filters.value.q,
  (q) => {
    if ((search.value.trim() || undefined) !== q) search.value = q ?? '';
  },
);
watch(searchDebounced, (q) => {
  if ((q || undefined) !== filters.value.q) setFilters({ q: q.trim() || undefined });
});

const { data, isPending, isFetching, isError, refetch } = useLeads(filters);

const tabs = computed(() => {
  const counts = data.value?.counts ?? {};
  const all = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return [
    { value: 'all' as const, label: 'Все', count: all },
    ...leadStatuses.map((s) => ({ value: s, label: leadStatusLabels[s], count: counts[s] ?? 0 })),
  ];
});

const hasFilters = computed(() => Boolean(filters.value.q || filters.value.source || filters.value.product || filters.value.from || filters.value.to));
const resetFilters = () => {
  search.value = '';
  void router.replace({ name: 'leads', query: filters.value.status === 'all' ? {} : { status: filters.value.status } });
};

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / PAGE_SIZE)));
const goPage = (page: number) => void router.replace({ name: 'leads', query: { ...route.query, page: page > 1 ? String(page) : undefined } });

const open = (lead: LeadItem) => void router.push({ name: 'lead', params: { id: lead.id }, query: route.query });

const orderLine = (lead: LeadItem) =>
  [productLabels[lead.product], lead.themeSlug ? themes[lead.themeSlug]?.name : null, lead.namedLinks ? `${lead.namedLinks} ссылок` : null]
    .filter(Boolean)
    .join(' · ');
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Заявки</h1>
        <p class="text-sm text-muted-foreground">
          <template v-if="data">Найдено: {{ data.total }}</template>
          <template v-else>&nbsp;</template>
        </p>
      </div>
    </div>

    <!-- вкладки статусов: горизонтальный скролл на телефоне -->
    <div class="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <div class="inline-flex gap-1 rounded-lg bg-muted p-1">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm"
          :data-active="filters.status === tab.value"
          @click="setFilters({ status: tab.value })"
        >
          {{ tab.label }}
          <span class="text-xs tabular-nums opacity-60">{{ tab.count }}</span>
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="relative w-full sm:w-72">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" placeholder="Имя, контакт, номер заявки" class="pl-8" />
      </div>
      <Select :model-value="filters.source ?? ANY" @update:model-value="(v) => setFilters({ source: v as LeadSource })">
        <SelectTrigger class="w-[calc(50%-4px)] sm:w-48"><SelectValue placeholder="Источник" /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ANY">Все источники</SelectItem>
          <SelectItem v-for="s in leadSources" :key="s" :value="s">{{ leadSourceLabels[s] }}</SelectItem>
        </SelectContent>
      </Select>
      <Select :model-value="filters.product ?? ANY" @update:model-value="(v) => setFilters({ product: v as Product })">
        <SelectTrigger class="w-[calc(50%-4px)] sm:w-48"><SelectValue placeholder="Продукт" /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="ANY">Все продукты</SelectItem>
          <SelectItem v-for="p in products" :key="p" :value="p">{{ productLabels[p] }}</SelectItem>
        </SelectContent>
      </Select>
      <div class="flex items-center gap-1.5">
        <Input type="date" class="w-36" :model-value="filters.from ?? ''" aria-label="С даты" @change="(e: Event) => setFilters({ from: (e.target as HTMLInputElement).value })" />
        <span class="text-muted-foreground">—</span>
        <Input type="date" class="w-36" :model-value="filters.to ?? ''" aria-label="По дату" @change="(e: Event) => setFilters({ to: (e.target as HTMLInputElement).value })" />
      </div>
      <Button v-if="hasFilters" variant="ghost" size="sm" @click="resetFilters">
        <XIcon />
        Сбросить
      </Button>
    </div>

    <div class="overflow-hidden rounded-xl border bg-background" :class="{ 'opacity-70 transition-opacity': isFetching && !isPending }">
      <div v-if="isPending" class="divide-y">
        <div v-for="i in 6" :key="i" class="flex items-center gap-4 p-4">
          <Skeleton class="h-4 w-10" />
          <Skeleton class="h-4 w-40" />
          <Skeleton class="ml-auto h-6 w-24 rounded-full" />
        </div>
      </div>

      <Empty v-else-if="isError" class="py-14">
        <EmptyHeader>
          <EmptyTitle>Не удалось загрузить заявки</EmptyTitle>
          <EmptyDescription>Проверьте соединение и попробуйте ещё раз</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" @click="refetch()">Повторить</Button>
      </Empty>

      <Empty v-else-if="!data?.items.length" class="py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
          <EmptyTitle>{{ hasFilters || filters.status !== 'all' ? 'Ничего не нашлось' : 'Заявок пока нет' }}</EmptyTitle>
          <EmptyDescription>
            {{ hasFilters || filters.status !== 'all' ? 'Попробуйте изменить фильтры' : 'Как только кто-то оставит заявку на сайте, она появится здесь' }}
          </EmptyDescription>
        </EmptyHeader>
        <Button v-if="hasFilters" variant="outline" size="sm" @click="resetFilters">Сбросить фильтры</Button>
      </Empty>

      <template v-else>
        <!-- телефон: карточки -->
        <ul class="divide-y md:hidden">
          <li v-for="lead in data.items" :key="lead.id">
            <button type="button" class="flex w-full flex-col gap-1.5 p-4 text-left active:bg-muted/60" @click="open(lead)">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate font-medium">{{ lead.name }}</span>
                <StatusBadge :status="lead.status as LeadStatus" />
              </div>
              <div class="truncate text-sm text-muted-foreground">{{ orderLine(lead) }}</div>
              <div class="flex items-center justify-between text-xs text-muted-foreground">
                <span>#{{ lead.id }} · {{ formatAgo(lead.createdAt) }}</span>
                <span v-if="lead.amount != null" class="font-medium text-foreground tabular-nums">{{ rub(lead.amount) }}</span>
              </div>
            </button>
          </li>
        </ul>

        <!-- компьютер: таблица -->
        <Table class="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead class="w-16 pl-4">№</TableHead>
              <TableHead class="w-36">Дата</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Заказ</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="pr-4 text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="lead in data.items" :key="lead.id" class="cursor-pointer" @click="open(lead)">
              <TableCell class="pl-4 text-muted-foreground tabular-nums">{{ lead.id }}</TableCell>
              <TableCell class="text-muted-foreground" :title="formatAgo(lead.createdAt)">{{ formatDateTime(lead.createdAt) }}</TableCell>
              <TableCell>
                <div class="font-medium">{{ lead.name }}</div>
                <div class="text-xs text-muted-foreground">{{ contactMethodLabels[lead.contactMethod] }} · {{ lead.contact }}</div>
              </TableCell>
              <TableCell class="max-w-64 truncate">{{ orderLine(lead) }}</TableCell>
              <TableCell class="text-muted-foreground">{{ leadSourceLabels[lead.source] }}</TableCell>
              <TableCell><StatusBadge :status="lead.status as LeadStatus" /></TableCell>
              <TableCell class="pr-4 text-right tabular-nums">
                <span v-if="lead.amount != null" class="font-medium">{{ rub(lead.amount) }}</span>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </template>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-between text-sm text-muted-foreground">
      <span>Страница {{ filters.page }} из {{ totalPages }}</span>
      <div class="flex gap-1">
        <Button variant="outline" size="icon-sm" :disabled="filters.page <= 1" aria-label="Назад" @click="goPage(filters.page - 1)"><ChevronLeftIcon /></Button>
        <Button variant="outline" size="icon-sm" :disabled="filters.page >= totalPages" aria-label="Вперёд" @click="goPage(filters.page + 1)"><ChevronRightIcon /></Button>
      </div>
    </div>

    <RouterView />
  </div>
</template>
