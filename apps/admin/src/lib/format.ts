// всё время в админке — московское, как у клиентов
const TZ = 'Europe/Moscow';

const dateTime = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dateTimeYear = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });

type DateLike = string | Date;

export const formatDateTime = (value: DateLike) => {
  const d = new Date(value);
  return (d.getFullYear() === new Date().getFullYear() ? dateTime : dateTimeYear).format(d);
};

// дата события хранится как YYYY-MM-DD без времени
export const formatEventDate = (ymd: string) => dateOnly.format(new Date(`${ymd}T12:00:00+03:00`));

export const formatAgo = (value: DateLike) => {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
};
