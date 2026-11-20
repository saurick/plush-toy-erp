import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../../scripts/test/reactRuntime.mjs'

test('shared table renders a summary that follows the current rows', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: AppTable }] = await Promise.all([
    import('react-dom/client'),
    import('./AppTable.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const render = async (dataSource) => {
    await act(async () =>
      root.render(
        createElement(AppTable, {
          rowKey: 'key',
          pagination: false,
          columns: [
            { title: '物料', dataIndex: 'name', key: 'name' },
            { title: '数量', dataIndex: 'quantity', key: 'quantity' },
          ],
          dataSource,
          summary: (rows) =>
            createElement(
              AppTable.Summary,
              null,
              createElement(
                AppTable.Summary.Row,
                null,
                createElement(AppTable.Summary.Cell, { index: 0 }, '合计'),
                createElement(
                  AppTable.Summary.Cell,
                  { index: 1 },
                  rows.reduce((total, row) => total + row.quantity, 0)
                )
              )
            ),
        })
      )
    )
  }
  await render([
    { key: 'a', name: '面料', quantity: 2 },
    { key: 'b', name: '填充料', quantity: 3 },
  ])
  const summaryCells = () =>
    [...container.querySelectorAll('tfoot td')].map((cell) => cell.textContent)
  assert.deepEqual(summaryCells(), ['合计', '5'])
  await render([{ key: 'a', name: '面料', quantity: 7 }])
  assert.deepEqual(summaryCells(), ['合计', '7'])
  assert.equal(container.querySelectorAll('tbody tr.ant-table-row').length, 1)
})
