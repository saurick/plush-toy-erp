import { Remarkable } from 'remarkable'

const CHOICES_HEADING = '选择表达 / Choosing A View'
const CHOICE = /^<a id="visual-form-([a-z][a-z-]*)"><\/a>([^<]+)$/u

// The selection table is the rule source for both readers and the workbench.
export function readVisualizationChoices(source) {
  const tokens = new Remarkable({ html: true }).parse(source, {})
  const isChapter = (token) => token.type === 'heading_open' && token.hLevel <= 2
  const start = tokens.findIndex(
    (token, index) =>
      isChapter(token) && tokens[index + 1]?.content === CHOICES_HEADING
  )
  if (start < 0) return []
  const end = tokens.findIndex((token, index) => index > start && isChapter(token))
  const chapter = tokens.slice(start + 3, end < 0 ? tokens.length : end)
  const table = chapter.findIndex((token) => token.type === 'table_open')
  const body = chapter.findIndex((token, index) => index > table && token.type === 'tbody_open')
  const close = chapter.findIndex((token, index) => index > body && token.type === 'tbody_close')
  if (table < 0 || body < 0 || close < 0) return []

  const choices = []
  let cells = []
  for (const token of chapter.slice(body + 1, close)) {
    if (token.type === 'tr_open') cells = []
    if (token.type === 'inline') cells.push(token.content.trim())
    if (token.type !== 'tr_close') continue
    const [identity, question, forms, rule] = cells
    const match = CHOICE.exec(identity || '')
    if (!match || cells.length !== 4 || !question || !forms || !rule) return []
    const [, value, rawLabel] = match
    const label = rawLabel.trim()
    if (!label || choices.some((item) => item.value === value || item.label === label)) return []
    choices.push({ value, label, question, forms, rule })
  }
  return choices
}

export function resolveVisualizationChoice(choices, value) {
  return choices.find((choice) => choice.value === value)
    ?? choices[0]
}
