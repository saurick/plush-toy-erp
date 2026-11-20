import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

const testDOM = installTestDOM()
after(() => testDOM.restore())
registerJSXTestLoader()
const { default: MobileTaskListContent } = await import('./MobileTaskListContent.jsx')

test('mobile list distinguishes first load, cold view, refresh and resolved content', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = async (props) => act(async () => {
    root.render(createElement(
      MobileTaskListContent,
      { label: '正在加载已办任务', ...props },
      createElement('button', { 'data-testid': 'real-task' }, '查看任务')
    ))
  })
  try {
    await render({ loading: true, pending: true, initialLoading: true })
    const skeleton = container.querySelector('[data-testid="mobile-role-task-skeleton"]')
    assert.ok(skeleton)
    assert.equal(skeleton.getAttribute('aria-hidden'), 'true')
    assert.equal(skeleton.querySelectorAll('button,a,input,select,textarea,[tabindex]').length, 0)
    assert.equal(container.querySelector('[role="status"]').textContent, '正在加载已办任务')
    assert.equal(container.querySelector('[data-testid="real-task"]'), null)

    await render({ loading: true, pending: true, initialLoading: false })
    assert.equal(container.querySelector('[data-testid="mobile-role-task-skeleton"]'), null)
    assert.equal(container.querySelector('[data-testid="mobile-role-task-list-loading"]').textContent, '正在加载已办任务')
    assert.equal(container.firstElementChild.getAttribute('aria-busy'), 'true')

    await render({ loading: false, pending: false, initialLoading: false })
    const task = container.querySelector('[data-testid="real-task"]')
    assert.ok(task)
    assert.equal(container.firstElementChild.getAttribute('aria-busy'), 'false')
    await render({ loading: true, pending: false, initialLoading: false })
    assert.equal(container.querySelector('[data-testid="real-task"]'), task, '刷新应保留真实内容节点和焦点入口')
    assert.equal(container.querySelector('[role="status"]'), null)
    assert.equal(container.firstElementChild.getAttribute('aria-busy'), 'true')
    await render({ loading: false, pending: false, initialLoading: false })
    assert.equal(container.querySelector('[data-testid="real-task"]'), task)
    assert.equal(container.firstElementChild.getAttribute('aria-busy'), 'false')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
