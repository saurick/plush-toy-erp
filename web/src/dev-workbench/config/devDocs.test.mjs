import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
  DEV_DOCS_LIFECYCLE_ARCHIVE,
  DEV_DOCS_LIFECYCLE_CURRENT,
  DEV_DOCS_LIFECYCLE_REVIEW,
  DEV_DOCS_LIFECYCLE_STORAGE_KEY,
  DEV_DOCS_ROUTE,
  DEV_DOCS_SEARCH_SCOPE_ALL,
  DEV_DOCS_SEARCH_SCOPE_TITLE,
  DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
  DEV_DOCS_TOC_EXPANDED_STORAGE_KEY,
  applyDevDocsPinnedState,
  buildDevDocsItems,
  buildDevDocsTree,
  filterDevDocsByLifecycle,
  filterDevDocsItems,
  getDevDocsLifecycle,
  getDefaultDevDocsPinnedPaths,
  isDevDocsEnabled,
  normalizeDevDocsExpandedDirKeys,
  normalizeDevDocsLifecycle,
  normalizeDevDocsPinnedPaths,
  normalizeDevDocsSelectedPath,
  sortDevDocsItemsByPinned,
} from './devDocs.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const devDocsPageSource = readFileSync(
  path.join(repoRoot, 'web/src/dev-workbench/pages/DevDocsPage.jsx'),
  'utf8'
)

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
  assert.match(devDocsPageSource, /config\/customers\/\*\*\/\*\.md/u)
  assert.match(devDocsPageSource, /'\.\.\/\.\.\/\.\.\/scripts\/README\.md'/u)
  assert.match(
    devDocsPageSource,
    /'\.\.\/\.\.\/\.\.\/\.\.\/server\/deploy\/README\.md'/u
  )
  assert.match(
    devDocsPageSource,
    /'\.\.\/\.\.\/\.\.\/\.\.\/server\/deploy\/compose\/prod\/README\.md'/u
  )
  assert.match(
    devDocsPageSource,
    /!\.\.\/\.\.\/\.\.\/\.\.\/docs\/archive\/\*\*\/\*\.md/u
  )
  assert.match(
    devDocsPageSource,
    /const archiveMarkdownModules = import\.meta\.glob/u
  )
  assert.match(
    devDocsPageSource,
    /aria-current=\{active \? 'true' : undefined\}/u
  )
})

test('devDocs: 搜索空结果不保留越界选中项或阅读动作', () => {
  assert.match(
    devDocsPageSource,
    /const isSearching = trimmedKeyword\.length > 0/u
  )
  assert.match(
    devDocsPageSource,
    /isSearching[\s\S]*?visibleDocs\.find\(\(item\) => item\.key === selectedKey\)/u
  )
  assert.match(
    devDocsPageSource,
    /visibleDocs\[0\] \|\|[\s\S]*?\(isSearching \? undefined : lifecycleDocs\[0\]\)/u
  )
  assert.match(devDocsPageSource, /<DevPageNav \/>/u)
  assert.doesNotMatch(devDocsPageSource, /<DevPageNav sourcePath=/u)
  assert.match(
    devDocsPageSource,
    /\{selectedDoc \? \([\s\S]*?erp-dev-docs-reader__toolbar[\s\S]*?\) : null\}/u
  )
  assert.match(
    devDocsPageSource,
    /description="没有匹配的文档，阅读操作已隐藏"/u
  )
})

test('devDocs: 当前工作区开发文档列表不恢复产品内文档 registry', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../AGENTS.md': '# 协作约定',
    '../../../README.md': '# 前端 README',
    '../../../scripts/README.md': '# Web 脚本说明',
    '../../../../docs/当前真源与交接顺序.md': '# 当前真源与交接顺序',
    '../../../../docs/product/产品完成路线图.md': '# 产品完成路线图',
    '../../../../docs/archive/progress-2026-06-02-before-print-template-defer.md':
      '# 过程记录归档',
    '../../../../docs/customers/yoyoosun/README.md': '# 永绅客户资料边界',
    '../../../../config/customers/yoyoosun/README.md':
      '# 永绅 yoyoosun 客户配置',
    '../../../../server/deploy/README.md': '# 服务端部署说明',
    '../../../../server/deploy/compose/prod/README.md': '# 生产 Compose 说明',
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
  assert(paths.includes('web/scripts/README.md'))
  assert(paths.includes('server/deploy/README.md'))
  assert(paths.includes('server/deploy/compose/prod/README.md'))
  assert(paths.includes('docs/当前真源与交接顺序.md'))
  assert(
    paths.includes(
      'docs/archive/progress-2026-06-02-before-print-template-defer.md'
    )
  )
  assert(paths.includes('docs/customers/yoyoosun/README.md'))
  assert(paths.includes('config/customers/yoyoosun/README.md'))
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
    docs.find(
      (item) =>
        item.path ===
        'docs/archive/progress-2026-06-02-before-print-template-defer.md'
    )?.lifecycle,
    DEV_DOCS_LIFECYCLE_ARCHIVE
  )
  assert.equal(
    docs.find((item) => item.path === 'docs/customers/yoyoosun/README.md')
      ?.group,
    '客户'
  )
  assert.equal(
    docs.find((item) => item.path === 'config/customers/yoyoosun/README.md')
      ?.group,
    '客户配置'
  )
  assert.equal(docs[0]?.path, 'README.md')
  assert.equal(docs[1]?.path, 'AGENTS.md')
  assert.equal(
    docs.find((item) => item.path === 'README.md')?.defaultPinned,
    true
  )
})

