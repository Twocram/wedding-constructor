// сводка и выгрузка ответов гостей — без zod: модуль грузится в браузер на странице для пары
import { strToU8, zipSync } from 'fflate'
import { pluralRu } from './plural'

export const attendingValues = ['yes', 'no'] as const
export type Attending = (typeof attendingValues)[number]

export const attendingLabels: Record<Attending, string> = {
  yes: 'Придёт',
  no: 'Не сможет',
}

export interface RsvpAnswer {
  name: string
  attending: Attending
  drinks: string[]
  plusOne: boolean
  notes: string | null
  guest: string | null
  createdAt: string
}

// один гость = одно имя: «Ольга Иванова» и «ольга  иванова» — тот же человек
const personKey = (name: string) => name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

// гость передумал и ответил снова — считаем только последний ответ; items приходят от новых к старым
export function latestAnswers<T extends RsvpAnswer>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = personKey(item.name)
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
}

// по именной ссылке ответил кто-то с другим именем — паре стоит это видеть
export const answeredForOther = (item: RsvpAnswer) => Boolean(item.guest) && personKey(item.guest!) !== personKey(item.name)

// сводка для пары и админки: сколько придёт людей с учётом пар и что заказать из напитков
export function rsvpSummary(all: RsvpAnswer[]) {
  const items = latestAnswers(all)
  const yes = items.filter(i => i.attending === 'yes')
  const drinks: Record<string, number> = {}
  for (const item of yes) {
    for (const drink of item.drinks) drinks[drink] = (drinks[drink] ?? 0) + 1
  }
  return {
    total: items.length,
    yes: yes.length,
    no: items.length - yes.length,
    people: yes.reduce((sum, i) => sum + (i.plusOne ? 2 : 1), 0),
    plusOnes: yes.filter(i => i.plusOne).length,
    drinks: Object.entries(drinks).sort((a, b) => b[1] - a[1]),
  }
}

// «3 человека придут» и из кого складывается число: иначе пара гостя выглядит как ошибка подсчёта
export const peopleLabel = (n: number) => `${pluralRu(n, ['человек', 'человека', 'человек'])} ${pluralRu(n, ['придёт', 'придут', 'придут'])}`
export function peopleNote({ yes, plusOnes }: { yes: number, plusOnes: number }) {
  return plusOnes ? `${yes} ${pluralRu(yes, ['гость', 'гостя', 'гостей'])} и ${plusOnes} ${pluralRu(plusOnes, ['спутник', 'спутника', 'спутников'])}` : ''
}

type Cell = string | number | Date | null
type Row = Cell[]

const colName = (i: number) => String.fromCharCode(65 + i)
// управляющие символы ломают XML книги — Excel тогда отказывается её открывать
// eslint-disable-next-line no-control-regex
const xmlText = (s: string) => s.replace(/[\u0000-\u0008\v\f\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// дата в Excel — число дней с 1900 года; время ответа показываем московское
const excelDate = (d: Date) => (d.getTime() + 3 * 3600_000) / 86400_000 + 25569

// стили из styles.xml: 1 — шапка, 2 — дата, 3 — текст с переносом
function sheetXml(rows: Row[], widths: number[], styles: number[], filter = false) {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const body = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
    const ref = `${colName(c)}${r + 1}`
    const s = r === 0 ? 1 : styles[c] ?? 3
    if (value === null || value === '')
      return ''
    if (value instanceof Date)
      return `<c r="${ref}" s="${s}"><v>${excelDate(value)}</v></c>`
    if (typeof value === 'number')
      return `<c r="${ref}" s="${s}"><v>${value}</v></c>`
    // строка всегда inlineStr: Excel не выполнит её как формулу, даже если гость начал ответ с «=»
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`
  }).join('')}</row>`).join('')
  const last = `${colName(widths.length - 1)}${rows.length}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData>${filter ? `<autoFilter ref="A1:${last}"/>` : ''}</worksheet>`
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1EEE6"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

function workbook(sheets: { name: string, xml: string }[]) {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(stylesXml),
  }
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml)))
  return zipSync(files)
}

export const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// книга для пары: ответы (только актуальные) и сводка — сколько людей и что заказать из напитков
export function rsvpXlsx(all: RsvpAnswer[]) {
  const answers: Row[] = [
    ['Дата', 'Имя', 'Ответ', 'С парой', 'Напитки', 'Пожелания', 'Именная ссылка'],
    ...latestAnswers(all).map(i => [
      new Date(i.createdAt),
      i.name,
      attendingLabels[i.attending],
      i.plusOne ? 'да' : '',
      i.drinks.join(', '),
      i.notes ?? '',
      i.guest ?? '',
    ]),
  ]
  const { people, yes, plusOnes, no, drinks } = rsvpSummary(all)
  const summary: Row[] = [
    ['Показатель', 'Количество'],
    ['Придут, человек', people],
    ['Из них гостей', yes],
    ['Из них спутников', plusOnes],
    ['Не смогут', no],
    ...drinks.map(([drink, n]): Row => [`Напиток: ${drink}`, n]),
  ]
  return workbook([
    { name: 'Ответы', xml: sheetXml(answers, [17, 26, 12, 9, 26, 44, 22], [2, 3, 3, 3, 3, 3, 3], true) },
    { name: 'Сводка', xml: sheetXml(summary, [34, 14], [3, 3]) },
  ])
}
