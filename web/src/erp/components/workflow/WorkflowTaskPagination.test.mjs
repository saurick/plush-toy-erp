import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('任务分页统一控件后保留翻页、加载锁定与原页位置恢复', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: WorkflowTaskPagination }] = await Promise.all([
    import('react-dom/client'),
    import('./WorkflowTaskPagination.jsx'),
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
  const render = async (props = {}) => act(async () => root.render(createElement(WorkflowTaskPagination, {
    total: 161,
    current: 1,
    pageSize: 20,
    onChange: (...args) => changes.push(args),
    ...props,
  })))
  const click = async (element) => act(async () => element.click())

  await render()
  assert.match(container.textContent, /第 1-20 条 \/ 共 161 条/u)
  assert.equal(container.querySelector('.ant-pagination-prev button').disabled, true)
  const next = container.querySelector('[aria-label="下一页"]')
  assert.equal(next.textContent, '', '翻页以标准图标呈现，保留可访问名称')
  await click(next)
  assert.deepEqual(changes, [[2, 20]])

  await render({ loading: true })
  assert.match(container.textContent, /正在加载任务/u)
  await click(container.querySelector('.ant-pagination-next button'))
  assert.deepEqual(changes, [[2, 20]], '加载中不能发出额外翻页请求')
  assert.equal(container.querySelector('[role="combobox"]').disabled, true)

  await render({ current: 3, retainedPage: 3, total: 1, loading: true })
  const recovery = container.querySelector('button')
  assert.equal(recovery.disabled, true)
  await render({ current: 3, retainedPage: 3, total: 1 })
  assert.match(container.textContent, /原第 3 页位置，当前筛选共 1 项/u)
  assert.equal(container.querySelector('.ant-pagination'), null)
  await click(container.querySelector('button'))
  assert.deepEqual(changes.at(-1), [1, 20])

  await render({ error: true })
  assert.match(container.textContent, /任务加载失败/u)
  await render({ total: 0 })
  assert.match(container.textContent, /第 0-0 条 \/ 共 0 条/u)
  assert.equal(container.querySelector('.ant-pagination-next button').disabled, true)
})
