function positiveID(value) {
  const id = Number(value || 0)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

function normalizeVersion(value) {
  return String(value ?? '').trim()
}

export function suggestNextBOMVersion(records, productID) {
  const targetProductID = positiveID(productID)
  if (!targetProductID) return ''

  const versions = (Array.isArray(records) ? records : [])
    .filter((record) => positiveID(record?.product_id) === targetProductID)
    .map((record) => normalizeVersion(record?.version))
    .filter(Boolean)

  const usedVersions = new Set(versions.map((version) => version.toUpperCase()))
  const numericVersions = versions
    .map((version) => /^V(\d+)$/iu.exec(version)?.[1])
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)

  let nextNumber =
    numericVersions.length > 0 ? Math.max(...numericVersions) + 1 : 1
  let candidate = `V${nextNumber}`
  while (usedVersions.has(candidate.toUpperCase())) {
    nextNumber += 1
    candidate = `V${nextNumber}`
  }
  return candidate
}
