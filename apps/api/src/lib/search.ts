type Searchable = { name: string; contact: string; message?: string | null };

export const leadSearchText = (lead: Searchable) => [lead.name, lead.contact, lead.message ?? ''].join('\n').toLowerCase();
