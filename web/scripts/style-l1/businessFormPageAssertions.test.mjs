import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSharedLineActions, assertSharedLineTableSurface } from './businessFormPageAssertions.mjs'

test('未识别任何明细结构时外观回归失败', async () => {
  await assert.rejects(() => assertSharedLineTableSurface({ evaluate: async () => ({ tables: [], cards: 0, empty: 0 }) }), /必须识别共享表格/u)
})

test('联系人表即使隐藏列头也不能绕过共享组件检查', async () => {
  const editor = { evaluate: async () => ({ tables: [{ label: '客户联系人', shared: false, headers: [] }], cards: 0, empty: 0 }) }
  await assert.rejects(() => assertSharedLineTableSurface(editor), /必须通过 BusinessLineTable/u)
})

test('手机卡片和明确空态属于可识别的明细结构', async () => {
  for (const surface of [{ tables: [], cards: 1, empty: 0 }, { tables: [], cards: 0, empty: 1 }]) {
    assert.equal((await assertSharedLineTableSurface({ evaluate: async () => surface })).length, 0)
  }
})

test('标题和表格之间的额外容器间距会使回归失败', async () => {
  const editor = { evaluate: async () => ({ cards: 0, empty: 0, tables: [{ shared: true, label: '客户联系人', frame: { border: '1px', radius: '6px' }, headerGap: 12, headers: [{ text: '联系人' }] }] }) }
  await assert.rejects(() => assertSharedLineTableSurface(editor), /标题与明细表直接贴合/u)
})

test('同名移除按钮未接入共享组件时行操作回归失败', async () => {
  const editor = { evaluate: async () => [{ label: '移除行', outlined: true, danger: true, height: 34, touch: false }] }
  await assert.rejects(() => assertSharedLineActions(editor), /行操作复用共享按钮/u)
})
