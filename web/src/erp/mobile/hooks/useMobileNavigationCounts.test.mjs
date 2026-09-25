import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const profile = { id: 1, revision: 'a', ready: true }
const counts = { todo: 124, risk: 7, overdue: 3 }
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
    new URL('./useMobileNavigationCounts.js', import.meta.url),
    'utf8'
  )
    .replace(
      /import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)'\n/gu,
      (_, names, path) =>
        `const {${names}} = modules[${JSON.stringify(path)}]\n`
    )
    .replace(
      'export default function useMobileNavigationCounts',
      'function useMobileNavigationCounts'
    )
  const context = {
    window: target,
    document: target,
    modules: {
      react,
      '../../api/workflowApi.mjs': {
        listWorkflowRoleTasks: (query) => {
          const request = deferred()
          calls.push({ query: JSON.parse(JSON.stringify(query)), ...request })
          return request.promise
        },
      },
      '../../utils/adminProfileSync.mjs': {
        canMountCustomerRuntime: (value) => value?.ready === true,
      },
      '../../utils/workflowTaskActionAccess.mjs': {
        workflowTaskAdminAccessRequestIdentity: (value) =>
          JSON.stringify(value),
      },
      '@/common/consts/errorCodes': {
        isAuthFailureCode: (code) => code === 401,
        isAdminSessionUnavailableCode: (code) => code === 402,
        RpcErrorCode: { PERMISSION_DENIED: 403 },
      },
    },
  }
  vm.createContext(context)
  vm.runInContext(`${source}\nthis.hook = useMobileNavigationCounts`, context)
  const render = (
    next = props || { adminProfile: profile, roleKey: 'pmc' }
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

test('navigation requests authoritative unfiltered counts with one record, independent of list filters', async () => {
  const h = harness()
  let result = h.render({
    adminProfile: profile,
    roleKey: 'pmc',
    keyword: '筛选项',
    status: 'blocked',
    page: 9,
  })
  assert.equal(result.counts, null)
  assert.deepEqual(h.calls[0].query, {
    role_key: 'pmc',
    view_key: 'todo',
    limit: 1,
  })
  h.calls[0].resolve({ counts })
  result = await h.settle()
  assert.equal(result.counts.todo, 124)
  assert.equal(
    result.counts.risk,
    7,
    'overdue is already a subset; do not add it again'
  )
  h.render({
    adminProfile: profile,
    roleKey: 'pmc',
    keyword: '另一个条件',
    status: 'ready',
    page: 1,
  })
  assert.equal(h.calls.length, 1)
})

test('refresh failure retains known counts and retry updates them, including zero', async () => {
  const h = harness()
  h.render()
  h.calls[0].resolve({ counts })
  let result = await h.settle()
  result.refresh()
  h.calls[1].reject(new Error('offline'))
  result = await h.settle()
  assert.equal(result.counts.todo, 124)
  assert.equal(result.error, true)
  result.refresh()
  h.calls[2].resolve({ counts: { todo: 0, risk: 0 } })
  result = await h.settle()
  assert.equal(result.counts.todo, 0)
  assert.equal(result.error, false)
})

test('an initial failure stays unknown rather than becoming zero', async () => {
  const h = harness()
  h.render()
  h.calls[0].reject(new Error('offline'))
  const result = await h.settle()
  assert.equal(result.counts, null)
  assert.equal(result.error, true)
})

test('late requests cannot replace a newer result', async () => {
  const h = harness()
  const first = h.render()
  first.refresh()
  h.calls[1].resolve({ counts: { todo: 8, risk: 2 } })
  await h.settle()
  h.calls[0].resolve({ counts })
  const result = await h.settle()
  assert.equal(result.counts.todo, 8)
})

test('role, account and permission revision changes immediately discard prior scope counts', async () => {
  for (const next of [
    { adminProfile: profile, roleKey: 'warehouse' },
    { adminProfile: { ...profile, id: 2 }, roleKey: 'pmc' },
    { adminProfile: { ...profile, revision: 'b' }, roleKey: 'pmc' },
  ]) {
    const h = harness()
    h.render()
    h.calls[0].resolve({ counts })
    await h.settle()
    const result = h.render(next)
    assert.equal(result.counts, null)
    assert.equal(h.calls.length, 2)
    h.calls[1].resolve({ counts: { todo: 1, risk: 0 } })
    assert.equal((await h.settle()).counts.todo, 1)
  }
})

test('revoked access removes previously known values', async () => {
  const h = harness()
  h.render()
  h.calls[0].resolve({ counts })
  const current = await h.settle()
  current.refresh()
  h.calls[1].reject({ code: 403 })
  assert.equal((await h.settle()).counts, null)
  assert.equal(
    h.render({ adminProfile: { ...profile, ready: false }, roleKey: 'pmc' })
      .counts,
    null
  )
  assert.equal(h.calls.length, 2)
})

test('successful list refresh invalidates counts even within the same minute', async () => {
  const h = harness()
  h.render()
  h.calls[0].resolve({ counts })
  await h.settle()
  h.render({
    adminProfile: profile,
    roleKey: 'pmc',
    refreshRevision: { todo: 1 },
  })
  assert.equal(h.calls.length, 2)
  h.calls[1].resolve({ counts: { todo: 123, risk: 6 } })
  assert.equal((await h.settle()).counts.todo, 123)
})

test('network recovery refreshes counts; unmounted requests cannot publish', async () => {
  const h = harness()
  h.render()
  h.calls[0].reject(new Error('offline'))
  await h.settle()
  h.events.get('online')()
  assert.equal(h.calls.length, 2)
  h.unmount()
  assert.equal(h.events.size, 0)
  h.calls[1].resolve({ counts })
  assert.equal((await h.settle()).counts, null)
})
