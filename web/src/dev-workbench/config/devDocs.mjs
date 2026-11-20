export { DEV_DOCS_ROUTE } from './devRoutes.mjs'

export const DEV_DOCS_HOME_PATH = 'docs/README.md'

export const PINNED_DEV_DOC_PATHS = Object.freeze([
  DEV_DOCS_HOME_PATH,
  'README.md',
  'AGENTS.md',
  'web/README.md',
  'docs/当前真源与交接顺序.md',
  'docs/项目治理地图.md',
  'docs/product/模块实施治理.md',
  'docs/product/产品完成路线图.md',
  'docs/product/产品能力进度台账.md',
  'docs/product/自动化测试策略.md',
])

const DIRECTORY_LABELS = Object.freeze({
  docs: '项目文档',
  'docs/manuals': '使用与实施手册',
  'docs/product': '产品与业务规则',
  'docs/product/ui-design': '交互设计',
  'docs/architecture': '架构与领域边界',
  'docs/engineering': '开发与交付',
  'docs/workflow': '工作流与协同',
  'docs/roles': '角色与权限',
  'docs/warehouse': '仓库与品质',
  'docs/finance': '财务',
  'docs/observability': '日志与审计',
  'docs/security': '安全与隐私',
  'docs/customers': '客户实施资料',
  'docs/archive': '历史归档',
  'docs/archive/architecture-history': '架构历史',
  'docs/archive/customer-evidence': '客户历史证据',
  server: '后端',
  'server/docs': '后端专题',
  'server/docs/database': '数据字典',
  'server/deploy': '服务端部署',
  web: '前端',
  scripts: '脚本与检查',
  deployments: '客户交付',
  config: '配置',
  'config/customers': '客户配置',
  '.agents': '工程约定',
  '.agents/skills': '项目 Skills',
})

export function getDevDocsDisplayTitle(title = '') {
  const value = String(title || '')
  // 中英对照标题保留完整检索值，导航只显示中文主标题。
  return value.replace(/^(.*[\u3400-\u9fff].*?)\s+\/\s+[A-Za-z][\x20-\x7e]*$/u, '$1')
}

export const DEV_DOCS_PINNED_STORAGE_KEY = 'plush_erp_dev_docs_pinned_paths'
export const DEV_DOCS_SELECTED_PATH_STORAGE_KEY =
  'plush_erp_dev_docs_selected_path'
export const DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY =
  'plush_erp_dev_docs_expanded_dirs'
export const DEV_DOCS_TOC_EXPANDED_STORAGE_KEY =
  'plush_erp_dev_docs_toc_expanded'
export const DEV_DOCS_LIFECYCLE_STORAGE_KEY = 'plush_erp_dev_docs_lifecycle'

export const DEV_DOCS_SEARCH_SCOPE_ALL = 'all'
export const DEV_DOCS_SEARCH_SCOPE_TITLE = 'title'

export const DEV_DOCS_LIFECYCLE_CURRENT = 'current'
export const DEV_DOCS_LIFECYCLE_REVIEW = 'review'
export const DEV_DOCS_LIFECYCLE_ARCHIVE = 'archive'
export const DEV_DOCS_LIFECYCLES = Object.freeze([
  DEV_DOCS_LIFECYCLE_CURRENT,
  DEV_DOCS_LIFECYCLE_REVIEW,
  DEV_DOCS_LIFECYCLE_ARCHIVE,
])

export function isDevDocsEnabled(env = import.meta.env) {
  return env?.DEV === true
}

