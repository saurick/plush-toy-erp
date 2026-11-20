import { numeric20Scale6Units } from './numeric20Scale6.mjs'
import { salesOrderSourceFieldValue } from './salesOrderXlsxImport.mjs'

const compact = (value) => String(value ?? '').replace(/[\s：:]/gu, '')
const unlabelled = (label) => /^第\d+列（无标题）$/u.test(compact(label))
const paymentWords = /定金|订金|尾款|预付款|收款|请款/u
const statusPattern =
  /^(定金|订金|尾款)(已付|已收|未付|未收|部分已付|部分已收)$/u
const statusValuePattern = /^(已付|已收|未付|未收|部分已付|部分已收)$/u
const amountLabels = new Set([
  '货款金额',
  '货款',
  '订单金额',
  '总金额',
  '金额',
  '合计金额',
])

function columnLetters(column) {
  let result = ''
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result
  }
  return result
}

function cellLocation(source, cell) {
  const column = columnLetters(cell.column)
  const span = cell.merged_rows
  const reference = span
    ? `${column}${span[0]}:${column}${span[1]}（合并单元格）`
    : `${column}${source.row_number}`
  return `${source.sheet_name} · ${reference}`
}

// This is a view of immutable source evidence. It neither derives paid totals
// nor uses edited order values to reinterpret amounts in the original workbook.
export function salesOrderSourcePayment(items = []) {
  const notes = new Map()
  const seen = new Set()
  const rows = []
  let hasRecords = false
  for (const item of items || []) {
    const source = item?.import_source
    if (!source?.cells?.length) continue
    const key = `${source.file_sha256}:${source.sheet_name}:${source.row_number}`
    if (seen.has(key)) continue
    seen.add(key)
    const { cells } = source
    const quantity = numeric20Scale6Units(
      salesOrderSourceFieldValue(cells, 'ordered_quantity')
    )
    const price = numeric20Scale6Units(
      salesOrderSourceFieldValue(cells, 'unit_price')
    )
    const row = {
      key,
      location: `${source.sheet_name} · 第 ${source.row_number} 行`,
      productName: salesOrderSourceFieldValue(cells, 'requested_product_name'),
      amounts: [],
      deposit: [],
      balance: [],
    }
    for (const cell of cells) {
      const value = String(cell.value ?? '').trim()
      if (!value) continue
      const label = compact(cell.label)
      const isUnlabelled = unlabelled(label)
      const isPaymentLabel = paymentWords.test(label)
      const literalStatus = compact(value).match(statusPattern)
      if (isUnlabelled || isPaymentLabel) {
        const phase = literalStatus?.[1] || label.match(/定金|订金|尾款/u)?.[0]
        if (
          phase &&
          (literalStatus || statusValuePattern.test(compact(value)))
        ) {
          row[phase === '尾款' ? 'balance' : 'deposit'].push(value)
          hasRecords = true
          continue
        }
        if (isPaymentLabel || paymentWords.test(value)) {
          const text = isUnlabelled ? value : `${cell.label}：${value}`
          const key = `${source.file_sha256}:${text}`
          if (!notes.has(key)) {
            notes.set(key, { key, text, locations: new Set() })
          }
          notes.get(key).locations.add(cellLocation(source, cell))
          hasRecords = true
          continue
        }
      }
      const amount = numeric20Scale6Units(value)
      const matchesGoods =
        amount !== null &&
        quantity !== null &&
        price !== null &&
        BigInt(amount) * BigInt(1_000_000) === BigInt(quantity) * BigInt(price)
      if (
        amount !== null &&
        (amountLabels.has(label) || (isUnlabelled && matchesGoods))
      ) {
        row.amounts.push(value)
        hasRecords = true
      }
    }
    rows.push(row)
  }
  return {
    rows: hasRecords ? rows : [],
    notes: [...notes.values()].map((note) => ({
      ...note,
      locations: [...note.locations],
    })),
  }
}
