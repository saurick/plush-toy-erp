import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer as createHTTPServer } from 'node:http'
import test from 'node:test'
import { build, createServer } from 'vite'
import { createDevDocsMetadataPlugin } from '../../../vite.docs.mjs'
import { extractMarkdownHeadings } from '../../common/components/markdown/anchors.mjs'

import {
  DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
  DEV_DOCS_HOME_PATH,
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
  getDevDocsDisplayTitle,
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

test('devDocs: 新访客先读任务入口，目录保留路径且完整标题仍可搜索', () => {
  const docs = buildDevDocsItems({
    '../../../../README.md': '# 项目总览 / Project Overview',
    '../../../../docs/README.md': '# 文档入口与治理 / docs Guide',
    '../../../../docs/engineering/README.md': '# 工程说明 / Engineering Guide',
  })
  assert.equal(docs[0].path, DEV_DOCS_HOME_PATH)
  assert.equal(getDevDocsDisplayTitle(docs[0].title), '文档入口与治理')
  assert.equal(filterDevDocsItems(docs, 'Engineering Guide', DEV_DOCS_SEARCH_SCOPE_TITLE)[0].path, 'docs/engineering/README.md')
  assert.equal(getDevDocsDisplayTitle('产品 / SKU / BOM 边界'), '产品 / SKU / BOM 边界')
  assert.equal(getDevDocsDisplayTitle('API / RPC'), 'API / RPC')
  const folder = buildDevDocsTree(docs).find((node) => node.path === 'docs')
  assert.equal(folder.label, '项目文档')
  assert.equal(folder.children[0].path, DEV_DOCS_HOME_PATH)
  assert.equal(folder.children.find((node) => node.path === 'docs/engineering').label, '开发与交付')
  assert.equal(normalizeDevDocsSelectedPath('README.md', docs), 'README.md')
})

test('devDocs: document build excludes customer input memos while retaining public documents', async (t) => {
  const declaration = devDocsPageSource.match(/const currentMarkdownModules = import\.meta\.glob\([\s\S]*?\n\)/u)?.[0]
  assert(declaration, 'the document build entry must remain inspectable')
  const root = await mkdtemp(path.join(tmpdir(), 'plush-docs-distribution-'))
  let server
  let httpServer
  try {
    for (const [file, source] of Object.entries({
      'web/src/dev-workbench/pages/entry.mjs': `${declaration}\nexport default currentMarkdownModules;\n`,
      'docs/engineering/public.md': '# Public contract\n\nunique-body-payload-sentinel\n',
      'docs/customers/example/甲方反馈记录.md': '# synthetic-private-memo\n',
      'docs/archive/history.md': '# Deferred archive\n',
      '.agents/skills/plush-example/SKILL.md': '# Skill contract\n\n[Detail](references/detail.md#scope)\n',
      '.agents/skills/plush-example/references/detail.md': '# Detail\n\n## Scope\n',
    })) {
      const target = path.join(root, file)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, source)
    }
    server = await createServer({
      root,
      plugins: [createDevDocsMetadataPlugin()],
      configFile: false,
      logLevel: 'silent',
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
        fs: {
          allow: [
            'web',
            'docs/engineering/public.md',
            '.agents/skills/plush-example/SKILL.md',
            '.agents/skills/plush-example/references/detail.md',
          ].map((file) => path.join(root, file)),
        },
      },
    })
    const modules = await server.ssrLoadModule('/web/src/dev-workbench/pages/entry.mjs')
    const skillDocs = buildDevDocsItems(modules.default)
    assert.equal(skillDocs.find((item) => item.path === '.agents/skills/plush-example/SKILL.md')?.title, 'Skill contract')
    assert.equal(skillDocs.find((item) => item.path === '.agents/skills/plush-example/references/detail.md')?.title, 'Detail')
    const publicDoc = modules.default['../../../../docs/engineering/public.md']
    assert.equal(publicDoc.title, 'Public contract')
    assert.equal(typeof publicDoc.loadSource, 'function')
    const items = buildDevDocsItems(modules.default)
    assert.equal(items[0].source, '')
    assert.equal(filterDevDocsItems(items, 'Public contract', DEV_DOCS_SEARCH_SCOPE_TITLE).length, 1)
    let unavailable = true
    httpServer = createHTTPServer((request, response) => {
      if (unavailable) {
        response.writeHead(503)
        response.end()
        return
      }
      server.middlewares(request, response)
    })
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${httpServer.address().port}`
    const nativeFetch = globalThis.fetch
    t.mock.method(globalThis, 'fetch', (url, options) => nativeFetch(new URL(url, origin), options))
    await assert.rejects(publicDoc.loadSource(), /Document request failed/u)
    unavailable = false
    assert.equal(await publicDoc.loadSource(), '# Public contract\n\nunique-body-payload-sentinel\n')
    const privateResponse = await fetch(`/@fs/${path.join(root, 'docs/customers/example/甲方反馈记录.md')}`)
    assert.equal(privateResponse.status, 403, 'excluded private files do not gain filesystem permission')
    assert.equal(Object.keys(modules.default).some((file) => file.endsWith('/甲方反馈记录.md')), false)
    assert.equal(Object.values(modules.default).some((item) => JSON.stringify(item).includes('synthetic-private-memo')), false)
    assert.equal(Object.keys(modules.default).some((file) => file.endsWith('/history.md')), false)
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [createDevDocsMetadataPlugin()],
      build: {
        write: false,
        minify: false,
        lib: { entry: path.join(root, 'web/src/dev-workbench/pages/entry.mjs'), formats: ['es'] },
      },
    })
    const output = [result].flat().flatMap((item) => item.output)
    const chunks = output.filter((item) => item.type === 'chunk')
    const entry = chunks.find((item) => item.isEntry)
    assert(entry)
    assert.equal(entry.code.includes('unique-body-payload-sentinel'), false, 'document bodies stay out of the eager index')
    assert(output.some((item) => item.type === 'asset' && String(item.source).includes('unique-body-payload-sentinel')))
    assert(output.every((item) => !String(item.code || item.source).includes('synthetic-private-memo')))
  } finally {
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve))
    try { await server?.close() } finally { await rm(root, { recursive: true, force: true }) }
  }
})

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
  assert.doesNotMatch(
    devDocsPageSource.match(
      /const archiveMarkdownModules = import\.meta\.glob\([\s\S]*?\n\)/u
    )?.[0] || '',
    /eager: true/u
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
    /\(isSearching \? visibleDocs : lifecycleDocs\)\.find\(/u
  )
  assert.match(
    devDocsPageSource,
    /isSearching \? undefined : visibleDocs\[0\] \|\| lifecycleDocs\[0\]/u
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

test('devDocs: 合并后的专题和操作说明仍能在查看器内查阅', () => {
  for (const source of [
    '../../../../server/docs/**/*.md',
    '../../../../server/deploy/gitlab/README.md',
    '../../../../scripts/qa/README.md',
    '../../../../scripts/deploy/README.md',
    '../../../../scripts/import/README.md',
    '../../../../deployments/*/runbooks/*.md',
    '../../../../deployments/*/checklists/*.md',
  ]) {
    assert(
      devDocsPageSource.includes(source),
      `missing documentation source: ${source}`
    )
  }
  const items = buildDevDocsItems({
    '../../../../server/docs/api.md': '# JSON-RPC API 说明',
    '../../../../server/docs/ent.md': '# Ent + Atlas 数据模型与迁移',
    '../../../../scripts/qa/README.md': '# QA 操作',
    '../../../../scripts/import/README.md': '# 导入准备',
    '../../../../deployments/yoyoosun/runbooks/08-daily-ops.md': '# 日常巡检',
  })
  assert.equal(items.length, 5)
  assert(items.every((item) => item.lifecycle === DEV_DOCS_LIFECYCLE_CURRENT))
  assert(items.some((item) => item.path === 'server/docs/api.md'))
  assert(
    items.some(
      (item) => item.path === 'deployments/yoyoosun/runbooks/08-daily-ops.md'
    )
  )
})

test('devDocs: 当前工作区项目文档列表不恢复产品内文档 registry', () => {
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
    '../../../../docs/product/ui-design/README.md': '# 交互设计入口',
    '../../../../docs/product/ui-design/交互设计说明.md': '# 交互设计说明',
    '../../../../docs/reference/外部输入.md': '# 外部输入参考',
    '../../../../docs/archive/progress-2026-06.md': loadArchive,
  })

  assert.equal(DEV_DOCS_LIFECYCLE_STORAGE_KEY, 'plush_erp_dev_docs_lifecycle')
  assert.equal(getDevDocsLifecycle('docs/当前真源与交接顺序.md'), 'current')
  assert.equal(
    getDevDocsLifecycle('docs/product/ui-design/README.md'),
    'current'
  )
  assert.equal(
    getDevDocsLifecycle('docs/product/ui-design/交互设计说明.md'),
    'review'
  )
  assert.equal(getDevDocsLifecycle('docs/reference/外部输入.md'), 'review')
  assert.equal(
    getDevDocsLifecycle('docs/archive/progress-2026-06.md'),
    'archive'
  )
  assert.equal(normalizeDevDocsLifecycle('unknown'), DEV_DOCS_LIFECYCLE_CURRENT)
  assert.deepEqual(
    filterDevDocsByLifecycle(docs, DEV_DOCS_LIFECYCLE_CURRENT)
      .map((item) => item.path)
      .sort(),
    ['docs/product/ui-design/README.md', 'docs/当前真源与交接顺序.md']
  )
  assert.deepEqual(
    filterDevDocsByLifecycle(docs, DEV_DOCS_LIFECYCLE_REVIEW)
      .map((item) => item.path)
      .sort(),
    ['docs/product/ui-design/交互设计说明.md', 'docs/reference/外部输入.md']
  )
  const archive = filterDevDocsByLifecycle(docs, DEV_DOCS_LIFECYCLE_ARCHIVE)
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
    '../../../../docs/customers/yoyoosun/客户配置草案.md':
      '# yoyoosun 客户配置',
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
  assert.match(devDocsPageSource, /aria-label="项目文档层级"/u)
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
  assert.match(devDocsPageSource, /aria-label="项目文档搜索范围"/u)
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

test('devDocs: workbench name changes preserve bookmarked section anchors', () => {
  const sources = [
    ['docs/engineering/研发效能工作台与CI-CD设计.md', [
      ['产品工程入口-__devproduct-engineering', '产品与业务入口'],
      ['产品内核-__devproduct-core', '产品能力'],
      ['工程规范与-skill-__devproject-skills', '项目 Skill'],
      ['开发文档-__devdocs', '项目文档'],
      ['ui-交互设计-__devui-design', '交互设计'],
      ['链路实测-__devbusiness-chain-audit', '链路实测报告'],
      ['交付运行总览-__devdelivery', '交付运维总览'],
    ]],
    ['docs/architecture/业务链与运行轨迹边界.md', [
      ['业务链观察的页面合同', '业务链路的页面合同'],
    ]],
    ['web/src/dev-workbench/pages/delivery/README.md', [
      ['交付运行页面', '交付运维页面'],
    ]],
    ['docs/product/移动端岗位任务页改版.md', [
      ['ui-交互设计', '交互设计'],
    ]],
  ]
  for (const [source, bookmarks] of sources) {
    const headings = extractMarkdownHeadings(readFileSync(path.join(repoRoot, source), 'utf8'), [1, 2, 3, 4, 5, 6])
    for (const [anchor, title] of bookmarks) {
      const heading = headings.find((item) => item.aliases.includes(anchor))
      assert(heading?.title.startsWith(title), `${source}#${anchor} must retain the renamed heading`)
    }
  }
})
