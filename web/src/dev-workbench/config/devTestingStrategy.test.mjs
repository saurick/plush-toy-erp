import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildDevTestingDocs, parseDevTestingStrategyGuide } from './devTesting.mjs'

const strategy = readFileSync(
  new URL('../../../../docs/product/自动化测试策略.md', import.meta.url),
  'utf8'
)
const methodsTable = (rows, headers = '测试方式 | 适用场景 | 当前入口 | 结果边界') => `
## 测试方式 / Test Methods

| ${headers} |
| --- | --- | --- | --- |
${rows}
`

test('测试方式读取正式策略，保留模拟、真机与探索的独立边界', () => {
  const { methods, evidence, devices } = parseDevTestingStrategyGuide(strategy)
  const deviceMethod = methods.rows.find(([label]) => label === '手机真机')
  assert(deviceMethod)
  assert.match(deviceMethod[2], /尚未接入固定真机 runner/u)
  assert.match(deviceMethod[3], /WDA.*UiAutomator2.*固定场景与断言/u)
  assert(methods.rows.some(([label]) => label === 'Codex 探索'))
  for (const label of ['浏览器与模拟接口', '浏览器与真实后端', '手机真机']) {
    assert(evidence.rows.some(([value]) => value === label), label)
  }
  assert(devices.rows.some(([label]) => label === '系统输入与布局'))
  assert(devices.rows.some(([label]) => label === '中断与显式重试'))
})

test('策略内容变化直接进入表格，保留代码文本和单元格内的分隔符', () => {
  const source = methodsTable('| 输入边界 | `a|b` | `node:test` | 显式断言 |')
  assert.deepEqual(parseDevTestingStrategyGuide(source).methods.rows, [
    ['输入边界', 'a|b', 'node:test', '显式断言'],
  ])
  const nextSource = source.replace('显式断言', '独立预期值')
  assert.equal(parseDevTestingStrategyGuide(nextSource).methods.rows[0][3], '独立预期值')
})

test('缺少策略章节时不使用默认目录补造说明', () => {
  const guide = parseDevTestingStrategyGuide('## 其他章节\n\n没有测试说明。')
  assert.deepEqual(Object.values(guide).map(({ rows }) => rows), [[], [], [], []])
  const partial = parseDevTestingStrategyGuide(methodsTable('| 逻辑 | 状态 | 单元 | 内存 |'))
  assert.equal(partial.methods.rows.length, 1)
  assert.deepEqual(partial.evidence.rows, [])
  assert.deepEqual(partial.devices.rows, [])
})

test('增长、并发与事务验证消费正式策略并保留不同证据的边界', () => {
  const { growth } = parseDevTestingStrategyGuide(strategy)
  assert.deepEqual(growth.rows.map(([label]) => label), [
    '功能可扩展性', '数据与负载可伸缩性', '并发正确性', '事务一致性', '性能、资源与恢复',
  ])
  assert.match(growth.rows[0][3], /设计依据.*不证明架构可扩展/u)
  assert.match(growth.rows[1][3], /有界回归.*规模未知/u)
  assert.match(growth.rows[2][3], /最终业务事实/u)
  assert.match(growth.rows[3][3], /Workflow.*Fact/u)
  assert.match(growth.rows[4][3], /源码.*负载.*阈值/u)
  assert.deepEqual(parseDevTestingStrategyGuide('').growth.rows, [])
})

test('增长检查可从既有专项检查库按能力词检索', () => {
  const source = readFileSync(new URL('../../../../scripts/qa/README.md', import.meta.url), 'utf8')
  const blocks = buildDevTestingDocs({ 'scripts/qa/README.md': source }).flatMap((doc) => doc.commandBlocks)
  const growth = blocks.find((block) => block.commands.some((command) => command.includes('BusinessSelectionActionBar.test.mjs')))
  assert(growth)
  for (const word of ['可扩展性', '可伸缩性', '并发', '事务']) assert(growth.searchText.includes(word))
})

test('列合同改变、缺值或重复标识时保留不可读状态', () => {
  for (const source of [
    methodsTable('| 逻辑 | 状态 | 单元 | 内存 |', '测试方式 | 适用场景 | 通过状态 | 结果边界'),
    methodsTable('| 逻辑 | 状态 | | 内存 |'),
    methodsTable('| 逻辑 | 状态 | 单元 | 内存 |\n| 残缺行 | 状态 |'),
    methodsTable('| 逻辑 | 状态 | 单元 | 内存 |').replace('| --- | --- | --- | --- |', '| 标题未分隔 | --- | --- | --- |'),
    methodsTable('| 逻辑 | 状态 | 单元 | 内存 |\n| 逻辑 | 金额 | 单元 | 内存 |'),
  ]) {
    assert.deepEqual(parseDevTestingStrategyGuide(source).methods.rows, [])
  }
})

test('测试方式章节不会混入证据分类或后续章节的表格', () => {
  const guide = parseDevTestingStrategyGuide(`${methodsTable('| 逻辑 | 状态 | 单元 | 内存 |')}
## 证据分类 / Evidence Categories
| 证据类别 | 必要上下文 | 能证明的范围 | 不能替代 |
| --- | --- | --- | --- |
| 真机 | 实际机型 | 系统输入 | 其他机型 |
## 其他章节
| 测试方式 | 适用场景 | 当前入口 | 结果边界 |
| --- | --- | --- | --- |
| 不属于方式说明 | 不应进入 | 不应进入 | 不应进入 |
`)
  assert.deepEqual(guide.methods.rows, [['逻辑', '状态', '单元', '内存']])
  assert.deepEqual(guide.evidence.rows, [['真机', '实际机型', '系统输入', '其他机型']])
})
