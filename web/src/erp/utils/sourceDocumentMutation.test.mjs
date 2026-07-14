import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSourceDocumentItemSaveParams,
  commitSourceDocumentSaveResult,
  createSourceDocumentOpenEditController,
  isMutationResultUnknown,
  isResourceVersionConflict,
  openSourceDocumentEditAfterItemsLoaded,
  openSourceDocumentEditWithAccessGate,
  selectOpenSourceDocumentItems,
  selectSourceDocumentItemsForSave,
  settleSourceDocumentPostSaveEffect,
} from './sourceDocumentMutation.mjs'
import { createLatestRequestCoordinator } from '../hooks/useLatestRequestCoordinator.js'
import { buildOutsourcingOrderItemParams } from './masterDataOrderView.mjs'

function deferred() {
  let reject
  let resolve
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

function createOpenEditControllerHarness() {
  const coordinator = createLatestRequestCoordinator()
  const loadingStates = []
  const controller = createSourceDocumentOpenEditController({
    beginLatestRequest: coordinator.begin,
    setLoading: (loading) => loadingStates.push(loading),
  })
  return { controller, coordinator, loadingStates }
}

async function runOpenEditHarness({ loadItems, blankLineOnEmpty }) {
  const state = {
    aggregateSaveCalls: 0,
    editingID: null,
    formItems: null,
    modalOpen: false,
  }
  const result = await openSourceDocumentEditAfterItemsLoaded({
    loadItems,
    enterEditing: (items) => {
      state.editingID = 1
      state.formItems =
        items.length > 0 ? items : blankLineOnEmpty ? [{ blank: true }] : []
      state.modalOpen = true
    },
  })
  if (state.modalOpen) {
    state.aggregateSaveCalls += 1
  }
  return { result, state }
}

test('source document mutation classifies version conflicts only by the shared code', () => {
  assert.equal(isResourceVersionConflict({ code: 40922 }), true)
  assert.equal(isResourceVersionConflict({ code: 40920 }), false)
  assert.equal(isResourceVersionConflict({ httpStatus: 409 }), false)
})

test('source document mutation keeps uncertain transport and response results distinct', () => {
  for (const error of [
    { isNetworkError: true },
    { isAbortError: true },
    { isInvalidResponse: true },
    { httpStatus: 408 },
    { httpStatus: 503 },
    { code: 50000 },
  ]) {
    assert.equal(isMutationResultUnknown(error), true)
  }
  assert.equal(isMutationResultUnknown({ code: 40922 }), false)
  assert.equal(isMutationResultUnknown({ httpStatus: 400 }), false)
})

for (const scenario of [
  {
    name: 'sales order',
    error: Object.assign(new Error('sales detail unavailable'), {
      httpStatus: 503,
    }),
    blankLineOnEmpty: false,
  },
  {
    name: 'purchase order',
    error: Object.assign(new Error('purchase detail disconnected'), {
      isNetworkError: true,
    }),
    blankLineOnEmpty: true,
  },
  {
    name: 'outsourcing order',
    error: Object.assign(new Error('outsourcing detail unavailable'), {
      httpStatus: 503,
    }),
    blankLineOnEmpty: true,
  },
]) {
  test(`${scenario.name} item read failure cannot enter a saveable edit state`, async () => {
    const { result, state } = await runOpenEditHarness({
      loadItems: async () => {
        throw scenario.error
      },
      blankLineOnEmpty: scenario.blankLineOnEmpty,
    })

    assert.equal(result.status, 'load_failed')
    assert.equal(result.error, scenario.error)
    assert.equal(state.editingID, null)
    assert.equal(state.modalOpen, false)
    assert.equal(state.formItems, null)
    assert.equal(state.aggregateSaveCalls, 0)
  })
}

test('successful empty item reads remain distinct from read failures', async () => {
  for (const scenario of [
    { name: 'sales order', blankLineOnEmpty: false, expectedItems: [] },
    {
      name: 'purchase order',
      blankLineOnEmpty: true,
      expectedItems: [{ blank: true }],
    },
    {
      name: 'outsourcing order',
      blankLineOnEmpty: true,
      expectedItems: [{ blank: true }],
    },
  ]) {
    const { result, state } = await runOpenEditHarness({
      loadItems: async () => [],
      blankLineOnEmpty: scenario.blankLineOnEmpty,
    })

    assert.equal(result.status, 'ready', scenario.name)
    assert.deepEqual(result.items, [], scenario.name)
    assert.equal(state.editingID, 1, scenario.name)
    assert.equal(state.modalOpen, true, scenario.name)
    assert.deepEqual(state.formItems, scenario.expectedItems, scenario.name)
  }
})

test('a malformed item response fails closed instead of impersonating an empty read', async () => {
  const { result, state } = await runOpenEditHarness({
    loadItems: async () => undefined,
    blankLineOnEmpty: true,
  })

  assert.equal(result.status, 'load_failed')
  assert.equal(result.error?.isInvalidResponse, true)
  assert.equal(state.editingID, null)
  assert.equal(state.modalOpen, false)
  assert.equal(state.formItems, null)
  assert.equal(state.aggregateSaveCalls, 0)
})

test('later open edit wins when A and B item reads resolve in reverse order', async () => {
  const { controller, loadingStates } = createOpenEditControllerHarness()
  const requestA = deferred()
  const requestB = deferred()
  const state = { editingID: null, items: null }

  const openA = controller.open({
    loadItems: () => requestA.promise,
    enterEditing: (items) => {
      state.editingID = 'A'
      state.items = items
    },
  })
  const openB = controller.open({
    loadItems: () => requestB.promise,
    enterEditing: (items) => {
      state.editingID = 'B'
      state.items = items
    },
  })

  requestB.resolve([{ id: 2, line_status: 'open' }])
  assert.equal((await openB).status, 'ready')
  assert.equal(state.editingID, 'B')

  requestA.resolve([{ id: 1, line_status: 'open' }])
  assert.equal((await openA).status, 'stale')
  assert.equal(state.editingID, 'B')
  assert.deepEqual(state.items, [{ id: 2, line_status: 'open' }])
  assert.deepEqual(loadingStates, [true, true, false])
})

test('a stale completion cannot clear loading owned by a newer open edit', async () => {
  const { controller, loadingStates } = createOpenEditControllerHarness()
  const requestA = deferred()
  const requestB = deferred()

  const openA = controller.open({
    loadItems: () => requestA.promise,
    enterEditing: () => assert.fail('stale A must not enter editing'),
  })
  const openB = controller.open({
    loadItems: () => requestB.promise,
    enterEditing: () => {},
  })

  requestA.resolve([{ id: 1, line_status: 'open' }])
  assert.equal((await openA).status, 'stale')
  assert.equal(loadingStates.at(-1), true)

  requestB.resolve([{ id: 2, line_status: 'open' }])
  assert.equal((await openB).status, 'ready')
  assert.equal(loadingStates.at(-1), false)
})

test('starting a new document invalidates a slow edit without overwriting new input', async () => {
  const { controller, loadingStates } = createOpenEditControllerHarness()
  const requestA = deferred()
  const state = {
    editingID: null,
    modalOpen: false,
    note: '',
  }
  const openA = controller.open({
    loadItems: () => requestA.promise,
    enterEditing: () => {
      state.editingID = 'A'
      state.note = '迟到的 A'
    },
  })

  controller.invalidate()
  Object.assign(state, {
    editingID: 'new',
    modalOpen: true,
    note: '用户正在填写的新订单',
  })
  requestA.resolve([{ id: 1, line_status: 'open' }])

  assert.equal((await openA).status, 'stale')
  assert.deepEqual(state, {
    editingID: 'new',
    modalOpen: true,
    note: '用户正在填写的新订单',
  })
  assert.equal(loadingStates.at(-1), false)
})

test('closing the editor invalidates a slow edit and keeps it closed', async () => {
  const { controller } = createOpenEditControllerHarness()
  const requestA = deferred()
  const state = { editingID: null, modalOpen: false }
  const openA = controller.open({
    loadItems: () => requestA.promise,
    enterEditing: () => {
      state.editingID = 'A'
      state.modalOpen = true
    },
  })

  controller.invalidate()
  requestA.resolve([{ id: 1, line_status: 'open' }])

  assert.equal((await openA).status, 'stale')
  assert.deepEqual(state, { editingID: null, modalOpen: false })
})

test('a late failure from an invalidated edit stays silent and changes no identity', async () => {
  const { controller } = createOpenEditControllerHarness()
  const requestA = deferred()
  const notices = []
  let editingID = 'new'
  const openA = controller.open({
    loadItems: () => requestA.promise,
    enterEditing: () => {
      editingID = 'A'
    },
  })

  controller.invalidate()
  requestA.reject(Object.assign(new Error('late 503'), { httpStatus: 503 }))
  const result = await openA
  if (result.status === 'load_failed') notices.push(result.error.message)

  assert.equal(result.status, 'stale')
  assert.equal(editingID, 'new')
  assert.deepEqual(notices, [])
})

test('unmount cancellation makes a pending open edit stale', async () => {
  const { controller, coordinator } = createOpenEditControllerHarness()
  const requestA = deferred()
  let entered = false
  const openA = controller.open({
    loadItems: () => requestA.promise,
    enterEditing: () => {
      entered = true
    },
  })

  coordinator.abortAll()
  requestA.resolve([{ id: 1, line_status: 'open' }])

  assert.equal((await openA).status, 'stale')
  assert.equal(entered, false)
})

test('a blocked non-editable attempt invalidates a slow edit through the shared gate', async () => {
  const { controller, loadingStates } = createOpenEditControllerHarness()
  const requestA = deferred()
  const state = { editingID: 'B', modalOpen: false }
  const openA = controller.open({
    loadItems: () => requestA.promise,
    enterEditing: () => {
      state.editingID = 'A'
      state.modalOpen = true
    },
  })

  const blockedB = await openSourceDocumentEditWithAccessGate({
    canUpdate: true,
    document: { id: 22, lifecycle_status: 'approved' },
    invalidatePending: () => controller.invalidate(),
    isEditable: (document) => document.lifecycle_status === 'draft',
    open: () => assert.fail('a non-editable document must not start loading'),
  })
  requestA.resolve([{ id: 1, line_status: 'open' }])

  assert.deepEqual(blockedB, {
    status: 'blocked',
    reason: 'not_editable',
  })
  assert.equal((await openA).status, 'stale')
  assert.deepEqual(state, { editingID: 'B', modalOpen: false })
  assert.deepEqual(loadingStates, [true, false])
})

test('forbidden and missing edit attempts also invalidate pending open edits', async () => {
  for (const scenario of [
    {
      name: 'forbidden',
      canUpdate: false,
      document: { id: 23, lifecycle_status: 'draft' },
    },
    {
      name: 'missing_document',
      canUpdate: true,
      document: null,
    },
  ]) {
    const { controller, loadingStates } = createOpenEditControllerHarness()
    const requestA = deferred()
    let entered = false
    const openA = controller.open({
      loadItems: () => requestA.promise,
      enterEditing: () => {
        entered = true
      },
    })

    const blockedB = await openSourceDocumentEditWithAccessGate({
      canUpdate: scenario.canUpdate,
      document: scenario.document,
      invalidatePending: () => controller.invalidate(),
      isEditable: (document) => document.lifecycle_status === 'draft',
      open: () => assert.fail('a blocked document must not start loading'),
    })
    requestA.resolve([{ id: 1, line_status: 'open' }])

    assert.deepEqual(
      blockedB,
      { status: 'blocked', reason: scenario.name },
      scenario.name
    )
    assert.equal((await openA).status, 'stale', scenario.name)
    assert.equal(entered, false, scenario.name)
    assert.deepEqual(loadingStates, [true, false], scenario.name)
  }
})

test('edit access gate prevents permission and lifecycle bypasses from loading items', async () => {
  for (const scenario of [
    {
      name: 'sales order without update permission',
      canUpdate: false,
      document: { id: 11, lifecycle_status: 'draft' },
      expectedReason: 'forbidden',
    },
    {
      name: 'purchase order outside draft lifecycle',
      canUpdate: true,
      document: { id: 12, lifecycle_status: 'approved' },
      expectedReason: 'not_editable',
    },
    {
      name: 'outsourcing order outside draft lifecycle',
      canUpdate: true,
      document: { id: 13, lifecycle_status: 'submitted' },
      expectedReason: 'not_editable',
    },
  ]) {
    let itemLoads = 0
    let modalOpens = 0
    const result = await openSourceDocumentEditWithAccessGate({
      canUpdate: scenario.canUpdate,
      document: scenario.document,
      isEditable: (document) => document.lifecycle_status === 'draft',
      open: async () => {
        itemLoads += 1
        modalOpens += 1
        return { status: 'ready' }
      },
    })

    assert.equal(result.status, 'blocked', scenario.name)
    assert.equal(result.reason, scenario.expectedReason, scenario.name)
    assert.equal(itemLoads, 0, scenario.name)
    assert.equal(modalOpens, 0, scenario.name)
  }
})

test('edit access gate delegates an allowed draft through the real open controller', async () => {
  const { controller } = createOpenEditControllerHarness()
  let itemLoads = 0
  let modalOpens = 0
  const result = await openSourceDocumentEditWithAccessGate({
    canUpdate: true,
    document: { id: 14, lifecycle_status: 'draft' },
    isEditable: (document) => document.lifecycle_status === 'draft',
    open: () =>
      controller.open({
        loadItems: async () => {
          itemLoads += 1
          return []
        },
        enterEditing: () => {
          modalOpens += 1
        },
      }),
  })

  assert.equal(result.status, 'ready')
  assert.equal(itemLoads, 1)
  assert.equal(modalOpens, 1)
})

test('outsourcing editing and save parameters keep only OPEN existing lines', () => {
  const loadedItems = [
    { id: 1, line_status: 'open', note: '保留' },
    { id: 2, line_status: 'canceled', note: '不得恢复' },
    { id: 3, line_status: ' OPEN ', note: '标准化后保留' },
  ]
  const editableItems = selectOpenSourceDocumentItems(loadedItems)
  const saveItems = selectSourceDocumentItemsForSave([
    ...editableItems,
    { id: 2, line_status: 'canceled', note: '残值也不得提交' },
    { line_status: 'canceled', note: '无 ID 的取消残值也不得提交' },
    { line_no: 4, note: '新行' },
  ])

  assert.deepEqual(
    editableItems.map((item) => item.id),
    [1, 3]
  )
  assert.deepEqual(
    saveItems.map((item) => item.id || 'new'),
    [1, 3, 'new']
  )
})

test('outsourcing final RPC item mapping preserves existing ids and excludes canceled rows', () => {
  const common = {
    subject_type: 'PRODUCT',
    product_id: 31,
    process_id: 41,
    unit_id: 51,
    outsourcing_quantity: '8',
  }
  const items = buildSourceDocumentItemSaveParams(
    [
      { ...common, id: 17, line_status: 'open', note: '既有 OPEN 行' },
      { ...common, note: '新行' },
      { ...common, id: 18, line_status: 'canceled', note: '已取消行' },
    ],
    buildOutsourcingOrderItemParams
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].id, 17)
  assert.equal(items[0].line_no, 1)
  assert.equal(Object.hasOwn(items[1], 'id'), false)
  assert.equal(items[1].line_no, 2)
  assert.equal(
    items.some((item) => item.id === 18),
    false
  )
})

