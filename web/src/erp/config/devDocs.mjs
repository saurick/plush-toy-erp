export const DEV_DOCS_ROUTE = '/__dev/docs'

export const PINNED_DEV_DOC_PATHS = Object.freeze([
  'README.md',
  'web/README.md',
  'docs/current-source-of-truth.md',
  'docs/product/implementation-governance.md',
  'docs/product/product-completion-roadmap.md',
  'docs/product/product-delivery-ledgers.md',
  'docs/product/test-strategy.md',
])

export const DEV_DOCS_PINNED_STORAGE_KEY = 'plush_erp_dev_docs_pinned_paths'
export const DEV_DOCS_SELECTED_PATH_STORAGE_KEY =
  'plush_erp_dev_docs_selected_path'
export const DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY =
  'plush_erp_dev_docs_expanded_dirs'
export const DEV_DOCS_TOC_EXPANDED_STORAGE_KEY =
  'plush_erp_dev_docs_toc_expanded'

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

function groupForPath(path = '') {
  if (
    [
      'README.md',
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
      'docs/current-source-of-truth.md',
      'docs/document-inventory.md',
    ].includes(path)
  ) {
    return '真源'
  }
  if (path.startsWith('docs/product/')) return '产品'
  if (path.startsWith('docs/architecture/')) return '架构'
  if (path.startsWith('docs/customers/')) return '客户'
  if (path.startsWith('docs/workflow/')) return 'Workflow'
  if (path.startsWith('docs/warehouse/')) return '仓库'
  if (path.startsWith('docs/finance/')) return '财务'
  if (path.startsWith('docs/roles/')) return '角色'
  if (path.startsWith('docs/observability/')) return '可观测'
  if (path.startsWith('docs/reference/')) return '参考'
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
    byPath.set(path, {
      key: path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      title: titleFromMarkdown(source, path),
      filename: filenameForPath(path),
      path,
      group: groupForPath(path),
      defaultPinned: PINNED_DEV_DOC_PATHS.includes(path),
      source,
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

export function filterDevDocsItems(items = [], keyword = '') {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!query) {
    return items
  }

  return items.filter((item) =>
    [item.title, item.path, item.group, item.searchText]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  )
}
