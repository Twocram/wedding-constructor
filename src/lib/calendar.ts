import type { CollectionEntry } from 'astro:content';

type Inv = CollectionEntry<'invitations'>['data'];

// время «плавающее» (без часового пояса): календарь гостя покажет его как есть — как и написано в приглашении
const HOURS = 6;
const stamp = (d: Date) => d.toISOString().slice(0, 19).replace(/[-:]/g, '');

export function calendarEvent(inv: Inv, url: string) {
  if (!inv.countdown) return null;
  // парсим как UTC, только чтобы сложить часы без влияния пояса сборки
  const start = new Date(`${inv.countdown.slice(0, 19)}Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + HOURS * 36e5);
  const title = `Свадьба: ${inv.groom} & ${inv.bride}`;
  const location = inv.venue ? `${inv.venue.name}, ${inv.venue.address}` : (inv.city ?? '');
  const details = `Приглашение: ${url}`;
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    location,
    details,
  })}`;
  return { start: stamp(start), end: stamp(end), title, location, details, google };
}

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

// RFC 5545: строки не длиннее 75 октетов, перенос — CRLF + пробел; режем по байтам, не разрывая кириллицу
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
};

export function icsFile(ev: NonNullable<ReturnType<typeof calendarEvent>>, uid: string) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wedding Constructor//RU',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${ev.start}`,
    `DTEND:${ev.end}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.location && `LOCATION:${esc(ev.location)}`,
    `DESCRIPTION:${esc(ev.details)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(ev.title)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).map((l) => fold(l as string)).join('\r\n') + '\r\n';
}
