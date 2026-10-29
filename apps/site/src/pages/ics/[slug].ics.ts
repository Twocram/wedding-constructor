import type { APIRoute, GetStaticPaths } from 'astro'
import type { CollectionEntry } from 'astro:content'
import { getCollection } from 'astro:content'
import { calendarEvent, icsFile } from '../../lib/calendar'
import { invitationPageUrl } from '../../lib/invitationUrl'

// файл для «Добавить в календарь» (iPhone, Outlook); только у приглашений с датой-временем
export const getStaticPaths = (async () => {
  const invitations = await getCollection('invitations')
  return invitations.filter(inv => inv.data.countdown).map(inv => ({ params: { slug: inv.id }, props: { inv: inv.data } }))
}) satisfies GetStaticPaths

export const GET: APIRoute = ({ params, props, site }) => {
  const { inv } = props as { inv: CollectionEntry<'invitations'>['data'] }
  const ev = calendarEvent(inv, invitationPageUrl(params.slug!, inv.demo, site))!
  return new Response(icsFile(ev, `${params.slug}@${new URL(site!).host}`), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  })
}