function stripHeadingMarkdown(rawTitle = '') {
  return String(rawTitle || '')
    .replace(/\s+#+\s*$/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()
}

function normalizeGlobPath(modulePath = '') {
  const cleanPath = String(modulePath || '').replace(/\?.*$/, '')
  if (cleanPath === '../../../../README.md') {
    return 'README.md'
  }
  if (cleanPath === '../../../../AGENTS.md') {
    return 'AGENTS.md'
  }
  if (cleanPath === '../../../README.md') {
    return 'web/README.md'
  }
  if (cleanPath.startsWith('../../../../')) {
    return cleanPath.slice('../../../../'.length)
  }
  if (cleanPath.startsWith('../../../')) {
    return `web/${cleanPath.slice('../../../'.length)}`
  }
  return cleanPath.replace(/^\.?\//, '')
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

function fallbackTitleFromPath(path = '') {
  const segments = String(path || '')
    .split('/')
    .filter(Boolean)
  const filename = segments.at(-1) || path
  if (/^README\.md$/iu.test(filename) && segments.length > 1) {
    return `${segments.at(-2)} / README`
  }
  return String(filename || '').replace(/\.md$/iu, '')
}

export function getDevDocsTitle(source = '', path = '') {
  return source ? titleFromMarkdown(source, path) : fallbackTitleFromPath(path)
}

export function getDevDocsLifecycle(path = '') {
  const normalizedPath = String(path || '')
  if (normalizedPath.startsWith('docs/archive/')) {
    return DEV_DOCS_LIFECYCLE_ARCHIVE
  }
  if (
    normalizedPath.startsWith('docs/reference/') ||
    (normalizedPath.startsWith('docs/product/ui-design/') &&
      normalizedPath !== 'docs/product/ui-design/README.md')
  ) {
    return DEV_DOCS_LIFECYCLE_REVIEW
  }
  return DEV_DOCS_LIFECYCLE_CURRENT
}

export function normalizeDevDocsLifecycle(
  lifecycle = DEV_DOCS_LIFECYCLE_CURRENT
) {
  return DEV_DOCS_LIFECYCLES.includes(lifecycle)
    ? lifecycle
    : DEV_DOCS_LIFECYCLE_CURRENT
}

export function filterDevDocsByLifecycle(
  items = [],
  lifecycle = DEV_DOCS_LIFECYCLE_CURRENT
) {
  const normalizedLifecycle = normalizeDevDocsLifecycle(lifecycle)
  return items.filter(
    (item) => normalizeDevDocsLifecycle(item.lifecycle) === normalizedLifecycle
  )
}

function groupForPath(path = '') {
  if (
    [
      'README.md',
      'AGENTS.md',
      'web/README.md',
      'server/README.md',
      'scripts/README.md',
    ].includes(path)
  ) {
    return '入口'
  }
  if (
    [
      'docs/README.md',
      'docs/当前真源与交接顺序.md',
      'docs/项目治理地图.md',
      'docs/文档清单.md',
    ].includes(path)
  ) {
    return '真源'
  }
  if (path.startsWith('docs/product/')) return '产品'
  if (path.startsWith('docs/architecture/')) return '架构'
  if (path.startsWith('docs/customers/')) return '客户'
  if (path.startsWith('config/customers/')) return '客户配置'
  if (path.startsWith('docs/workflow/')) return 'Workflow'
  if (path.startsWith('docs/warehouse/')) return '仓库'
  if (path.startsWith('docs/finance/')) return '财务'
  if (path.startsWith('docs/roles/')) return '角色'
  if (path.startsWith('docs/observability/')) return '可观测'
  if (path.startsWith('docs/archive/')) return '归档'
  if (path.startsWith('docs/')) return '文档'
  return '其他'
}

function filenameForPath(path = '') {
  return (
    String(path || '')
      .split('/')
      .pop() || path
  )
}

function normalizeModuleValue(value) {
  if (typeof value === 'string') return value
  if (typeof value?.default === 'string') return value.default
  return ''
}

function keyForPath(path = '') {
  return `doc:${String(path || '')}`
}

export function buildDevDocsItems(markdownModules = {}) {
  const defaultPinnedRank = new Map(
    PINNED_DEV_DOC_PATHS.map((path, index) => [path, index])
  )
  const byPath = new Map()

  Object.entries(markdownModules).forEach(([modulePath, moduleValue]) => {
    const path = normalizeGlobPath(modulePath)
    if (!path || byPath.has(path) || !path.endsWith('.md')) {
      return
    }
    const source = normalizeModuleValue(moduleValue)
    const loadSource =
      typeof moduleValue === 'function'
        ? moduleValue
        : moduleValue?.loadSource
    byPath.set(path, {
      key: keyForPath(path),
      title: moduleValue?.title || getDevDocsTitle(source, path),
      filename: filenameForPath(path),
      path,
      group: groupForPath(path),
      lifecycle: getDevDocsLifecycle(path),
      defaultPinned: PINNED_DEV_DOC_PATHS.includes(path),
      source,
      loadSource,
    })
  })

  return [...byPath.values()].sort((left, right) => {
    const leftDefaultPinned = defaultPinnedRank.has(left.path)
    const rightDefaultPinned = defaultPinnedRank.has(right.path)
    if (leftDefaultPinned || rightDefaultPinned) {
      return (
        (defaultPinnedRank.get(left.path) ?? Number.MAX_SAFE_INTEGER) -
        (defaultPinnedRank.get(right.path) ?? Number.MAX_SAFE_INTEGER)
      )
    }
    if (left.group !== right.group) {
      return left.group.localeCompare(right.group, 'zh-Hans-CN')
    }
    return left.path.localeCompare(right.path, 'zh-Hans-CN')
  })
}

export function normalizeDevDocsPinnedPaths(paths = [], docs = []) {
  const availablePaths = new Set(docs.map((item) => item.path))
  return [...new Set(paths)]
    .map((path) => String(path || '').trim())
    .filter((path) => path.endsWith('.md'))
    .filter((path) => availablePaths.size === 0 || availablePaths.has(path))
}

export function normalizeDevDocsSelectedPath(path = '', docs = []) {
  const selectedPath = String(path || '').trim()
  if (!selectedPath.endsWith('.md')) {
    return ''
  }
  const availablePaths = new Set(docs.map((item) => item.path))
  return availablePaths.size === 0 || availablePaths.has(selectedPath)
    ? selectedPath
    : ''
}

export function normalizeDevDocsExpandedDirKeys(keys = [], availableKeys = []) {
  const availableKeySet = new Set(availableKeys)
  return [...new Set(keys)]
    .map((key) => String(key || '').trim())
    .filter((key) => key.startsWith('dir:'))
    .filter((key) => availableKeySet.size === 0 || availableKeySet.has(key))
}

export function getDefaultDevDocsPinnedPaths(docs = []) {
  return normalizeDevDocsPinnedPaths(PINNED_DEV_DOC_PATHS, docs)
}

export function applyDevDocsPinnedState(docs = [], pinnedPaths = []) {
  const pinnedRank = new Map(
    normalizeDevDocsPinnedPaths(pinnedPaths, docs).map((path, index) => [
      path,
      index,
    ])
  )
  return docs.map((item) => ({
    ...item,
    pinned: pinnedRank.has(item.path),
    pinnedRank: pinnedRank.get(item.path) ?? Number.MAX_SAFE_INTEGER,
  }))
}

export function sortDevDocsItemsByPinned(items = []) {
  return [...items].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1
    }
    if (left.pinned && right.pinned) {
      return left.pinnedRank - right.pinnedRank
    }
    return 0
  })
}

