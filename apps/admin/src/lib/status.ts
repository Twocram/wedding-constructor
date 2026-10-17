import type { LeadStatus } from '@saywed/shared'

// цвет статуса — один на бейдж, точку в списке и вкладку
export const statusTone: Record<LeadStatus, { badge: string, dot: string }> = {
  new: { badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  contacted: { badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  in_progress: { badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  done: { badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  lost: { badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' },
}