test('devDocs: 默认按当前、评审参考和历史三层分流', async () => {
  const loadArchive = async () => '# 历史过程记录'
  const docs = buildDevDocsItems({
    '../../../../docs/当前真源与交接顺序.md': '# 当前真源',
    '../../../../docs/product/prototypes/README.md': '# 原型总入口',
    '../../../../docs/product/prototypes/menu-v1/README.md':
      '# 菜单候选原型',
    '../../../../docs/reference/外部输入.md': '# 外部输入参考',
    '../../../../docs/archive/progress-2026-06.md': loadArchive,
  })

  assert.equal(DEV_DOCS_LIFECYCLE_STORAGE_KEY, 'plush_erp_dev_docs_lifecycle')
  assert.equal(getDevDocsLifecycle('docs/当前真源与交接顺序.md'), 'current')
  assert.equal(
    getDevDocsLifecycle('docs/product/prototypes/README.md'),
    'current'
  )
  assert.equal(
    getDevDocsLifecycle('docs/product/prototypes/menu-v1/README.md'),
    'review'
  )
  assert.equal(getDevDocsLifecycle('docs/reference/外部输入.md'), 'review')
  assert.equal(
    getDevDocsLifecycle('docs/archive/progress-2026-06.md'),
    'archive'
  )
  assert.equal(normalizeDevDocsLifecycle('unknown'), DEV_DOCS_LIFECYCLE_CURRENT)
  assert.deepEqual(
    filterDevDocsByLifecycle(docs, DEV_DOCS_LIFECYCLE_CURRENT).map(
      (item) => item.path
    ).sort(),
    [
      'docs/product/prototypes/README.md',
      'docs/当前真源与交接顺序.md',
    ]
  )
  assert.deepEqual(
    filterDevDocsByLifecycle(docs, DEV_DOCS_LIFECYCLE_REVIEW).map(
      (item) => item.path
    ).sort(),
    [
      'docs/product/prototypes/menu-v1/README.md',
      'docs/reference/外部输入.md',
    ]
  )
  const archive = filterDevDocsByLifecycle(
    docs,
    DEV_DOCS_LIFECYCLE_ARCHIVE
  )
  assert.equal(archive.length, 1)
  assert.equal(archive[0].source, '')
  assert.equal(archive[0].loadSource, loadArchive)
  assert.equal(await archive[0].loadSource(), '# 历史过程记录')
  assert.match(devDocsPageSource, /const selectLifecycle = \(value\) =>/u)
  assert.match(
    devDocsPageSource,
    /filterDevDocsByLifecycle\(\s*docsWithPinnedState,\s*nextLifecycle\s*\)\[0\]/u
  )
  assert.match(devDocsPageSource, /onChange=\{selectLifecycle\}/u)
})

test('devDocs: 按仓库路径生成目录树', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 仓库 README',
    '../../../../docs/product/产品完成路线图.md': '# 产品完成路线图',
    '../../../../docs/customers/yoyoosun/导入策略.md': '# yoyoosun 导入策略',
    '../../../../docs/customers/yoyoosun/客户配置草案.md': '# yoyoosun 客户配置',
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

test('devDocs: 支持在全部与仅标题范围之间筛选', () => {
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
    filterDevDocsItems(items, 'truth', DEV_DOCS_SEARCH_SCOPE_ALL).map(
      (item) => item.title
    ),
    ['当前真源']
  )
  assert.deepEqual(
    filterDevDocsItems(items, 'phase', DEV_DOCS_SEARCH_SCOPE_ALL).map(
      (item) => item.title
    ),
    ['路线图']
  )
  assert.deepEqual(
    filterDevDocsItems(items, 'phase', DEV_DOCS_SEARCH_SCOPE_TITLE).map(
      (item) => item.title
    ),
    []
  )
  assert.deepEqual(
    filterDevDocsItems(items, '路线', DEV_DOCS_SEARCH_SCOPE_TITLE).map(
      (item) => item.title
    ),
    ['路线图']
  )
})

test('devDocs: 搜索范围切换有明确名称和无结果恢复提示', () => {
  assert.match(devDocsPageSource, /aria-label="开发文档层级"/u)
  assert.match(
    devDocsPageSource,
    /\{ label: '当前', value: DEV_DOCS_LIFECYCLE_CURRENT \}/u
  )
  assert.match(
    devDocsPageSource,
    /\{ label: '评审与参考', value: DEV_DOCS_LIFECYCLE_REVIEW \}/u
  )
  assert.match(
    devDocsPageSource,
    /\{ label: '历史', value: DEV_DOCS_LIFECYCLE_ARCHIVE \}/u
  )
  assert.match(devDocsPageSource, /aria-label="开发文档搜索范围"/u)
  assert.match(
    devDocsPageSource,
    /\{ label: '全部', value: DEV_DOCS_SEARCH_SCOPE_ALL \}/u
  )
  assert.match(
    devDocsPageSource,
    /\{ label: '仅标题', value: DEV_DOCS_SEARCH_SCOPE_TITLE \}/u
  )
  assert.match(
    devDocsPageSource,
    /标题中没有匹配文档，可切换到“全部”搜索路径和正文/u
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
