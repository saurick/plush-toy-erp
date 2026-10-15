import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { normalizeTableColumns } from './tableColumns.mjs'

test('table headers follow their body alignment and default to the reading edge', () => {
  const render = (value) => value
  const columns = [
    { title: '状态', dataIndex: 'status' },
    { title: '材料名称', dataIndex: 'name', align: 'left', render },
    { title: '金额', dataIndex: 'amount', align: 'right', sorter: true },
  ]
  const result = normalizeTableColumns(columns)
  assert.deepEqual(
    result.map((column) => column.align),
    ['left', 'left', 'right']
  )
  assert.equal(result[1].render, render)
  assert.equal(result[2].sorter, true)
  for (const column of result) {
    assert.deepEqual(column.onHeaderCell().style, {
      textAlign: column.align,
      verticalAlign: 'middle',
    })
  }
  assert.equal(columns[0].align, undefined)
  assert.equal(columns[1].onHeaderCell, undefined)
})

test('grouped headers preserve callbacks and non-alignment styles while enforcing shared alignment', () => {
  const click = () => {}
  const result = normalizeTableColumns([
    {
      title: '采购',
      children: [{ title: '数量', align: 'right' }],
      onHeaderCell: (column) => ({
        onClick: click,
        colSpan: 2,
        'aria-label': column.title,
        style: { width: 120, textAlign: 'left' },
      }),
    },
  ])
  const props = result[0].onHeaderCell(result[0])
  assert.equal(props.onClick, click)
  assert.equal(props.colSpan, 2)
  assert.equal(props['aria-label'], '采购')
  assert.deepEqual(props.style, {
    width: 120,
    textAlign: 'left',
    verticalAlign: 'middle',
  })
  assert.equal(result[0].children[0].align, 'right')
  assert.equal(result[0].children[0].onHeaderCell().style.textAlign, 'right')
  assert.deepEqual(normalizeTableColumns(), [])
})

test('runtime Ant tables use the shared alignment entry', () => {
  const root = new URL('../../../', import.meta.url)
  const bypasses = readdirSync(root, { recursive: true })
    .filter((file) => /\.(jsx|js|mjs)$/.test(file) && !file.includes('.test.'))
    .filter((file) => file !== 'common/components/table/AppTable.jsx')
    .filter((file) =>
      /import\s*\{[^}]*\bTable\b[^}]*\}\s*from\s*['"]antd['"]/s.test(
        readFileSync(new URL(file, root), 'utf8')
      )
    )
  assert.deepEqual(bypasses, [])
})

test('表头测量副本保留尺寸且不暴露可聚焦的字段问号', () => {
  const styles = readFileSync(
    new URL('./app-table.css', import.meta.url),
    'utf8'
  )
  assert.match(
    styles,
    /\.app-table\.ant-table-wrapper \.ant-table-measure-cell-content\s*\{\s*visibility: hidden;\s*\}/u
  )
  assert.doesNotMatch(
    styles,
    /\.ant-table-measure-cell-content\s*\{[^}]*display: none/u
  )
})
