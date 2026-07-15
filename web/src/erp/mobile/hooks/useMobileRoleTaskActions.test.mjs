import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  isWorkflowTaskMutationResultUnknown,
  verifyNewWorkflowTaskMutationAttempt,
} from '../../utils/workflowTaskMutation.mjs'

test('mobile task page uses backend action projection and does not restore local reject gates', () => {
  const pageSource = readFileSync(
    new URL('../pages/MobileRoleTasksPage.jsx', import.meta.url),
    'utf8'
  )
  const detailSource = readFileSync(
    new URL('../components/MobileTaskDetailScreen.jsx', import.meta.url),
    'utf8'
  )
  const hookSource = readFileSync(
    new URL('./useMobileRoleTaskActions.js', import.meta.url),
    'utf8'
  )

  assert.match(pageSource, /useWorkflowTaskActionAccess/u)
  assert.match(pageSource, /taskActionAccess:\s*selectedTaskActionAccess/u)
  assert.match(detailSource, /const showRejected = selectedCanReject/u)
  assert.doesNotMatch(detailSource, /supportsRejectedAction/u)
  assert.doesNotMatch(hookSource, /canOpenMobileTaskDetailAction/u)
  assert.doesNotMatch(hookSource, /canRunWorkflowTaskAction/u)
})

test('mobile task page keeps load failures explicit and invalidates inactive views after mutation', () => {
  const pageSource = readFileSync(
    new URL('../pages/MobileRoleTasksPage.jsx', import.meta.url),
    'utf8'
  )
  const listSource = readFileSync(
    new URL('../components/MobileTaskListScreen.jsx', import.meta.url),
    'utf8'
  )
  const querySource = readFileSync(
    new URL('../../utils/mobileTaskQueries.mjs', import.meta.url),
    'utf8'
  )

  assert.match(pageSource, /settleMobileRoleTaskRequest/u)
  assert.match(querySource, /error: errorMessage/u)
  assert.match(pageSource, /!activeTaskSlot\.error/u)
  assert.match(pageSource, /const refreshTasksAfterMutation = useCallback/u)
  assert.match(pageSource, /viewKey === activeTaskViewKey/u)
  assert.match(pageSource, /loaded: false,[\s\S]*?error: ''/u)
  assert.match(pageSource, /rejectOnError = false/u)
  assert.match(pageSource, /if \(rejectOnError\) throw error/u)
  assert.match(
    pageSource,
    /loadTaskView\(activeTaskViewKey, \{ rejectOnError: true \}\)/u
  )
  assert.match(pageSource, /loadTasks: refreshTasksAfterMutation/u)
  assert.match(listSource, /role="alert"/u)
  assert.match(listSource, /当前没有可确认的任务数据，请重试/u)
  assert.match(listSource, /onClick=\{\(\) => loadTasks\(\)\}/u)
  assert.match(listSource, /taskSummary\.ready/u)
  assert.match(listSource, /taskSummary\.blocked/u)
  assert.match(listSource, /taskSummary\.rejected/u)
  assert.match(listSource, /taskSummary\.done/u)
  assert.doesNotMatch(
    listSource,
    /taskSummary\.(?:pending|processing|blockedProgress)/u
  )
  assert.match(listSource, /任务提醒/u)
  assert.match(listSource, /条提醒/u)
})

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createReactHookRuntime() {
  const slots = []
  let cursor = 0

  return {
    beginRender() {
      cursor = 0
    },
    useRef(initialValue) {
      const slotIndex = cursor
      cursor += 1
      if (!slots[slotIndex]) {
        slots[slotIndex] = { type: 'ref', value: { current: initialValue } }
      }
      return slots[slotIndex].value
    },
    useState(initialValue) {
      const slotIndex = cursor
      cursor += 1
      if (!slots[slotIndex]) {
        slots[slotIndex] = {
          type: 'state',
          value:
            typeof initialValue === 'function' ? initialValue() : initialValue,
        }
      }
      const setValue = (nextValue) => {
        slots[slotIndex].value =
          typeof nextValue === 'function'
            ? nextValue(slots[slotIndex].value)
            : nextValue
      }
      return [slots[slotIndex].value, setValue]
    },
  }
}

