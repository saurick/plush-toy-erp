export const DEV_TESTING_ROUTE = '/__dev/testing'
export const DEV_TESTING_STRATEGY_SOURCE_PATH = 'docs/product/test-strategy.md'

export const DEV_TESTING_DOC_KEYWORDS = Object.freeze([
  '测试',
  '验收',
  '回归',
  '门禁',
  '证据',
  'QA',
  'qa',
  'test',
  'smoke',
  'style:l1',
  'Playwright',
])

export function isDevTestingEnabled(env = import.meta.env) {
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

function stripHeadingMarkdown(rawTitle = '') {
  return stripMarkdownInline(rawTitle)
    .replace(/\s+#+\s*$/, '')
    .trim()
}

function normalizeGlobPath(modulePath = '') {
  const cleanPath = String(modulePath || '').replace(/\?.*$/, '')
  if (cleanPath.startsWith('../../../../')) {
    return cleanPath.slice('../../../../'.length)
  }
  if (cleanPath.startsWith('../../../')) {
    return `web/${cleanPath.slice('../../../'.length)}`
  }
  return cleanPath.replace(/^\.?\//, '')
}

function normalizeModuleValue(value) {
  if (typeof value === 'string') return value
  if (typeof value?.default === 'string') return value.default
  return ''
}

function titleFromMarkdown(source = '', fallbackPath = '') {
  const match = String(source || '').match(/^#\s+(.+)$/m)
  if (match) {
    return stripHeadingMarkdown(match[1])
  }
  const filename =
    String(fallbackPath || '')
      .split('/')
      .pop() || fallbackPath
  return filename.replace(/\.md$/i, '')
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

function extractInlineCommands(value = '') {
  return [...String(value || '').matchAll(/`([^`]+)`/g)]
    .map((match) => stripMarkdownInline(match[1]))
    .filter((command) => {
      return /^(cd|pnpm|npm|node|bash|go|make|git|grep|docker|APP_ID=|STYLE_|TRIAL_|PHASE|CUSTOMER_)/.test(
        command
      )
    })
}

export function parseDevTestingStrategyTiers(source = '') {
  const { headers, rows } = parseMarkdownTable(source, '## 3. 测试分层')
  if (headers.length === 0) return []

  const headerIndex = Object.fromEntries(
    headers.map((header, index) => [header, index])
  )

  return rows.map((cells, index) => {
    const level = stripMarkdownInline(cells[headerIndex['层级']] || '')
    const changeType = stripMarkdownInline(cells[headerIndex['改动类型']] || '')
    const commandText = cells[headerIndex['必跑或优先命令']] || ''
    const description = stripMarkdownInline(cells[headerIndex['说明']] || '')
    const key = level.split(/\s+/)[0] || `T${index}`

    return {
      key,
      level,
      changeType,
      commands: extractInlineCommands(commandText),
      description,
      searchText: [level, changeType, commandText, description]
        .join(' ')
        .toLowerCase(),
    }
  })
}

export function extractDevTestingCommandBlocks(
  source = '',
  { sourcePath = '', title = '' } = {}
) {
  const blocks = []
  const text = String(source || '')
  const pattern = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g
  let match
  while (true) {
    match = pattern.exec(text)
    if (match === null) break
    const before = text.slice(0, match.index)
    const headingMatch = [...before.matchAll(/^#{2,4}\s+(.+)$/gm)].pop()
    const context = headingMatch ? stripHeadingMarkdown(headingMatch[1]) : title
    const commands = match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('#'))

    if (commands.length === 0) continue

    blocks.push({
      key: `${sourcePath || 'source'}:${blocks.length}`,
      sourcePath,
      title,
      context,
      commands,
      commandText: commands.join('\n'),
      searchText: [sourcePath, title, context, commands.join(' ')]
        .join(' ')
        .toLowerCase(),
    })
  }
  return blocks
}

function classifyTestingDoc(path = '', source = '') {
  if (path === DEV_TESTING_STRATEGY_SOURCE_PATH) return '测试策略'
  if (path.includes('/phase') && /evidence|验收|发布|smoke/i.test(source)) {
    return '发布验收'
  }
  if (path.includes('/import-') || path.includes('/source-snapshot')) {
    return '导入验收'
  }
  if (path.includes('/trial-') || path.includes('acceptance')) {
    return '试用验收'
  }
  if (path.includes('/reference/')) return '参考'
  if (path.includes('/archive/')) return '归档'
  if (/qa|test|测试|验收|回归|smoke|style:l1/i.test(path)) {
    return '测试资料'
  }
  return '相关文档'
}

function countKeywordHits(value = '') {
  const normalized = String(value || '').toLowerCase()
  return DEV_TESTING_DOC_KEYWORDS.reduce((total, keyword) => {
    const target = keyword.toLowerCase()
    return total + (normalized.includes(target) ? 1 : 0)
  }, 0)
}

export function buildDevTestingDocs(markdownModules = {}) {
  const byPath = new Map()

  Object.entries(markdownModules).forEach(([modulePath, moduleValue]) => {
    const path = normalizeGlobPath(modulePath)
    if (
      !path.startsWith('docs/') ||
      !path.endsWith('.md') ||
      byPath.has(path)
    ) {
      return
    }

    const source = normalizeModuleValue(moduleValue)
    const title = titleFromMarkdown(source, path)
    const haystack = [path, title, source].join('\n')
    const keywordHits = countKeywordHits(haystack)
    if (path !== DEV_TESTING_STRATEGY_SOURCE_PATH && keywordHits === 0) {
      return
    }

    const commandBlocks = extractDevTestingCommandBlocks(source, {
      sourcePath: path,
      title,
    })
    const category = classifyTestingDoc(path, source)

    byPath.set(path, {
      key: path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      path,
      title,
      category,
      keywordHits,
      commandCount: commandBlocks.reduce(
        (total, block) => total + block.commands.length,
        0
      ),
      commandBlocks,
      source,
      searchText: [path, title, category, source].join(' ').toLowerCase(),
    })
  })

  return [...byPath.values()].sort((left, right) => {
    if (left.path === DEV_TESTING_STRATEGY_SOURCE_PATH) return -1
    if (right.path === DEV_TESTING_STRATEGY_SOURCE_PATH) return 1
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category, 'zh-Hans-CN')
    }
    if (left.keywordHits !== right.keywordHits) {
      return right.keywordHits - left.keywordHits
    }
    return left.path.localeCompare(right.path, 'zh-Hans-CN')
  })
}

export function getDevTestingCategoryOptions(docs = []) {
  return [
    { label: '全部', value: 'all' },
    ...[...new Set(docs.map((item) => item.category).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((category) => ({ label: category, value: category })),
  ]
}

export function filterDevTestingDocs(
  docs = [],
  { keyword = '', category = 'all' } = {}
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  return docs.filter((item) => {
    if (category !== 'all' && item.category !== category) return false
    if (!query) return true
    return item.searchText.includes(query)
  })
}

export function buildDevTestingSummary({ tiers = [], docs = [] } = {}) {
  const commandCount = docs.reduce(
    (total, item) => total + item.commandCount,
    0
  )
  const docsWithCommands = docs.filter((item) => item.commandCount > 0).length
  const strategyDoc = docs.find(
    (item) => item.path === DEV_TESTING_STRATEGY_SOURCE_PATH
  )
  return {
    tierCount: tiers.length,
    docCount: docs.length,
    commandCount,
    docsWithCommands,
    strategyCommandCount: strategyDoc?.commandCount || 0,
  }
}
