import assert from 'node:assert/strict'
import { createElement } from 'react'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { WORK_CENTER_DESIGN_TOPICS } from '../config/devWorkCenterDesign.mjs'

test('工作中心样例在高权限上下文中仍只展示固定数据，清单只复制示例文字', async (t) => {
  const { container, render, act, flush } = await createReactTestHarness(t)
  const [{ default: DevWorkCenterDesign }, { MemoryRouter, Routes, Route, Outlet }] = await Promise.all([
    import('./DevWorkCenterDesign.jsx'),
    import('react-router-dom'),
  ])
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url))
    throw new Error('设计样例不得请求业务数据')
  })
  // Make lazy image reads observable instead of letting an off-screen element hide them.
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  class VisibleImageObserver {
    constructor(callback) { this.callback = callback }

    observe(target) { this.callback([{ target, isIntersecting: true }]) }

    disconnect() {}
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: VisibleImageObserver })
  t.after(() => previousObserver ? Object.defineProperty(globalThis, 'IntersectionObserver', previousObserver) : delete globalThis.IntersectionObserver)
  const writes = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => writes.push(value) } })
  const storageBefore = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]
  for (const topic of WORK_CENTER_DESIGN_TOPICS) {
    for (const device of topic.devices) {
      const view = createElement(DevWorkCenterDesign, { topic })
      const outlet = createElement(Outlet, { context: { adminProfile: { id: 1, is_super_admin: true } } })
      const route = createElement(Route, { element: outlet }, createElement(Route, { path: '*', element: view }))
      const entry = `/__dev/ui-design?${device === 'mobile' ? 'page=mobile-tasks' : ''}`
      await render(createElement(MemoryRouter, { key: `${topic.key}:${device}`, initialEntries: [entry] }, createElement(Routes, null, route)))
      await flush()
      assert.match(container.textContent, /示例数据/u)
      assert.doesNotMatch(container.textContent, /无图片读取权限|加载失败/u)
      if (topic.key === 'task-cards' && device === 'mobile') {
        await act(async () => container.querySelector('[aria-label="查看3 款产品"]').click())
        const dialog = document.querySelector('.erp-task-linked-items-modal')
        assert.match(dialog.textContent, /示例草莓小熊/u)
        await act(async () => dialog.querySelector('[aria-label="复制产品编号"]').click())
        assert.deepEqual(writes, ['DEMO-CP-001'])
      }
      assert.deepEqual(requests, [], `${topic.key}:${device}`)
    }
  }
  assert.deepEqual([JSON.stringify(localStorage), JSON.stringify(sessionStorage)], storageBefore)
})
