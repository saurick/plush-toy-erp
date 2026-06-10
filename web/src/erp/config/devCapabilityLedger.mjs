export const DEV_CAPABILITY_LEDGER_ROUTE = '/__dev/capability-ledger'
export const DEV_CAPABILITY_LEDGER_SOURCE_PATH =
  'docs/product/capability-ledger.md'
export const DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH =
  'docs/customers/yoyoosun/delivery-matrix.md'
export const DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH =
  'docs/customers/yoyoosun/delta-ledger.md'

const CAPABILITY_LEDGER_SECTION_HEADING = '## 4. 产品能力进度台账'
const CUSTOMER_DELIVERY_MATRIX_SECTION_HEADING = '## 6. 客户交付矩阵：yoyoosun'
const CUSTOMER_DELTA_LEDGER_SECTION_HEADING = '## 8. 客户差异台账：yoyoosun'
const CAPABILITY_ID_PATTERN = /\bCAP-\d+\b/g

const CAPABILITY_FIELD_BY_HEADER = Object.freeze({
  'Capability ID': 'id',
  能力名称: 'name',
  所属层: 'layer',
  业务域: 'domain',
  当前成熟度: 'maturity',
  当前结果: 'currentResult',
  当前不包含: 'notIncluded',
  证据: 'evidence',
  下一步: 'nextStep',
  风险: 'risk',
  可客户试用: 'customerTrial',
  可交付承诺: 'deliveryCommitment',
})

const DELIVERY_MATRIX_FIELD_BY_HEADER = Object.freeze({
  'Customer Key': 'customerKey',
  '模块 / 能力': 'moduleName',
  '产品能力 ID': 'capabilityIdsRaw',
  交付状态: 'customerDeliveryStatus',
  当前客户可见方式: 'visibleMethod',
  交付结果: 'deliveryResult',
  不包含: 'notIncluded',
  前置条件: 'prerequisites',
  客户确认项: 'customerConfirmation',
  风险: 'risk',
})

const DELTA_LEDGER_FIELD_BY_HEADER = Object.freeze({
  'Delta ID': 'id',
  Customer: 'customerKey',
  '差异/需求': 'demand',
  来源: 'source',
  分类: 'category',
  当前判断: 'judgement',
  '是否进入 Product Core': 'productCoreDecision',
  处理方式: 'handling',
  前置条件: 'prerequisites',
  风险: 'risk',
  下一步: 'nextStep',
})

export const DEV_CAPABILITY_LEDGER_FIELD_KEYS = Object.freeze(
  Object.values(CAPABILITY_FIELD_BY_HEADER)
)
export const DEV_CUSTOMER_DELIVERY_MATRIX_FIELD_KEYS = Object.freeze(
  Object.values(DELIVERY_MATRIX_FIELD_BY_HEADER)
)
export const DEV_CUSTOMER_DELTA_LEDGER_FIELD_KEYS = Object.freeze(
  Object.values(DELTA_LEDGER_FIELD_BY_HEADER)
)

export function isDevCapabilityLedgerEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripMarkdownInline(value = '') {
  return normalizeText(value)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()
}

function splitMarkdownTableRow(row = '') {
  const cells = []
  let current = ''
  let inCode = false
  const source = String(row || '').trim()
  const startIndex = source.startsWith('|') ? 1 : 0
  const endIndex = source.endsWith('|') ? source.length - 1 : source.length

  for (let index = startIndex; index < endIndex; index += 1) {
    const char = source[index]
    const previous = source[index - 1]
    if (char === '`' && previous !== '\\') {
      inCode = !inCode
      current += char
      continue
    }
    if (char === '|' && !inCode && previous !== '\\') {
      cells.push(normalizeText(current))
      current = ''
      continue
    }
    current += char
  }
  cells.push(normalizeText(current))
  return cells
}

function isSeparatorRow(cells = []) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

function extractMarkdownSection(source = '', heading = '') {
  const text = String(source || '')
  const startIndex = text.indexOf(heading)
  if (startIndex < 0) {
    return ''
  }
  const afterHeading = text.slice(startIndex + heading.length)
  const endIndex = afterHeading.search(/\n---\n/)
  return endIndex >= 0 ? afterHeading.slice(0, endIndex) : afterHeading
}

function parseMarkdownTable(source = '', heading = '') {
  const section = extractMarkdownSection(source, heading)
  const tableRows = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map(splitMarkdownTableRow)

  if (tableRows.length < 3) {
    return { headers: [], rows: [] }
  }

  const headers = tableRows[0].map(stripMarkdownInline)
  const rows = tableRows.slice(2).filter((cells) => {
    return cells.length === headers.length && !isSeparatorRow(cells)
  })
  return { headers, rows }
}

