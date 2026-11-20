import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('task scope help keeps membership clear and closes without losing the trigger', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: ScopeHelp }] = await Promise.all([
    import('react-dom/client'),
    import('./WorkflowTaskScopeHelp.jsx'),
  ])
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const render = async (props) => act(async () => root.render(createElement(ScopeHelp, props)))
  const open = async () => act(async () => container.querySelector('button').click())
  const help = (label = '任务进度范围') => document.querySelector(`.workflow-task-scope-help[aria-label="${label}说明"]`)

  await render({ kind: 'progress' })
  assert.equal(container.querySelector('button').getAttribute('aria-expanded'), 'false')
  await open()
  assert.equal(container.querySelector('button').getAttribute('aria-expanded'), 'true')
  assert.equal(help().querySelector('.workflow-task-scope-help__related').hasAttribute('data-active'), true)
  assert.equal(help().querySelector('.workflow-task-scope-help__map').hasAttribute('data-active'), false)

  await render({ kind: 'progress', orderView: true })
  assert.equal(help().querySelector('.workflow-task-scope-help__map').hasAttribute('data-active'), true)
  assert.equal(help().querySelector('.workflow-task-scope-help__related').hasAttribute('data-active'), false)
  await act(async () => help().querySelector('button').click())
  assert.equal(container.querySelector('button').getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement === container.querySelector('button'), true)

  await render({ kind: 'records', scope: 'flow' })
  await open()
  assert.equal(container.querySelector('button').getAttribute('aria-expanded'), 'true')
  assert.equal(Boolean(help('处理记录范围')), true)
  assert.equal(help('处理记录范围').querySelectorAll('[data-included]').length, 2)
  assert.match(help('处理记录范围').textContent, /当前任务和这次相关任务/u)
  await render({ kind: 'records', scope: 'task' })
  assert.equal(help('处理记录范围').querySelectorAll('[data-included]').length, 1)
  assert.equal(help('处理记录范围').querySelector('[data-included]').textContent, '当前任务的记录')
  assert.match(help('处理记录范围').textContent, /没有其他关联任务时，内容相同/u)
  await act(async () => {
    container.querySelector('button').dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }))
  })
  assert.equal(container.querySelector('button').getAttribute('aria-expanded'), 'false')
})

test('existing description help keeps its click and Escape behavior', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { BusinessHelpLabel }] = await Promise.all([
    import('react-dom/client'),
    import('../help/BusinessContextHelp.jsx'),
  ])
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  await act(async () => root.render(createElement(BusinessHelpLabel, {
    label: '原有字段', description: '原有字段的补充说明',
  })))
  const trigger = container.querySelector('button')
  await act(async () => trigger.click())
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.match(document.querySelector('.erp-business-inline-help-popover').textContent, /原有字段的补充说明/u)
  await act(async () => trigger.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: 'Escape', bubbles: true, cancelable: true,
  })))
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
})
