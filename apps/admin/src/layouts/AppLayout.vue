<script setup lang="ts">
import { ChevronDownIcon, InboxIcon, LayoutDashboardIcon, LogOutIcon, MailIcon } from '@lucide/vue'
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

const { data: user } = useSession()
const { data: newCount } = useNewLeadsCount()
const logout = useLogout()
</script>

<template>
  <TooltipProvider>
    <div class="min-h-svh bg-muted/30">
      <header class="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-6">
          <RouterLink :to="{ name: 'leads' }" class="flex items-center gap-2.5 font-medium">
            <span class="grid size-7 place-items-center rounded-full bg-[#78865a] font-serif text-base text-[#f6f2ea] italic">&amp;</span>
            <span class="hidden sm:inline">saywed</span>
          </RouterLink>

          <nav class="flex items-center gap-1">
            <Button variant="ghost" size="sm" as-child>
              <RouterLink :to="{ name: 'leads' }" active-class="bg-muted text-foreground" class="text-muted-foreground" aria-label="Заявки">
                <InboxIcon />
                <span class="hidden sm:inline">Заявки</span>
                <span v-if="newCount" class="grid h-5 min-w-5 place-items-center rounded-full bg-sky-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">
                  {{ newCount }}
                </span>
              </RouterLink>
            </Button>
            <Button variant="ghost" size="sm" as-child>
              <RouterLink :to="{ name: 'invitations' }" active-class="bg-muted text-foreground" class="text-muted-foreground" aria-label="Приглашения">
                <MailIcon />
                <span class="hidden sm:inline">Приглашения</span>
              </RouterLink>
            </Button>
            <Button variant="ghost" size="sm" as-child>
              <RouterLink :to="{ name: 'dashboard' }" active-class="bg-muted text-foreground" class="text-muted-foreground" aria-label="Дашборд">
                <LayoutDashboardIcon />
                <span class="hidden sm:inline">Дашборд</span>
              </RouterLink>
            </Button>
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="sm" class="ml-auto gap-2">
                <span class="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">{{ user?.name?.[0] }}</span>
                <span class="hidden sm:inline">{{ user?.name }}</span>
                <ChevronDownIcon class="text-muted-foreground" />
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

      <main class="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <RouterView />
      </main>
    </div>
  </TooltipProvider>
</template>
