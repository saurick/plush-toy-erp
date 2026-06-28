export { DEV_TESTING_ROUTE } from './devRoutes.mjs'
export const DEV_TESTING_STRATEGY_SOURCE_PATH = 'docs/product/自动化测试策略.md'

export const DEV_TESTING_CURRENT_DOC_PATHS = Object.freeze([
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  'README.md',
  'web/README.md',
  'server/README.md',
  'scripts/README.md',
  'docs/部署约定.md',
  'server/deploy/README.md',
  'server/deploy/compose/prod/README.md',
])

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

export const DEV_TESTING_COPY_PRESETS = Object.freeze([
  {
    key: 'frontend',
    label: '本轮前端验证 / Frontend Check',
    description:
      '页面、路由、样式或前端 helper 改动时优先复制 / use for frontend changes.',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp/web',
      'pnpm lint',
      'pnpm css',
      'pnpm test',
      'pnpm style:l1',
    ],
  },
  {
    key: 'pre-commit',
    label: '提交前 QA / Pre-commit QA',
    description:
      '提交或推送前复制 / copy before commit or push；具体范围仍按本轮改动判断。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'bash scripts/qa/full.sh',
    ],
  },
  {
    key: 'release',
    label: '发版前严格 QA / Release QA',
    description:
      '发版前复制 / copy before release；不代表部署、备份或回滚已自动完成。',
    commands: [
      'cd /Users/simon/projects/plush-toy-erp',
      'bash scripts/qa/strict.sh',
    ],
  },
])

const DEV_TESTING_TIER_HEADINGS = Object.freeze([
  '## 4. 验证层级 T0-T8',
  '## 3. 测试分层',
])

const DEV_TESTING_TIER_COPY_FALLBACKS = Object.freeze({
  T1: [
    'cd /Users/simon/projects/plush-toy-erp',
    'git status --short',
    'git diff --stat',
    'git diff --check',
    'grep -R "tenant_id" docs/customers docs/product docs/architecture docs/reference config deployments server web || true',
    'grep -R "ChangeUsecase\\|change_records" server web docs || true',
  ],
  T7: [
    '# T7 当前没有完整业务 E2E runner；按触达事实层选择下列当前可用检查，不要伪造全链路自动化。',
    'cd /Users/simon/projects/plush-toy-erp/server',
    'go test ./internal/biz ./internal/data',
    '# 如本轮明确触达对应库存、BOM、采购入库或采购退货 PG 防呆测试，再按领域选择 server Makefile 中的对应 target',
  ],
  T8: [
    'cd /Users/simon/projects/plush-toy-erp',
    'bash scripts/qa/full.sh',
    'bash scripts/qa/strict.sh',
    '# 部署、备份、migration、health、smoke 和回滚按 server/deploy/README.md 与目标环境执行，浏览器入口不直接运行。',
  ],
})

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

function parseFirstMarkdownTable(source = '', headings = []) {
  for (const heading of headings) {
    const table = parseMarkdownTable(source, heading)
    if (table.headers.length > 0) return table
  }
  return { headers: [], rows: [] }
}