test('canceled-only outsourcing rows are a valid empty read, not a read failure', async () => {
  const result = await openSourceDocumentEditAfterItemsLoaded({
    loadItems: async () => [{ id: 2, line_status: 'canceled' }],
    enterEditing: (items) => {
      assert.deepEqual(selectOpenSourceDocumentItems(items), [])
    },
  })

  assert.equal(result.status, 'ready')
})

test('a created source document is rebound before failed detail and list refreshes', async () => {
  let editingOrder = null
  const requestedIDs = []
  const postSaveStatuses = []

  async function saveAttempt() {
    const requestedID = Number(editingOrder?.id || 0)
    requestedIDs.push(requestedID)
    const saveResult = await commitSourceDocumentSaveResult({
      save: async () => ({
        id: requestedID || 41,
        version: requestedID ? editingOrder.version + 1 : 1,
      }),
      bindSaved: (saved) => {
        editingOrder = saved
      },
    })
    assert.equal(saveResult.status, 'saved')

    const detailEffect = await settleSourceDocumentPostSaveEffect(async () => {
      throw Object.assign(new Error('detail unavailable'), { httpStatus: 503 })
    })
    const listEffect = await settleSourceDocumentPostSaveEffect(async () => {
      throw Object.assign(new Error('list unavailable'), {
        isNetworkError: true,
      })
    })
    postSaveStatuses.push(detailEffect.status, listEffect.status)
  }

  await saveAttempt()
  assert.deepEqual(editingOrder, { id: 41, version: 1 })
  assert.deepEqual(postSaveStatuses, ['rejected', 'rejected'])

  await saveAttempt()
  assert.deepEqual(requestedIDs, [0, 41])
  assert.deepEqual(editingOrder, { id: 41, version: 2 })
})

