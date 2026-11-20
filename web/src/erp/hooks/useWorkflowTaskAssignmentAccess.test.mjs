import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import {
  workflowTaskActionAccessRequestIdentity,
  workflowTaskAdminAccessRequestIdentity,
} from '../utils/workflowTaskActionAccess.mjs'

const source = readFileSync(
  fileURLToPath(
    new URL('./useWorkflowTaskAssignmentAccess.js', import.meta.url)
  ),
  'utf8'
)

test('task assignment options are bound to task version and effective admin session', () => {
  assert.match(source, /workflowTaskActionAccessRequestIdentity\(task\)/u)
  assert.match(
    source,
    /workflowTaskAdminAccessRequestIdentity\(adminProfile\)/u
  )
  assert.match(source, /`\$\{taskRequestKey\}\|\$\{adminKey\}\|assignment`/u)
  assert.match(source, /new AbortController\(\)/u)
  assert.match(source, /getWorkflowTaskAssignmentOptions/u)
  assert.match(source, /data\.task_version !== Number\(task\?\.version/u)
  assert.match(source, /isRpcAbortError\(error\)/u)
})

function createDeferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function loadHookRuntime(getWorkflowTaskAssignmentOptions) {
  const slots = []
  let cursor = 0
  const react = {
    beginRender() {
      cursor = 0
    },
    useRef(initialValue) {
      const index = cursor++
      slots[index] ||= { current: initialValue }
      return slots[index]
    },
    useState(initialValue) {
      const index = cursor++
      slots[index] ||= {
        value:
          typeof initialValue === 'function' ? initialValue() : initialValue,
      }
      return [
        slots[index].value,
        (value) => {
          slots[index].value =
            typeof value === 'function' ? value(slots[index].value) : value
        },
      ]
    },
    useEffect(effect, dependencies) {
      const index = cursor++
      const previous = slots[index]
      const changed =
        !previous ||
        dependencies.length !== previous.dependencies.length ||
        dependencies.some(
          (dependency, dependencyIndex) =>
            !Object.is(dependency, previous.dependencies[dependencyIndex])
        )
      if (!changed) return
      previous?.cleanup?.()
      slots[index] = {
        dependencies: [...dependencies],
        cleanup: effect() || null,
      }
    },
    useMemo(factory) {
      cursor++
      return factory()
    },
  }
  const transformed = source
    .replace(
      /import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)'\n/gu,
      (_, imports, modulePath) =>
        `const {${imports}} = __modules__[${JSON.stringify(modulePath)}]\n`
    )
    .replace(
      'export default function useWorkflowTaskAssignmentAccess',
      'function useWorkflowTaskAssignmentAccess'
    )
  const module = { exports: {} }
  vm.runInNewContext(
    `${transformed}\nmodule.exports = { useWorkflowTaskAssignmentAccess }`,
    {
      AbortController,
      __modules__: {
        react,
        '@/common/utils/jsonRpc': { isRpcAbortError: () => false },
        '../api/workflowApi.mjs': { getWorkflowTaskAssignmentOptions },
        '../utils/workflowTaskActionAccess.mjs': {
          workflowTaskActionAccessRequestIdentity,
          workflowTaskAdminAccessRequestIdentity,
        },
      },
      module,
    }
  )
  return {
    render(props) {
      react.beginRender()
      return module.exports.useWorkflowTaskAssignmentAccess(props)
    },
  }
}

test('task assignment version drift ends loading and exposes a refreshable stale state', async () => {
  const requests = []
  const runtime = loadHookRuntime((params) => {
    const deferred = createDeferred()
    requests.push({ deferred, params })
    return deferred.promise
  })
  const props = {
    adminProfile: {
      id: 7,
      roles: [{ role_key: 'pmc' }],
      permissions: ['workflow.task.assign'],
    },
    task: { id: 42, version: 3 },
  }

  runtime.render(props)
  let view = runtime.render(props)
  assert.equal(requests.length, 1)
  assert.equal(view.loading, true)

  requests[0].deferred.resolve({
    task_id: 42,
    task_version: 4,
    can_reassign: true,
    candidates: [{ admin_id: 8, username: 'next' }],
  })
  await new Promise((resolve) => setImmediate(resolve))

  view = runtime.render(props)
  assert.equal(view.loading, false)
  assert.equal(view.failed, false)
  assert.equal(view.stale, true)
  assert.equal(view.can_reassign, false)
  assert.match(view.reason, /任务信息已更新/u)
})
