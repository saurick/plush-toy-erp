import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as React from 'react'
import { installTestDOM } from '../../../scripts/test/reactRuntime.mjs'
import * as identities from '../utils/workflowTaskActionAccess.mjs'

async function mount(t) {
  const dom = installTestDOM()
  const { createRoot } = await import('react-dom/client')
  const pending = []
  const listWorkflowTaskEvents = (id, options) =>
    new Promise((resolve, reject) =>
      pending.push({ id, ...options, resolve, reject })
    )
  const source = readFileSync(
    new URL('./useWorkflowTaskEventRecords.js', import.meta.url),
    'utf8'
  )
    .replace(
      /import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)'\n/gu,
      (_, names, path) =>
        `const {${names}} = __modules__[${JSON.stringify(path)}]\n`
    )
    .replace(
      'export default function useWorkflowTaskEventRecords',
      'function useWorkflowTaskEventRecords'
    )
  const module = { exports: {} }
  vm.runInNewContext(
    `${source}\nmodule.exports = useWorkflowTaskEventRecords`,
    {
      module,
      AbortController,
      __modules__: {
        react: React,
        '../api/workflowApi.mjs': { listWorkflowTaskEvents },
        '../utils/workflowTaskActionAccess.mjs': identities,
      },
    }
  )
  const hook = module.exports
  let current
  const Harness = (props) => {
    current = hook(props)
    return null
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = (props) =>
    React.act(async () => root.render(React.createElement(Harness, props)))
  const flush = (action) =>
    React.act(async () => {
      action?.()
      await Promise.resolve()
    })
  t.after(async () => {
    await React.act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  return {
    pending,
    render,
    flush,
    get current() {
      return current
    },
  }
}

const task = {
  id: 41,
  version: 1,
  source_type: 'engineering_material_request',
  source_id: 5,
}
const profile = { id: 7, permissions: ['workflow.task.read'] }

test('task and flow reads fail independently; filters reuse their page and pagination preserves records on failure', async (t) => {
  const app = await mount(t)
  await app.render({ task, profile })
  assert.equal(app.pending.length, 2)
  assert.equal(app.current.scope, 'flow')
  await app.flush(() => {
    app.pending
      .find((call) => call.scope === 'task')
      .reject(new Error('task unavailable'))
    app.pending
      .find((call) => call.scope === 'flow')
      .resolve({ items: [{ id: 9 }, { id: 8 }], truncated: true })
  })
  assert.equal(app.current.task.status, 'error')
  assert.equal(app.current.flow.status, 'ready')
  await app.flush(() => app.current.changeScope('task'))
  assert.equal(app.pending.length, 2)
  await app.flush(() => app.current.retry())
  assert.equal(app.pending[2].scope, 'task')
  await app.flush(() =>
    app.pending[2].resolve({ items: [{ id: 9 }], truncated: false })
  )
  await app.flush(() => app.current.changeScope('flow'))
  await app.flush(() => app.current.loadOlder())
  assert.equal(app.pending[3].beforeEventId, 8)
  await app.flush(() =>
    app.pending[3].reject(new Error('older page unavailable'))
  )
  assert.equal(app.current.flow.items.length, 2)
  assert.equal(app.current.flow.pageError, true)
  await app.flush(() => app.current.loadOlder())
  await app.flush(() =>
    app.pending[4].resolve({ items: [{ id: 7 }], truncated: false })
  )
  assert.equal(app.current.flow.items.map((item) => item.id).join(','), '9,8,7')
  assert.equal(app.current.flow.pageError, false)
  assert.equal(app.current.flow.truncated, false)
})

test('task and effective permission changes cancel old reads and never reveal their late results', async (t) => {
  const app = await mount(t)
  await app.render({ task, profile })
  const oldFlow = app.pending.find((call) => call.scope === 'flow')
  await app.render({ task: { ...task, id: 42 }, profile })
  assert.equal(oldFlow.signal.aborted, true)
  await app.flush(() =>
    oldFlow.resolve({ items: [{ id: 99 }], truncated: false })
  )
  assert.equal(app.current.flow.items.length, 0)
  assert.equal(app.current.flow.status, 'loading')
  const nextFlow = app.pending.filter((call) => call.scope === 'flow').at(-1)
  await app.flush(() =>
    nextFlow.resolve({ items: [{ id: 10 }], truncated: false })
  )
  assert.equal(app.current.flow.items.length, 1)
  await app.render({
    task: { ...task, id: 42 },
    profile: { ...profile, permissions: [] },
  })
  assert.equal(app.current.flow.items.length, 0)
  assert.equal(app.current.task.items.length, 0)
  assert.equal(app.current.flow.status, 'loading')
})
