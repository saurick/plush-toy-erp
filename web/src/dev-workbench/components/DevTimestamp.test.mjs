import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('shared workbench time preserves source identity and event wording', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: DevTimestamp } = await import('./DevTimestamp.jsx')
  const source = '2026-08-09T12:26:46+08:00'
  await view.render(createElement(DevTimestamp, {
    value: source,
    action: '发布于',
    missing: '发布时间未证明',
    className: 'event-time',
  }))
  const time = view.container.querySelector('time')
  assert.equal(time.getAttribute('datetime'), source)
  assert.equal(time.getAttribute('title'), source)
  assert.match(time.textContent, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/u)
  assert.equal(view.container.firstChild.className.includes('event-time'), true)
  assert.equal(view.container.textContent, `发布于 ${time.textContent}`)
})

test('shared workbench time fails closed without inventing completion time', async (t) => {
  const view = await createReactTestHarness(t)
  const { default: DevTimestamp } = await import('./DevTimestamp.jsx')
  for (const value of ['', null, '2026-08-09T12:26:46', '2026-02-30T01:02:03Z', 1786249600000]) {
    await view.render(createElement(DevTimestamp, {
      value,
      action: '完成于',
      missing: '完成时间未证明',
    }))
    assert.equal(view.container.querySelector('time'), null)
    assert.equal(view.container.textContent, '完成时间未证明')
  }
  await view.render(createElement(DevTimestamp, {
    value: 1786249600,
    unit: 'unix-seconds',
  }))
  assert.equal(view.container.querySelector('time').dateTime, '2026-08-09T04:26:40.000Z')
})
