import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('source presentation survives a related editor and rejects stale account, task, version and source scopes', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: useInformation } = await import('./useTaskBusinessInformation.js')
  let value
  function Consumer({ scope }) { value = useInformation(scope); return h('div', null, value.retained) }
  await ui.render(h(Consumer, { scope: 'account1:task7:v1:source3' }))
  const old = value
  await ui.act(() => { value.stage(value.scopeKey, '原单资料'); value.retain(value.scopeKey) })
  assert.equal(value.retained, '原单资料')
  for (const scope of ['account2:task7:v1:source3', 'account2:task8:v1:source3', 'account2:task8:v2:source3', 'account2:task8:v2:source4']) {
    await ui.render(h(Consumer, { scope }))
    const current = value
    assert.equal(value.retained, null)
    await ui.act(() => { old.stage(old.scopeKey, '过期来源'); old.retain(old.scopeKey) })
    assert.equal(value.retained, null)
    await ui.act(() => { current.stage(current.scopeKey, '当前资料'); current.retain(current.scopeKey) })
    assert.equal(value.retained, '当前资料')
    await ui.act(() => current.release(current.scopeKey))
    assert.equal(value.retained, null)
    await ui.act(() => current.retain(current.scopeKey))
    assert.equal(value.retained, null, 'withdrawn access cannot revive a released source presentation')
  }
})