function parseMaturity(value = '') {
  const levels = [...String(value || '').matchAll(/L(\d+)/gi)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((level) => Number.isFinite(level))
  const min = levels.length > 0 ? Math.min(...levels) : null
  const max = levels.length > 0 ? Math.max(...levels) : null
  return {
    label: stripMarkdownInline(value),
    min,
    max,
    bucket: max === null ? 'unknown' : `L${max}`,
  }
}

function classifyTrial(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('yes')) return 'yes'
  if (normalized.includes('limited')) return 'limited'
  return 'no'
}

function classifyDelivery(value = '') {
  return String(value || '')
    .toLowerCase()
    .includes('yes')
    ? 'yes'
    : 'no'
}

function buildSearchText(capability) {
  return DEV_CAPABILITY_LEDGER_FIELD_KEYS.map((key) => capability[key])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function buildSearchTextFromKeys(item, keys = []) {
  return keys
    .map((key) => item[key])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function extractCapabilityIds(...values) {
  const ids = values
    .flatMap((value) => String(value || '').match(CAPABILITY_ID_PATTERN) || [])
    .map((id) => id.toUpperCase())
  return [...new Set(ids)]
}

function parseMappedTableRows({
  source = '',
  heading = '',
  sourcePath = '',
  fieldByHeader = {},
  requiredField = 'id',
}) {
  const { headers, rows } = parseMarkdownTable(source, heading)
  if (headers.length === 0) return []

  return rows.flatMap((cells, index) => {
    const item = {
      rowNumber: index + 1,
      sourcePath,
    }

    headers.forEach((header, cellIndex) => {
      const fieldKey = fieldByHeader[header]
      if (!fieldKey) return
      item[fieldKey] = stripMarkdownInline(cells[cellIndex])
    })

    if (requiredField && !item[requiredField]) {
      return []
    }

    return [item]
  })
}

export function parseCapabilityLedgerMarkdown(source = '') {
  return parseMappedTableRows({
    source,
    heading: CAPABILITY_LEDGER_SECTION_HEADING,
    sourcePath: DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    fieldByHeader: CAPABILITY_FIELD_BY_HEADER,
  }).map((capability) => {
    const maturity = parseMaturity(capability.maturity)
    capability.key = capability.id
    capability.maturityLabel = maturity.label
    capability.maturityMin = maturity.min
    capability.maturityMax = maturity.max
    capability.maturityBucket = maturity.bucket
    capability.trialStatus = classifyTrial(capability.customerTrial)
    capability.deliveryStatus = classifyDelivery(capability.deliveryCommitment)
    capability.searchText = buildSearchText(capability)

    return capability
  })
}

export function parseCustomerDeliveryMatrixMarkdown(source = '') {
  return parseMappedTableRows({
    source,
    heading: CUSTOMER_DELIVERY_MATRIX_SECTION_HEADING,
    sourcePath: DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
    fieldByHeader: DELIVERY_MATRIX_FIELD_BY_HEADER,
    requiredField: 'moduleName',
  }).map((item) => {
    item.key = `${item.sourcePath}:${item.rowNumber}`
    item.capabilityIds = extractCapabilityIds(item.capabilityIdsRaw)
    item.searchText = buildSearchTextFromKeys(
      item,
      DEV_CUSTOMER_DELIVERY_MATRIX_FIELD_KEYS
    )
    return item
  })
}

export function parseCustomerDeltaLedgerMarkdown(source = '') {
  return parseMappedTableRows({
    source,
    heading: CUSTOMER_DELTA_LEDGER_SECTION_HEADING,
    sourcePath: DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
    fieldByHeader: DELTA_LEDGER_FIELD_BY_HEADER,
  }).map((item) => {
    item.key = item.id
    item.capabilityIds = extractCapabilityIds(
      item.demand,
      item.judgement,
      item.handling,
      item.prerequisites,
      item.risk,
      item.nextStep
    )
    item.searchText = buildSearchTextFromKeys(
      item,
      DEV_CUSTOMER_DELTA_LEDGER_FIELD_KEYS
    )
    return item
  })
}

function countBy(getKey, items = []) {
  const result = new Map()
  items.forEach((item) => {
    const rawKey = getKey(item)
    const key = rawKey || '未归类'
    result.set(key, (result.get(key) || 0) + 1)
  })
  return [...result.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.key.localeCompare(right.key, 'zh-Hans-CN')
    })
}

export function buildCapabilityLedgerSummary(capabilities = []) {
  const total = capabilities.length
  const trialYes = capabilities.filter(
    (item) => item.trialStatus === 'yes'
  ).length
  const trialLimited = capabilities.filter(
    (item) => item.trialStatus === 'limited'
  ).length
  const deliveryYes = capabilities.filter(
    (item) => item.deliveryStatus === 'yes'
  ).length
  const highMaturity = capabilities.filter(
    (item) => (item.maturityMax ?? -1) >= 7
  ).length
  const lowMaturity = capabilities.filter(
    (item) => (item.maturityMax ?? 99) <= 3
  ).length
  const noCommitment = capabilities.filter(
    (item) => item.deliveryStatus !== 'yes'
  ).length

  return {
    total,
    trialYes,
    trialLimited,
    deliveryYes,
    highMaturity,
    lowMaturity,
    noCommitment,
    byLayer: countBy((item) => item.layer, capabilities),
    byDomain: countBy((item) => item.domain, capabilities),
    byMaturity: countBy((item) => item.maturityBucket, capabilities),
  }
}

export function buildCustomerDeliveryMatrixSummary(items = []) {
  const total = items.length
  const trialReady = items.filter(
    (item) => item.customerDeliveryStatus === 'Trial Ready'
  ).length
  const targetReleased = items.filter(
    (item) =>
      item.customerDeliveryStatus === 'Target Released' ||
      item.customerDeliveryStatus === 'Delivery Ready'
  ).length
  const blockedOrDeferred = items.filter((item) => {
    const status = item.customerDeliveryStatus || ''
    return (
      status.includes('Blocked') ||
      status.includes('Deferred') ||
      status.includes('Deprecated') ||
      status.includes('Not Planned') ||
      status.includes('No-Go')
    )
  }).length
  const linkedCapabilities = items.filter(
    (item) => item.capabilityIds.length > 0
  ).length

  return {
    total,
    trialReady,
    targetReleased,
    blockedOrDeferred,
    linkedCapabilities,
    byStatus: countBy((item) => item.customerDeliveryStatus, items),
    byCustomer: countBy((item) => item.customerKey, items),
  }
}

export function buildCustomerDeltaLedgerSummary(items = []) {
  const total = items.length
  const productCoreYes = items.filter(
    (item) => item.productCoreDecision === '是'
  ).length
  const productCoreCandidates = items.filter((item) =>
    (item.category || '').includes('Product Core')
  ).length
  const deferredOrForbidden = items.filter((item) => {
    const category = item.category || ''
    return category.includes('Deferred') || category.includes('Forbidden')
  }).length
  const linkedCapabilities = items.filter(
    (item) => item.capabilityIds.length > 0
  ).length

  return {
    total,
    productCoreYes,
    productCoreCandidates,
    deferredOrForbidden,
    linkedCapabilities,
    byCategory: countBy((item) => item.category, items),
    byCoreDecision: countBy((item) => item.productCoreDecision, items),
  }
}

export function filterCapabilityLedgerItems(
  capabilities = [],
  { keyword = '', layer = 'all', domain = 'all', maturity = 'all' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()

  return capabilities.filter((item) => {
    const keywordMatched = !query || item.searchText?.includes(query)
    const layerMatched = layer === 'all' || item.layer === layer
    const domainMatched = domain === 'all' || item.domain === domain
    const maturityMatched =
      maturity === 'all' || item.maturityBucket === maturity
    return keywordMatched && layerMatched && domainMatched && maturityMatched
  })
}

export function filterCustomerDeliveryMatrixItems(
  items = [],
  { keyword = '', status = 'all', capabilityId = 'all' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()

  return items.filter((item) => {
    const keywordMatched = !query || item.searchText?.includes(query)
    const statusMatched =
      status === 'all' || item.customerDeliveryStatus === status
    const capabilityMatched =
      capabilityId === 'all' || item.capabilityIds.includes(capabilityId)
    return keywordMatched && statusMatched && capabilityMatched
  })
}

export function filterCustomerDeltaLedgerItems(
  items = [],
  { keyword = '', category = 'all', coreDecision = 'all' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()

  return items.filter((item) => {
    const keywordMatched = !query || item.searchText?.includes(query)
    const categoryMatched = category === 'all' || item.category === category
    const coreDecisionMatched =
      coreDecision === 'all' || item.productCoreDecision === coreDecision
    return keywordMatched && categoryMatched && coreDecisionMatched
  })
}
