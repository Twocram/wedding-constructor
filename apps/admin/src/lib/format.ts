// всё время в админке — московское, как у клиентов
const TZ = 'Europe/Moscow'

const dateTime = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dateTimeYear = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
const relative = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })

type DateLike = string | Date

export function formatDateTime(value: DateLike) {
  const d = new Date(value)
  return (d.getFullYear() === new Date().getFullYear() ? dateTime : dateTimeYear).format(d)
}

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 0 })
const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
const monthLong = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// подписи оси: «8 тыс.», «1,2 млн»
export const formatCompact = (n: number) => compact.format(n)
export const formatPercent = (n: number) => percent.format(n)

// ключ месяца из API — «2026-10»
function monthDate(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}
export const formatMonthShort = (key: string) => monthShort.format(monthDate(key)).replace('.', '')
export const formatMonthLong = (key: string) => monthLong.format(monthDate(key)).replace(' г.', '')

// дата события хранится как YYYY-MM-DD без времени
export const formatEventDate = (ymd: string) => dateOnly.format(new Date(`${ymd}T12:00:00+03:00`))

export function formatAgo(value: DateLike) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000)
  if (Math.abs(minutes) < 60)
    return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24)
    return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}
