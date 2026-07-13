export { DEV_CAPABILITY_LEDGER_ROUTE } from './devRoutes.mjs'

export const DEV_CAPABILITY_LEDGER_SOURCE_PATH =
  'docs/product/产品能力进度台账.md'
export const DEV_CAPABILITY_EVIDENCE_SOURCE_PATH =
  'docs/product/产品能力证据详情.md'
export const DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH =
  'docs/customers/yoyoosun/客户交付矩阵.md'
export const DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH =
  'docs/customers/yoyoosun/客户差异台账.md'

export const DEV_CAPABILITY_DIAGNOSTIC_CODES = Object.freeze({
  SOURCE_SCHEMA_MISMATCH: 'source_schema_mismatch',
  SOURCE_TABLE_AMBIGUOUS: 'source_table_ambiguous',
  SOURCE_ROW_MISMATCH: 'source_row_mismatch',
  SOURCE_EMPTY: 'source_empty',
  SOURCE_DUPLICATE_KEY: 'source_duplicate_key',
  DETAIL_SCHEMA_MISMATCH: 'capability_detail_schema_mismatch',
  DETAIL_MISSING: 'capability_detail_missing',
  DETAIL_ORPHAN: 'capability_detail_orphan',
})

const CAPABILITY_TABLE_HEADERS = Object.freeze([
  '能力',
  '所属层',
  '成熟度',
  '客户可见性',
  '下一步',
])
const CAPABILITY_MATURITY_HEADERS = Object.freeze([
  '等级',
  '名称',
  '含义',
  '是否可对客户承诺',
])
const DELIVERY_TABLE_HEADERS = Object.freeze([
  '模块 / 能力',
  '当前状态',
  '客户可见承诺',
  '验收证据',
  '风险 / 下一步',
])
const DELTA_TABLE_HEADERS = Object.freeze([
  'Delta ID',
  'Customer',
  '差异/需求',
  '来源',
  '分类',
  '当前判断',
  '是否进入 Product Core',
  '处理方式',
  '前置条件',
  '风险',
  '下一步',
])

const CAPABILITY_FIELD_BY_HEADER = Object.freeze({
  能力: 'name',
  所属层: 'layer',
  成熟度: 'maturity',
  客户可见性: 'customerVisibility',
  下一步: 'nextStep',
})
const CAPABILITY_MATURITY_FIELD_BY_HEADER = Object.freeze({
  等级: 'level',
  名称: 'name',
  含义: 'meaning',
  是否可对客户承诺: 'customerCommitment',
})
const DELIVERY_FIELD_BY_HEADER = Object.freeze({
  '模块 / 能力': 'moduleName',
  当前状态: 'customerDeliveryStatus',
  客户可见承诺: 'visibleCommitment',
  验收证据: 'acceptanceEvidence',
  '风险 / 下一步': 'riskNextStep',
})
const DELTA_FIELD_BY_HEADER = Object.freeze({
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
const CAPABILITY_DETAIL_FIELD_BY_LABEL = Object.freeze({
  '所属层 / 业务域': 'layerDomain',
  当前成熟度: 'maturity',
  当前结果: 'currentResult',
  当前不包含: 'notIncluded',
  证据: 'evidence',
  下一步: 'nextStep',
  风险: 'risk',
  '客户试用 / 交付承诺': 'trialAndCommitment',
})
const CAPABILITY_DETAIL_REQUIRED_FIELDS = Object.freeze(
  Object.values(CAPABILITY_DETAIL_FIELD_BY_LABEL)
)

const CAPABILITY_SEARCH_FIELDS = Object.freeze([
  'name',
  'layer',
  'domain',
  'maturity',
  'customerVisibility',
  'nextStep',
  'currentResult',
  'notIncluded',
  'evidence',
  'risk',
])
const DELIVERY_SEARCH_FIELDS = Object.freeze(
  Object.values(DELIVERY_FIELD_BY_HEADER)
)
const DELTA_SEARCH_FIELDS = Object.freeze(Object.values(DELTA_FIELD_BY_HEADER))

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
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
  )
}

