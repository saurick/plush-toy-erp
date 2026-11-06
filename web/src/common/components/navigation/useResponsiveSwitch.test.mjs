import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as nextTask } from 'node:timers/promises'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function fixture(t) {
  const ui = await createReactTestHarness(t)
  const React = await import('react')
  const { default: useResponsiveSwitch } = await import('./useResponsiveSwitch.js')
  const frames = new Map()
  let frameID = 0
  globalThis.requestAnimationFrame = (callback) => { frames.set(++frameID, callback); return frameID }
  globalThis.cancelAnimationFrame = (id) => frames.delete(id)
  let api
  let setValue
  let setScope
  const commits = []
  let blocked = null
  function Content({ value }) {
    if (blocked?.value === value) throw blocked.promise
    return React.createElement('p', { 'data-content': true }, value)
  }
  function Scene() {
    const [value, update] = React.useState('a')
    const [scope, updateScope] = React.useState('first-location')
    const control = useResponsiveSwitch(value, scope)
    React.useLayoutEffect(() => { api = control; setValue = update; setScope = updateScope }, [control])
    return React.createElement(React.Fragment, null, React.createElement('output', { 'aria-busy': control.pending }, control.selected), React.createElement(React.Suspense, { fallback: 'loading' }, React.createElement(Content, { value })))
  }
  await ui.render(React.createElement(Scene))
  return {
    ui,
    commits,
    get selected() { return ui.container.querySelector('output').textContent },
    get content() { return ui.container.querySelector('[data-content]')?.textContent },
    get busy() { return ui.container.querySelector('output').getAttribute('aria-busy') === 'true' },
    begin: (value, options) => api.request(value, () => { commits.push(value); setValue(value) }, options),
    request: (value, options) => ui.act(async () => api.request(value, () => { commits.push(value); setValue(value) }, options)),
    external: (value) => ui.act(async () => setValue(value)),
    externalScope: (value) => ui.act(async () => setScope(value)),
    async frame() {
      await ui.act(async () => {
        const callbacks = [...frames.values()]
        frames.clear()
        callbacks.forEach((callback) => callback())
        await nextTask(0)
      })
    },
    block(value) {
      let resolve
      blocked = { value, promise: new Promise((done) => { resolve = done }) }
      return async () => { blocked = null; await ui.act(async () => resolve()) }
    },
  }
}

test('selection responds before content work starts', async (t) => {
  const f = await fixture(t)
  await f.request('b')
  assert.equal(f.selected, 'b')
  assert.equal(f.content, 'a')
  assert.equal(f.busy, true)
  assert.deepEqual(f.commits, [])
  await f.frame()
  assert.equal(f.content, 'b')
  assert.equal(f.busy, false)
})

test('leave confirmation finishes before projecting a selection; denial preserves the view', async (t) => {
  const f = await fixture(t)
  let decide
  let request
  await f.ui.act(async () => { request = f.begin('b', { before: () => new Promise((done) => { decide = done }) }) })
  assert.equal(f.selected, 'a')
  assert.equal(f.busy, false)
  await f.ui.act(async () => { decide(false); await request })
  await f.frame()
  assert.equal(f.selected, 'a')
  assert.deepEqual(f.commits, [])
})

test('rapid choices only commit the last queued destination, including returning to the active view', async (t) => {
  const f = await fixture(t)
  await f.request('b')
  await f.request('c')
  await f.frame()
  assert.deepEqual(f.commits, ['c'])
  await f.request('b')
  await f.request('c')
  await f.frame()
  assert.deepEqual(f.commits, ['c', 'c'])
  assert.equal(f.selected, 'c')
})

test('a late confirmation cannot replace a newer choice', async (t) => {
  const f = await fixture(t)
  let decide
  let request
  await f.ui.act(async () => { request = f.begin('b', { before: () => new Promise((done) => { decide = done }) }) })
  await f.request('c')
  await f.ui.act(async () => { decide(true); await request })
  await f.frame()
  assert.deepEqual(f.commits, ['c'])
})

test('suspended content remains switchable and cannot replace the latest destination when it arrives', async (t) => {
  const f = await fixture(t)
  const release = f.block('b')
  await f.request('b')
  await f.frame()
  assert.equal(f.selected, 'b')
  assert.equal(f.content, 'a')
  assert.equal(f.busy, true)
  await f.request('c')
  assert.equal(f.selected, 'c')
  assert.equal(f.content, 'a')
  await f.frame()
  await release()
  assert.equal(f.content, 'c')
  assert.equal(f.selected, 'c')
  assert.equal(f.busy, false)
})

test('returning to the current view supersedes already started suspended work', async (t) => {
  const f = await fixture(t)
  const release = f.block('b')
  await f.request('b')
  await f.frame()
  await f.request('a')
  assert.equal(f.selected, 'a')
  await f.frame()
  await release()
  assert.equal(f.content, 'a')
  assert.equal(f.selected, 'a')
})

test('external history changes and unmount cancel queued content work', async (t) => {
  const f = await fixture(t)
  await f.request('b')
  await f.external('c')
  await f.frame()
  assert.equal(f.selected, 'c')
  assert.deepEqual(f.commits, [])
  await f.request('d')
  await f.ui.unmount()
  await f.frame()
  assert.deepEqual(f.commits, [])
})

test('a history change within the same tab also cancels its queued destination', async (t) => {
  const f = await fixture(t)
  await f.request('b')
  await f.externalScope('same-tab-different-query')
  await f.frame()
  assert.equal(f.selected, 'a')
  assert.equal(f.busy, false)
  assert.deepEqual(f.commits, [])
})
