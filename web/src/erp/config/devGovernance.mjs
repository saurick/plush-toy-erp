import { DEV_DOCS_ROUTE } from './devDocs.mjs'

export const DEV_GOVERNANCE_ROUTE = '/__dev/governance'
export const DEV_GOVERNANCE_SOURCE_PATH = 'docs/项目治理地图.md'

const AXIS_TABLE_HEADING = '## 治理维度与口径速查'
const TASK_ROUTING_TABLE_HEADING = '## 常见任务分流'
const GOVERNANCE_MERMAID_HEADING = '## 项目治理分流图'

const DOCS_VIEWER_SUPPORTED_ROOTS = Object.freeze([
  'README.md',
  'AGENTS.md',
  'web/README.md',
  'server/README.md',
  'scripts/README.md',
])

export function isDevGovernanceEnabled(env = import.meta.env) {
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
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

function extractMarkdownSection(source = '', heading = '') {
  const text = String(source || '')
  const startIndex = text.indexOf(heading)
  if (startIndex < 0) {
    return ''
  }
  const afterHeading = text.slice(startIndex + heading.length)
  const endIndex = afterHeading.search(/\n##\s+/)
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

function resolveRelativePath(
  rawPath = '',
  basePath = DEV_GOVERNANCE_SOURCE_PATH
) {
  const raw = String(rawPath || '').trim()
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return raw
  }
  if (raw.startsWith('/')) {
    return raw.slice(1)
  }

  const baseSegments = String(basePath || '')
    .split('/')
    .slice(0, -1)
  const segments = raw.startsWith('#') ? [basePath] : [...baseSegments, raw]
  const normalized = []

  segments
    .join('/')
    .split('/')
    .filter(Boolean)
    .forEach((segment) => {
      if (segment === '.') return
      if (segment === '..') {
        normalized.pop()
        return
      }
      normalized.push(segment)
    })
  return normalized.join('/')
}

function supportsDevDocsPath(path = '') {
  const normalizedPath = String(path || '').trim()
  return (
    DOCS_VIEWER_SUPPORTED_ROOTS.includes(normalizedPath) ||
    normalizedPath.startsWith('docs/')
  )
}

export function buildDevDocsHref(path = '', hash = '') {
  const normalizedPath = String(path || '').trim()
  if (!supportsDevDocsPath(normalizedPath)) {
    return ''
  }
  const normalizedHash = String(hash || '')
    .trim()
    .replace(/^#/, '')
  return `${DEV_DOCS_ROUTE}?path=${encodeURIComponent(normalizedPath)}${
    normalizedHash ? `#${normalizedHash}` : ''
  }`
}

export function parseMarkdownLinks(
  value = '',
  basePath = DEV_GOVERNANCE_SOURCE_PATH
) {
  return [...String(value || '').matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(
    (match) => {
      const [, rawLabel, rawHref] = match
      const [rawPath, rawHash = ''] = String(rawHref || '').split('#')
      const path = resolveRelativePath(rawPath || basePath, basePath)
      const hash = rawHash ? `#${rawHash}` : ''
      return {
        label: stripMarkdownInline(rawLabel),
        href: rawHref,
        path,
        hash,
        copyPath: `${path}${hash}`,
        devDocsHref: buildDevDocsHref(path, hash),
      }
    }
  )
}

function mapTableRows(source = '', heading = '', fieldByHeader = {}) {
  const { headers, rows } = parseMarkdownTable(source, heading)
  if (headers.length === 0) return []

  return rows.map((cells, rowIndex) => {
    const item = {
      key: `${heading}:${rowIndex + 1}`,
      rowNumber: rowIndex + 1,
    }

    headers.forEach((header, cellIndex) => {
      const fieldKey = fieldByHeader[header]
      if (!fieldKey) return
      const rawValue = cells[cellIndex] || ''
      item[`${fieldKey}Raw`] = rawValue
      item[fieldKey] = stripMarkdownInline(rawValue)
      item[`${fieldKey}Links`] = parseMarkdownLinks(rawValue)
    })

    item.searchText = Object.values(item)
      .filter((value) => typeof value === 'string')
      .join(' ')
      .toLowerCase()

    return item
  })
}

export function parseGovernanceAxes(source = '') {
  return mapTableRows(source, AXIS_TABLE_HEADING, {
    治理维度与口径: 'axis',
    回答什么: 'question',
    先看哪里: 'sources',
    不要混成: 'boundary',
  })
}

export function parseGovernanceTaskRoutes(source = '') {
  return mapTableRows(source, TASK_ROUTING_TABLE_HEADING, {
    如果本轮要做: 'task',
    第一跳: 'firstHop',
    必须同步检查: 'syncCheck',
  })
}

export function extractGovernanceMermaid(source = '') {
  const section = extractMarkdownSection(source, GOVERNANCE_MERMAID_HEADING)
  const match = section.match(/```mermaid\s*([\s\S]*?)```/)
  return match ? match[1].trim() : ''
}

export function filterGovernanceTasks(tasks = [], keyword = '') {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!query) return tasks
  return tasks.filter((task) => task.searchText?.includes(query))
}

function collectGovernanceLinkPaths(item = {}, linkFields = []) {
  const paths = new Set()
  linkFields.forEach((field) => {
    const links = item[field] || []
    links.forEach((link) => {
      if (link.path) paths.add(link.path)
    })
  })
  return paths
}

function normalizeGovernanceToken(value = '') {
  return stripMarkdownInline(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectGovernanceTextTokens(value = '') {
  return normalizeGovernanceToken(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !['md', 'docs', 'readme', 'skill'].includes(token))
}

function scoreGovernanceTaskForAxis(task = {}, axis = {}) {
  if (!task || !axis) return 0

  const axisPaths = collectGovernanceLinkPaths(axis, ['sourcesLinks'])
  const taskPaths = collectGovernanceLinkPaths(task, [
    'firstHopLinks',
    'syncCheckLinks',
  ])
  let score = 0

  axisPaths.forEach((path) => {
    if (taskPaths.has(path)) score += 10
  })

  const taskText = normalizeGovernanceToken(task.searchText || '')
  const axisTokens = [
    ...collectGovernanceTextTokens(axis.axis),
    ...collectGovernanceTextTokens(axis.question),
  ]
  const uniqueAxisTokens = [...new Set(axisTokens)]
  uniqueAxisTokens.forEach((token) => {
    if (taskText.includes(token)) score += 1
  })

  return score
}

export function getRelatedGovernanceTasks(tasks = [], axis = {}) {
  const scoredTasks = tasks
    .map((task, index) => ({
      index,
      score: scoreGovernanceTaskForAxis(task, axis),
      task,
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })

  return scoredTasks.map((item) => item.task)
}

export function buildGovernanceSummary({
  axes = [],
  tasks = [],
  mermaid = '',
} = {}) {
  const uniqueSourcePaths = new Set()
  axes.forEach((axis) => {
    axis.sourcesLinks?.forEach((link) => {
      if (link.path) uniqueSourcePaths.add(link.path)
    })
  })
  tasks.forEach((task) => {
    const taskLinks = [
      ...(task.firstHopLinks || []),
      ...(task.syncCheckLinks || []),
    ]
    taskLinks.forEach((link) => {
      if (link.path) uniqueSourcePaths.add(link.path)
    })
  })

  return {
    axisCount: axes.length,
    taskCount: tasks.length,
    sourceCount: uniqueSourcePaths.size,
    hasMermaid: Boolean(mermaid),
    sourcePath: DEV_GOVERNANCE_SOURCE_PATH,
    boundary:
      'Markdown remains the source of truth; this page is a dev-only read-only view.',
  }
}
