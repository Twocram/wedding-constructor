import type { QueryClient } from '@tanstack/vue-query'
import { createRouter, createWebHistory } from 'vue-router'
import { loadSession } from '@/composables/useSession'

export function createAppRouter(queryClient: QueryClient) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
      {
        path: '/',
        component: () => import('@/layouts/AppLayout.vue'),
        children: [
          { path: '', redirect: { name: 'leads' } },
          { path: 'dashboard', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
          {
            path: 'leads',
            name: 'leads',
            component: () => import('@/pages/LeadsPage.vue'),
            // карточка заявки — боковая панель поверх списка, у неё свой адрес, чтобы делиться ссылкой на заявку
            children: [{ path: ':id(\\d+)', name: 'lead', component: () => import('@/components/LeadSheet.vue'), props: true }],
          },
        ],
      },
      { path: '/:pathMatch(.*)*', redirect: { name: 'leads' } },
    ],
  })

  router.beforeEach(async (to) => {
    const user = await loadSession(queryClient)
    if (!to.meta.public && !user)
      return { name: 'login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} }
    if (to.name === 'login' && user)
      return { name: 'leads' }
  })

  return router
}
