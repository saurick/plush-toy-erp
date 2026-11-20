import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()

const { useOperationalFactQuery } =
  await import('./useOperationalFactQuery.mjs')
const enabledViews = ['production', 'outsourcing', 'shipments']
const adminProfile = {}

test('业务记录页签沿用 URL 真源，深链、切换与历史恢复不回跳', async () => {
  const dom = installTestDOM()
  const root = createRoot(document.createElement('div'))
  const renders = []
  let controls
  function Probe() {
    const query = useOperationalFactQuery({
      initialActiveKey: 'production',
      enabledViews,
      adminProfile,
    })
    const location = useLocation()
    controls = { ...query, navigate: useNavigate(), search: location.search }
    renders.push(query.currentActiveKey)
    return null
  }
  try {
    await act(() =>
      root.render(
        h(
          MemoryRouter,
          {
            initialEntries: [
              '/records?view=outsourcing&source_type=PURCHASE_ORDER&source_id=17',
            ],
            future: { v7_startTransition: true, v7_relativeSplatPath: true },
          },
          h(Probe)
        )
      )
    )
    assert(
      renders.every((view) => view === 'outsourcing'),
      '首次渲染直接显示深链页签'
    )
    renders.length = 0
    await act(() => controls.setActiveKey('shipments'))
    const firstTarget = renders.indexOf('shipments')
    assert(firstTarget >= 0)
    assert(renders.slice(firstTarget).every((view) => view === 'shipments'))
    assert.equal(new URLSearchParams(controls.search).get('view'), 'shipments')
    assert.equal(new URLSearchParams(controls.search).get('source_id'), '17')

    await act(() => controls.navigate(-1))
    assert.equal(controls.currentActiveKey, 'outsourcing')
    await act(() => controls.navigate(1))
    assert.equal(controls.currentActiveKey, 'shipments')
    await act(() => controls.setActiveKey('finance'))
    assert.equal(controls.currentActiveKey, 'shipments', '不能进入未启用视图')
    await act(() => controls.navigate('/records?view=finance'))
    assert.equal(
      controls.currentActiveKey,
      'production',
      '无效深链使用当前启用的默认视图'
    )
    await act(() => controls.navigate('/records?view=__proto__'))
    assert.equal(controls.currentActiveKey, 'production')
    await act(() => controls.setActiveKey('constructor'))
    assert.equal(controls.currentActiveKey, 'production')
  } finally {
    await act(() => root.unmount())
    dom.restore()
  }
})
