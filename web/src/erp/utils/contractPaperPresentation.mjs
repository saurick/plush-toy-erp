import { numeric20Scale6Units } from './numeric20Scale6.mjs'

// 只补纸面所需的小数位；不舍入业务精度，也不隐藏需要校验的非法输入。
export function formatContractPaperDecimal(value, minimumFractionDigits) {
  const text = String(value ?? '').trim()
  if (!text || numeric20Scale6Units(text) === null || text.endsWith('.')) {
    return text
  }
  const [integer, fraction = ''] = text.split('.')
  return `${integer}.${fraction.padEnd(minimumFractionDigits, '0')}`
}

export const formatContractPaperPrice = (value) =>
  formatContractPaperDecimal(value, 3)
export const formatContractPaperAmount = (value) =>
  formatContractPaperDecimal(value, 2)

export function formatContractPaperDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return '\u2003\u2003年\u2003月\u2003日'
  const date = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text)
  return date ? `${date[1]} 年 ${date[2]} 月 ${date[3]} 日` : text
}

export const CONTRACT_PAPER_MIN_ROWS = 4
