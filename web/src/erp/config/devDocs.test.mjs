import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
  DEV_DOCS_ROUTE,
  DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
  DEV_DOCS_TOC_EXPANDED_STORAGE_KEY,
  applyDevDocsPinnedState,
  buildDevDocsItems,
  buildDevDocsTree,
  filterDevDocsItems,
  getDefaultDevDocsPinnedPaths,
  isDevDocsEnabled,
  normalizeDevDocsExpandedDirKeys,
  normalizeDevDocsPinnedPaths,
  normalizeDevDocsSelectedPath,
  sortDevDocsItemsByPinned,
} from './devDocs.mjs'

function findDirectory(nodes, path) {
  for (const node of nodes) {
    if (node.type === 'directory' && node.path === path) {
      return node
    }
    if (node.type === 'directory') {
      const nested = findDirectory(node.children, path)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

test('devDocs: 只通过开发态独立路径暴露', () => {
  assert.equal(DEV_DOCS_ROUTE, '/__dev/docs')
  assert.equal(
    DEV_DOCS_TOC_EXPANDED_STORAGE_KEY,
    'plush_erp_dev_docs_toc_expanded'
  )
  assert.equal(isDevDocsEnabled({ DEV: true }), true)
  assert.equal(isDevDocsEnabled({ DEV: false }), false)
  assert.equal(isDevDocsEnabled({}), false)
  assert(!DEV_DOCS_ROUTE.startsWith('/erp/'))
})

test('devDocs: 全量开发文档列表不恢复产品内文档 registry', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../README.md': '# 前端 README',
    '../../../../docs/current-source-of-truth.md': '# 当前真源与交接顺序',
    '../../../../docs/product/product-completion-roadmap.md':
      '# 产品完成路线图',
    '../../../../docs/archive/progress-2026-06-02-before-print-template-defer.md':
      '# 过程记录归档',
    '../../../../docs/customers/yoyoosun/README.md': '# 永绅客户资料边界',
  })

  const keys = docs.map((item) => item.key)
  const paths = docs.map((item) => item.path)

  assert.equal(new Set(keys).size, keys.length)
  assert(paths.includes('README.md'))
  assert(paths.includes('web/README.md'))
  assert(paths.includes('docs/current-source-of-truth.md'))
  assert(
    paths.includes(
      'docs/archive/progress-2026-06-02-before-print-template-defer.md'
    )
  )
  assert(paths.includes('docs/customers/yoyoosun/README.md'))
  assert(paths.includes('docs/product/product-completion-roadmap.md'))
  assert(!paths.some((path) => path.startsWith('web/src/erp/docs/')))
  assert(!paths.some((path) => path.includes('docs.mjs')))
  assert.equal(
    docs.find(
      (item) =>
        item.path ===
        'docs/archive/progress-2026-06-02-before-print-template-defer.md'
    )?.group,
    '归档'
  )
  assert.equal(
    docs.find((item) => item.path === 'docs/customers/yoyoosun/README.md')
      ?.group,
    '客户'
  )
  assert.equal(docs[0]?.path, 'README.md')
  assert.equal(
    docs.find((item) => item.path === 'README.md')?.defaultPinned,
    true
  )
})

test('devDocs: 按仓库路径生成目录树', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../docs/product/product-completion-roadmap.md':
      '# 产品完成路线图',
    '../../../../docs/customers/yoyoosun/import-strategy.md':
      '# yoyoosun 导入策略',
    '../../../../docs/customers/yoyoosun/source-materials.md':
      '# yoyoosun 来源资料',
    '../../../../docs/archive/progress-2026-06.md': '# 过程归档',
  })

  const tree = buildDevDocsTree(docs)
  const docsDir = findDirectory(tree, 'docs')
  const productDir = findDirectory(tree, 'docs/product')
  const customerDir = findDirectory(tree, 'docs/customers/yoyoosun')

  assert.equal(docsDir?.docCount, 4)
  assert.equal(productDir?.docCount, 1)
  assert.equal(customerDir?.docCount, 2)
  assert(
    customerDir?.children.some(
      (node) =>
        node.type === 'document' &&
        node.path === 'docs/customers/yoyoosun/import-strategy.md'
    )
  )
})

test('devDocs: 支持按标题、路径和正文索引筛选', () => {
  const items = [
    { title: '当前真源', path: 'docs/current-source-of-truth.md' },
    { title: '测试策略', path: 'docs/product/test-strategy.md' },
    {
      title: '路线图',
      path: 'docs/product/product-completion-roadmap.md',
      searchText: 'Phase V1',
    },
  ]

  assert.deepEqual(
    filterDevDocsItems(items, 'truth').map((item) => item.title),
    ['当前真源']
  )
  assert.deepEqual(
    filterDevDocsItems(items, 'phase').map((item) => item.title),
    ['路线图']
  )
})

test('devDocs: 支持本地置顶路径归一化和排序', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../docs/current-source-of-truth.md': '# 当前真源与交接顺序',
    '../../../../docs/product/product-completion-roadmap.md':
      '# 产品完成路线图',
    '../../../../docs/archive/progress-2026-06.md': '# 过程归档',
  })

  assert.deepEqual(getDefaultDevDocsPinnedPaths(docs), [
    'README.md',
    'docs/current-source-of-truth.md',
    'docs/product/product-completion-roadmap.md',
  ])
  assert.deepEqual(
    normalizeDevDocsPinnedPaths(
      [
        'docs/product/product-completion-roadmap.md',
        'missing.md',
        'docs/product/product-completion-roadmap.md',
        '../unsafe.txt',
      ],
      docs
    ),
    ['docs/product/product-completion-roadmap.md']
  )

  const docsWithPinned = applyDevDocsPinnedState(docs, [
    'docs/archive/progress-2026-06.md',
    'docs/current-source-of-truth.md',
  ])
  const sortedPaths = sortDevDocsItemsByPinned(docsWithPinned).map(
    (item) => item.path
  )

  assert.deepEqual(sortedPaths.slice(0, 2), [
    'docs/archive/progress-2026-06.md',
    'docs/current-source-of-truth.md',
  ])
})

test('devDocs: 支持刷新后恢复当前文档路径', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../docs/current-source-of-truth.md': '# 当前真源与交接顺序',
    '../../../../docs/product/test-strategy.md': '# 自动化测试策略',
  })

  assert.equal(
    DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
    'plush_erp_dev_docs_selected_path'
  )
  assert.equal(
    normalizeDevDocsSelectedPath('docs/product/test-strategy.md', docs),
    'docs/product/test-strategy.md'
  )
  assert.equal(
    normalizeDevDocsSelectedPath('docs/product/missing.md', docs),
    ''
  )
  assert.equal(normalizeDevDocsSelectedPath('../unsafe.txt', docs), '')
})

test('devDocs: 支持刷新后恢复目录展开状态', () => {
  assert.equal(
    DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
    'plush_erp_dev_docs_expanded_dirs'
  )
  assert.deepEqual(
    normalizeDevDocsExpandedDirKeys(
      [
        'dir:docs',
        'dir:docs/product',
        'dir:docs/product',
        'doc:docs/product/test-strategy.md',
        '../unsafe',
        'dir:missing',
      ],
      ['dir:docs', 'dir:docs/product', 'dir:docs/archive']
    ),
    ['dir:docs', 'dir:docs/product']
  )
})
