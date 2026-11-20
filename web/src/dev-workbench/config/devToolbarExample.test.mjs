import assert from 'node:assert/strict'
import test from 'node:test'
import { TOOLBAR_EXAMPLES, filterToolbarRows, toolbarRows, toolbarScopes, toolbarViews } from './devToolbarExample.mjs'

test('数据名单增长不增加业务分类，功能增长只有明确的演示类别', () => {
  for (const { key } of TOOLBAR_EXAMPLES) {
    assert.deepEqual(toolbarViews(key, 'data'), toolbarViews(key, 'current'))
    assert.equal(toolbarScopes(key, 'data').length, 30)
    assert.equal(toolbarRows(key, 'data').length, 60)
    assert.equal(toolbarViews(key, 'categories').length, toolbarViews(key, 'current').length + 6)
    assert.equal(toolbarScopes(key, 'categories').length, 3)
    for (const { value } of toolbarViews(key, 'categories').filter(({ value }) => value.startsWith('extra-'))) {
      assert.ok(filterToolbarRows(toolbarRows(key, 'categories'), { category: value }).length)
    }
  }
})

test('演示查询取交集，清空恢复完整范围且不改原数据', () => {
  const rows = toolbarRows('purchase', 'data')
  const original = structuredClone(rows)
  assert.equal(filterToolbarRows(rows, { scope: '30' }).length, 2)
  assert.equal(filterToolbarRows(rows, { query: 'demo-purchase-030', scope: '30', status: 'closed' }).length, 1)
  assert.equal(filterToolbarRows(rows, { query: '  不存在  ' }).length, 0)
  assert.equal(filterToolbarRows(rows, { scope: '30', status: 'draft' }).length, 0)
  assert.equal(filterToolbarRows(rows, {}).length, 60)
  assert.deepEqual(rows, original)
  assert.notEqual(toolbarRows('inventory', 'current')[0].id, rows[0].id)
})