function loadMobileActionHook({
  completeWorkflowTaskAction = async () => {},
  resumeWorkflowTaskAction = async () => {},
  urgeWorkflowTask = async () => {},
  verifyWorkflowTaskActionAccessBeforeSubmit = async () => true,
  messages = { errors: [], successes: [], warnings: [] },
} = {}) {
  const source = readFileSync(
    new URL('./useMobileRoleTaskActions.js', import.meta.url),
    'utf8'
  )
  const transformed = source
    .replace(
      /import\s+\{([\s\S]*?)\}\s+from\s+'([^']+)'\n/gu,
      (_, imports, sourcePath) =>
        `const {${imports}} = __modules__[${JSON.stringify(sourcePath)}]\n`
    )
    .replace(
      'export default function useMobileRoleTaskActions',
      'function useMobileRoleTaskActions'
    )

  assert(!/\bimport\s/u.test(transformed))
  assert(!/\bexport\s/u.test(transformed))

  const reactRuntime = createReactHookRuntime()
  const module = { exports: {} }
  const message = {
    error: (value) => messages.errors.push(value),
    success: (value) => messages.successes.push(value),
    warning: (value) => messages.warnings.push(value),
  }
  vm.runInNewContext(
    `${transformed}
module.exports = { useMobileRoleTaskActions }`,
    {
      __modules__: {
        react: reactRuntime,
        '@/common/utils/antdApp': { message },
        '@/common/utils/errorMessage': {
          getActionErrorMessage: (_, fallback) => fallback,
        },
        '../../api/workflowApi.mjs': {
          blockWorkflowTaskAction: completeWorkflowTaskAction,
          completeWorkflowTaskAction,
          rejectWorkflowTaskAction: completeWorkflowTaskAction,
          resumeWorkflowTaskAction,
          urgeWorkflowTask,
        },
        '../../utils/mobileTaskView.mjs': {
          buildMobileTaskActionEvidence: ({ evidenceText = '' } = {}) => {
            const evidenceRefs = String(evidenceText)
              .split(/[\n,，;；]/u)
              .map((item) => item.trim())
              .filter(Boolean)
            return {
              ...(evidenceRefs.length ? { evidence_refs: evidenceRefs } : {}),
              surface_key: 'mobile_role_tasks',
            }
          },
          normalizeMobileActionEvidenceRefs: () => [],
        },
        '../../utils/orderApprovalFlow.mjs': {
          isOrderApprovalTask: () => false,
        },
        '../../utils/purchaseInboundFlow.mjs': {
          isPurchaseIqcTask: () => false,
        },
        '../../utils/outsourceReturnFlow.mjs': {
          isOutsourceReturnQcTask: () => false,
        },
        '../../utils/finishedGoodsFlow.mjs': {
          isFinishedGoodsQcTask: () => false,
          isShipmentReleaseTask: () => false,
        },
        '../../utils/shipmentFinanceFlow.mjs': {
          isInvoiceRegistrationTask: () => false,
          isReceivableRegistrationTask: () => false,
        },
        '../../utils/payableReconciliationFlow.mjs': {
          isPayableReconciliationTask: () => false,
          isPayableRegistrationTask: () => false,
        },
        '../utils/mobileRoleTaskModel.mjs': {
          getMobileTaskActionReasonDraftKey: (task, action) =>
            `${task?.id || ''}:${action || ''}`,
          normalizeMobileTaskActionKey: (action) => action,
          requiresMobileActionFeedback: () => false,
          resolveMobileActionLabel: (action) => action,
          resolveMobileTaskActionReason: ({ task, action, reasonDrafts }) =>
            reasonDrafts[`${task?.id || ''}:${action || ''}`] || '',
          resolveMobileUrgeAction: () => 'urge_task',
        },
        '../../utils/workflowTaskActionSubmitGuard.mjs': {
          verifyWorkflowTaskActionAccessBeforeSubmit,
        },
        '../../utils/workflowTaskMutation.mjs': {
          createTaskMutationAttemptStore,
          createTaskMutationInFlightGuard,
          isWorkflowTaskMutationResultUnknown,
          verifyNewWorkflowTaskMutationAttempt,
        },
      },
      module,
    }
  )

  return {
    hook: module.exports.useMobileRoleTaskActions,
    reactRuntime,
  }
}

