function normalizedUpperText(value) {
  return String(value ?? '').trim().toUpperCase()
}

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function hasRequiredOperationalFactDraftSource(viewKey, fact = {}) {
  const record = fact && typeof fact === 'object' ? fact : {}
  const factType = normalizedUpperText(record.fact_type)
  const sourceType = normalizedUpperText(record.source_type)
  const sourceID = positiveID(record.source_id)
  const sourceLineID = positiveID(record.source_line_id)

  if (viewKey === 'production') {
    if (factType === 'REWORK') {
      return sourceType === 'PRODUCTION_FACT' && sourceID > 0 && sourceLineID > 0
    }
    return (
      ['MATERIAL_ISSUE', 'FINISHED_GOODS_RECEIPT'].includes(factType) &&
      sourceType === 'PRODUCTION_ORDER' &&
      sourceID > 0 &&
      sourceLineID > 0
    )
  }

  if (viewKey === 'outsourcing') {
    return (
      ['MATERIAL_ISSUE', 'RETURN_RECEIPT'].includes(factType) &&
      sourceType === 'OUTSOURCING_ORDER' &&
      sourceID > 0 &&
      sourceLineID > 0
    )
  }

  return false
}
