import { DEV_DOCS_ROUTE, DEV_PRODUCT_CORE_ROUTE } from './devRoutes.mjs'

export { DEV_PRODUCT_CORE_ROUTE }

export const DEV_PRODUCT_CORE_SOURCE_PATH = 'docs/product/产品能力进度台账.md'
export const DEV_PRODUCT_CORE_MEMBERSHIP_ALL = 'all'
export const DEV_PRODUCT_CORE_MEMBERSHIP_ORDER = Object.freeze([
  'entered',
  'partial',
  'pending',
  'excluded',
])

export const DEV_PRODUCT_CORE_STATUS_PRESENTATION = Object.freeze({
  可试用: Object.freeze({
    key: 'entered',
    membership: '已进入内核',
    shortDescription: '当前承诺范围的主路径已经收口',
  }),
  实现中: Object.freeze({
    key: 'partial',
    membership: '部分进入',
    shortDescription: '已有实现，但完整主路径尚未收口',
  }),
  待办: Object.freeze({
    key: 'pending',
    membership: '尚未进入',
    shortDescription: '目前只有需求线索或评审结论',
  }),
  暂不做: Object.freeze({
    key: 'excluded',
    membership: '当前不纳入',
    shortDescription: '不属于当前版本的 Product Core 范围',
  }),
})

const STATUS_HEADING = '## 状态口径'
const CAPABILITY_HEADING = '## 能力状态'
const EVIDENCE_HEADING = '## 证据入口'

export function isDevProductCoreEnabled(env = import.meta.env) {
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
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

function splitMarkdownTableRow(row = '') {
  const cells = []
  let current = ''
  let inCode = false
  let bracketDepth = 0
  let parenDepth = 0
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
    if (!inCode) {
      if (char === '[' && previous !== '\\') bracketDepth += 1
      if (char === ']' && previous !== '\\') {
        bracketDepth = Math.max(0, bracketDepth - 1)
      }
      if (char === '(' && previous !== '\\' && bracketDepth === 0) {
        parenDepth += 1
      }
      if (char === ')' && previous !== '\\') {
        parenDepth = Math.max(0, parenDepth - 1)
      }
    }
    if (
      char === '|' &&
      !inCode &&
      bracketDepth === 0 &&
      parenDepth === 0 &&
      previous !== '\\'
    ) {
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
    cells.every((cell) => /^:?-{3,}:?$/.test(String(cell || '').trim()))
  )
}

function extractMarkdownSection(source = '', heading = '') {
  const lines = String(source || '').split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === heading)
  if (startIndex < 0) return ''
  const level = heading.match(/^#+/)?.[0]?.length || 2
  const endIndex = lines.findIndex(
    (line, index) =>
      index > startIndex && new RegExp(`^#{1,${level}}\\s+`).test(line.trim())
  )
  return lines
    .slice(startIndex + 1, endIndex < 0 ? undefined : endIndex)
    .join('\n')
    .trim()
}

function parseMarkdownTable(source = '', heading = '') {
  const sectionLines = extractMarkdownSection(source, heading)
    .split(/\r?\n/)
    .map((line) => line.trim())
  const headerIndex = sectionLines.findIndex((line) => line.startsWith('|'))
  if (headerIndex < 0) return []

  const headers = splitMarkdownTableRow(sectionLines[headerIndex]).map(
    stripMarkdownInline
  )
  const separator = splitMarkdownTableRow(sectionLines[headerIndex + 1] || '')
  if (!isSeparatorRow(separator) || separator.length !== headers.length) {
    return []
  }

  const rows = []
  for (let index = headerIndex + 2; index < sectionLines.length; index += 1) {
    const line = sectionLines[index]
    if (!line.startsWith('|')) break
    const cells = splitMarkdownTableRow(line)
    if (cells.length !== headers.length) continue
    rows.push(
      Object.fromEntries(
        headers.map((header, cellIndex) => [
          header,
          stripMarkdownInline(cells[cellIndex]),
        ])
      )
    )
  }
  return rows
}

function presentationForStatus(status = '') {
  return (
    DEV_PRODUCT_CORE_STATUS_PRESENTATION[status] ||
    Object.freeze({
      key: 'unknown',
      membership: '状态待核对',
      shortDescription: '台账出现了尚未登记的状态口径',
    })
  )
}

function normalizeRepoPath(path = '', baseDir = 'docs/product') {
  const rawPath = String(path || '')
    .split('#')[0]
    .split('?')[0]
    .trim()
  if (!rawPath || /^(?:[a-z]+:|\/)/i.test(rawPath)) return ''

  const segments = rawPath.startsWith('docs/')
    ? rawPath.split('/')
    : [...baseDir.split('/'), ...rawPath.split('/')]
  const normalized = []
  segments.forEach((segment) => {
    if (!segment || segment === '.') return
    if (segment === '..') {
      normalized.pop()
      return
    }
    normalized.push(segment)
  })
  const resolved = normalized.join('/')
  return resolved.endsWith('.md') ? resolved : ''
}

function parseMarkdownLinks(value = '') {
  return [...String(value || '').matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
    .map((match) => {
      const path = normalizeRepoPath(match[2])
      if (!path) return null
      return {
        label: stripMarkdownInline(match[1]),
        path,
        devDocsHref: `${DEV_DOCS_ROUTE}?path=${encodeURIComponent(path)}`,
      }
    })
    .filter(Boolean)
}

export function parseProductCoreStatusDefinitions(source = '') {
  return parseMarkdownTable(source, STATUS_HEADING).map((row) => {
    const status = row['产品状态'] || ''
    const presentation = presentationForStatus(status)
    return {
      key: presentation.key,
      status,
      membership: presentation.membership,
      shortDescription: presentation.shortDescription,
      meaning: row['含义'] || '',
    }
  })
}

export function parseProductCoreCapabilities(source = '') {
  return parseMarkdownTable(source, CAPABILITY_HEADING).map((row, index) => {
    const status = row['状态'] || ''
    const presentation = presentationForStatus(status)
    return {
      key: `capability-${String(index + 1).padStart(2, '0')}`,
      index: index + 1,
      capability: row['业务能力'] || '',
      status,
      membershipKey: presentation.key,
      membership: presentation.membership,
      membershipDescription: presentation.shortDescription,
      availableScope: row['当前可用范围'] || '',
      boundary: row['主要边界 / 下一步'] || '',
    }
  })
}

export function parseProductCoreEvidenceEntries(source = '') {
  return extractMarkdownSection(source, EVIDENCE_HEADING)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line, index) => {
      const rawContent = line.slice(2).trim()
      const colonIndex = rawContent.search(/[：:]/)
      return {
        key: `evidence-${String(index + 1).padStart(2, '0')}`,
        label: stripMarkdownInline(
          colonIndex >= 0 ? rawContent.slice(0, colonIndex) : rawContent
        ),
        description: stripMarkdownInline(
          colonIndex >= 0 ? rawContent.slice(colonIndex + 1) : rawContent
        ),
        links: parseMarkdownLinks(rawContent),
      }
    })
}

