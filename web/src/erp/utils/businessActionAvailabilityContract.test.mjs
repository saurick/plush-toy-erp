import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveBusinessActionAvailability,
  resolveBusinessLifecycleActions,
  selectStableBusinessActionIndexes,
} from './businessActionAvailability.mjs'

test('业务动作可用性：无权限、结构不适用和已完成隐藏，临时门禁保留入口', () => {
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: false,
      selected: false,
    }),
    { visible: false, disabled: true, disabledReason: '' }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: false,
      selectionReason: '请先选择销售订单',
    }),
    {
      visible: true,
      disabled: true,
      disabledReason: '请先选择销售订单',
    }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      relevant: false,
    }),
    { visible: false, disabled: true, disabledReason: '' }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      completed: true,
    }),
    { visible: false, disabled: true, disabledReason: '' }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      applicable: false,
      unavailableReason: '销售订单生效后可预留库存',
    }),
    {
      visible: true,
      disabled: true,
      disabledReason: '销售订单生效后可预留库存',
    }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      applicable: true,
      busy: true,
      busyReason: '当前操作完成后可继续',
    }),
    {
      visible: true,
      disabled: true,
      disabledReason: '当前操作完成后可继续',
    }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      applicable: true,
    }),
    { visible: true, disabled: false, disabledReason: '' }
  )
})

test('业务动作可用性：状态不适用原因优先于保存中，避免把非法状态伪装成短暂等待', () => {
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      applicable: false,
      busy: true,
      unavailableReason: '已关闭订单不能再次提交',
      busyReason: '保存完成后可提交',
    }),
    {
      visible: true,
      disabled: true,
      disabledReason: '已关闭订单不能再次提交',
    }
  )
})

test('生命周期动作槽：未选择时展示全部已授权动作，选中后只展示当前合法动作', () => {
  const actions = [
    { key: 'submit', label: '提交', permission: 'order.submit' },
    { key: 'close', label: '关闭', permission: 'order.close' },
    {
      key: 'cancel',
      label: '取消',
      permission: 'order.cancel',
      danger: true,
    },
  ]
  const permissions = new Set(['order.submit', 'order.close', 'order.cancel'])
  const transitions = {
    draft: new Set(['submit', 'cancel']),
    active: new Set(['close', 'cancel']),
    closed: new Set(),
  }
  const resolve = (status, selected = true) =>
    resolveBusinessLifecycleActions({
      actions,
      selected,
      hasPermission: (action) => permissions.has(action.permission),
      canRun: (action) => transitions[status]?.has(action.key) === true,
    })

  const draft = resolve('draft')
  const active = resolve('active')
  const closed = resolve('closed')
  const empty = resolve('draft', false)

  assert.equal(draft.hasCapability, true)
  assert.equal(active.hasCapability, true)
  assert.equal(closed.hasCapability, true)
  assert.equal(empty.hasCapability, true)
  assert.equal(draft.showPrimarySlot, true)
  assert.equal(draft.showMoreSlot, true)
  assert.equal(active.showPrimarySlot, true)
  assert.equal(active.showMoreSlot, true)
  assert.equal(closed.showPrimarySlot, false)
  assert.equal(closed.showMoreSlot, false)
  assert.equal(empty.showPrimarySlot, true)
  assert.equal(empty.showMoreSlot, true)
  assert.equal(draft.primaryAction.key, 'submit')
  assert.equal(active.primaryAction.key, 'close')
  assert.equal(closed.primaryAction, null)
  assert.equal(empty.primaryAction.key, 'submit')
  assert.deepEqual(empty.availableActions, [])
  assert.deepEqual(
    draft.secondaryActions.map((action) => action.key),
    ['cancel']
  )
  assert.deepEqual(
    active.secondaryActions.map((action) => action.key),
    ['cancel']
  )
  assert.deepEqual(closed.secondaryActions, [])
  assert.deepEqual(
    empty.secondaryActions.map((action) => action.key),
    ['close', 'cancel']
  )
})

test('生命周期动作槽：所有角色按能力裁剪，未选择也不泄露未授权动作', () => {
  const actions = [
    { key: 'submit', permission: 'order.submit' },
    { key: 'cancel', permission: 'order.cancel', danger: true },
  ]
  const hidden = resolveBusinessLifecycleActions({
    actions,
    selected: true,
    hasPermission: () => false,
    canRun: () => true,
  })
  assert.equal(hidden.hasCapability, false)
  assert.equal(hidden.showPrimarySlot, false)
  assert.equal(hidden.showMoreSlot, false)
  assert.equal(hidden.primaryAction, null)
  assert.deepEqual(hidden.secondaryActions, [])

  const cancelOnly = resolveBusinessLifecycleActions({
    actions,
    selected: true,
    hasPermission: (action) => action.key === 'cancel',
    canRun: () => true,
  })
  assert.equal(cancelOnly.hasCapability, true)
  assert.equal(cancelOnly.showPrimarySlot, false)
  assert.equal(cancelOnly.showMoreSlot, true)
  assert.equal(cancelOnly.primaryAction, null)
  assert.deepEqual(
    cancelOnly.secondaryActions.map((action) => action.key),
    ['cancel']
  )

  const unselectedCancelOnly = resolveBusinessLifecycleActions({
    actions,
    selected: false,
    hasPermission: (action) => action.key === 'cancel',
    canRun: () => false,
  })
  assert.equal(unselectedCancelOnly.hasCapability, true)
  assert.equal(unselectedCancelOnly.showPrimarySlot, false)
  assert.equal(unselectedCancelOnly.showMoreSlot, true)
  assert.equal(unselectedCancelOnly.primaryAction, null)
  assert.deepEqual(unselectedCancelOnly.availableActions, [])
  assert.deepEqual(
    unselectedCancelOnly.secondaryActions.map((action) => action.key),
    ['cancel']
  )

  const unselectedSubmitOnly = resolveBusinessLifecycleActions({
    actions,
    selected: false,
    hasPermission: (action) => action.key === 'submit',
    canRun: () => false,
  })
  assert.equal(unselectedSubmitOnly.showPrimarySlot, true)
  assert.equal(unselectedSubmitOnly.showMoreSlot, false)
  assert.equal(unselectedSubmitOnly.primaryAction.key, 'submit')
  assert.deepEqual(unselectedSubmitOnly.secondaryActions, [])
})

test('窄屏动作排序：状态和 loading 只改变禁用态，不改变固定优先级与原始顺序', () => {
  const descriptors = [
    { index: 0, actionable: true, enabled: false, score: 40 },
    { index: 1, actionable: true, enabled: true, score: 100 },
    { index: 2, actionable: true, enabled: true, score: 40 },
    { index: 3, actionable: false, enabled: false, score: -1 },
  ]
  const toggledDescriptors = descriptors.map((item) => ({
    ...item,
    enabled: !item.enabled,
  }))

  assert.deepEqual(selectStableBusinessActionIndexes(descriptors, 2), [1, 0])
  assert.deepEqual(
    selectStableBusinessActionIndexes(toggledDescriptors, 2),
    [1, 0]
  )
})
