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
  assert.match(
    pageSource,
    /workflowTaskAdminAccessRequestIdentity\(adminProfile\)/u
  )
  assert.match(pageSource, /taskScopeKey = `\$\{activeRoleKey\}\|access:/u)
  assert.match(pageSource, /persistMobileTaskDraftBackup/u)
  assert.match(pageSource, /readMobileTaskDraftBackup/u)
  assert.match(pageSource, /restoreActionDraft/u)
  assert.match(pageSource, /selectedCanReject \? 'rejected' : ''/u)
  assert.match(detailSource, /selectedCanOperate/u)
  assert.match(detailSource, /onOpenAction/u)
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
    /loadTaskView\(activeTaskViewKey,\s*\{\s*rejectOnError:\s*true,?\s*\}\)/u
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
    useCallback(callback) {
      return callback
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
          buildMobileTaskView: (task) => ({ ...task }),
          buildMobileTaskActionPayload: ({ feedback = '' } = {}) => ({
            ...(String(feedback).trim()
              ? { feedback: String(feedback).trim() }
              : {}),
            surface_key: 'mobile_role_tasks',
          }),
          normalizeMobileActionEvidenceRefs: (value) =>
            Array.isArray(value) ? value.filter(Boolean) : [],
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
          requiresMobileActionFeedback: (action) => action === 'done',
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
  let { receiptScopeKey } = options
  let selectedTask = options.selectedTask || {
    id: 42,
    owner_role_key: 'warehouse',
    version: 5,
  }
  const { hook, reactRuntime } = loadMobileActionHook(options)
  const props = {
    activeRoleKey: 'warehouse',
    initialAction: detailAction,
    initialActionReceipt: options.initialActionReceipt,
    initialActionTaskID: selectedTask.id,
    initialReason: Object.hasOwn(options, 'initialReason')
      ? options.initialReason
      : detailAction === 'done'
        ? '已完成并核对'
        : '',
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
      return hook({ ...props, detailAction, receiptScopeKey, selectedTask })
    },
    setDetailAction(value) {
      detailAction = value
    },
    setSelectedTask(nextTask) {
      selectedTask = nextTask
    },
    setReceiptScopeKey(nextScopeKey) {
      receiptScopeKey = nextScopeKey
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

test('useMobileRoleTaskActions: confirmed response exposes the canonical task receipt', async () => {
  const harness = createHookHarness({
    completeWorkflowTaskAction: async () => ({
      id: 42,
      owner_role_key: 'warehouse',
      task_name: '成品入库确认',
      task_status_key: 'done',
      version: 6,
    }),
  })

  let view = harness.render()
  await view.submitDetailAction()
  view = harness.render()

  assert.equal(view.actionReceipt.status, 'confirmed')
  assert.equal(view.actionReceipt.action, 'done')
  assert.equal(view.actionReceipt.task.version, 6)
  assert.equal(view.actionReceipt.task.task_status_key, 'done')
})

test('useMobileRoleTaskActions: required completion feedback uses the canonical payload field', async () => {
  const submitted = []
  const harness = createHookHarness({
    completeWorkflowTaskAction: async (params) => {
      submitted.push(params)
      return {
        id: 42,
        owner_role_key: 'warehouse',
        task_name: '成品入库确认',
        task_status_key: 'done',
        version: 6,
      }
    },
  })

  let view = harness.render()
  view.updateDetailReason('现场数量与单据一致')
  view = harness.render()
  await view.submitDetailAction()
  view = harness.render()

  assert.equal(Object.hasOwn(submitted[0], 'reason'), false)
  assert.equal(submitted[0].payload.feedback, '现场数量与单据一致')
  assert.equal(view.actionReceipt.status, 'confirmed')
  assert.equal(view.actionReceipt.feedback, '现场数量与单据一致')
  assert.equal(view.actionReceipt.reason, '')
})

test('useMobileRoleTaskActions: new actions do not copy historical evidence refs', async () => {
  const submitted = []
  const harness = createHookHarness({
    selectedTask: {
      id: 42,
      mobile_action_evidence_refs: ['OLD-PHOTO-42'],
      owner_role_key: 'warehouse',
      version: 5,
    },
    completeWorkflowTaskAction: async (params) => {
      submitted.push(params)
      return {
        id: 42,
        mobile_action_evidence_refs: ['OLD-PHOTO-42'],
        owner_role_key: 'warehouse',
        task_status_key: 'done',
        version: 6,
      }
    },
  })

  let view = harness.render()
  assert.deepEqual(view.savedEvidenceRefs, ['OLD-PHOTO-42'])
  await view.submitDetailAction()
  view = harness.render()

  assert.equal(Object.hasOwn(submitted[0].payload, 'evidence_refs'), false)
  assert.deepEqual(Array.from(view.actionReceipt.evidence_refs), [])
})

test('useMobileRoleTaskActions: completion is blocked when feedback is missing', async () => {
  let actionCalls = 0
  const messages = { errors: [], successes: [], warnings: [] }
  const harness = createHookHarness({
    initialReason: '',
    messages,
    completeWorkflowTaskAction: async () => {
      actionCalls += 1
    },
  })

  const view = harness.render()
  assert.equal(await view.submitDetailAction(), false)
  assert.equal(actionCalls, 0)
  assert.deepEqual(messages.warnings, ['请先填写完成反馈'])
})

test('useMobileRoleTaskActions: result step never fabricates a receipt from task status', async () => {
  const selectedTask = {
    id: 42,
    owner_role_key: 'warehouse',
    task_status_key: 'done',
    version: 6,
  }
  const harness = createHookHarness({ selectedTask })

  let view = harness.render()
  assert.equal(view.selectedTaskReceipt, null)
  assert.equal(view.showTaskReceipt(selectedTask), null)

  view = harness.render()
  assert.equal(view.actionReceipt, null)
})

test('useMobileRoleTaskActions: history receipt requires an exact account scope', () => {
  const receipt = {
    action: 'done',
    status: 'confirmed',
    task: { id: 42, task_status_key: 'done', version: 6 },
  }
  const missingScope = createHookHarness({
    initialActionReceipt: receipt,
    receiptScopeKey: 'warehouse|admin:9|yoyoosun|revision-1|ready',
  })
  assert.equal(missingScope.render().actionReceipt, null)

  const wrongAccount = createHookHarness({
    initialActionReceipt: {
      ...receipt,
      scope_key: 'warehouse|admin:8|yoyoosun|revision-1|ready',
    },
    receiptScopeKey: 'warehouse|admin:9|yoyoosun|revision-1|ready',
  })
  assert.equal(wrongAccount.render().actionReceipt, null)

  const sameAccount = createHookHarness({
    initialActionReceipt: {
      ...receipt,
      scope_key: 'warehouse|admin:9|yoyoosun|revision-1|ready',
    },
    receiptScopeKey: 'warehouse|admin:9|yoyoosun|revision-1|ready',
  })
  assert.equal(sameAccount.render().actionReceipt?.status, 'confirmed')
})

test('useMobileRoleTaskActions: scope changes isolate receipts and drafts for the same task id', () => {
  const scopeA = 'warehouse|account-a|revision-1'
  const harness = createHookHarness({
    detailAction: 'blocked',
    initialActionReceipt: {
      action: 'blocked',
      reason: '旧范围回执',
      scope_key: scopeA,
      status: 'confirmed',
      task: { id: 42, task_status_key: 'blocked', version: 6 },
    },
    receiptScopeKey: scopeA,
  })

  let view = harness.render()
  view.restoreActionDraft({
    action: 'blocked',
    reason: '旧范围草稿',
    taskID: 42,
  })
  view = harness.render()
  assert.equal(view.actionReceipt?.reason, '旧范围回执')
  assert.equal(view.detailReasonValue, '旧范围草稿')

  harness.setReceiptScopeKey('warehouse|account-b|revision-2')
  view = harness.render()
  assert.equal(view.actionReceipt, null)
  assert.equal(view.detailReasonValue, '')
})

test('useMobileRoleTaskActions: restores a history draft for the exact task and action', () => {
  const harness = createHookHarness({ detailAction: 'blocked' })

  let view = harness.render()
  assert.equal(
    view.restoreActionDraft({
      action: 'blocked',
      reason: '等待现场确认',
      taskID: 42,
    }),
    true
  )
  view = harness.render()

  assert.equal(view.detailReasonValue, '等待现场确认')
})

test('useMobileRoleTaskActions: missing canonical task stays visibly unconfirmed', async () => {
  const harness = createHookHarness({
    completeWorkflowTaskAction: async () => undefined,
  })

  let view = harness.render()
  await view.submitDetailAction()
  view = harness.render()

  assert.equal(view.actionReceipt.status, 'unknown')
  assert.match(view.actionReceipt.message, /没有取得可确认的任务信息/u)
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
    feedback: '已完成并核对',
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
  await view.submitDetailAction()
  view = harness.render()
  assert.equal(submitted.length, 2)
  assert.equal(submitted[0].idempotency_key, submitted[1].idempotency_key)
  assert.deepEqual(submitted[0], submitted[1])
  assert.deepEqual(submitted[0].payload, {
    feedback: '已完成并核对',
    surface_key: 'mobile_role_tasks',
  })
  assert.deepEqual(harness.loadCalls, [])
  assert.deepEqual(messages.warnings, [
    '提交结果暂未确认，已保留填写内容，可直接重试',
  ])

  await view.submitDetailAction()
  assert.equal(submitted.length, 3)
  assert.equal(submitted[0].idempotency_key, submitted[2].idempotency_key)
  assert.deepEqual(submitted[0], submitted[2])
  assert.deepEqual(harness.loadCalls, [42])
})

test('useMobileRoleTaskActions: retained attempts never cross an access scope', async () => {
  const submitted = []
  let preflightCalls = 0
  const networkError = Object.assign(new Error('network result unknown'), {
    isNetworkError: true,
  })
  const harness = createHookHarness({
    initialReason: '范围 A 完成反馈',
    receiptScopeKey: 'scope-a',
    completeWorkflowTaskAction: async (params) => {
      submitted.push(params)
      throw networkError
    },
    verifyWorkflowTaskActionAccessBeforeSubmit: async () => {
      preflightCalls += 1
      return true
    },
  })

  let view = harness.render()
  await view.submitDetailAction()
  assert.equal(submitted.length, 2)
  assert.equal(preflightCalls, 1)

  harness.setReceiptScopeKey('scope-b')
  view = harness.render()
  assert.equal(view.actionReceipt, null)
  assert.equal(view.detailReasonValue, '')
  view.updateDetailReason('范围 B 完成反馈')
  view = harness.render()
  await view.submitDetailAction()

  assert.equal(submitted.length, 4)
  assert.equal(preflightCalls, 2)
  assert.equal(submitted[0].idempotency_key, submitted[1].idempotency_key)
  assert.equal(submitted[2].idempotency_key, submitted[3].idempotency_key)
  assert.notEqual(submitted[0].idempotency_key, submitted[2].idempotency_key)
  assert.equal(submitted[0].payload.feedback, '范围 A 完成反馈')
  assert.equal(submitted[2].payload.feedback, '范围 B 完成反馈')
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
  view.updateDetailReason('第二条任务已完成并核对')
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