function collectMarkdownTables(source = '') {
  const tables = []
  const lines = String(source || '').split('\n')
  let block = []

  const flush = () => {
    if (block.length >= 2) {
      const parsedRows = block.map((entry) => ({
        cells: splitMarkdownTableRow(entry.line),
        lineNumber: entry.lineNumber,
      }))
      if (isSeparatorRow(parsedRows[1].cells)) {
        const headers = parsedRows[0].cells.map(stripMarkdownInline)
        const rows = []
        const invalidRows = []
        parsedRows.slice(2).forEach((entry) => {
          if (entry.cells.length === headers.length) {
            rows.push(entry)
          } else {
            invalidRows.push(entry)
          }
        })
        tables.push({
          headers,
          rows,
          invalidRows,
          lineNumber: parsedRows[0].lineNumber,
        })
      }
    }
    block = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      block.push({ line: trimmed, lineNumber: index + 1 })
      return
    }
    flush()
  })
  flush()
  return tables
}

function sameHeaderSignature(actual = [], expected = []) {
  return (
    actual.length === expected.length &&
    actual.every((header, index) => header === expected[index])
  )
}

function createDiagnostic({
  code,
  severity = 'warning',
  sourcePath,
  message,
  names = [],
  lineNumbers = [],
} = {}) {
  return {
    code,
    severity,
    sourcePath,
    message,
    names,
    lineNumbers,
  }
}

function findTableByHeaderSignature(source, expectedHeaders, sourcePath) {
  const tables = collectMarkdownTables(source)
  const matches = tables.filter((table) =>
    sameHeaderSignature(table.headers, expectedHeaders)
  )

  if (matches.length === 0) {
    return {
      table: null,
      diagnostics: [
        createDiagnostic({
          code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_SCHEMA_MISMATCH,
          severity: 'error',
          sourcePath,
          message: `未找到当前表头签名：${expectedHeaders.join(' | ')}`,
        }),
      ],
    }
  }

  if (matches.length > 1) {
    return {
      table: null,
      diagnostics: [
        createDiagnostic({
          code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_TABLE_AMBIGUOUS,
          severity: 'error',
          sourcePath,
          message: `发现 ${matches.length} 张相同表头的表，无法确定唯一真源表。`,
          lineNumbers: matches.map((table) => table.lineNumber),
        }),
      ],
    }
  }

  const table = matches[0]
  const diagnostics = []
  if (table.invalidRows.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_ROW_MISMATCH,
        severity: 'error',
        sourcePath,
        message: `${table.invalidRows.length} 行列数与表头不一致，已停止静默丢行。`,
        lineNumbers: table.invalidRows.map((entry) => entry.lineNumber),
      })
    )
  }
  if (table.rows.length === 0) {
    diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_EMPTY,
        severity: 'error',
        sourcePath,
        message: '表头已识别，但当前表没有数据行。',
      })
    )
  }
  return { table, diagnostics }
}

function parseMappedTableRows({
  source = '',
  sourcePath = '',
  expectedHeaders = [],
  fieldByHeader = {},
  requiredField,
}) {
  const { table, diagnostics } = findTableByHeaderSignature(
    source,
    expectedHeaders,
    sourcePath
  )
  if (!table) return { items: [], diagnostics }

  const items = []
  table.rows.forEach(({ cells, lineNumber }, rowIndex) => {
    const item = {
      rowNumber: rowIndex + 1,
      sourceLineNumber: lineNumber,
      sourcePath,
    }
    table.headers.forEach((header, cellIndex) => {
      const fieldKey = fieldByHeader[header]
      if (fieldKey) item[fieldKey] = stripMarkdownInline(cells[cellIndex])
    })
    if (!requiredField || item[requiredField]) {
      items.push(item)
      return
    }
    diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_ROW_MISMATCH,
        severity: 'error',
        sourcePath,
        message: `第 ${lineNumber} 行缺少必填字段 ${requiredField}。`,
        lineNumbers: [lineNumber],
      })
    )
  })

  if (requiredField) {
    const byValue = new Map()
    items.forEach((item) => {
      const value = item[requiredField]
      byValue.set(value, [...(byValue.get(value) || []), item])
    })
    const duplicateNames = [...byValue.entries()]
      .filter(([, matches]) => matches.length > 1)
      .map(([value]) => value)
    if (duplicateNames.length > 0) {
      diagnostics.push(
        createDiagnostic({
          code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_DUPLICATE_KEY,
          severity: 'error',
          sourcePath,
          message: `${requiredField} 存在重复值，不能作为稳定查阅入口。`,
          names: duplicateNames,
        })
      )
    }
  }

  return { items, diagnostics }
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

