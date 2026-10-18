// Палитра графиков проверена валидатором (CVD ΔE ≥ 9 между соседями, на белом фоне);
// у третьего цвета контраст < 3:1 — поэтому у графика выручки есть табличный вид.
// Порядок серий фиксирован: цвет закреплён за продуктом, а не за местом в стопке.
export const productSeries = [
  { key: 'template', label: 'Шаблон', color: '#2a78d6' },
  { key: 'custom', label: 'Индивидуальный', color: '#eb6834' },
  { key: 'unsure', label: 'Без типа', color: '#1baf7a' },
] as const

// один ряд значений — один цвет (первый слот), без раскраски по величине
export const singleSeriesColor = '#2a78d6'

export const chartChrome = {
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  muted: '#898781',
}

// «красивый» максимум оси: 1, 2, 2.5 или 5 × 10ⁿ на шаг, ~4 деления
export function niceScale(max: number, ticks = 4) {
  if (max <= 0)
    return { max: ticks, step: 1 }
  const raw = max / ticks
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw) ?? 10 * power
  return { max: step * Math.ceil(max / step), step }
}
