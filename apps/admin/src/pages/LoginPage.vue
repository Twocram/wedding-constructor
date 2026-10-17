<script setup lang="ts">
import { reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useLogin } from '@/composables/useSession';
import { ApiError } from '@/lib/api';

const route = useRoute();
const router = useRouter();
const login = useLogin();
const form = reactive({ login: '', password: '' });

const submit = () =>
  login.mutate(form, {
    onSuccess: () => {
      // только свои пути: «//host» и «/\host» браузер понял бы как другой сайт
      const raw = route.query.next;
      const next = typeof raw === 'string' && /^\/(?![/\\])/.test(raw) ? raw : '/';
      void router.replace(next);
    },
  });

const errorText = (error: unknown) =>
  error instanceof ApiError && error.status === 429 ? 'Слишком много попыток. Попробуйте через 15 минут' : error instanceof Error ? error.message : 'Не удалось войти';
</script>

<template>
  <div class="grid min-h-svh place-items-center bg-muted/40 px-4">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center justify-center gap-2.5 text-lg font-medium">
        <span class="grid size-9 place-items-center rounded-full bg-[#78865a] font-serif text-xl text-[#f6f2ea] italic">&amp;</span>
        saywed
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Вход в админку</CardTitle>
          <CardDescription>Заявки с сайта и работа с заказами</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="submit">
            <FieldGroup>
              <Alert v-if="login.error.value" variant="destructive">
                <AlertDescription>{{ errorText(login.error.value) }}</AlertDescription>
              </Alert>
              <Field>
                <FieldLabel for="login">Логин</FieldLabel>
                <Input id="login" v-model="form.login" autocomplete="username" autofocus required />
              </Field>
              <Field>
                <FieldLabel for="password">Пароль</FieldLabel>
                <Input id="password" v-model="form.password" type="password" autocomplete="current-password" required />
              </Field>
              <Button type="submit" class="w-full" :disabled="login.isPending.value">
                <Spinner v-if="login.isPending.value" />
                Войти
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