export function parseCapabilityMaturityDefinitions(source = '') {
  const result = parseMappedTableRows({
    source,
    sourcePath: DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    expectedHeaders: CAPABILITY_MATURITY_HEADERS,
    fieldByHeader: CAPABILITY_MATURITY_FIELD_BY_HEADER,
    requiredField: 'level',
  })
  const items = result.items
    .map((item) => ({
      ...item,
      level: item.level.toUpperCase(),
      levelNumber: Number.parseInt(item.level.replace(/^L/i, ''), 10),
    }))
    .sort((left, right) => left.levelNumber - right.levelNumber)
  const expectedLevels = Array.from({ length: 9 }, (_, index) => `L${index}`)
  const actualLevels = items.map((item) => item.level)

  if (
    actualLevels.length !== expectedLevels.length ||
    actualLevels.some((level, index) => level !== expectedLevels[index])
  ) {
    result.diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_SCHEMA_MISMATCH,
        severity: 'error',
        sourcePath: DEV_CAPABILITY_LEDGER_SOURCE_PATH,
        message: `能力成熟度定义必须完整覆盖 ${expectedLevels.join('、')}，当前为 ${actualLevels.join('、') || '空'}。`,
      })
    )
  }

  return { items, diagnostics: result.diagnostics }
}

function classifyTrial(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized.includes('limited') || normalized.includes('有限试用')) {
    return 'limited'
  }
  if (
    normalized.includes('不可试用') ||
    normalized.includes('不试用') ||
    /\bno\b/.test(normalized)
  ) {
    return 'no'
  }
  if (normalized.includes('yes') || normalized.includes('可试用')) return 'yes'
  return 'unknown'
}

function classifyDelivery(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (
    normalized.includes('不承诺') ||
    normalized.includes('不可承诺') ||
    /\bno\b/.test(normalized)
  ) {
    return 'no'
  }
  if (
    normalized.includes('yes') ||
    normalized.includes('可承诺') ||
    normalized.includes('已承诺')
  ) {
    return 'yes'
  }
  return 'unknown'
}

function buildSearchTextFromKeys(item, keys = []) {
  return keys
    .map((key) => item[key])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function deriveDomainLabel(layer = '', layerDomain = '') {
  const normalizedLayer = normalizeText(layer)
  const normalizedLayerDomain = normalizeText(layerDomain)
  const prefix = `${normalizedLayer} / `
  if (normalizedLayer && normalizedLayerDomain.startsWith(prefix)) {
    return normalizedLayerDomain.slice(prefix.length)
  }
  return normalizedLayerDomain
}

export function parseCapabilityEvidenceMarkdown(source = '') {
  const sourcePath = DEV_CAPABILITY_EVIDENCE_SOURCE_PATH
  const lines = String(source || '').split('\n')
  const items = []
  const diagnostics = []
  let current = null
  let currentField = ''

  const flush = () => {
    if (!current) return
    const recognizedFields = CAPABILITY_DETAIL_REQUIRED_FIELDS.filter(
      (field) => current[field]
    )
    current.structured = recognizedFields.length > 0
    current.key = `${sourcePath}:${current.sourceLineNumber}`
    items.push(current)

    if (
      current.structured &&
      recognizedFields.length !== CAPABILITY_DETAIL_REQUIRED_FIELDS.length
    ) {
      const missingFields = CAPABILITY_DETAIL_REQUIRED_FIELDS.filter(
        (field) => !current[field]
      )
      diagnostics.push(
        createDiagnostic({
          code: DEV_CAPABILITY_DIAGNOSTIC_CODES.DETAIL_SCHEMA_MISMATCH,
          severity: 'error',
          sourcePath,
          message: `“${current.name}”详情字段不完整：${missingFields.join('、')}`,
          names: [current.name],
          lineNumbers: [current.sourceLineNumber],
        })
      )
    }
    current = null
    currentField = ''
  }

  lines.forEach((line, index) => {
    const heading = line.match(/^###\s+(.+)$/)
    if (heading) {
      flush()
      current = {
        name: stripMarkdownInline(heading[1]),
        sourcePath,
        sourceLineNumber: index + 1,
      }
      return
    }
    if (!current) return

    if (!line.trim() || /^#{1,2}\s+/.test(line) || line.trim() === '---') {
      currentField = ''
      return
    }

    const fieldMatch = line.match(/^-\s+(.+?)[：:]\s*(.*)$/)
    if (fieldMatch) {
      const label = stripMarkdownInline(fieldMatch[1])
      currentField = CAPABILITY_DETAIL_FIELD_BY_LABEL[label] || ''
      if (currentField) {
        current[currentField] = stripMarkdownInline(fieldMatch[2])
      }
      return
    }

    const continuation = stripMarkdownInline(line)
    if (currentField && continuation && !line.trim().startsWith('```')) {
      current[currentField] = normalizeText(
        `${current[currentField] || ''} ${continuation}`
      )
    }
  })
  flush()

  if (items.length === 0) {
    diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_SCHEMA_MISMATCH,
        severity: 'error',
        sourcePath,
        message: '未找到任何三级能力详情标题（### 能力名）。',
      })
    )
  }

  const names = new Map()
  items.forEach((item) => {
    names.set(item.name, [...(names.get(item.name) || []), item])
  })
  const duplicateNames = [...names.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([name]) => name)
  if (duplicateNames.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.SOURCE_DUPLICATE_KEY,
        severity: 'error',
        sourcePath,
        message: '能力详情标题重复，无法唯一对齐快查表。',
        names: duplicateNames,
      })
    )
  }

  return { items, diagnostics, sourcePath }
}

