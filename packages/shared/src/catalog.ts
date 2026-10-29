// Каталог и цены — общие для сайта, API и админки. Порядок тем в `themes` = порядок карточек в каталоге.

export const prices = { template: 4000, custom: 8000, named: 200 }

export const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`

export interface ThemeInfo { name: string, tagline: string, tags: string[], isNew?: boolean }

export const themes: Record<string, ThemeInfo> = {
  stories: { name: 'Stories', tagline: 'Как сторис в Instagram: тапы, стикеры, опрос «Придёте?»', tags: ['Новинка', 'Одним экраном'], isNew: true },
  deco: { name: 'Deco', tagline: 'Ар-деко: золотая рамка, геометрия, Гэтсби', tags: ['Тёмная', 'Вечерняя'] },
  cover: { name: 'Cover', tagline: 'Классика с конвертом и сургучной печатью', tags: ['Светлая', 'Конверт'] },
  cinema: { name: 'Cinema', tagline: 'Кино одним экраном: сцены, титры, премьера', tags: ['Тёмная', 'Одним экраном'], isNew: true },
  vogue: { name: 'Vogue', tagline: 'Чёрно-белый глянец: крупная типографика, ноль декора', tags: ['Тёмная', 'Минимализм'] },
  amalfi: { name: 'Amalfi', tagline: 'Вечер у моря: ночное небо, золото и арки', tags: ['Тёмная', 'Destination'] },
  coquette: { name: 'Coquette', tagline: 'Банты, жемчуг и пудровый розовый — нежная кокетка', tags: ['Светлая', 'Нежная'], isNew: true },
  watercolor: { name: 'Watercolor', tagline: 'Акварель и пастель — как открытка ручной работы', tags: ['Светлая', 'Нежная'] },
  ticket: { name: 'Ticket', tagline: 'Посадочный талон для свадьбы-путешествия', tags: ['Светлая', 'Необычная'], isNew: true },
  luxe: { name: 'Luxe', tagline: 'Мрамор, золото и тонкая рамка — дорогая классика', tags: ['Светлая', 'Премиум'] },
  botanical: { name: 'Botanical', tagline: 'Эвкалипт, крафт и садовая нежность', tags: ['Светлая', 'Ботаника'] },
  toile: { name: 'Toile de Jouy', tagline: 'Синий фарфор: чернильный принт и кремовая бумага', tags: ['Светлая', 'Классика'], isNew: true },
  editorial: { name: 'Editorial', tagline: 'Журнальная вёрстка, воздух и тонкая типографика', tags: ['Светлая', 'Минимализм'] },
}
