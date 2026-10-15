import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { installTestDOM } from '../../../scripts/test/reactRuntime.mjs'
import useBusinessPageState from './useBusinessPageState.js'

test('筛选地址变化与清空后切换页签，不恢复已清除的旧筛选', async () => {
  const dom = installTestDOM()
  const root = createRoot(document.createElement('div'))
  const values = new Map()
  let controls
  function Shell() {
    return createElement(Outlet, { context: { pageUIState: { values } } })
  }
  function Probe({ page, scope }) {
    const [value, setValue] = useBusinessPageState(`${page}:${scope}`, scope)
    controls = { value, setValue }
    return null
  }
  const render = (page, scope) =>
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(Shell) },
            createElement(Route, {
              path: '/',
              element: createElement(Probe, { key: page, page, scope }),
            })
          )
        )
      )
    )
  try {
    await act(() => render('suppliers', ''))
    await act(() => {
      controls.setValue('PROCESSOR')
      render('suppliers', 'PROCESSOR')
    })
    assert.equal(controls.value, 'PROCESSOR')
    await act(() => {
      controls.setValue('')
      render('suppliers', '')
    })
    await act(() => render('materials', ''))
    await act(() => render('suppliers', ''))
    assert.equal(controls.value, '')

    await act(() => render('materials', ''))
    await act(() => render('suppliers', 'MATERIAL'))
    assert.equal(controls.value, 'MATERIAL')
    await act(() => controls.setValue('keyword'))
    await act(() => render('materials', ''))
    await act(() => render('suppliers', 'MATERIAL'))
    assert.equal(controls.value, 'keyword')
  } finally {
    await act(() => root.unmount())
    dom.restore()
  }
})
