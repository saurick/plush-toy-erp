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
  const pinnedRank = new Map(
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
      pinned: pinnedRank.has(path),
      source,
    })
  })

  return [...byPath.values()].sort((left, right) => {
    const leftPinned = pinnedRank.has(left.path)
    const rightPinned = pinnedRank.has(right.path)
    if (leftPinned || rightPinned) {
      return (
        (pinnedRank.get(left.path) ?? Number.MAX_SAFE_INTEGER) -
        (pinnedRank.get(right.path) ?? Number.MAX_SAFE_INTEGER)
      )
    }
    if (left.group !== right.group) {
      return left.group.localeCompare(right.group, 'zh-Hans-CN')
    }
    return left.path.localeCompare(right.path, 'zh-Hans-CN')
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
