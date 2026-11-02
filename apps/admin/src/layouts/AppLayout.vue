<script setup lang="ts">
import { ChevronDownIcon, LogOutIcon } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useNewLeadsCount } from '@/composables/useLeads'
import { useLogout, useSession } from '@/composables/useSession'
import { useTgSubscribers } from '@/composables/useTelegram'

const { data: user } = useSession()
const { data: newCount } = useNewLeadsCount()
const logout = useLogout()
const { data: subscribers } = useTgSubscribers()
const pendingSubscribers = computed(() => subscribers.value?.items.filter(s => s.status === 'pending').length ?? 0)

const route = useRoute()
const sections = computed(() => [
  {
    label: 'Заявки',
    badge: newCount.value,
    badgeClass: 'bg-sky-500',
    pages: [{ name: 'leads', label: 'Список' }, { name: 'dashboard', label: 'Дашборд' }],
  },
  {
    label: 'Коммуникации',
    badge: pendingSubscribers.value,
    badgeClass: 'bg-amber-500',
    pages: [{ name: 'invitations', label: 'Приглашения' }, { name: 'notifications', label: 'Уведомления' }],
  },
])
const currentSection = computed(() => sections.value.find(s => s.pages.some(page => route.matched.some(r => r.name === page.name))) ?? sections.value[0]!)
</script>

<template>
  <TooltipProvider>
    <div class="min-h-svh bg-muted/30">
      <header class="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-6">
          <RouterLink :to="{ name: 'leads' }" class="hidden items-center gap-2.5 font-medium sm:flex">
            <img src="/favicon.svg" alt="" class="size-7 rounded-md border">
            saywed
          </RouterLink>

          <nav class="inline-flex min-w-0 gap-1 rounded-lg bg-muted p-1" aria-label="Разделы">
            <RouterLink
              v-for="section in sections"
              :key="section.label"
              :to="{ name: section.pages[0]!.name }"
              class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm sm:px-3"
              :data-active="section === currentSection"
            >
              {{ section.label }}
              <span v-if="section.badge" class="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold text-white tabular-nums" :class="section.badgeClass">
                {{ section.badge }}
              </span>
            </RouterLink>
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="sm" class="ml-auto gap-2">
                <span class="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">{{ user?.name?.[0] }}</span>
                <span class="hidden sm:inline">{{ user?.name }}</span>
                <ChevronDownIcon class="hidden text-muted-foreground sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuLabel class="font-normal">
                <div class="text-sm font-medium">
                  {{ user?.name }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ user?.login }}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem @select="logout.mutate()">
                <LogOutIcon />
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 pt-3 pb-6 sm:pt-4 sm:pb-8">
        <nav class="mb-5 flex gap-5 border-b" aria-label="Страницы раздела">
          <RouterLink
            v-for="page in currentSection.pages"
            :key="page.name"
            :to="{ name: page.name }"
            class="-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent text-sm text-muted-foreground transition-colors hover:text-foreground"
            active-class="border-foreground! text-foreground!"
          >
            {{ page.label }}
            <span v-if="page.name === 'notifications' && pendingSubscribers" class="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">
              {{ pendingSubscribers }}
            </span>
          </RouterLink>
        </nav>

        <RouterView />
      </main>
    </div>
  </TooltipProvider>
</template>