export function parseCapabilityLedgerMarkdown(
  source = '',
  evidenceSource = ''
) {
  const quickResult = parseMappedTableRows({
    source,
    sourcePath: DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    expectedHeaders: CAPABILITY_TABLE_HEADERS,
    fieldByHeader: CAPABILITY_FIELD_BY_HEADER,
    requiredField: 'name',
  })
  const detailResult = parseCapabilityEvidenceMarkdown(evidenceSource)
  const maturityResult = parseCapabilityMaturityDefinitions(source)
  const diagnostics = [
    ...quickResult.diagnostics,
    ...detailResult.diagnostics,
    ...maturityResult.diagnostics,
  ]

  const detailsByName = new Map()
  detailResult.items.forEach((detail) => {
    detailsByName.set(detail.name, [
      ...(detailsByName.get(detail.name) || []),
      detail,
    ])
  })
  const quickNameSet = new Set(quickResult.items.map((item) => item.name))
  const missingDetailNames = quickResult.items
    .filter((item) => (detailsByName.get(item.name) || []).length !== 1)
    .map((item) => item.name)
  const orphanDetailNames = detailResult.items
    .filter((item) => !quickNameSet.has(item.name))
    .map((item) => item.name)

  if (missingDetailNames.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.DETAIL_MISSING,
        severity: 'warning',
        sourcePath: DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
        message: `${missingDetailNames.length} 个能力未找到完全同名的证据详情；未做模糊匹配。`,
        names: missingDetailNames,
      })
    )
  }
  if (orphanDetailNames.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: DEV_CAPABILITY_DIAGNOSTIC_CODES.DETAIL_ORPHAN,
        severity: 'warning',
        sourcePath: DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
        message: `${orphanDetailNames.length} 个详情标题未与能力快查表对齐。`,
        names: orphanDetailNames,
      })
    )
  }

  const items = quickResult.items.map((capability) => {
    const detailMatches = detailsByName.get(capability.name) || []
    const detail = detailMatches.length === 1 ? detailMatches[0] : null
    const maturity = parseMaturity(capability.maturity)
    const item = {
      ...capability,
      key: `${capability.sourcePath}:${capability.sourceLineNumber}`,
      detailMatched: Boolean(detail),
      detailSourcePath:
        detail?.sourcePath || DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
      detailSourceLineNumber: detail?.sourceLineNumber || null,
      domain: detail
        ? deriveDomainLabel(capability.layer, detail.layerDomain)
        : '',
      currentResult: detail?.currentResult || '',
      notIncluded: detail?.notIncluded || '',
      evidence: detail?.evidence || '',
      risk: detail?.risk || '',
      detailNextStep: detail?.nextStep || '',
      detailTrialAndCommitment: detail?.trialAndCommitment || '',
      maturityLabel: maturity.label,
      maturityMin: maturity.min,
      maturityMax: maturity.max,
      maturityBucket: maturity.bucket,
      trialStatus: classifyTrial(capability.customerVisibility),
      deliveryStatus: classifyDelivery(capability.customerVisibility),
    }
    item.searchText = buildSearchTextFromKeys(item, CAPABILITY_SEARCH_FIELDS)
    return item
  })

  return {
    items,
    maturityDefinitions: maturityResult.items,
    diagnostics,
    sourcePaths: [
      DEV_CAPABILITY_LEDGER_SOURCE_PATH,
      DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
    ],
  }
}

