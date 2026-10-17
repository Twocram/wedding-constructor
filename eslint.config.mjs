import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  astro: true,
  typescript: true,
  ignores: [
    '**/dist',
    '**/.astro',
    'promo',
    // сгенерированное: миграции drizzle-kit и компоненты shadcn-vue (обновляются их CLI)
    'apps/api/drizzle',
    'apps/admin/src/components/ui',
  ],
}, {
  // серверный код на Bun: await на верхнем уровне — норма, а лог в консоль — это журнал systemd
  files: ['apps/api/src/**', 'apps/site/src/pages/og/**'],
  rules: {
    'antfu/no-top-level-await': 'off',
    'no-console': 'off',
  },
})
