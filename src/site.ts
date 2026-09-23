// Витрина: контакты для заказа и описания тем. Порядок тем в `themes` = порядок карточек в каталоге.

// ponytail: плейсхолдер — заменить на реальный Telegram-юзернейм для заказов (без @)
export const orderTelegram = 'wedding_constructor';

export const orderUrl = (themeName?: string) => {
  const text = themeName
    ? `Здравствуйте! Хочу приглашение в стиле «${themeName}»`
    : 'Здравствуйте! Хочу заказать свадебное приглашение';
  return `https://t.me/${orderTelegram}?text=${encodeURIComponent(text)}`;
};

export type ThemeInfo = { name: string; tagline: string; tags: string[] };

export const themes: Record<string, ThemeInfo> = {
  cover: { name: 'Cover', tagline: 'Классика с конвертом и сургучной печатью', tags: ['Светлая', 'Конверт'] },
  editorial: { name: 'Editorial', tagline: 'Журнальная вёрстка, воздух и тонкая типографика', tags: ['Светлая', 'Минимализм'] },
  amalfi: { name: 'Amalfi', tagline: 'Вечер у моря: ночное небо, золото и арки', tags: ['Тёмная', 'Destination'] },
  deco: { name: 'Deco', tagline: 'Ар-деко: золотая рамка, геометрия, Гэтсби', tags: ['Тёмная', 'Вечерняя'] },
  ticket: { name: 'Ticket', tagline: 'Посадочный талон для свадьбы-путешествия', tags: ['Светлая', 'Необычная'] },
  cinema: { name: 'Cinema', tagline: 'Кино одним экраном: сцены, титры, премьера', tags: ['Тёмная', 'Одним экраном'] },
};
