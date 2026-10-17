<script setup lang="ts">
import { leadStatusLabels, type LeadStatus } from '@saywed/shared';
import { cn } from 'cn';
import { statusTone } from '@/lib/status';

defineProps<{ status: LeadStatus }>();
</script>

<template>
  <span :class="cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap', statusTone[status].badge)">
    <span :class="cn('size-1.5 rounded-full', statusTone[status].dot)" />
    {{ leadStatusLabels[status] }}
  </span>
</template>
