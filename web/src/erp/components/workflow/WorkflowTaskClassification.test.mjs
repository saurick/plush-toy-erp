import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('分类主文字简明，完整路径按需查看，关闭恢复焦点且切换任务不会残留', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Classification }] = await Promise.all([import('react-dom/client'), import('./WorkflowTaskClassification.jsx')])
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove(); dom.restore() })
  const path = '协同跟进 / 模拟任务 / 模拟验收任务'
  const task = { id: 1, source_type: 'simulated-manual-acceptance-task-batch', discovery: { path } }
  await act(async () => root.render(createElement(Classification, { task })))
  assert.equal(host.querySelector('dt').textContent, '任务分类')
  assert.equal(host.querySelector('dd > span').textContent, '模拟任务')
  assert.equal(host.textContent.includes(path), false)
  const trigger = host.querySelector('button')
  await act(async () => { trigger.focus(); trigger.click() })
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(document.querySelector('.workflow-task-classification__path p').textContent, path)
  await act(async () => trigger.dispatchEvent(new dom.runtimeWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, trigger)
  await act(async () => trigger.click())
  await act(async () => root.render(createElement(Classification, { task: { id: 2, discovery: { path: '订单履约 / 采购 / 核对数量' } } })))
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(host.querySelector('dd > span').textContent, '核对数量')
  await act(async () => root.render(createElement(Classification, { task: {} })))
  assert.equal(host.querySelector('dl'), null)
})
