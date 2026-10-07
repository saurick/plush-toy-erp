import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const profile = { id: 1, revision: 'a', ready: true }
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

function harness() {
  const calls = []
  const slots = []
  const events = new Map()
  let cursor = 0
  let dirty = false
  let effects = []
  let props
  let output
  const same = (a, b) =>
    a?.length === b?.length &&
    a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useRef(value) {
      const i = cursor++
      slots[i] ||= { current: value }
      return slots[i]
    },
    useState(value) {
      const i = cursor++
      slots[i] ||= { value }
      return [
        slots[i].value,
        (next) => {
          slots[i].value =
            typeof next === 'function' ? next(slots[i].value) : next
          dirty = true
        },
      ]
    },
    useCallback(fn, deps) {
      const i = cursor++
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, fn }
      return slots[i].fn
    },
    useEffect(effect, deps) {
      const i = cursor++
      if (same(slots[i]?.deps, deps)) return
      const previous = slots[i]
      effects.push(() => {
        previous?.cleanup?.()
        slots[i] = { deps, cleanup: effect() }
      })
    },
  }
  const target = {
    visibilityState: 'visible',
    addEventListener: (key, value) => events.set(key, value),
    removeEventListener: (key, value) => {
      if (events.get(key) === value) events.delete(key)
    },
  }
  const source = readFileSync(
    new URL('./useDesktopTaskCount.js', import.meta.url),
    'utf8'
  )
    .replace(
      /import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)'\n/gu,
      (_, names, path) =>
        `const {${names}} = modules[${JSON.stringify(path)}]\n`
    )
    .replace(
      'export default function useDesktopTaskCount',
      'function useDesktopTaskCount'
    )
  const context = {
    window: target,
    AbortController,
    document: target,
    modules: {
      react,
      '../api/workflowApi.mjs': {
        getWorkflowTaskBoard: (query, options) => {
          const request = deferred()
          calls.push({ query: JSON.parse(JSON.stringify(query)), options, ...request })
          return request.promise
        },
      },
      '../utils/adminProfileSync.mjs': {
        canMountCustomerRuntime: (value) => value?.ready === true,
      },
      '../utils/workflowTaskActionAccess.mjs': {
        workflowTaskAdminAccessRequestIdentity: (value) =>
          JSON.stringify(value),
      },
      '../utils/workflowTaskChanges.mjs': { WORKFLOW_TASKS_CHANGED: 'tasks-changed' },
      '@/common/consts/errorCodes': {
        isAuthFailureCode: (code) => code === 401,
        isAdminSessionUnavailableCode: (code) => code === 402,
        RpcErrorCode: { PERMISSION_DENIED: 403 },
      },
    },
  }
  vm.createContext(context)
  vm.runInContext(`${source}\nthis.hook = useDesktopTaskCount`, context)
  const render = (
    next = props || { adminProfile: profile, enabled: true, pathname: '/erp/task-board' }
  ) => {
    props = next
    let rounds = 0
    do {
      assert(++rounds < 15, 'hook must settle without a render loop')
      dirty = false
      cursor = 0
      effects = []
      output = context.hook(props)
      effects.forEach((effect) => effect())
    } while (dirty)
    return output
  }
  return {
    calls,
    events,
    render,
    async settle() {
      await new Promise((resolve) => setImmediate(resolve))
      return render()
    },
    unmount() {
      slots.forEach((slot) => slot?.cleanup?.())
    },
  }
}

test('desktop count uses the complete pending total independent of page filters', async () => {
  const h = harness()
  assert.equal(h.render().count, null)
  assert.deepEqual(h.calls[0].query, { todo_only: true, limit: 1 })
  h.calls[0].resolve({ total: 128 })
  assert.equal((await h.settle()).count, 128)
  h.render({ adminProfile: profile, enabled: true, pathname: '/erp/task-board', keyword: 'filter', page: 9 })
  assert.equal(h.calls.length, 1)
})

test('late or aborted reads cannot overwrite a new scope or newer response', async () => {
  const h = harness()
  const first = h.render()
  first.refresh()
  assert.equal(h.calls[0].options.signal.aborted, true)
  h.calls[1].resolve({ total: 5 })
  await h.settle()
  h.calls[0].resolve({ total: 128 })
  assert.equal((await h.settle()).count, 5)
  const next = h.render({ adminProfile: { ...profile, id: 2 }, enabled: true, pathname: '/erp/task-board' })
  assert.equal(next.count, null)
  assert.equal(next.loading, true)
  h.calls[2].resolve({ total: 2 })
  assert.equal((await h.settle()).count, 2)
  h.unmount()
  assert.equal(h.events.size, 0)
  assert.equal(h.calls[2].options.signal.aborted, true)
})

test('read failure preserves known counts, first failure is unknown, retry can confirm zero', async () => {
  const h = harness()
  h.render()
  h.calls[0].reject(new Error('offline'))
  let result = await h.settle()
  assert.equal(result.count, null)
  assert.equal(result.error, true)
  result.refresh()
  h.calls[1].resolve({ total: 6 })
  result = await h.settle()
  result.refresh()
  h.calls[2].reject(new Error('offline'))
  result = await h.settle()
  assert.equal(result.count, 6)
  assert.equal(result.error, true)
  result.refresh()
  h.calls[3].resolve({ total: 0 })
  result = await h.settle()
  assert.equal(result.count, 0)
  assert.equal(result.error, false)
})

test('permission and session changes clear old counts immediately', async () => {
  for (const next of [{ ...profile, id: 2 }, { ...profile, revision: 'b' }, { ...profile, ready: false }]) {
    const h = harness()
    h.render()
    h.calls[0].resolve({ total: 8 })
    await h.settle()
    assert.equal(h.render({ adminProfile: next, enabled: true, pathname: '/erp/task-board' }).count, null)
  }
  for (const code of [401, 402, 403]) {
    const h = harness()
    h.render()
    h.calls[0].resolve({ total: 8 })
    const result = await h.settle()
    result.refresh()
    h.calls[1].reject({ code })
    assert.equal((await h.settle()).count, null)
  }
  const h = harness()
  h.render({ adminProfile: profile, enabled: false, pathname: '/erp/task-board' })
  assert.equal(h.calls.length, 0)
})

test('confirmed changes, visibility, online and route return trigger fresh reads without polling', async () => {
  const h = harness()
  h.render()
  for (const event of ['tasks-changed', 'online', 'visibilitychange']) {
    h.events.get(event)()
  }
  assert.equal(h.calls.length, 4)
  h.render({ adminProfile: profile, enabled: true, pathname: '/erp/workbench' })
  assert.equal(h.calls.length, 5)
})
