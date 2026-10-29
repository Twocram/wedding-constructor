export const siteDomain = 'saywed.ru'

// приглашение клиента живёт на своём поддомене: <адрес>.saywed.ru; демо каталога — по пути saywed.ru/<адрес>
export const invitationHost = (slug: string) => `${slug}.${siteDomain}`
export const invitationUrl = (slug: string) => `https://${invitationHost(slug)}`