export function normalizeProductCoreMembership(value = '') {
  const normalized = String(value || '').trim()
  return DEV_PRODUCT_CORE_MEMBERSHIP_ORDER.includes(normalized)
    ? normalized
    : DEV_PRODUCT_CORE_MEMBERSHIP_ALL
}

export function filterProductCoreCapabilities(
  capabilities = [],
  { membership = DEV_PRODUCT_CORE_MEMBERSHIP_ALL, keyword = '' } = {}
) {
  const normalizedMembership = normalizeProductCoreMembership(membership)
  const normalizedKeyword = normalizeText(keyword).toLowerCase()

  return capabilities.filter((capability) => {
    if (
      normalizedMembership !== DEV_PRODUCT_CORE_MEMBERSHIP_ALL &&
      capability.membershipKey !== normalizedMembership
    ) {
      return false
    }
    if (!normalizedKeyword) return true

    return [
      capability.capability,
      capability.status,
      capability.membership,
      capability.availableScope,
      capability.boundary,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedKeyword)
  })
}

export function buildProductCoreSummary(capabilities = []) {
  const counts = Object.fromEntries(
    DEV_PRODUCT_CORE_MEMBERSHIP_ORDER.map((key) => [key, 0])
  )
  capabilities.forEach((capability) => {
    if (Object.hasOwn(counts, capability.membershipKey)) {
      counts[capability.membershipKey] += 1
    }
  })

  return {
    total: capabilities.length,
    counts,
    sourcePath: DEV_PRODUCT_CORE_SOURCE_PATH,
    readOnly: true,
    boundary:
      '进入 Product Core 只表示产品能力事实；不能推出目标环境已发布、恢复可用或客户已验收。',
  }
}
