export const DEV_CAPABILITY_LEDGER_ROUTE = '/__dev/capability-ledger'
export const DEV_CAPABILITY_LEDGER_SOURCE_PATH =
  'docs/product/product-delivery-ledgers.md'

const CAPABILITY_LEDGER_SECTION_HEADING = '## 4. 产品能力进度台账'

const FIELD_BY_HEADER = Object.freeze({
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

export const DEV_CAPABILITY_LEDGER_FIELD_KEYS = Object.freeze(
  Object.values(FIELD_BY_HEADER)
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

function extractCapabilityLedgerSection(source = '') {
  const text = String(source || '')
  const startIndex = text.indexOf(CAPABILITY_LEDGER_SECTION_HEADING)
  if (startIndex < 0) {
    return ''
  }
  const afterHeading = text.slice(
    startIndex + CAPABILITY_LEDGER_SECTION_HEADING.length
  )
  const endIndex = afterHeading.search(/\n---\n/)
  return endIndex >= 0 ? afterHeading.slice(0, endIndex) : afterHeading
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

export function parseCapabilityLedgerMarkdown(source = '') {
  const section = extractCapabilityLedgerSection(source)
  const tableRows = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map(splitMarkdownTableRow)

  if (tableRows.length < 3) {
    return []
  }

  const headers = tableRows[0].map(stripMarkdownInline)
  return tableRows.slice(2).flatMap((cells, index) => {
    if (cells.length !== headers.length || isSeparatorRow(cells)) {
      return []
    }
    const capability = {
      rowNumber: index + 1,
      sourcePath: DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    }

    headers.forEach((header, cellIndex) => {
      const fieldKey = FIELD_BY_HEADER[header]
      if (!fieldKey) return
      capability[fieldKey] = stripMarkdownInline(cells[cellIndex])
    })

    if (!capability.id) {
      return []
    }

    const maturity = parseMaturity(capability.maturity)
    capability.key = capability.id
    capability.maturityLabel = maturity.label
    capability.maturityMin = maturity.min
    capability.maturityMax = maturity.max
    capability.maturityBucket = maturity.bucket
    capability.trialStatus = classifyTrial(capability.customerTrial)
    capability.deliveryStatus = classifyDelivery(capability.deliveryCommitment)
    capability.searchText = buildSearchText(capability)

    return [capability]
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
