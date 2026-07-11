import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

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
          urgeWorkflowTask,
        },
        '../../utils/mobileTaskView.mjs': {
          buildMobileTaskActionEvidence: () => ({}),
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
          canOpenMobileTaskDetailAction: () => true,
          getMobileTaskActionReasonDraftKey: (task, action) =>
            `${task?.id || ''}:${action || ''}`,
          normalizeMobileTaskActionKey: (action) => action,
          requiresMobileActionFeedback: () => false,
          resolveMobileActionLabel: (action) => action,
          resolveMobileTaskActionReason: ({ task, action, reasonDrafts }) =>
            reasonDrafts[`${task?.id || ''}:${action || ''}`] || '',
          resolveMobileUrgeAction: () => 'urge',
        },
        '../../utils/workflowTaskActionSubmitGuard.mjs': {
          verifyWorkflowTaskActionAccessBeforeSubmit,
        },
        '../../utils/workflowTaskBoard.mjs': {
          canRunWorkflowTaskAction: () => true,
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
  }
  const { hook, reactRuntime } = loadMobileActionHook(options)
  const props = {
    activeRoleKey: 'warehouse',
    adminProfile: {},
    selectedTask,
    setDetailAction: (value) => {
      detailAction = value
      detailActionChanges.push(value)
    },
    setSelectedTaskID: () => {},
    loadTasks: async () => {
      loadCalls.push(selectedTask.id)
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

test('useMobileRoleTaskActions: rapid double submit runs one preflight and one action', async () => {
  const preflight = createDeferred()
  const action = createDeferred()
  let preflightCalls = 0
  let actionCalls = 0
  const harness = createHookHarness({
    verifyWorkflowTaskActionAccessBeforeSubmit: async () => {
      preflightCalls += 1
      return preflight.promise
    },
    completeWorkflowTaskAction: async () => {
      actionCalls += 1
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

  action.resolve()
  await firstSubmit
  view = harness.render()
  assert.equal(view.updatingID, null)
  assert.deepEqual(harness.loadCalls, [42])
})

test('useMobileRoleTaskActions: failed urge preflight releases lock for retry', async () => {
  let preflightCalls = 0
  let urgeCalls = 0
  const harness = createHookHarness({
    detailAction: 'urge',
    verifyWorkflowTaskActionAccessBeforeSubmit: async () => {
      preflightCalls += 1
      return preflightCalls > 1
    },
    urgeWorkflowTask: async () => {
      urgeCalls += 1
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
  assert.deepEqual(harness.loadCalls, [])
  assert.deepEqual(messages.errors, ['更新任务状态失败，请稍后重试'])

  await view.submitDetailAction()
  view = harness.render()
  assert.equal(view.updatingID, null)
  assert.equal(actionCalls, 2)
  assert.deepEqual(harness.loadCalls, [42])
  assert.deepEqual(harness.detailActionChanges, [null])
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

  harness.setSelectedTask({ id: 43, owner_role_key: 'warehouse' })
  view = harness.render()
  const secondSubmit = view.submitDetailAction()
  view = harness.render()
  assert.equal(view.updatingID, 43)

  await secondSubmit
  assert.deepEqual(preflightTaskIDs, [42, 43])
  assert.deepEqual(actionTaskIDs, [43])

  harness.setSelectedTask({ id: 42, owner_role_key: 'warehouse' })
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

  const secondTask = { id: 43, owner_role_key: 'warehouse' }
  harness.setSelectedTask(secondTask)
  view = harness.render()
  await view.handleTaskAction(secondTask, 'blocked')
  view = harness.render()
  view.updateDetailReason('等待补齐资料')

  firstPreflight.resolve(true)
  await firstSubmit

  assert.deepEqual(harness.detailActionChanges, ['blocked'])
})