function createHookHarness(options = {}) {
  const detailActionChanges = []
  const loadCalls = []
  let detailAction = options.detailAction || 'done'
  let selectedTask = options.selectedTask || {
    id: 42,
    owner_role_key: 'warehouse',
    version: 5,
  }
  const { hook, reactRuntime } = loadMobileActionHook(options)
  const props = {
    activeRoleKey: 'warehouse',
    selectedTask,
    taskActionAccess: {
      canRun: (actionMode) =>
        options.allowedActionModes?.includes(actionMode) ?? true,
    },
    setDetailAction: (value) => {
      detailAction = value
      detailActionChanges.push(value)
    },
    setSelectedTaskID: () => {},
    loadTasks: async () => {
      const taskID = selectedTask.id
      loadCalls.push(taskID)
      await options.loadTasks?.(taskID)
    },
  }

  return {
    detailActionChanges,
    loadCalls,
    render() {
      reactRuntime.beginRender()
      return hook({ ...props, detailAction, selectedTask })
    },
    setDetailAction(value) {
      detailAction = value
    },
    setSelectedTask(nextTask) {
      selectedTask = nextTask
    },
  }
}

test('useMobileRoleTaskActions: backend action projection is the local execution gate', async () => {
  let actionCalls = 0
  const messages = { errors: [], successes: [], warnings: [] }
  const harness = createHookHarness({
    allowedActionModes: ['urge'],
    messages,
    completeWorkflowTaskAction: async () => {
      actionCalls += 1
    },
  })

  const view = harness.render()
  assert.equal(view.selectedCanComplete, false)
  assert.equal(view.selectedCanUrge, true)
  await view.submitDetailAction()

  assert.equal(actionCalls, 0)
  assert.deepEqual(messages.warnings, ['当前岗位不能处理该任务'])
})

test('useMobileRoleTaskActions: resume requires an explanation and uses the resume action', async () => {
  const messages = { errors: [], successes: [], warnings: [] }
  const submitted = []
  const harness = createHookHarness({
    allowedActionModes: ['resume'],
    detailAction: 'resume',
    messages,
    resumeWorkflowTaskAction: async (params) => submitted.push(params),
    selectedTask: {
      id: 42,
      owner_role_key: 'warehouse',
      task_status_key: 'blocked',
      version: 5,
    },
  })

  let view = harness.render()
  assert.equal(view.selectedCanResume, true)
  await view.submitDetailAction()
  assert.deepEqual(submitted, [])
  assert.deepEqual(messages.warnings, ['请先填写阻塞解除说明'])

  view.updateDetailReason('资料已补齐，可以继续处理')
  view = harness.render()
  await view.submitDetailAction()

  assert.equal(submitted.length, 1)
  assert.equal(submitted[0].task_id, 42)
  assert.equal(submitted[0].expected_version, 5)
  assert.equal(submitted[0].action_key, 'resume')
  assert.equal(submitted[0].reason, '资料已补齐，可以继续处理')
  assert.match(submitted[0].idempotency_key, /^wf:42:resume:/u)
  assert.deepEqual(submitted[0].payload, {
    surface_key: 'mobile_role_tasks',
  })
  assert.deepEqual(harness.loadCalls, [42])
})

