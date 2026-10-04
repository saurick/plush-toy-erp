import standardUnits from '../../../../server/internal/unitpolicy/units.json' with { type: 'json' }

import { NumericContract } from '../../common/consts/numeric.generated.mjs'

const MAX_PRECISION = NumericContract.scale
const UNIT_QUANTITY_PATTERN = new RegExp(`^-?(\\d{1,${NumericContract.integerDigits}})(?:\\.(\\d{1,${MAX_PRECISION}}))?$`, 'u')

export function normalizeUnitPrecision(value) {
  if (value === null || value === undefined || value === '') return undefined
  const precision = Number(value)
  return Number.isInteger(precision) &&
    precision >= 0 &&
    precision <= MAX_PRECISION
    ? precision
    : undefined
}

export function unitPrecisionFromOptions(options, unitID) {
  const id = Number(unitID)
  if (!Number.isSafeInteger(id) || id <= 0) return undefined
  return normalizeUnitPrecision(
    (Array.isArray(options) ? options : []).find(
      (option) => Number(option?.value) === id
    )?.precision
  )
}

export function isQuantityTextWithinUnitPrecision(value, precision) {
  const text = String(value ?? '').trim()
  if (!text) return true
  if (normalizeUnitPrecision(precision) === undefined) return false
  const match = UNIT_QUANTITY_PATTERN.exec(text)
  if (!match) return false
  return (match[2] || '').replace(/0+$/u, '').length <= precision
}

export function unitPrecisionErrorMessage(precision) {
  if (normalizeUnitPrecision(precision) === undefined) {
    return '请先选择已配置精度的单位'
  }
  return precision === 0
    ? '当前单位只允许整数数量'
    : `当前单位最多允许 ${precision} 位小数`
}

export function unitQuantityRule(precisionOrGetter) {
  return {
    async validator(_, value) {
      const precision =
        typeof precisionOrGetter === 'function'
          ? precisionOrGetter()
          : precisionOrGetter
      if (!isQuantityTextWithinUnitPrecision(value, precision)) {
        throw new Error(unitPrecisionErrorMessage(precision))
      }
    },
  }
}

export function unitQuantityRuleFromOptions(options, unitIDOrGetter) {
  return unitQuantityRule(() =>
    unitPrecisionFromOptions(
      options,
      typeof unitIDOrGetter === 'function' ? unitIDOrGetter() : unitIDOrGetter
    )
  )
}

// The catalog supplies spelling and standalone print defaults. Business input
// precision always comes from the selected persisted unit via unitPrecisionFromOptions.
export function standardUnitForLabel(value) {
  const label = String(value ?? '')
    .trim()
    .toLowerCase()
  return standardUnits.find((unit) =>
    [unit.name, unit.code, ...unit.aliases].some(
      (candidate) => candidate.toLowerCase() === label
    )
  )
}
export function standardUnitLabels() {
  return standardUnits.map((unit) => unit.name)
}

export function unitRecordMatchesLabel(record, sourceLabel) {
  const normalized = (value) =>
    String(value ?? '')
      .trim()
      .toLowerCase()
  const source = normalized(sourceLabel)
  if (!source) return false
  const standard = standardUnitForLabel(source)
  return [record?.name, record?.code].some(
    (value) =>
      normalized(value) === source ||
      (standard && standardUnitForLabel(value)?.code === standard.code)
  )
}
