import { NumericContract } from '../../common/consts/numeric.generated.mjs'

export const QUALITY_DEFECT_RATE_OPERATORS = Object.freeze({
  APPROX: 'APPROX',
  GT: 'GT',
})

export const QUALITY_DEFECT_RATE_CUSTOM_SELECTION = 'CUSTOM'

export const QUALITY_DEFECT_RATE_PRESETS = Object.freeze([
  { label: '0%（未发现不良）', value: 'APPROX:0' },
  { label: '约 5%', value: 'APPROX:5' },
  { label: '约 10%', value: 'APPROX:10' },
  { label: '约 20%', value: 'APPROX:20' },
  { label: '约 30%', value: 'APPROX:30' },
  { label: '约 50%', value: 'APPROX:50' },
  { label: '大于 50%', value: 'GT:50' },
  { label: '100%（全部不良）', value: 'APPROX:100' },
  { label: '自定义', value: QUALITY_DEFECT_RATE_CUSTOM_SELECTION },
])

const PRESET_SELECTIONS = new Set(
  QUALITY_DEFECT_RATE_PRESETS.map((option) => option.value).filter(
    (value) => value !== QUALITY_DEFECT_RATE_CUSTOM_SELECTION
  )
)

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

export function normalizeQualityDefectPercent(value) {
  if (!hasValue(value)) {
    throw new TypeError('请填写估算不良比例')
  }

  const source = String(value).trim()
  const parts = /^(\d+)(?:\.(\d+))?$/u.exec(source)
  const fraction = (parts?.[2] || '').replace(/0+$/u, '')
  if (!parts || fraction.length > NumericContract.scale) {
    throw new TypeError(`估算不良比例最多保留 ${NumericContract.scale} 位小数`)
  }

  const numeric = Number(source)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new RangeError('估算不良比例须在 0% 到 100% 之间')
  }

  const normalizedInteger = String(Number(parts[1]))
  return fraction
    ? `${normalizedInteger}.${fraction}`
    : normalizedInteger
}

export function buildQualityDefectRateParams(selection, customPercent) {
  const selected = String(selection || '').trim()
  if (!selected) {
    throw new TypeError('请选择估算不良比例')
  }

  if (selected === QUALITY_DEFECT_RATE_CUSTOM_SELECTION) {
    return {
      defect_rate_operator: QUALITY_DEFECT_RATE_OPERATORS.APPROX,
      defect_rate_percent: normalizeQualityDefectPercent(customPercent),
    }
  }

  if (!PRESET_SELECTIONS.has(selected)) {
    throw new TypeError('请选择有效的估算不良比例')
  }

  const [operator, percent] = selected.split(':')
  return {
    defect_rate_operator: operator,
    defect_rate_percent: normalizeQualityDefectPercent(percent),
  }
}

export function formatQualityDefectRate(record = {}, { emptyText = '未记录' } = {}) {
  const operator = String(record?.defect_rate_operator || '')
    .trim()
    .toUpperCase()
  const percentValue = record?.defect_rate_percent
  if (!operator && !hasValue(percentValue)) return emptyText
  if (!operator || !hasValue(percentValue)) return '比例待核对'

  try {
    const percent = normalizeQualityDefectPercent(percentValue)
    if (operator === QUALITY_DEFECT_RATE_OPERATORS.GT) {
      return Number(percent) < 100 ? `大于 ${percent}%` : '比例待核对'
    }
    if (operator !== QUALITY_DEFECT_RATE_OPERATORS.APPROX) {
      return '比例待核对'
    }
    return percent === '0' || percent === '100'
      ? `${percent}%`
      : `约 ${percent}%`
  } catch {
    return '比例待核对'
  }
}
