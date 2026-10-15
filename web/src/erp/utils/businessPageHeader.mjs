export function isBusinessPageHeaderStatValue(value) {
  return Number.isSafeInteger(value) && value >= 0
}

export function normalizeBusinessPageHeaderStats(stats) {
  if (!Array.isArray(stats)) return []

  return stats.filter(
    (item) =>
      item &&
      typeof item === 'object' &&
      isBusinessPageHeaderStatValue(item.value)
  )
}
