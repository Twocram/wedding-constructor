// русские плюралы для таймеров: pluralRu(3, ['день','дня','дней']) → 'дня'
const rules = new Intl.PluralRules('ru-RU');
export const pluralRu = (n: number, [one, few, many]: [string, string, string]): string => {
  const rule = rules.select(n);
  return rule === 'one' ? one : rule === 'few' ? few : many;
};
