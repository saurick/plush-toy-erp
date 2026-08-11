import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { businessModuleDefinitions } from '../../erp/config/businessModules.mjs'
import { navigationItemRegistry } from '../../erp/config/seedData.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const prototypePath = path.join(
  repoRoot,
  'docs/product/prototypes/current-page-atlas-v3/index.html'
)
const readmePath = path.join(
  repoRoot,
  'docs/product/prototypes/current-page-atlas-v3/README.md'
)
const prototypeSource = readFileSync(prototypePath, 'utf8')
const readmeSource = readFileSync(readmePath, 'utf8')

function readPageMatrix(source) {
  const match = source.match(
    /<script id="prototype-page-matrix" type="application\/json">([\s\S]*?)<\/script>/u
  )
  assert.ok(match, 'current page atlas must embed its page matrix')
  return JSON.parse(match[1])
}

function toComparablePage(item) {
  return {
    key: item.key,
    title: item.title || item.label,
    path: item.path,
  }
}

test('currentPageAtlasPrototype: 页面矩阵与当前业务模块和桌面导航逐项一致', () => {
  const matrix = readPageMatrix(prototypeSource)
  const desktopPages = matrix
    .filter((item) => item.scope === 'desktop')
    .map(toComparablePage)
    .sort((left, right) => left.key.localeCompare(right.key))
  const expectedDesktopPages = [
    ...Object.values(navigationItemRegistry),
    ...businessModuleDefinitions,
  ]
    .map(toComparablePage)
    .sort((left, right) => left.key.localeCompare(right.key))

  assert.equal(matrix.length, 56)
  assert.equal(new Set(matrix.map((item) => item.key)).size, matrix.length)
  assert.equal(matrix.filter((item) => item.scope === 'desktop').length, 32)
  assert.equal(matrix.filter((item) => item.scope === 'auxiliary').length, 7)
  assert.equal(matrix.filter((item) => item.scope === 'development').length, 17)
  assert.deepEqual(desktopPages, expectedDesktopPages)
})

test('currentPageAtlasPrototype: 辅助与开发页面只登记当前真实路由模式', () => {
  const matrix = readPageMatrix(prototypeSource)
  const auxiliaryPaths = matrix
    .filter((item) => item.scope === 'auxiliary')
    .map((item) => item.path)
    .sort()
  const developmentPaths = matrix
    .filter((item) => item.scope === 'development')
    .map((item) => item.path)
    .sort()

  assert.deepEqual(auxiliaryPaths, [
    '/admin-login',
    '/entry',
    '/erp/print-center/:templateKey',
    '/erp/print-workspace/:templateKey',
    '/legal/privacy',
    '/legal/system-rules',
    '/m/:roleKey/tasks',
  ])
  assert.deepEqual(developmentPaths, [
    '/__dev',
    '/__dev/customer-config',
    '/__dev/data-preparation',
    '/__dev/database-migration',
    '/__dev/delivery',
    '/__dev/docs',
    '/__dev/drill-recovery',
    '/__dev/governance',
    '/__dev/permission-relationships',
    '/__dev/product-core',
    '/__dev/product-engineering',
    '/__dev/prototypes',
    '/__dev/quality',
    '/__dev/quality-gates',
    '/__dev/status-flows',
    '/__dev/testing',
    '/__dev/version-center',
  ])
})

test('currentPageAtlasPrototype: 保持中性 To Implement 边界且不恢复退出能力', () => {
  assert.match(
    prototypeSource,
    /name="prototype-source-revision"\s+content="d9165f1fabf8003b713d504dc419ddbf4fdc6221"/u
  )
  assert.match(prototypeSource, /待实现 \/ To Implement/u)
  assert.match(prototypeSource, /中性模拟数据/u)
  assert.match(prototypeSource, /not_proven/u)
  assert.match(readmeSource, /阶段：待实现 \/ To Implement/u)
  assert.match(readmeSource, /“56 个页面”只表示当前路由盘点/u)
  assert.doesNotMatch(
    prototypeSource,
    /客户退货（RMA）|\/erp\/sales\/customer-returns|永绅|yoyoosun/u
  )
  assert.doesNotMatch(prototypeSource, /postMessage\s*\(/u)
})

test('currentPageAtlasPrototype: 权限、关联任务、恢复控件和焦点合同不是假交互', () => {
  assert.match(prototypeSource, /const TASKS_BY_RECORD = \{/u)
  assert.match(
    prototypeSource,
    /const task = TASKS_BY_RECORD\[state\.selectedRecordId\]/u
  )
  assert.match(
    prototypeSource,
    /\$\(["']#createButton["']\)\.disabled =\s*denied \|\| state\.pageState === ["']loading["']/u
  )
  assert.match(
    prototypeSource,
    /\[["']block["'], ["']reject["']\]\.includes\(action\) && !reason/u
  )
  assert.match(prototypeSource, /id="previousPage"/u)
  assert.match(prototypeSource, /id="nextPage"/u)
  assert.match(prototypeSource, /data-column="product"/u)
  assert.match(prototypeSource, /function getFocusable\(layer\)/u)
  assert.match(
    prototypeSource,
    /requestAnimationFrame\(\(\) => trigger\?\.focus\?\.\(\)\)/u
  )
  assert.match(prototypeSource, /event\.key === ["']Escape["']/u)
  assert.match(prototypeSource, /event\.key !== ["']Tab["']/u)
  assert.match(
    prototypeSource,
    /Workflow\s+完成不等于库存、出货或财务事实生效/u
  )
})
