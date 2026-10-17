// Витрина: контакты для заказа; цены и темы — в @saywed/shared.
export { prices, rub, type ThemeInfo, themes } from '@saywed/shared'

// Telegram для заказов (без @)
export const orderTelegram = 'sad_arty'

export const messageUrl = (text: string) => `https://t.me/${orderTelegram}?text=${encodeURIComponent(text)}`

// оператор персональных данных для /privacy: без реальных реквизитов форму в проде не включаем
export const legal = {
  operator: '[ФИО индивидуального предпринимателя]',
  inn: '[ИНН]',
  ogrnip: '[ОГРНИП]',
  email: '[email для обращений]',
  updated: '17 октября 2026',
}

// форма заявки включается после запуска API: PUBLIC_LEAD_FORM=true при сборке; локально — всегда
export const leadFormEnabled = import.meta.env.PUBLIC_LEAD_FORM === 'true' || import.meta.env.DEV

export function orderUrl(themeName?: string) {
  return messageUrl(themeName
    ? `Здравствуйте! Хочу приглашение в стиле «${themeName}»`
    : 'Здравствуйте! Хочу заказать свадебное приглашение')
}
