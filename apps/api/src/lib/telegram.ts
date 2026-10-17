import {
  contactMethodLabels,
  contactUrl,
  eventTypeLabels,
  leadSourceLabels,
  prices,
  productLabels,
  rub,
  themes,
} from '@saywed/shared';
import type { LeadRow } from '../db/schema';
import { env } from '../env';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const sendTelegram = async (html: string) => {
  if (!env.tgBotToken || !env.tgChatId) return;
  const res = await fetch(`https://api.telegram.org/bot${env.tgBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.tgChatId,
      text: html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
};

// ориентир по цене из прайса — чтобы сразу видеть порядок суммы
const estimate = (lead: LeadRow) => {
  const base = lead.product === 'custom' ? prices.custom : lead.product === 'template' ? prices.template : 0;
  if (!base) return undefined;
  return base + (lead.namedLinks ?? 0) * prices.named;
};

export const notifyNewLead = (lead: LeadRow) => {
  const theme = lead.themeSlug ? themes[lead.themeSlug]?.name ?? lead.themeSlug : undefined;
  const total = estimate(lead);
  const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ');
  const contacts = env.tgNotifyContacts
    ? [
        `<b>${escape(lead.name)}</b>`,
        `${contactMethodLabels[lead.contactMethod]}: <a href="${contactUrl(lead.contactMethod, lead.contact)}">${escape(lead.contact)}</a>`,
      ]
    : [`Связь: ${contactMethodLabels[lead.contactMethod]} — контакт в админке`];
  const lines = [
    `🆕 <b>Заявка #${lead.id}</b>`,
    '',
    ...contacts,
    '',
    `${productLabels[lead.product]}${theme ? ` · ${escape(theme)}` : ''}`,
    `${eventTypeLabels[lead.eventType]}${lead.eventDate ? `, ${lead.eventDate}` : ''}`,
    lead.namedLinks ? `Именных ссылок: ${lead.namedLinks}` : '',
    total ? `Ориентир: ${rub(total)}` : '',
    lead.message ? (env.tgNotifyContacts ? `\n💬 ${escape(lead.message)}` : '\n💬 Есть комментарий') : '',
    '',
    `Источник: ${leadSourceLabels[lead.source]}${lead.sourcePath ? ` (${escape(lead.sourcePath)})` : ''}`,
    utm ? `UTM: ${escape(utm)}` : '',
    `<a href="${env.adminUrl}/leads/${lead.id}">Открыть в админке</a>`,
  ];
  return sendTelegram(lines.filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n'));
};
