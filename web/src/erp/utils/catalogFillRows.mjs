export const CATALOG_FILL_MODES = Object.freeze({
  APPEND: 'append',
  REPLACE: 'replace',
})

export const CATALOG_FILL_DUPLICATE_POLICIES = Object.freeze({
  ALLOW: 'allow',
  SKIP: 'skip',
  REJECT: 'reject',
})

function normalizedSourceKey(value) {
  if (value === null || value === undefined) return ''
  const key = String(value).trim()
  return key && key !== '0' ? key : ''
}

/**
 * Builds a deterministic catalog-fill plan without mutating form state.
 * Catalog fill only copies master-data values into draft rows; it never
 * creates provenance or posts a business fact.
 */
export function buildCatalogFillRowsPlan({
  currentRows = [],
  selectedRows = [],
  mode = CATALOG_FILL_MODES.APPEND,
  duplicatePolicy = CATALOG_FILL_DUPLICATE_POLICIES.ALLOW,
  getCurrentSourceKey,
  getSelectedSourceKey,
  mapSelectedRow,
} = {}) {
  if (!Object.values(CATALOG_FILL_MODES).includes(mode)) {
    throw new TypeError(`unsupported catalog fill mode: ${mode}`)
  }
  if (
    !Object.values(CATALOG_FILL_DUPLICATE_POLICIES).includes(duplicatePolicy)
  ) {
    throw new TypeError(
      `unsupported catalog fill duplicate policy: ${duplicatePolicy}`
    )
  }
  if (
    typeof getSelectedSourceKey !== 'function' ||
    typeof mapSelectedRow !== 'function'
  ) {
    throw new TypeError('catalog fill source key and row mapper are required')
  }
  if (
    duplicatePolicy !== CATALOG_FILL_DUPLICATE_POLICIES.ALLOW &&
    typeof getCurrentSourceKey !== 'function'
  ) {
    throw new TypeError(
      'catalog fill current-row key is required when duplicates are controlled'
    )
  }

  const existingRows = Array.isArray(currentRows) ? currentRows : []
  const sources = Array.isArray(selectedRows) ? selectedRows : []
  const retainedRows =
    mode === CATALOG_FILL_MODES.APPEND ? [...existingRows] : []
  const occupiedKeys = new Set()
  if (
    mode === CATALOG_FILL_MODES.APPEND &&
    duplicatePolicy !== CATALOG_FILL_DUPLICATE_POLICIES.ALLOW
  ) {
    for (const row of retainedRows) {
      const key = normalizedSourceKey(getCurrentSourceKey(row))
      if (key) occupiedKeys.add(key)
    }
  }

  const acceptedRows = []
  const skippedRows = []
  for (const sourceRow of sources) {
    const sourceKey = normalizedSourceKey(getSelectedSourceKey(sourceRow))
    if (!sourceKey) {
      throw new TypeError(
        'catalog fill selected row is missing a stable source key'
      )
    }
    const duplicate = occupiedKeys.has(sourceKey)
    if (
      duplicate &&
      duplicatePolicy === CATALOG_FILL_DUPLICATE_POLICIES.REJECT
    ) {
      throw new Error(`catalog fill duplicate source key: ${sourceKey}`)
    }
    if (duplicate && duplicatePolicy === CATALOG_FILL_DUPLICATE_POLICIES.SKIP) {
      skippedRows.push(sourceRow)
      continue
    }
    occupiedKeys.add(sourceKey)
    acceptedRows.push(sourceRow)
  }

  const rowsToAdd = acceptedRows.map((sourceRow, acceptedIndex) =>
    mapSelectedRow(sourceRow, {
      acceptedIndex,
      targetIndex: retainedRows.length + acceptedIndex,
    })
  )
  return Object.freeze({
    mode,
    duplicatePolicy,
    retainedRows: Object.freeze(retainedRows),
    rowsToAdd: Object.freeze(rowsToAdd),
    skippedRows: Object.freeze(skippedRows),
    nextRows: Object.freeze([...retainedRows, ...rowsToAdd]),
  })
}
