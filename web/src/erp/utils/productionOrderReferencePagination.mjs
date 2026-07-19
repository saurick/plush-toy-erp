export const PRODUCTION_ORDER_REFERENCE_PAGE_SIZE = 50

export function mergeProductionOrderReferenceOptions(...groups) {
  const merged = new Map()
  for (const group of groups) {
    for (const option of Array.isArray(group) ? group : []) {
      if (Number.isSafeInteger(option?.value) && option.value > 0) {
        merged.set(option.value, option)
      }
    }
  }
  return [...merged.values()]
}

export function nextProductionOrderReferencePage(page) {
  const offset = Number(page?.offset)
  const total = Number(page?.total)
  const rowCount = Array.isArray(page?.options) ? page.options.length : 0
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    return null
  }
  const nextOffset = offset + rowCount
  return nextOffset < total ? nextOffset : null
}

export function createProductionOrderReferenceRequestGate() {
  let generation = 0
  return {
    next() {
      generation += 1
      return generation
    },
    isCurrent(candidate) {
      return candidate === generation
    },
  }
}
