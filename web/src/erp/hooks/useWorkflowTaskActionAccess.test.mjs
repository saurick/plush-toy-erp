import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import {
  DEFAULT_WORKFLOW_ACTION_MODES,
  resolveWorkflowActionAccessRequestOutcome,
  workflowTaskActionAccessRequestIdentity,
  workflowTaskAdminAccessRequestIdentity,
} from '../utils/workflowTaskActionAccess.mjs'

const source = readFileSync(
  new URL('./useWorkflowTaskActionAccess.js', import.meta.url),
  'utf8'
)

test('useWorkflowTaskActionAccess: version-aware request identity still sends only task_id', () => {
  assert.match(source, /workflowTaskActionAccessRequestIdentity\(task\)/u)
  assert.match(source, /requestKey:\s*taskRequestKey/u)
  assert.match(
    source,
    /`\$\{taskRequestKey\}\|\$\{adminKey\}\|\$\{actionModeKey\}`/u
  )
  assert.match(source, /\[enabled, requestKey, taskID\]/u)
  assert.match(source, /remoteState\.requestKey === requestKey/u)
  assert.match(source, /\{ task_id: taskID \}/u)
  assert.doesNotMatch(source, /task_version/u)
  assert.doesNotMatch(source, /expected_version/u)
})

test('useWorkflowTaskActionAccess: effective customer projection changes the request identity', () => {
  const baseProfile = {
    id: 7,
    is_super_admin: false,
    roles: [{ role_key: 'warehouse' }],
    permissions: ['workflow.task.read', 'workflow.task.complete'],
    effective_session: {
      customer: { key: 'yoyoosun' },
      config_revision: 'revision-1',
      config_hash: 'hash-1',
      actions: ['workflow.task.read', 'workflow.task.complete'],
    },
  }
  const baseKey = workflowTaskAdminAccessRequestIdentity(baseProfile)
  for (const effectiveSession of [
    { ...baseProfile.effective_session, actions: ['workflow.task.read'] },
    { ...baseProfile.effective_session, config_revision: 'revision-2' },
    { ...baseProfile.effective_session, config_hash: 'hash-2' },
    {
      ...baseProfile.effective_session,
      customer: { key: 'another-customer' },
    },
  ]) {
    assert.notEqual(
      workflowTaskAdminAccessRequestIdentity({
        ...baseProfile,
        effective_session: effectiveSession,
      }),
      baseKey
    )
  }
  assert.equal(
    workflowTaskAdminAccessRequestIdentity({
      ...baseProfile,
      roles: [...baseProfile.roles].reverse(),
      permissions: [...baseProfile.permissions].reverse(),
      effective_session: {
        ...baseProfile.effective_session,
        actions: [...baseProfile.effective_session.actions].reverse(),
      },
    }),
    baseKey
  )
  assert.match(
    source,
    /workflowTaskAdminAccessRequestIdentity\(adminProfile\)/u
  )
  assert.match(source, /remoteState\.requestKey === requestKey/u)
})

function createDeferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function loadHookRuntime(explainWorkflowActionAccess) {
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
      'export default function useWorkflowTaskActionAccess',
      'function useWorkflowTaskActionAccess'
    )
  const module = { exports: {} }
  vm.runInNewContext(
    `${transformed}\nmodule.exports = { useWorkflowTaskActionAccess }`,
    {
      AbortController,
      __modules__: {
        react,
        '@/common/utils/jsonRpc': { isRpcAbortError: () => false },
        '../api/workflowApi.mjs': { explainWorkflowActionAccess },
        '../utils/workflowTaskActionAccess.mjs': {
          DEFAULT_WORKFLOW_ACTION_MODES,
          buildWorkflowActionAccessState: (input) => input,
          resolveWorkflowActionAccessRequestOutcome,
          workflowTaskActionAccessRequestIdentity,
          workflowTaskAdminAccessRequestIdentity,
        },
      },
      module,
    }
  )
  return {
    react,
    render(props) {
      react.beginRender()
      return module.exports.useWorkflowTaskActionAccess(props)
    },
  }
}

test('useWorkflowTaskActionAccess: revision changes re-request and stale responses cannot replace the new projection', async () => {
  const requests = []
  const runtime = loadHookRuntime((params, options) => {
    const deferred = createDeferred()
    requests.push({ deferred, options, params })
    return deferred.promise
  })
  const task = { id: 42, version: 3 }
  const profile = {
    id: 7,
    roles: [{ role_key: 'warehouse' }],
    permissions: ['workflow.task.complete'],
    effective_session: {
      customer: { key: 'yoyoosun' },
      config_revision: 'revision-1',
      config_hash: 'hash-1',
      actions: ['workflow.task.complete'],
    },
  }

  runtime.render({ adminProfile: profile, task })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].params.task_id, 42)
  assert.deepEqual(Object.keys(requests[0].params), ['task_id'])

  const nextProfile = {
    ...profile,
    effective_session: {
      ...profile.effective_session,
      config_revision: 'revision-2',
      config_hash: 'hash-2',
      actions: [],
    },
  }
  runtime.render({ adminProfile: nextProfile, task })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].options.signal.aborted, true)

  requests[0].deferred.resolve({
    actions: [{ action_key: 'complete', allowed: true }],
  })
  await new Promise((resolve) => setImmediate(resolve))
  let view = runtime.render({ adminProfile: nextProfile, task })
  assert.equal(view.loading, true)
  assert.equal(view.explainData, null)

  const currentProjection = {
    actions: [{ action_key: 'complete', allowed: false }],
  }
  requests[1].deferred.resolve(currentProjection)
  await new Promise((resolve) => setImmediate(resolve))
  view = runtime.render({ adminProfile: nextProfile, task })
  assert.equal(view.loading, false)
  assert.equal(view.explainData, currentProjection)
})
