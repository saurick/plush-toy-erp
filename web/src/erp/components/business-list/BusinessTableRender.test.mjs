import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('隐藏与恢复表格不重复执行单元格渲染，最新响应仍更新内容', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ BusinessDataTable }, { OverlayScopeContext }] = await Promise.all([
    import('./BusinessListLayout.jsx'),
    import('../../../common/components/overlay/OverlayScopeContext.mjs'),
  ])
  let renders = 0
  const columns = [{ title: '名称', dataIndex: 'name', render: (value) => { renders += 1; return value } }]
  const rows = [{ id: 1, name: '原有名称' }]
  const render = (visible, dataSource = rows) => ui.render(h(OverlayScopeContext.Provider, { value: { visible } }, h(BusinessDataTable, { columns, dataSource, rowKey: 'id', pagination: false })))
  await render(true)
  await ui.act(async () => new Promise(requestAnimationFrame))
  await ui.flush()
  const initial = renders
  assert.ok(initial > 0)
  await render(false)
  await render(true)
  await ui.act(async () => new Promise(requestAnimationFrame))
  assert.equal(renders, initial, '仅可见性变化不重新渲染记录')
  await render(true, [{ id: 1, name: '更新后的名称' }])
  assert.ok(renders > initial)
  assert.match(ui.container.textContent, /更新后的名称/u)
  assert.doesNotMatch(ui.container.textContent, /原有名称/u)
})
