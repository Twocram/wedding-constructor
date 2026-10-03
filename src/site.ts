// Витрина: контакты для заказа и описания тем. Порядок тем в `themes` = порядок карточек в каталоге.

// ponytail: плейсхолдер — заменить на реальный Telegram-юзернейм для заказов (без @)
export const orderTelegram = 'wedding_constructor';

export const orderUrl = (themeName?: string) => {
  const text = themeName
    ? `Здравствуйте! Хочу приглашение в стиле «${themeName}»`
    : 'Здравствуйте! Хочу заказать свадебное приглашение';
  return `https://t.me/${orderTelegram}?text=${encodeURIComponent(text)}`;
};

export type ThemeInfo = { name: string; tagline: string; tags: string[]; isNew?: boolean };

export const themes: Record<string, ThemeInfo> = {
  cover: { name: 'Cover', tagline: 'Классика с конвертом и сургучной печатью', tags: ['Светлая', 'Конверт'] },
  botanical: { name: 'Botanical', tagline: 'Эвкалипт, крафт и садовая нежность', tags: ['Светлая', 'Ботаника'] },
  editorial: { name: 'Editorial', tagline: 'Журнальная вёрстка, воздух и тонкая типографика', tags: ['Светлая', 'Минимализм'] },
  watercolor: { name: 'Watercolor', tagline: 'Акварель и пастель — как открытка ручной работы', tags: ['Светлая', 'Нежная'] },
  luxe: { name: 'Luxe', tagline: 'Мрамор, золото и тонкая рамка — дорогая классика', tags: ['Светлая', 'Премиум'] },
  amalfi: { name: 'Amalfi', tagline: 'Вечер у моря: ночное небо, золото и арки', tags: ['Тёмная', 'Destination'] },
  deco: { name: 'Deco', tagline: 'Ар-деко: золотая рамка, геометрия, Гэтсби', tags: ['Тёмная', 'Вечерняя'] },
  vogue: { name: 'Vogue', tagline: 'Чёрно-белый глянец: крупная типографика, ноль декора', tags: ['Тёмная', 'Минимализм'] },
  ticket: { name: 'Ticket', tagline: 'Посадочный талон для свадьбы-путешествия', tags: ['Светлая', 'Необычная'], isNew: true },
  cinema: { name: 'Cinema', tagline: 'Кино одним экраном: сцены, титры, премьера', tags: ['Тёмная', 'Одним экраном'], isNew: true },
  coquette: { name: 'Coquette', tagline: 'Банты, жемчуг и пудровый розовый — нежная кокетка', tags: ['Светлая', 'Нежная'], isNew: true },
  toile: { name: 'Toile de Jouy', tagline: 'Синий фарфор: чернильный принт и кремовая бумага', tags: ['Светлая', 'Классика'], isNew: true },
  stories: { name: 'Stories', tagline: 'Как сторис в Instagram: тапы, стикеры, опрос «Придёте?»', tags: ['Новинка', 'Одним экраном'], isNew: true },
};
