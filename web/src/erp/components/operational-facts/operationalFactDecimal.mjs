import {
  compareNumeric20Scale6Units,
  formatNumeric20Scale6,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

export function formatOperationalFactDecimal(value) {
  return formatNumeric20Scale6(value)
}

export function compareOperationalFactDecimalValues(left, right) {
  const leftUnits = numeric20Scale6Units(left)
  const rightUnits = numeric20Scale6Units(right)
  if (leftUnits === null || rightUnits === null) {
    if (leftUnits === rightUnits) return 0
    return leftUnits === null ? 1 : -1
  }
  return compareNumeric20Scale6Units(leftUnits, rightUnits)
}
