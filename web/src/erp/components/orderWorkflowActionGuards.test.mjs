import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  runWorkflowTaskMutationWithFailureRefresh,
  verifyNewWorkflowTaskMutationAttempt,
} from '../utils/workflowTaskMutation.mjs'

function createDeferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function loadOrderWorkflowHook({
  exportName,
  relativePath,
  completeWorkflowTaskAction,
  blockWorkflowTaskAction,
  verifyWorkflowTaskActionAccessBeforeSubmit,
}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transformed = source
    .replace(
      /import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)'\n/gu,
      (_, imports, sourcePath) =>
        `const {${imports}} = __modules__[${JSON.stringify(sourcePath)}]\n`
    )
    .replace(`export function ${exportName}`, `function ${exportName}`)
  assert(!/\bimport\s/u.test(transformed))
  assert(!/\bexport\s/u.test(transformed))

  const refs = []
  let refIndex = 0
  const module = { exports: {} }
  vm.runInNewContext(`${transformed}\nmodule.exports = { ${exportName} }`, {
    __modules__: {
      react: {
        useCallback: (callback) => callback,
        useRef: (initialValue) => {
          const index = refIndex
          refIndex += 1
          refs[index] ||= { current: initialValue }
          return refs[index]
        },
      },
      '@/common/utils/antdApp': {
        message: { error() {}, success() {}, warning() {} },
      },
      '../../api/workflowApi.mjs': {
        blockWorkflowTaskAction,
        completeWorkflowTaskAction,
        rejectWorkflowTaskAction: async () => {},
        urgeWorkflowTask: async () => {},
      },
      '../../utils/workflowTaskActionSubmitGuard.mjs': {
        verifyWorkflowTaskActionAccessBeforeSubmit,
      },
      '../../utils/workflowTaskMutation.mjs': {
        createTaskMutationAttemptStore,
        createTaskMutationInFlightGuard,
        runWorkflowTaskMutationWithFailureRefresh,
        verifyNewWorkflowTaskMutationAttempt,
      },
    },
    module,
  })
  return module.exports[exportName]
}

test('purchase and outsourcing hooks synchronously block another action for the same task', async (t) => {
  for (const config of [
    {
      exportName: 'usePurchaseOrderWorkflowActions',
      relativePath: './purchase-orders/usePurchaseOrderWorkflowActions.mjs',
    },
    {
      exportName: 'useOutsourcingOrderWorkflowActions',
      relativePath:
        './outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs',
    },
  ]) {
    await t.test(config.exportName, async () => {
      const preflight = createDeferred()
      let preflightCalls = 0
      let completeCalls = 0
      let blockCalls = 0
      let completeParams
      const hook = loadOrderWorkflowHook({
        ...config,
        verifyWorkflowTaskActionAccessBeforeSubmit: async () => {
          preflightCalls += 1
          return preflight.promise
        },
        completeWorkflowTaskAction: async (params) => {
          completeCalls += 1
          completeParams = params
        },
        blockWorkflowTaskAction: async () => {
          blockCalls += 1
        },
      })
      const actions = hook({ loadWorkflowTasks: async () => {} })
      const task = { id: 42, version: 7 }

      const completeSubmit = actions.completeWorkflowTask(task)
      const blockSubmit = actions.blockWorkflowTask(task, {
        reason: '等待资料',
      })

      assert.equal(await blockSubmit, false)
      assert.equal(preflightCalls, 1)
      assert.equal(completeCalls, 0)
      assert.equal(blockCalls, 0)

      preflight.resolve(true)
      assert.equal(await completeSubmit, true)
      assert.equal(completeCalls, 1)
      assert.equal(blockCalls, 0)
      assert.equal(completeParams.expected_version, 7)
      assert.match(completeParams.idempotency_key, /^wf:42:complete:/u)
    })
  }
})
