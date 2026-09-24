import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { calendarEvent, icsFile } from '../../lib/calendar';

// файл для «Добавить в календарь» (iPhone, Outlook); только у приглашений с датой-временем
export const getStaticPaths = (async () => {
  const invitations = await getCollection('invitations');
  return invitations.filter((inv) => inv.data.countdown).map((inv) => ({ params: { slug: inv.id }, props: { inv: inv.data } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params, props, site }) => {
  const { inv } = props as { inv: CollectionEntry<'invitations'>['data'] };
  const url = new URL(`/${params.slug}`, site).href;
  const ev = calendarEvent(inv, url)!;
  return new Response(icsFile(ev, `${params.slug}@${new URL(url).host}`), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
