import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('任务编号只出现在任务信息折叠区，复制完整编号，切换任务后不沿用旧编号', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Card } = await import('./WorkflowTaskInfoCard.jsx')
  const copied = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => copied.push(value) } })
  const first = { id: 1911, task_no: 'RW20261018-0029', task_code: 'source-internal-1911', task_name: '整理首件要求', task_status_key: 'ready', payload: {} }
  await harness.render(h(Card, { task: first, title: first.task_name }))
  const details = document.querySelector('.workflow-task-info-card__details')
  assert.equal(details.open, false)
  assert.equal(document.querySelectorAll('.workflow-task-info-card__heading [aria-label="复制任务编号"]').length, 0)
  assert.equal(details.querySelector('dl > dt').textContent, '任务编号')
  await harness.click(details.querySelector('summary'))
  assert.equal(details.open, true)
  await harness.click(details.querySelector('[aria-label="复制任务编号"]'))
  assert.deepEqual(copied, [first.task_no])
  const second = { ...first, id: 1912, task_no: 'RW20261018-0030' }
  await harness.render(h(Card, { task: second, title: second.task_name }))
  assert.equal(document.querySelector('.workflow-task-info-card__details').open, false)
  assert.equal(document.querySelector('.workflow-task-info-card__number .erp-task-copy-field__value').textContent, second.task_no)
  assert.doesNotMatch(document.querySelector('.workflow-task-info-card__number').textContent, /0029|1911|source-internal/u)
  await harness.render(h(Card, { task: { ...second, task_no: '' }, title: second.task_name }))
  assert.equal(document.querySelector('.workflow-task-info-card__number dd').textContent, '未记录')
  assert.equal(document.querySelectorAll('[aria-label="复制任务编号"]').length, 0)
})
