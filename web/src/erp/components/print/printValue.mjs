export const PRINT_BLANK_VALUE = '\u00A0'

export function hasPrintValue(value) {
  return String(value ?? '').trim() !== ''
}

export function renderPrintValue(value, blankValue = PRINT_BLANK_VALUE) {
  return hasPrintValue(value) ? value : blankValue
}

export function coalescePrintValues(...values) {
  for (const value of values) {
    if (hasPrintValue(value)) {
      return value
    }
  }
  return ''
}
