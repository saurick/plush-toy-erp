import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'
import { businessDocumentTypeOptions } from '../../config/businessModules.mjs'

test('任务单据筛选复用页签和筛选按钮，切换模块清空类型且保持模块条挂载', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: WorkflowTaskDocumentFilter } = await import('./WorkflowTaskDocumentFilter.jsx')
  const values = ['production_fact', 'production-progress', 'production_order', 'purchase_receipt', 'purchase_order']
  const options = businessDocumentTypeOptions(values)
  const changes = []
  function Example() {
    const [filters, setFilters] = React.useState({ sourceSection: 'production', sourceType: 'production_fact' })
    return createElement(WorkflowTaskDocumentFilter, {
      options,
      section: filters.sourceSection,
      value: filters.sourceType,
      onChange: (next) => { changes.push(next); setFilters(next) },
    })
  }
  await harness.render(createElement(Example))
  const tabs = document.querySelector('[role="tablist"]')
  const choices = () => document.querySelector('[role="group"][aria-label="单据类型"]')
  assert.equal(document.querySelectorAll('.erp-filter-field > legend').length, 1)
  assert.equal(choices().querySelectorAll('button').length, 3, '同一生产记录只显示一个选项')
  assert.equal(choices().querySelectorAll('.erp-filter-chip').length, 3)
  assert.equal(document.querySelectorAll('[role="combobox"]').length, 0)
  await harness.click(harness.button('采购管理'))
  assert.equal(document.querySelector('[role="tablist"]') === tabs, true)
  assert.deepEqual(changes.at(-1), { sourceSection: 'purchase', sourceType: 'all' })
  assert.equal(choices().querySelector('[aria-pressed="true"]').textContent, '不限')
  assert.deepEqual([...choices().querySelectorAll('button')].map((button) => button.textContent).sort(), ['不限', '采购收货单', '采购订单'].sort())
  await harness.click(harness.button('采购收货单'))
  assert.deepEqual(changes.at(-1), { sourceSection: 'purchase', sourceType: 'purchase_receipt' })
  await harness.click(harness.button('全部模块'))
  assert.equal(choices().querySelectorAll('button').length, 5)
  assert.deepEqual(changes.at(-1), { sourceSection: 'all', sourceType: 'all' })
  assert.equal(document.querySelector('[role="tablist"]') === tabs, true)
})

test('已选模块没有当前可见类型时保留明确选择，允许返回全部模块', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: WorkflowTaskDocumentFilter } = await import('./WorkflowTaskDocumentFilter.jsx')
  const changes = []
  await harness.render(createElement(WorkflowTaskDocumentFilter, {
    section: 'production', value: 'all', options: businessDocumentTypeOptions(['purchase_receipt']), onChange: (value) => changes.push(value),
  }))
  assert.equal(harness.button('生产管理').getAttribute('aria-selected'), 'true')
  assert.equal(document.querySelectorAll('[role="group"][aria-label="单据类型"] button').length, 1)
  await harness.click(harness.button('全部模块'))
  assert.deepEqual(changes, [{ sourceSection: 'all', sourceType: 'all' }])
})