function customerKeyFromSourcePath(sourcePath = '') {
  return String(sourcePath).match(/^docs\/customers\/([^/]+)\//)?.[1] || ''
}

export function parseCustomerDeliveryMatrixMarkdown(source = '') {
  const result = parseMappedTableRows({
    source,
    sourcePath: DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
    expectedHeaders: DELIVERY_TABLE_HEADERS,
    fieldByHeader: DELIVERY_FIELD_BY_HEADER,
    requiredField: 'moduleName',
  })
  const customerKey = customerKeyFromSourcePath(
    DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH
  )
  const items = result.items.map((item) => {
    const mapped = {
      ...item,
      key: `${item.sourcePath}:${item.sourceLineNumber}`,
      customerKey,
    }
    mapped.searchText = buildSearchTextFromKeys(mapped, [
      'customerKey',
      ...DELIVERY_SEARCH_FIELDS,
    ])
    return mapped
  })
  return {
    items,
    diagnostics: result.diagnostics,
    sourcePaths: [DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH],
  }
}

export function parseCustomerDeltaLedgerMarkdown(source = '') {
  const result = parseMappedTableRows({
    source,
    sourcePath: DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
    expectedHeaders: DELTA_TABLE_HEADERS,
    fieldByHeader: DELTA_FIELD_BY_HEADER,
    requiredField: 'id',
  })
  const items = result.items.map((item) => {
    const mapped = {
      ...item,
      key: item.id,
    }
    mapped.searchText = buildSearchTextFromKeys(mapped, DELTA_SEARCH_FIELDS)
    return mapped
  })
  return {
    items,
    diagnostics: result.diagnostics,
    sourcePaths: [DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH],
  }
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
    detailMatched: capabilities.filter((item) => item.detailMatched).length,
    detailMissing: capabilities.filter((item) => !item.detailMatched).length,
    byLayer: countBy((item) => item.layer, capabilities),
    byDomain: countBy((item) => item.domain, capabilities),
    byMaturity: countBy((item) => item.maturityBucket, capabilities),
  }
}

export function buildCustomerDeliveryMatrixSummary(items = []) {
  return {
    total: items.length,
    trialReady: items.filter((item) => item.customerDeliveryStatus === '可试用')
      .length,
    delivered: items.filter((item) => item.customerDeliveryStatus === '已交付')
      .length,
    internalReady: items.filter((item) =>
      (item.customerDeliveryStatus || '').includes('内部可用')
    ).length,
    notStarted: items.filter((item) => item.customerDeliveryStatus === '未开始')
      .length,
    byStatus: countBy((item) => item.customerDeliveryStatus, items),
    byCustomer: countBy((item) => item.customerKey, items),
  }
}

export function buildCustomerDeltaLedgerSummary(items = []) {
  return {
    total: items.length,
    productCoreYes: items.filter((item) => item.productCoreDecision === '是')
      .length,
    productCoreCandidates: items.filter((item) =>
      (item.category || '').includes('Product Core')
    ).length,
    deferredOrForbidden: items.filter((item) => {
      const category = item.category || ''
      return category.includes('Deferred') || category.includes('Forbidden')
    }).length,
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
  { keyword = '', status = 'all' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()

  return items.filter((item) => {
    const keywordMatched = !query || item.searchText?.includes(query)
    const statusMatched =
      status === 'all' || item.customerDeliveryStatus === status
    return keywordMatched && statusMatched
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

export function selectVisibleLedgerItem(items = [], selectedKey = '') {
  if (!Array.isArray(items) || items.length === 0) return null
  return items.find((item) => item.key === selectedKey) || items[0]
}

export function buildDevCapabilityDocsHref(path = '') {
  const normalizedPath = String(path || '').trim()
  return normalizedPath
    ? `/__dev/docs?path=${encodeURIComponent(normalizedPath)}`
    : '/__dev/docs'
}
