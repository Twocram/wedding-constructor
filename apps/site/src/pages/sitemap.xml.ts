import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { articles } from '../lib/articles'

// только то, что должно быть в поиске: личные приглашения и служебные страницы закрыты noindex
export const GET: APIRoute = async ({ site }) => {
  const demos = (await getCollection('invitations')).filter(inv => inv.data.demo).map(inv => `/${inv.id}/`)
  const urls = ['/', ...articles.map(a => a.path), ...demos].map(path => `<url><loc>${new URL(path, site)}</loc></url>`)
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
