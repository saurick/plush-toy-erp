function normalizedLineItemID(item = {}) {
  const id = Number(item?.id || 0)
  return Number.isInteger(id) && id > 0 ? id : 0
}

export function buildBusinessLineItemOrderEntries(items = []) {
  if (!Array.isArray(items)) return []
  return items.map((item, index) => {
    const id = normalizedLineItemID(item)
    return {
      key: `${id > 0 ? `saved-${id}` : 'draft'}-${index}`,
      item,
      originalIndex: index,
    }
  })
}

export function repositionBusinessLineItem(entries, key, targetIndex) {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  const currentIndex = normalizedEntries.findIndex((entry) => entry.key === key)
  if (currentIndex < 0 || normalizedEntries.length <= 1) {
    return normalizedEntries
  }

  const boundedTarget = Math.max(
    0,
    Math.min(normalizedEntries.length - 1, targetIndex)
  )
  if (currentIndex === boundedTarget) return normalizedEntries

  const nextEntries = [...normalizedEntries]
  const [entry] = nextEntries.splice(currentIndex, 1)
  nextEntries.splice(boundedTarget, 0, entry)
  return nextEntries
}

export function moveBusinessLineItem(entries, key, direction) {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  const currentIndex = normalizedEntries.findIndex((entry) => entry.key === key)
  if (currentIndex < 0) return normalizedEntries
  return repositionBusinessLineItem(
    normalizedEntries,
    key,
    currentIndex + direction
  )
}

export function businessLineItemOrderChanged(entries = []) {
  return entries.some((entry, index) => entry.originalIndex !== index)
}

export function orderedBusinessLineItems(entries = []) {
  return entries.map((entry) => entry.item)
}
