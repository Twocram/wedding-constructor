<script setup lang="ts">
import {
  contactMethodLabels,
  contactMethods,
  eventTypeLabels,
  eventTypes,
  productLabels,
  products,
  themes,
  type ContactMethod,
  type EventType,
  type LeadPatch,
  type Product,
} from '@saywed/shared';
import { reactive, ref } from 'vue';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateLead, type LeadDetail } from '@/composables/useLeads';
import { ApiError } from '@/lib/api';

const props = defineProps<{ lead: LeadDetail['lead'] }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const NO_THEME = 'none';

const initial: {
  name: string;
  contactMethod: ContactMethod;
  contact: string;
  product: Product;
  themeSlug: string;
  eventType: EventType;
  eventDate: string;
  namedLinks: string | number;
  message: string;
} = {
  name: props.lead.name,
  contactMethod: props.lead.contactMethod as ContactMethod,
  contact: props.lead.contact,
  product: props.lead.product as Product,
  themeSlug: props.lead.themeSlug ?? NO_THEME,
  eventType: props.lead.eventType as EventType,
  eventDate: props.lead.eventDate ?? '',
  namedLinks: props.lead.namedLinks == null ? '' : String(props.lead.namedLinks),
  message: props.lead.message ?? '',
};
const form = reactive({ ...initial });
const errors = ref<Record<string, string[] | undefined>>({});
const update = useUpdateLead(() => props.lead.id);

const toPatch = (f: typeof initial) => ({
  name: f.name.trim(),
  contactMethod: f.contactMethod,
  contact: f.contact.trim(),
  product: f.product,
  themeSlug: f.themeSlug === NO_THEME ? null : f.themeSlug,
  eventType: f.eventType,
  eventDate: f.eventDate || null,
  namedLinks: String(f.namedLinks ?? '').trim() === '' ? null : Math.round(Number(f.namedLinks)),
  message: f.message.trim() || null,
});

// отправляем только то, что поменяли в этой форме, — сравнение со снимком на момент открытия,
// а не со свежими данными: иначе чужая правка, пришедшая фоном, откатилась бы нашим старым значением
const changes = (): LeadPatch => {
  const before = toPatch(initial);
  const after = toPatch(form);
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => v !== before[k as keyof typeof before])) as LeadPatch;
};

const submit = () => {
  const patch = changes();
  if (!Object.keys(patch).length) return emit('cancel');
  errors.value = {};
  update.mutate(patch, {
    onSuccess: () => {
      toast.success('Данные обновлены');
      emit('saved');
    },
    onError: (error) => {
      if (error instanceof ApiError) errors.value = error.fieldErrors;
      toast.error(error.message);
    },
  });
};
</script>

<template>
  <form class="rounded-xl border p-4" @submit.prevent="submit">
    <FieldGroup class="gap-4">
      <Field :data-invalid="Boolean(errors.name)">
        <FieldLabel for="edit-name">Имя</FieldLabel>
        <Input id="edit-name" v-model="form.name" />
        <FieldError :errors="errors.name" />
      </Field>
      <div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field>
          <FieldLabel>Связь</FieldLabel>
          <Select v-model="form.contactMethod">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="m in contactMethods" :key="m" :value="m">{{ contactMethodLabels[m] }}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field :data-invalid="Boolean(errors.contact)">
          <FieldLabel for="edit-contact">Контакт</FieldLabel>
          <Input id="edit-contact" v-model="form.contact" />
          <FieldError :errors="errors.contact" />
        </Field>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Продукт</FieldLabel>
          <Select v-model="form.product">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="p in products" :key="p" :value="p">{{ productLabels[p] }}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Дизайн</FieldLabel>
          <Select v-model="form.themeSlug">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_THEME">Не выбран</SelectItem>
              <SelectItem v-for="(t, key) in themes" :key="key" :value="key">{{ t.name }}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Событие</FieldLabel>
          <Select v-model="form.eventType">
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="e in eventTypes" :key="e" :value="e">{{ eventTypeLabels[e] }}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field :data-invalid="Boolean(errors.eventDate)">
          <FieldLabel for="edit-date">Дата события</FieldLabel>
          <Input id="edit-date" v-model="form.eventDate" type="date" />
          <FieldError :errors="errors.eventDate" />
        </Field>
        <Field :data-invalid="Boolean(errors.namedLinks)">
          <FieldLabel for="edit-named">Именные ссылки</FieldLabel>
          <Input id="edit-named" v-model="form.namedLinks" type="number" min="0" inputmode="numeric" placeholder="0" />
          <FieldError :errors="errors.namedLinks" />
        </Field>
      </div>
      <Field :data-invalid="Boolean(errors.message)">
        <FieldLabel for="edit-message">Комментарий клиента</FieldLabel>
        <Textarea id="edit-message" v-model="form.message" rows="3" />
        <FieldError :errors="errors.message" />
      </Field>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" @click="emit('cancel')">Отмена</Button>
        <Button type="submit" :disabled="update.isPending.value">Сохранить</Button>
      </div>
    </FieldGroup>
  </form>
</template>