export function buildDevDocsTree(items = []) {
  const root = {
    type: 'directory',
    key: 'dir:',
    name: '',
    path: '',
    children: [],
    docCount: 0,
  }

  items.forEach((item) => {
    const segments = String(item.path || '')
      .split('/')
      .filter(Boolean)
    if (segments.length === 0) {
      return
    }

    let current = root
    segments.slice(0, -1).forEach((segment, index) => {
      const dirPath = segments.slice(0, index + 1).join('/')
      let directory = current.children.find(
        (child) => child.type === 'directory' && child.path === dirPath
      )
      if (!directory) {
        directory = {
          type: 'directory',
          key: `dir:${dirPath}`,
          name: segment,
          label: DIRECTORY_LABELS[dirPath] || segment,
          path: dirPath,
          children: [],
          docCount: 0,
        }
        current.children.push(directory)
      }
      current = directory
    })

    current.children.push({
      type: 'document',
      key: `doc:${item.path}`,
      name: item.filename || filenameForPath(item.path),
      path: item.path,
      item,
    })
  })

  function sortAndCount(node) {
    if (node.type !== 'directory') {
      return 1
    }

    node.children.sort((left, right) => {
      const leftIndex = left.type === 'document' && left.name === 'README.md'
      const rightIndex = right.type === 'document' && right.name === 'README.md'
      if (leftIndex !== rightIndex) return leftIndex ? -1 : 1
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })

    node.docCount = node.children.reduce(
      (total, child) => total + sortAndCount(child),
      0
    )
    return node.docCount
  }

  sortAndCount(root)
  return root.children
}

export function filterDevDocsItems(
  items = [],
  keyword = '',
  scope = DEV_DOCS_SEARCH_SCOPE_ALL
) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!query) {
    return items
  }

  return items.filter((item) =>
    (scope === DEV_DOCS_SEARCH_SCOPE_TITLE
      ? [item.title]
      : [item.title, item.path, item.group, item.searchText]
    )
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  )
}
