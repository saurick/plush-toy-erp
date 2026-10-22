import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('独立分页与表格分页共用范围、翻页和禁用行为，固定批次不出现条数选择', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: AppPagination }, { default: AppTable }] = await Promise.all([
    import('react-dom/client'),
    import('./AppPagination.jsx'),
    import('../table/AppTable.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const changes = []
  const dataSource = Array.from({ length: 61 }, (_, index) => ({ id: index + 1 }))
  const render = async (kind, overrides = {}) => {
    const pagination = {
      current: 1,
      total: 61,
      pageSize: 10,
      showSizeChanger: false,
      onChange: (...args) => changes.push(args),
      ...overrides,
    }
    await act(async () => root.render(kind === 'standalone'
      ? createElement(AppPagination, pagination)
      : createElement(AppTable, {
        rowKey: 'id',
        columns: [{ title: '序号', dataIndex: 'id' }],
        dataSource: overrides.total === 0 ? [] : dataSource,
        pagination,
      })))
  }
  for (const kind of ['standalone', 'table']) {
    changes.length = 0
    await render(kind)
    assert.equal(container.querySelectorAll('.app-pagination').length, 1)
    assert.match(container.textContent, /第 1-10 条 \/ 共 61 条/u)
    assert.equal(container.querySelector('.app-pagination [role="combobox"]'), null)
    assert.equal(container.querySelector('[aria-label="上一页"]').disabled, true)
    await act(async () => container.querySelector('[aria-label="下一页"]').click())
    assert.deepEqual(changes, [[2, 10]])

    await render(kind, { current: 7 })
    assert.match(container.textContent, /第 61-61 条 \/ 共 61 条/u)
    assert.equal(container.querySelector('[aria-label="下一页"]').disabled, true)
    await render(kind, { current: 2, disabled: true, showSizeChanger: { 'aria-label': '每页条数' } })
    assert.equal(container.querySelector('[aria-label="上一页"]').disabled, true)
    assert.equal(container.querySelector('[aria-label="下一页"]').disabled, true)
    assert.equal(container.querySelector('input[aria-label="每页条数"]').disabled, true)
    await act(async () => container.querySelector('[aria-label="下一页"]').click())
    assert.deepEqual(changes, [[2, 10]], '禁用时不发起额外翻页')
    await render(kind, { current: 2 })
    assert.equal(container.querySelector('[aria-label="上一页"]').disabled, false)
    assert.equal(container.querySelector('[aria-label="下一页"]').disabled, false)

    await render(kind, { total: 0 })
    if (kind === 'standalone') {
      assert.match(container.textContent, /第 0-0 条 \/ 共 0 条/u)
      assert.equal(container.querySelector('[aria-label="下一页"]').disabled, true)
    } else {
      assert.equal(container.querySelector('.app-pagination'), null, '空表沿用内置空态，不显示无效分页')
    }
  }
  await act(async () => root.render(createElement(AppTable, { rowKey: 'id', dataSource, columns: [], pagination: false })))
  assert.equal(container.querySelector('.app-pagination'), null, '关闭表格分页后不产生第二套分页条')
})
