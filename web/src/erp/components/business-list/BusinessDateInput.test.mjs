import { act, createElement, useState } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import dayjs from 'dayjs'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('date and time selections update the controlled value without confirmation or closing', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { DateInput, DateTimeInput }] = await Promise.all([import('react-dom/client'), import('./BusinessListLayout.jsx')])
  const node = document.createElement('div')
  document.body.appendChild(node)
  const root = createRoot(node)
  t.after(async () => { await act(async () => root.unmount()); node.remove(); dom.restore() })
  function Controlled({ timed }) {
    const [value, setValue] = useState('')
    return createElement('div', null, createElement(timed ? DateTimeInput : DateInput, { value, onChange: setValue, defaultPickerValue: dayjs('2026-10-08T09:00'), showNow: false }), createElement('output', null, value))
  }
  const click = (element) => act(async () => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  for (const timed of [false, true]) {
    await act(async () => root.render(createElement(Controlled, { key: String(timed), timed })))
    await click(node.querySelector('.ant-picker'))
    const popup = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
    assert.ok(popup)
    assert.equal(popup.querySelector('.ant-picker-ok'), null)
    await click(popup.querySelector('.ant-picker-cell-in-view[title="2026-10-09"]'))
    assert.ok(node.querySelector('output').textContent.startsWith('2026-10-09'), 'the controlled consumer must receive the date immediately')
    if (timed) {
      const minute = [...popup.querySelectorAll('.ant-picker-time-panel-column:last-child .ant-picker-time-panel-cell')].find((cell) => cell.textContent === '37')
      await click(minute)
      assert.ok(node.querySelector('output').textContent.endsWith(':37'), 'minutes must reach the consumer while the panel stays open')
      assert.ok(document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)'))
    }
  }
})
