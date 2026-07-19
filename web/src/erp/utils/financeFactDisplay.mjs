function normalizedText(value) {
  return String(value ?? '').trim()
}

function enumText(value, labels = {}) {
  const normalized = normalizedText(value)
  if (!normalized) return '历史未记录'
  return labels[normalized] || '待核对'
}

export function financeCollectionTypeText(value, labels = {}) {
  return enumText(value, labels)
}

export function financeInvoiceCategoryText(value, labels = {}) {
  return enumText(value, labels)
}

export function financePaymentTermText(record = {}, labels = {}) {
  const paymentTerm = normalizedText(record?.payment_term)
  const rawDays = record?.payment_term_days
  const hasDays = rawDays !== null && rawDays !== undefined && rawDays !== ''
  const dayCount = hasDays ? Number(rawDays) : Number.NaN
  const validDays = Number.isSafeInteger(dayCount) && dayCount >= 0

  if (!paymentTerm && validDays) return `自定义账期 / ${dayCount} 天`

  const label = enumText(paymentTerm, labels)
  if (!hasDays) return label
  if (!validDays) return `${label} / 待核对`
  return `${label} / ${dayCount} 天`
}