test('outsourcing refresh failure remains a post-save warning', async () => {
  let editingOrder = null
  let modalOpen = true
  const warnings = []
  const saveResult = await commitSourceDocumentSaveResult({
    save: async () => ({ id: 52, version: 3 }),
    bindSaved: (saved) => {
      editingOrder = saved
    },
  })

  assert.equal(saveResult.status, 'saved')
  modalOpen = false
  const refreshEffect = await settleSourceDocumentPostSaveEffect(async () => {
    throw Object.assign(new Error('refresh unavailable'), { httpStatus: 503 })
  })
  if (refreshEffect.status === 'rejected') {
    warnings.push('刷新加工合同列表和协同任务')
  }

  assert.deepEqual(editingOrder, { id: 52, version: 3 })
  assert.equal(modalOpen, false)
  assert.equal(isMutationResultUnknown(refreshEffect.error), true)
  assert.deepEqual(warnings, ['刷新加工合同列表和协同任务'])
})

test('sales attachment and refresh failures cannot replace the saved identity', async () => {
  let editingOrder = { id: 61, version: 1 }
  const notices = []
  const saveResult = await commitSourceDocumentSaveResult({
    save: async () => ({ id: 61, version: 2 }),
    bindSaved: (saved) => {
      editingOrder = saved
    },
  })
  const attachmentEffect = await settleSourceDocumentPostSaveEffect(
    async () => {
      throw Object.assign(new Error('attachment unavailable'), {
        isNetworkError: true,
      })
    }
  )
  const refreshEffect = await settleSourceDocumentPostSaveEffect(async () => {
    throw Object.assign(new Error('refresh unavailable'), { httpStatus: 500 })
  })
  if (attachmentEffect.status === 'rejected') notices.push('附件上传失败')
  if (refreshEffect.status === 'rejected') notices.push('列表刷新失败')

  assert.equal(saveResult.status, 'saved')
  assert.deepEqual(editingOrder, { id: 61, version: 2 })
  assert.deepEqual(notices, ['附件上传失败', '列表刷新失败'])
})

test('save timeout retains the form and skips every post-save effect', async () => {
  const formValues = { note: '用户未提交的稳定性备注' }
  let modalOpen = true
  let bound = false
  let attachmentWrites = 0
  let listRefreshes = 0
  const timeout = Object.assign(new Error('request timed out'), {
    isNetworkError: true,
  })

  const saveResult = await commitSourceDocumentSaveResult({
    save: async () => {
      throw timeout
    },
    bindSaved: () => {
      bound = true
    },
  })
  if (saveResult.status === 'saved') {
    modalOpen = false
    await settleSourceDocumentPostSaveEffect(async () => {
      attachmentWrites += 1
    })
    await settleSourceDocumentPostSaveEffect(async () => {
      listRefreshes += 1
    })
  }

  assert.equal(saveResult.status, 'save_failed')
  assert.equal(isMutationResultUnknown(saveResult.error), true)
  assert.equal(bound, false)
  assert.equal(modalOpen, true)
  assert.deepEqual(formValues, { note: '用户未提交的稳定性备注' })
  assert.equal(attachmentWrites, 0)
  assert.equal(listRefreshes, 0)
})