function extractInlineCommands(value = '') {
  return [...String(value || '').matchAll(/`([^`]+)`/g)]
    .map((match) => stripMarkdownInline(match[1]))
    .filter(isShellCommandLine)
}

function getMarkdownTableCell(cells = [], headerIndex = {}, headerNames = []) {
  for (const headerName of headerNames) {
    const index = headerIndex[headerName]
    if (Number.isInteger(index)) return cells[index] || ''
  }
  return ''
}

export function parseDevTestingStrategyTiers(source = '') {
  const { headers, rows } = parseFirstMarkdownTable(
    source,
    DEV_TESTING_TIER_HEADINGS
  )
  if (headers.length === 0) return []

  const headerIndex = Object.fromEntries(
    headers.map((header, index) => [header, index])
  )

  return rows.map((cells, index) => {
    const level = stripMarkdownInline(
      getMarkdownTableCell(cells, headerIndex, ['层级', '验证层级'])
    )
    const changeType = stripMarkdownInline(
      getMarkdownTableCell(cells, headerIndex, ['改动类型'])
    )
    const commandText = getMarkdownTableCell(cells, headerIndex, [
      '必跑或优先命令',
    ])
    const description = stripMarkdownInline(
      getMarkdownTableCell(cells, headerIndex, ['说明'])
    )
    const key = level.split(/\s+/)[0] || `T${index}`

    const commands = extractInlineCommands(commandText)
    const copyCommands =
      commands.length > 0
        ? commands
        : DEV_TESTING_TIER_COPY_FALLBACKS[key] || []

    return {
      key,
      level,
      changeType,
      commands,
      copyCommands,
      copyText: buildDevTestingCopyText(copyCommands),
      description,
      searchText: [level, changeType, commandText, description]
        .join(' ')
        .toLowerCase(),
    }
  })
}

export function buildDevTestingCopyText(commands = []) {
  return commands
    .map((command) => String(command || '').trim())
    .filter(Boolean)
    .join('\n')
}

function isShellCommandLine(line = '') {
  const command = String(line || '').trim()
  return /^((env|CI|APP_ID|STYLE_[A-Z0-9_]*|TRIAL_[A-Z0-9_]*|CUSTOMER_[A-Z0-9_]*|ERP_[A-Z0-9_]*|NODE_[A-Z0-9_]*|SKIP_[A-Z0-9_]*|STRICT_[A-Z0-9_]*|QA_[A-Z0-9_]*)=[^\s]+(\s+|$))*((cd|pnpm|npm|node|bash|go|make|git|grep|docker|curl|ssh|scp|rsync|atlas)\b|\/usr\/local\/bin\/(pnpm|atlas)\b)/.test(
    command
  )
}

function extractShellCommandsFromBlock(rawBlock = '') {
  const commands = []
  const lines = String(rawBlock || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let previousKeptContinuation = false
  lines.forEach((line) => {
    if (line.startsWith('#')) {
      previousKeptContinuation = false
      return
    }
    const keep =
      isShellCommandLine(line) ||
      (previousKeptContinuation &&
        /^(-{1,2}|\||&&|\|\||[A-Z0-9_]+=)/.test(line))
    if (!keep) {
      previousKeptContinuation = false
      return
    }
    commands.push(line)
    previousKeptContinuation = line.endsWith('\\')
  })

  return commands
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
    const commands = extractShellCommandsFromBlock(match[1])

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

function classifyTestingDoc(path = '') {
  if (path === DEV_TESTING_STRATEGY_SOURCE_PATH) return '测试策略'
  if (path === 'scripts/README.md') return 'QA 脚本'
  if (path === 'web/README.md') return '前端验证'
  if (path === 'server/README.md') return '后端验证'
  if (path === 'README.md') return '项目入口'
  if (path === 'docs/部署约定.md' || path.startsWith('server/deploy/')) {
    return '部署验证'
  }
  if (/release-evidence|target-release-evidence/i.test(path)) return '发布验收'
  if (path.includes('/import-') || path.includes('/source-snapshot')) {
    return '导入验收'
  }
  if (path.includes('/trial-') || path.includes('acceptance')) return '试用验收'
  return /qa|test|测试|验收|回归|smoke|style:l1/i.test(path)
    ? '测试资料'
    : '当前文档'
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
  const currentDocPaths = new Set(DEV_TESTING_CURRENT_DOC_PATHS)

  Object.entries(markdownModules).forEach(([modulePath, moduleValue]) => {
    const path = normalizeGlobPath(modulePath)
    if (
      !path.endsWith('.md') ||
      byPath.has(path) ||
      !currentDocPaths.has(path)
    ) {
      return
    }

    const source = normalizeModuleValue(moduleValue)
    const title = titleFromMarkdown(source, path)
    const haystack = [path, title, source].join('\n')
    const keywordHits = countKeywordHits(haystack)
    const commandBlocks = extractDevTestingCommandBlocks(source, {
      sourcePath: path,
      title,
    })
    const category = classifyTestingDoc(path, source)

    byPath.set(path, {
      key: path,
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

  const pathOrder = new Map(
    DEV_TESTING_CURRENT_DOC_PATHS.map((path, index) => [path, index])
  )

  return [...byPath.values()].sort((left, right) => {
    const leftOrder = pathOrder.get(left.path) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = pathOrder.get(right.path) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
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