test('useMobileRoleTaskActions: rapid double submit runs one preflight and one action', async () => {
  const preflight = createDeferred()
  const action = createDeferred()
  let preflightCalls = 0
  let actionCalls = 0
  let actionParams
  const harness = createHookHarness({
    verifyWorkflowTaskActionAccessBeforeSubmit: async () => {
      preflightCalls += 1
      return preflight.promise
    },
    completeWorkflowTaskAction: async (params) => {
      actionCalls += 1
      actionParams = params
      return action.promise
    },
  })

  const initialView = harness.render()
  const firstSubmit = initialView.submitDetailAction()
  const secondSubmit = initialView.submitDetailAction()

  let view = harness.render()
  assert.equal(view.updatingID, 42)

  await secondSubmit
  assert.equal(preflightCalls, 1)
  assert.equal(actionCalls, 0)

  preflight.resolve(true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(actionCalls, 1)
  assert.equal(actionParams.expected_version, 5)
  assert.match(actionParams.idempotency_key, /^wf:42:complete:/u)
  assert.deepEqual(actionParams.payload, {
    surface_key: 'mobile_role_tasks',
  })

  action.resolve()
  await firstSubmit
  view = harness.render()
  assert.equal(view.updatingID, null)
  assert.deepEqual(harness.loadCalls, [42])
})

test('useMobileRoleTaskActions: one task cannot start a different action during preflight', async () => {
  const preflight = createDeferred()
  let preflightCalls = 0
  let completeCalls = 0
  let urgeCalls = 0
  const harness = createHookHarness({
    verifyWorkflowTaskActionAccessBeforeSubmit: async () => {
      preflightCalls += 1
      return preflight.promise
    },
    completeWorkflowTaskAction: async () => {
      completeCalls += 1
    },
    urgeWorkflowTask: async () => {
      urgeCalls += 1
    },
  })

  let view = harness.render()
  const completeSubmit = view.submitDetailAction()
  harness.setDetailAction('urge')
  view = harness.render()
  view.updateDetailReason('请尽快处理')
  view = harness.render()

  const urgeSubmit = view.submitDetailAction()
  await urgeSubmit
  assert.equal(preflightCalls, 1)
  assert.equal(completeCalls, 0)
  assert.equal(urgeCalls, 0)

  preflight.resolve(true)
  await completeSubmit
  assert.equal(completeCalls, 1)
  assert.equal(urgeCalls, 0)
})

test('useMobileRoleTaskActions: failed urge preflight releases lock for retry', async () => {
  let preflightCalls = 0
  let urgeCalls = 0
  let urgeParams
  const harness = createHookHarness({
    detailAction: 'urge',
    verifyWorkflowTaskActionAccessBeforeSubmit: async () => {
      preflightCalls += 1
      return preflightCalls > 1
    },
    urgeWorkflowTask: async (params) => {
      urgeCalls += 1
      urgeParams = params
    },
  })

  let view = harness.render()
  view.updateDetailReason('请尽快处理')
  view = harness.render()

  await view.submitDetailAction()
  view = harness.render()
  assert.equal(view.urgingID, null)
  assert.equal(urgeCalls, 0)

  await view.submitDetailAction()
  view = harness.render()
  assert.equal(view.urgingID, null)
  assert.equal(preflightCalls, 2)
  assert.equal(urgeCalls, 1)
  assert.equal(urgeParams.expected_version, 5)
  assert.match(urgeParams.idempotency_key, /^wf:42:urge:/u)
  assert.deepEqual(urgeParams.payload, {
    surface_key: 'mobile_role_tasks',
  })
  assert.deepEqual(harness.loadCalls, [42])
})

test('useMobileRoleTaskActions: unknown network result reuses frozen key and payload', async () => {
  const submitted = []
  const networkError = Object.assign(new Error('network result unknown'), {
    isNetworkError: true,
  })
  const messages = { errors: [], successes: [], warnings: [] }
  const harness = createHookHarness({
    messages,
    completeWorkflowTaskAction: async (params) => {
      submitted.push(params)
      if (submitted.length <= 2) throw networkError
    },
  })

  let view = harness.render()
  view.updateEvidenceText('PHOTO-B\nPHOTO-A')
  view = harness.render()
  await view.submitDetailAction()
  view = harness.render()
  assert.equal(submitted.length, 2)
  assert.equal(submitted[0].idempotency_key, submitted[1].idempotency_key)
  assert.deepEqual(submitted[0], submitted[1])
  assert.deepEqual(submitted[0].payload, {
    evidence_refs: ['PHOTO-A', 'PHOTO-B'],
    surface_key: 'mobile_role_tasks',
  })
  assert.deepEqual(harness.loadCalls, [])
  assert.deepEqual(messages.warnings, [
    '提交结果暂未确认，已保留原因和证据，可直接重试',
  ])

  await view.submitDetailAction()
  assert.equal(submitted.length, 3)
  assert.equal(submitted[0].idempotency_key, submitted[2].idempotency_key)
  assert.deepEqual(submitted[0], submitted[2])
  assert.deepEqual(harness.loadCalls, [42])
})

test('useMobileRoleTaskActions: action failure restores idle state and allows retry', async () => {
  let actionCalls = 0
  const messages = { errors: [], successes: [], warnings: [] }
  const harness = createHookHarness({
    messages,
    completeWorkflowTaskAction: async () => {
      actionCalls += 1
      if (actionCalls === 1) {
        throw new Error('temporary failure')
      }
    },
  })

  let view = harness.render()
  await view.submitDetailAction()
  view = harness.render()
  assert.equal(view.updatingID, null)
  assert.equal(actionCalls, 1)
  assert.deepEqual(harness.loadCalls, [42])
  assert.deepEqual(messages.errors, ['更新任务状态失败，请稍后重试'])

  await view.submitDetailAction()
  view = harness.render()
  assert.equal(view.updatingID, null)
  assert.equal(actionCalls, 2)
  assert.deepEqual(harness.loadCalls, [42, 42])
  assert.deepEqual(harness.detailActionChanges, [null])
})

test('useMobileRoleTaskActions: successful status mutation clears drafts when refresh fails', async () => {
  let actionCalls = 0
  const messages = { errors: [], successes: [], warnings: [] }
  const harness = createHookHarness({
    detailAction: 'blocked',
    messages,
    completeWorkflowTaskAction: async () => {
      actionCalls += 1
    },
    loadTasks: async () => {
      throw Object.assign(new Error('refresh network failure'), {
        isNetworkError: true,
      })
    },
  })

  let view = harness.render()
  view.updateDetailReason('等待补齐资料')
  view = harness.render()
  await view.submitDetailAction()

  view = harness.render()
  assert.equal(actionCalls, 1)
  assert.equal(view.updatingID, null)
  assert.deepEqual(harness.loadCalls, [42])
  assert.deepEqual(harness.detailActionChanges, [null])
  assert.deepEqual(messages.errors, [])
  assert.deepEqual(messages.successes, ['任务状态已更新'])
  assert.deepEqual(messages.warnings, ['操作已成功但列表刷新失败，请手动刷新'])

  harness.setDetailAction('blocked')
  view = harness.render()
  assert.equal(view.detailReasonValue, '')
})

test('useMobileRoleTaskActions: successful urge clears its draft when refresh fails', async () => {
  let urgeCalls = 0
  const messages = { errors: [], successes: [], warnings: [] }
  const harness = createHookHarness({
    detailAction: 'urge',
    messages,
    urgeWorkflowTask: async () => {
      urgeCalls += 1
    },
    loadTasks: async () => {
      throw Object.assign(new Error('refresh network failure'), {
        isNetworkError: true,
      })
    },
  })

  let view = harness.render()
  view.updateDetailReason('请尽快处理')
  view = harness.render()
  await view.submitDetailAction()

  view = harness.render()
  assert.equal(urgeCalls, 1)
  assert.equal(view.urgingID, null)
  assert.deepEqual(harness.loadCalls, [42])
  assert.deepEqual(harness.detailActionChanges, [null])
  assert.deepEqual(messages.errors, [])
  assert.deepEqual(messages.successes, ['催办已记录'])
  assert.deepEqual(messages.warnings, ['操作已成功但列表刷新失败，请手动刷新'])

  harness.setDetailAction('urge')
  view = harness.render()
  assert.equal(view.detailReasonValue, '')
})

test('useMobileRoleTaskActions: different tasks do not block each other', async () => {
  const firstPreflight = createDeferred()
  const preflightTaskIDs = []
  const actionTaskIDs = []
  const harness = createHookHarness({
    verifyWorkflowTaskActionAccessBeforeSubmit: async ({ task }) => {
      preflightTaskIDs.push(task.id)
      if (task.id === 42) return firstPreflight.promise
      return true
    },
    completeWorkflowTaskAction: async ({ task_id: taskID }) => {
      actionTaskIDs.push(taskID)
    },
  })

  let view = harness.render()
  const firstSubmit = view.submitDetailAction()
  view = harness.render()
  assert.equal(view.updatingID, 42)

  harness.setSelectedTask({ id: 43, owner_role_key: 'warehouse', version: 6 })
  view = harness.render()
  const secondSubmit = view.submitDetailAction()
  view = harness.render()
  assert.equal(view.updatingID, 43)

  await secondSubmit
  assert.deepEqual(preflightTaskIDs, [42, 43])
  assert.deepEqual(actionTaskIDs, [43])

  harness.setSelectedTask({ id: 42, owner_role_key: 'warehouse', version: 5 })
  view = harness.render()
  assert.equal(view.updatingID, 42)

  firstPreflight.resolve(true)
  await firstSubmit
  view = harness.render()
  assert.equal(view.updatingID, null)
  assert.deepEqual(actionTaskIDs, [43, 42])
  assert.equal(harness.loadCalls.length, 2)
})

test('useMobileRoleTaskActions: task A completion does not clear task B action', async () => {
  const firstPreflight = createDeferred()
  const harness = createHookHarness({
    verifyWorkflowTaskActionAccessBeforeSubmit: async ({ task }) =>
      task.id === 42 ? firstPreflight.promise : true,
  })

  let view = harness.render()
  const firstSubmit = view.submitDetailAction()

  const secondTask = { id: 43, owner_role_key: 'warehouse', version: 6 }
  harness.setSelectedTask(secondTask)
  view = harness.render()
  await view.handleTaskAction(secondTask, 'blocked')
  view = harness.render()
  view.updateDetailReason('等待补齐资料')

  firstPreflight.resolve(true)
  await firstSubmit

  assert.deepEqual(harness.detailActionChanges, ['blocked'])
})
