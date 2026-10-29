import { invitationUrl } from '@saywed/shared'

// демо каталога открываются по пути на основном домене, приглашения клиентов — на своём поддомене
export function invitationPageUrl(slug: string, demo: boolean, site: URL | undefined) {
  return demo ? new URL(`/${slug}`, site).href : `${invitationUrl(slug)}/`
}
