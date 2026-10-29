// подписчики бота уведомлений: нажал Start — ждёт одобрения в админке
export const tgSubscriberStatuses = ['pending', 'active', 'blocked'] as const
export type TgSubscriberStatus = (typeof tgSubscriberStatuses)[number]

export const tgSubscriberStatusLabels: Record<TgSubscriberStatus, string> = {
  pending: 'Ждёт одобрения',
  active: 'Получает уведомления',
  blocked: 'Заблокирован',
}
