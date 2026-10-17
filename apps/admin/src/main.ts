import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';
import App from './App.vue';
import { setUnauthorizedHandler } from './lib/api';
import { createAppRouter } from './router';
import './style.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});
const router = createAppRouter(queryClient);

// сессия истекла посреди работы — на вход, а после входа вернёмся туда же
setUnauthorizedHandler(() => {
  queryClient.setQueryData(['me'], null);
  const current = router.currentRoute.value;
  if (current.name !== 'login') void router.replace({ name: 'login', query: { next: current.fullPath } });
});

// после деплоя старые файлы сборки удалены: открытая с прошлой версии вкладка перезагружается сама
const staleChunk = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/;
// одна попытка за минуту: если файла нет и после перезагрузки, бесконечного цикла не будет
const reloadOnce = (path: string) => {
  try {
    const last = Number(sessionStorage.getItem('saywed:chunk-reload'));
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('saywed:chunk-reload', String(Date.now()));
  } catch {}
  window.location.assign(path);
};
router.onError((error: Error, to) => {
  if (staleChunk.test(error.message)) reloadOnce(to.fullPath);
});
window.addEventListener('vite:preloadError', () => reloadOnce(window.location.pathname + window.location.search));

createApp(App).use(VueQueryPlugin, { queryClient }).use(router).mount('#app');
