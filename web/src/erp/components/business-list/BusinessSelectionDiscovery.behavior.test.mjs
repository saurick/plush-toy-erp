import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('常驻操作栏覆盖未选、选中、清空和空列表，并隔离相邻列表', async (t) => {
  const { render, act } = await createReactTestHarness(t)
  const { MemoryRouter } = await import('react-router-dom')
  const { Button } = await import('antd')
  const {
    BusinessPageLayout,
    BusinessOperationPanel,
    SelectionActionBar,
    SelectionClearAction,
    BusinessDataTable,
    SearchInput,
  } = await import('./BusinessListLayout.jsx')
  let selected = []
  let rows = [{ id: 1, no: 'BOM-DISCOVERY' }]
  let loading = false
  let disabled = false
  let selectable = true
  let actionable = true
  const renderPage = () =>
    render(
      createElement(
        MemoryRouter,
        { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
        createElement(
          BusinessPageLayout,
          null,
          createElement(
            BusinessOperationPanel,
            {
              filters: createElement(SearchInput, { 'aria-label': '搜索记录' }),
            },
            createElement(
              SelectionActionBar,
              { selectedCount: selected.length },
              createElement(SelectionClearAction, {
                selectedCount: selected.length,
                onClear: () => {
                  selected = []
                },
              }),
              actionable
                ? createElement(
                    Button,
                    { 'data-business-action-key': 'view' },
                    '查看'
                  )
                : null
            )
          ),
          createElement(BusinessDataTable, {
            rowKey: 'id',
            columns: [{ title: '版本', dataIndex: 'no', key: 'no' }],
            dataSource: rows,
            loading,
            pagination: false,
            rowSelection: selectable
              ? {
                  type: 'radio',
                  selectedRowKeys: selected,
                  onChange: (keys) => {
                    selected = keys
                  },
                  getCheckboxProps: () => ({ disabled }),
                }
              : null,
            onRow: (record) => ({
              onClick: () => {
                selected = [record.id]
              },
            }),
          })
        )
      )
    )
  const hint = () =>
    document.querySelector('.erp-business-selection-action-bar--placeholder')
  await renderPage()
  assert.equal(hint()?.textContent, '当前操作选中记录后显示可用操作')
  assert.ok(hint().closest('.erp-business-operation-panel__selection'))
  assert.equal(document.querySelector('[data-business-selection-hint]'), null)
  assert.equal(hint().querySelectorAll('button').length, 0)
  assert.equal(
    document.querySelector('.erp-business-selection-action-bar').hidden,
    true
  )
  await act(async () =>
    document.querySelector('.ant-table-tbody .ant-radio-input').click()
  )
  await renderPage()
  assert.deepEqual(selected, [1])
  assert.equal(hint(), null)
  assert.equal(
    document.querySelector('.erp-business-selection-action-bar').hidden,
    false
  )
  await act(async () =>
    document
      .querySelector('[data-business-action-key="clear-selection"]')
      .click()
  )
  await renderPage()
  assert.ok(hint(), '清空选择后恢复常驻操作栏的引导')
  for (const pending of [true, { spinning: true }]) {
    loading = pending
    await renderPage()
    assert.equal(hint(), null, '加载时不提示操作尚未就绪的记录')
  }
  loading = { spinning: false }
  await renderPage()
  assert.ok(hint())
  rows = []
  await renderPage()
  assert.equal(hint(), null, '无记录时只保留空结果反馈')
  rows = [{ id: 1, no: 'BOM-DISCOVERY' }]
  disabled = true
  await renderPage()
  assert.equal(hint(), null, '所有记录不可选时不作操作承诺')
  disabled = false
  selectable = false
  await renderPage()
  assert.equal(hint(), null)
  selectable = true
  actionable = false
  await renderPage()
  assert.equal(hint(), null, '没有记录动作时无需提示')
  actionable = true
  await render(
    createElement(
      MemoryRouter,
      { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      createElement(
        'div',
        null,
        createElement(
          BusinessPageLayout,
          null,
          createElement(
            BusinessOperationPanel,
            null,
            createElement(
              SelectionActionBar,
              { selectedCount: 0 },
              createElement(Button, null, '查看空列表')
            )
          ),
          createElement(BusinessDataTable, {
            rowKey: 'id',
            columns: [],
            dataSource: [],
            pagination: false,
            rowSelection: {},
          })
        ),
        createElement(
          BusinessPageLayout,
          null,
          createElement(
            BusinessOperationPanel,
            null,
            createElement(
              SelectionActionBar,
              { selectedCount: 0 },
              createElement(Button, null, '查看另一个列表')
            )
          ),
          createElement(BusinessDataTable, {
            rowKey: 'id',
            columns: [],
            dataSource: rows,
            pagination: false,
            rowSelection: {},
          })
        )
      )
    )
  )
  const scopes = document.querySelectorAll('.erp-business-page-layout')
  assert.equal(
    scopes[0].querySelector('.erp-business-selection-action-bar--placeholder'),
    null
  )
  assert.ok(
    scopes[1].querySelector('.erp-business-selection-action-bar--placeholder')
  )
})
