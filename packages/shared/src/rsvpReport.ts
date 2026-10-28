// сводка и выгрузка ответов гостей — без zod: модуль грузится в браузер на странице для пары

export const attendingValues = ['yes', 'no'] as const
export type Attending = (typeof attendingValues)[number]

export const attendingLabels: Record<Attending, string> = {
  yes: 'Придёт',
  no: 'Не сможет',
}

export interface RsvpAnswer {
  name: string
  attending: Attending
  drinks: string[]
  plusOne: boolean
  notes: string | null
  guest: string | null
  createdAt: string
}

// один гость = одно имя: «Ольга Иванова» и «ольга  иванова» — тот же человек
const personKey = (name: string) => name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

// гость передумал и ответил снова — считаем только последний ответ; items приходят от новых к старым
export function latestAnswers<T extends RsvpAnswer>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = personKey(item.name)
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
}

// по именной ссылке ответил кто-то с другим именем — паре стоит это видеть
export const answeredForOther = (item: RsvpAnswer) => Boolean(item.guest) && personKey(item.guest!) !== personKey(item.name)

// сводка для пары и админки: сколько придёт людей с учётом пар и что заказать из напитков
export function rsvpSummary(all: RsvpAnswer[]) {
  const items = latestAnswers(all)
  const yes = items.filter(i => i.attending === 'yes')
  const drinks: Record<string, number> = {}
  for (const item of yes) {
    for (const drink of item.drinks) drinks[drink] = (drinks[drink] ?? 0) + 1
  }
  return {
    total: items.length,
    yes: yes.length,
    no: items.length - yes.length,
    people: yes.reduce((sum, i) => sum + (i.plusOne ? 2 : 1), 0),
    drinks: Object.entries(drinks).sort((a, b) => b[1] - a[1]),
  }
}

// Excel выполняет ячейку, начинающуюся с = + - @, как формулу: гость мог вписать ссылку или макрос — ставим апостроф
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// точка с запятой и BOM: русский Excel иначе открывает файл одной колонкой и кракозябрами; в файл — только актуальные ответы
export function rsvpCsv(all: RsvpAnswer[]) {
  const head = ['Дата', 'Имя', 'Ответ', 'С парой', 'Напитки', 'Пожелания', 'Именная ссылка']
  const rows = latestAnswers(all).map(i => [
    new Date(i.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
    i.name,
    attendingLabels[i.attending],
    i.plusOne ? 'да' : '',
    i.drinks.join(', '),
    i.notes ?? '',
    i.guest ?? '',
  ])
  return `\uFEFF${[head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n')}`
}
