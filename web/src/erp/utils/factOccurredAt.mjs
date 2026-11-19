export function optionalOccurredAt(value, invalidDate) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !value.trim()) throw invalidDate()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw invalidDate()
  return date.toISOString()
}

export function optionalOccurredAtFromForm(value) {
  return optionalOccurredAt(String(value ?? '').trim(), () => new Error('发生时间无效，请重新选择'))
}
