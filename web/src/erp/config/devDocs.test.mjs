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

test('devDocs: 当前工作区开发文档列表不恢复产品内文档 registry', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../AGENTS.md': '# 协作约定',
    '../../../README.md': '# 前端 README',
    '../../../../docs/当前真源与交接顺序.md': '# 当前真源与交接顺序',
    '../../../../docs/product/产品完成路线图.md': '# 产品完成路线图',
    '../../../../docs/archive/progress-2026-06-02-before-print-template-defer.md':
      '# 过程记录归档',
    '../../../../docs/customers/yoyoosun/README.md': '# 永绅客户资料边界',
  })

  const keys = docs.map((item) => item.key)
  const paths = docs.map((item) => item.path)

  assert.equal(new Set(keys).size, keys.length)
  assert.equal(
    docs.find((item) => item.path === 'docs/product/产品完成路线图.md')?.key,
    'doc:docs/product/产品完成路线图.md'
  )
  assert(paths.includes('README.md'))
  assert(paths.includes('AGENTS.md'))
  assert(paths.includes('web/README.md'))
  assert(paths.includes('docs/当前真源与交接顺序.md'))
  assert(
    paths.includes(
      'docs/archive/progress-2026-06-02-before-print-template-defer.md'
    )
  )
  assert(paths.includes('docs/customers/yoyoosun/README.md'))
  assert(paths.includes('docs/product/产品完成路线图.md'))
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
  assert.equal(docs[1]?.path, 'AGENTS.md')
  assert.equal(
    docs.find((item) => item.path === 'README.md')?.defaultPinned,
    true
  )
})

test('devDocs: 按仓库路径生成目录树', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../docs/product/产品完成路线图.md': '# 产品完成路线图',
    '../../../../docs/customers/yoyoosun/导入策略.md': '# yoyoosun 导入策略',
    '../../../../docs/customers/yoyoosun/来源材料.md': '# yoyoosun 来源资料',
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
        node.path === 'docs/customers/yoyoosun/导入策略.md'
    )
  )
})

test('devDocs: 支持按标题、路径和正文索引筛选', () => {
  const items = [
    {
      title: '当前真源',
      path: 'docs/当前真源与交接顺序.md',
      searchText: 'Current Source Of Truth',
    },
    { title: '测试策略', path: 'docs/product/自动化测试策略.md' },
    {
      title: '路线图',
      path: 'docs/product/产品完成路线图.md',
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
    '../../../../AGENTS.md': '# 协作约定',
    '../../../../docs/当前真源与交接顺序.md': '# 当前真源与交接顺序',
    '../../../../docs/product/产品完成路线图.md': '# 产品完成路线图',
    '../../../../docs/archive/progress-2026-06.md': '# 过程归档',
  })

  assert.deepEqual(getDefaultDevDocsPinnedPaths(docs), [
    'README.md',
    'AGENTS.md',
    'docs/当前真源与交接顺序.md',
    'docs/product/产品完成路线图.md',
  ])
  assert.deepEqual(
    normalizeDevDocsPinnedPaths(
      [
        'docs/product/产品完成路线图.md',
        'missing.md',
        'docs/product/产品完成路线图.md',
        '../unsafe.txt',
      ],
      docs
    ),
    ['docs/product/产品完成路线图.md']
  )

  const docsWithPinned = applyDevDocsPinnedState(docs, [
    'docs/archive/progress-2026-06.md',
    'docs/当前真源与交接顺序.md',
  ])
  const sortedPaths = sortDevDocsItemsByPinned(docsWithPinned).map(
    (item) => item.path
  )

  assert.deepEqual(sortedPaths.slice(0, 2), [
    'docs/archive/progress-2026-06.md',
    'docs/当前真源与交接顺序.md',
  ])
})

test('devDocs: 支持刷新后恢复当前文档路径', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../docs/当前真源与交接顺序.md': '# 当前真源与交接顺序',
    '../../../../docs/product/自动化测试策略.md': '# 自动化测试策略',
  })

  assert.equal(
    DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
    'plush_erp_dev_docs_selected_path'
  )
  assert.equal(
    normalizeDevDocsSelectedPath('docs/product/自动化测试策略.md', docs),
    'docs/product/自动化测试策略.md'
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
        'doc:docs/product/自动化测试策略.md',
        '../unsafe',
        'dir:missing',
      ],
      ['dir:docs', 'dir:docs/product', 'dir:docs/archive']
    ),
    ['dir:docs', 'dir:docs/product']
  )
})
