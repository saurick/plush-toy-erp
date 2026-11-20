export const BUSINESS_CURRENCY_OPTIONS = Object.freeze([
  Object.freeze({ value: 'CNY', label: '人民币（CNY）' }),
  Object.freeze({ value: 'USD', label: '美元（USD）' }),
  Object.freeze({ value: 'HKD', label: '港币（HKD）' }),
])

const BUSINESS_CURRENCY_CODES = new Set(
  BUSINESS_CURRENCY_OPTIONS.map((option) => option.value)
)

export function isBusinessCurrency(value) {
  return typeof value === 'string' && BUSINESS_CURRENCY_CODES.has(value)
}
