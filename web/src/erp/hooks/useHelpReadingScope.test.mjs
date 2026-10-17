import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { registerJSXTestLoader, installTestDOM } from '../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()
const dom = installTestDOM()
const { JsonRpc } = await import('../../common/utils/jsonRpc.js')
const { default: useHelpContent } = await import('./useHelpContent.js')
const { default: useProjectManuals } = await import('./useProjectManuals.js')
after(() => dom.restore())

const profile = {
  id: 11,
  is_super_admin: false,
  roles: [{ role_key: 'boss' }],
  permissions: ['help.business.edit'],
  menus: ['/erp/help-center'],
  effective_session: { source: 'active_customer_config_revision', customer: { key: 'yoyoosun' }, config_revision: 'a' },
}
const cases = [
  {
    name: 'published help',
    hook: useHelpContent,
    method: 'help_content',
    key: 'published',
    data: (value) => ({ documents: [], published: [{ document_id: 'handbook:start', markdown: value }] }),
  },
  {
    name: 'protected manuals',
    hook: useProjectManuals,
    method: 'project_manuals',
    key: 'manuals',
    data: (value) => ({ manuals: [{ key: 'administration', title: '管理手册', summary: '实施说明', markdown: value, source_hash: 'a'.repeat(64) }] }),
  },
]

function harness(t, entry) {
  const calls = []
  const mock = t.mock.method(JsonRpc.prototype, 'call', (method, params, options) => {
    assert.equal(method, entry.method)
    return new Promise((resolve, reject) => calls.push({ options, resolve: (text) => resolve({ data: entry.data(text) }), reject }))
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let output
  function Probe({ value }) { output = entry.hook(value); return null }
  const h = {
    calls,
    async render(value = profile) {
      await act(async () => root.render(createElement(Probe, { value })))
      return output
    },
    async settle(action = () => {}) {
      await act(async () => { action(); await new Promise((resolve) => setImmediate(resolve)) })
      return output
    },
  }
  t.after(async () => { await act(async () => root.unmount()); container.remove(); mock.mock.restore() })
  return h
}

for (const entry of cases) {
  test(`${entry.name}: equivalent session refresh retains content and explicit retry still reads`, async (t) => {
    const h = harness(t, entry)
    await h.render()
    const ready = await h.settle(() => h.calls[0].resolve('已发布正文'))
    assert.equal(ready.status, 'ready')
    const content = ready[entry.key]
    const refreshed = await h.render({ ...structuredClone(profile), display_name: '更新显示名称' })
    assert.equal(h.calls.length, 1)
    assert.equal(refreshed.status, 'ready')
    assert.equal(refreshed[entry.key], content)
    await h.settle(() => refreshed.reload())
    assert.equal(h.calls.length, 2)
    assert.equal((await h.settle(() => h.calls[1].resolve('重新读取的正文'))).status, 'ready')
  })
  test(`${entry.name}: changed permissions clear content and late responses cannot restore it`, async (t) => {
    const h = harness(t, entry)
    await h.render()
    await h.settle(() => h.calls[0].resolve('仅原岗位可读'))
    const next = await h.render({ ...profile, permissions: [] })
    assert.equal(next.status, 'loading')
    assert.deepEqual(next[entry.key], [])
    await h.settle(() => next.reload())
    assert.equal(h.calls[1].options.signal.aborted, true)
    const pending = await h.settle(() => h.calls[1].resolve('失效响应'))
    assert.equal(pending.status, 'loading')
    assert.deepEqual(pending[entry.key], [])
    const updated = await h.settle(() => h.calls[2].resolve('当前岗位可读'))
    assert.equal(updated.status, 'ready')
    const signedOut = await h.render(null)
    assert.deepEqual(signedOut[entry.key], [])
    assert.equal(signedOut.status, 'loading')
  })
}
