// Витрина: контакты для заказа; цены и темы — в @saywed/shared.
export { prices, rub, type ThemeInfo, themePrice, themes } from '@saywed/shared'

// Telegram для заказов (без @); на сайте показываем имя, а не логин
export const orderTelegram = 'Pie_lie_die96'
export const orderContactTo = 'Сергею'

export const messageUrl = (text: string) => `https://t.me/${orderTelegram}?text=${encodeURIComponent(text)}`

// оператор персональных данных для /privacy
export const legal = {
  // самозанятый: ФИО и ИНН, ОГРНИП у самозанятого нет
  operator: 'Маслов Артём Александрович',
  inn: '592009943269',
  updated: '2 ноября 2026',
}

// форма заявки включается после запуска API: PUBLIC_LEAD_FORM=true при сборке; локально — всегда
export const leadFormEnabled = import.meta.env.PUBLIC_LEAD_FORM === 'true' || import.meta.env.DEV

export function orderUrl(themeName?: string) {
  return messageUrl(themeName
    ? `Здравствуйте! Хочу приглашение в стиле «${themeName}»`
    : 'Здравствуйте! Хочу заказать свадебное приглашение')
}
