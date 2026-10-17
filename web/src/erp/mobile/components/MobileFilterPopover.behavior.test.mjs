import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('筛选摘要具名显示首项和剩余数量，一键清空后恢复默认并保留搜索', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Filter } = await import('./MobileFilterPopover.jsx')
  function Example() {
    const [count, setCount] = React.useState(3)
    return h('section', null, h('input', { value: '小熊', readOnly: true }), h(Filter, { contextLabel: '任务',
title: '任务筛选',
open: false,
onOpenChange() {},
count,
        summary: count ? ['任务状态：待处理', '来源单据：销售订单', '排序：等待最久'] : [],
        onReset: () => setCount(0),
      }))
  }
  await harness.render(h(Example))
  const trigger = document.querySelector('.mobile-filter-trigger')
  assert.equal(trigger.querySelector('.mobile-filter-trigger__label').textContent, '待处理')
  assert.equal(trigger.querySelector('.erp-control-count').textContent, '+2')
  assert.equal(trigger.getAttribute('title'), '任务状态：待处理；来源单据：销售订单；排序：等待最久')
  await harness.click(document.querySelector('.mobile-filter-clear'))
  assert.equal(trigger.querySelector('.mobile-filter-trigger__label').textContent, '筛选')
  assert.equal(trigger.querySelector('.erp-control-count'), null)
  assert.equal(document.querySelector('.mobile-filter-clear'), null)
  assert.equal(document.querySelector('input').value, '小熊')
  assert.equal(document.activeElement, trigger)
})

test('共享手机筛选入口仅在有可清空条件时提供独立的右侧取消按钮', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Filter } = await import('./MobileFilterPopover.jsx')
  for (const [count, onReset, buttons] of [[0, () => {}, 1], [1, () => {}, 2], [3, () => {}, 2], [2, undefined, 1]]) {
    await harness.render(h(Filter, { contextLabel: '任务', title: '任务筛选', open: false, onOpenChange() {}, count, onReset }))
    const group = document.querySelector('[role="group"][aria-label="任务筛选操作"]')
    assert.equal(group.querySelectorAll('button').length, buttons)
    assert.equal(group.querySelector('button button'), null, '打开与清空使用并排按钮')
    assert.equal(group.querySelector('.mobile-filter-trigger').getAttribute('aria-expanded'), 'false')
    const clear = group.querySelector('.mobile-filter-clear')
    if (clear) {
      assert.equal(clear.getAttribute('aria-label'), '清空任务筛选')
      assert.equal(clear.getAttribute('aria-haspopup'), null)
      assert.equal(clear.textContent.trim(), '', '右侧只呈现图标')
    }
  }
})

test('右侧取消只调用一次重置、关闭浮层并恢复入口焦点，单条件也能清空', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Filter } = await import('./MobileFilterPopover.jsx')
  let resets = 0
  const opens = []
  function Example() {
    const [count, setCount] = React.useState(3)
    const [open, setOpen] = React.useState(false)
    const filter = h(Filter, {
      contextLabel: '已办',
      title: '已办筛选',
      count,
      open,
      onOpenChange(value) { opens.push(value); setOpen(value) },
      onReset() { resets += 1; setCount(0) },
    })
    return h('section', null, h('input', { value: '小熊', readOnly: true }), filter, h('button', { onClick: () => setCount(1) }, '重新筛选'))
  }
  await harness.render(h(Example))
  const trigger = () => document.querySelector('.mobile-filter-trigger')
  const clear = () => document.querySelector('.mobile-filter-clear')
  await harness.click(clear())
  assert.equal(resets, 1)
  assert.equal(opens.includes(true), false, '直接清空不先打开面板')
  assert.equal(trigger().getAttribute('aria-expanded'), 'false')
  assert.equal(clear(), null)
  assert.equal(document.activeElement, trigger())
  assert.equal(document.querySelector('input').value, '小熊')
  await harness.click(harness.button('重新筛选'))
  assert.ok(clear(), '只有一个条件时同样提供右侧取消')
  await harness.click(trigger())
  assert.equal(trigger().getAttribute('aria-expanded'), 'true')
  await harness.click(clear())
  assert.equal(resets, 2)
  assert.equal(trigger().getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, trigger())
})

test('面板内重置保持展开，关闭仍将焦点交回筛选入口', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Filter } = await import('./MobileFilterPopover.jsx')
  let resets = 0
  function Example() {
    const [open, setOpen] = React.useState(false)
    const [count, setCount] = React.useState(1)
    return h(Filter, { contextLabel: '流程', title: '流程筛选', open, count, onOpenChange: setOpen, onReset() { resets += 1; setCount(0) } })
  }
  await harness.render(h(Example))
  const trigger = document.querySelector('.mobile-filter-trigger')
  await harness.click(trigger)
  await harness.click(harness.button('重置筛选'))
  assert.equal(resets, 1)
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(document.querySelector('.mobile-filter-clear'), null)
  assert.ok(document.querySelector('.mobile-filter-panel').contains(document.activeElement))
  await harness.click(harness.button('收起'))
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, trigger)
})
