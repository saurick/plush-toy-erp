import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveBusinessActionAvailability,
  resolveBusinessLifecycleActions,
  selectStableBusinessActionIndexes,
} from './businessActionAvailability.mjs'
import { yoyoosunRoleFlowMatrix } from '../../../../config/customers/yoyoosun/roleFlowMatrix.mjs'

test('业务动作可用性：只有无权限隐藏，选择、结构、终态和临时门禁均保留入口', () => {
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
      unavailableReason: '当前记录没有可打开的关联单据',
    }),
    {
      visible: true,
      disabled: true,
      disabledReason: '当前记录没有可打开的关联单据',
    }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      completed: true,
    }),
    {
      visible: true,
      disabled: true,
      disabledReason: '当前记录已完成此操作',
    }
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

test('生命周期动作槽：同一权限下选择和状态只改变禁用态，不改变目录与位置', () => {
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
  assert.equal(closed.showPrimarySlot, true)
  assert.equal(closed.showMoreSlot, true)
  assert.equal(empty.showPrimarySlot, true)
  assert.equal(empty.showMoreSlot, true)
  assert.equal(draft.primaryAction.key, 'submit')
  assert.equal(active.primaryAction.key, 'submit')
  assert.equal(closed.primaryAction.key, 'submit')
  assert.equal(empty.primaryAction.key, 'submit')
  assert.deepEqual(empty.availableActions, [])
  assert.deepEqual(
    draft.secondaryActions.map((action) => action.key),
    ['close', 'cancel']
  )
  assert.deepEqual(
    active.secondaryActions.map((action) => action.key),
    ['close', 'cancel']
  )
  assert.deepEqual(
    closed.secondaryActions.map((action) => action.key),
    ['close', 'cancel']
  )
  assert.deepEqual(
    empty.secondaryActions.map((action) => action.key),
    ['close', 'cancel']
  )
  for (const state of [draft, active, closed, empty]) {
    assert.deepEqual(
      state.authorizedActions.map((action) => action.key),
      ['submit', 'close', 'cancel']
    )
    assert.equal(state.actionStates.submit.disabledReason.length > 0, state.actionStates.submit.disabled)
    assert.equal(state.actionStates.close.disabledReason.length > 0, state.actionStates.close.disabled)
    assert.equal(state.actionStates.cancel.disabledReason.length > 0, state.actionStates.cancel.disabled)
  }
  assert.equal(draft.actionStates.submit.disabled, false)
  assert.equal(draft.actionStates.close.disabled, true)
  assert.equal(active.actionStates.submit.disabled, true)
  assert.equal(active.actionStates.close.disabled, false)
  assert.equal(closed.actionStates.submit.disabled, true)
  assert.equal(closed.actionStates.close.disabled, true)
  assert.equal(closed.actionStates.cancel.disabled, true)
  assert.equal(empty.actionStates.submit.disabled, true)
  assert.equal(empty.actionStates.submit.disabledReason, '请先选择一条记录')
})

test('生命周期动作槽：保存中仅置灰可执行动作，不改变主动作和更多操作', () => {
  const actions = [
    { key: 'submit', label: '提交' },
    { key: 'cancel', label: '取消', danger: true },
  ]
  const result = resolveBusinessLifecycleActions({
    actions,
    selected: true,
    busy: true,
    hasPermission: () => true,
    canRun: () => true,
    busyReason: '当前订单操作完成后可继续办理',
  })

  assert.equal(result.primaryAction.key, 'submit')
  assert.deepEqual(
    result.secondaryActions.map((action) => action.key),
    ['cancel']
  )
  assert.deepEqual(result.actionStates.submit, {
    available: true,
    disabled: true,
    disabledReason: '当前订单操作完成后可继续办理',
  })
  assert.deepEqual(result.actionStates.cancel, result.actionStates.submit)
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

test('九个岗位的实际能力投影均保持固定动作目录，选择和终态只改变禁用态', () => {
  const actions = [
    ...new Set(
      yoyoosunRoleFlowMatrix.roles.flatMap((role) => role.capabilityKeys)
    ),
  ].map((permission) => ({
    key: permission,
    label: permission,
    permission,
  }))

  assert.equal(yoyoosunRoleFlowMatrix.roles.length, 9)
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    const permissions = new Set(role.capabilityKeys)
    const resolve = ({ selected, runnable }) =>
      resolveBusinessLifecycleActions({
        actions,
        selected,
        hasPermission: (action) => permissions.has(action.permission),
        canRun: () => runnable,
        selectionReason: `请先选择 ${role.displayName} 待办理记录`,
      })
    const empty = resolve({ selected: false, runnable: false })
    const available = resolve({ selected: true, runnable: true })
    const terminal = resolve({ selected: true, runnable: false })
    const authorizedKeys = empty.authorizedActions.map((action) => action.key)

    assert.deepEqual(
      available.authorizedActions.map((action) => action.key),
      authorizedKeys,
      `${role.roleKey} 选中记录后不得改变动作目录`
    )
    assert.deepEqual(
      terminal.authorizedActions.map((action) => action.key),
      authorizedKeys,
      `${role.roleKey} 终态记录不得改变动作目录`
    )
    assert.equal(available.primaryAction?.key, empty.primaryAction?.key)
    assert.equal(terminal.primaryAction?.key, empty.primaryAction?.key)
    assert.deepEqual(
      terminal.secondaryActions.map((action) => action.key),
      empty.secondaryActions.map((action) => action.key)
    )
    assert(
      Object.values(terminal.actionStates).every(
        (state) => state.disabled && state.disabledReason
      ),
      `${role.roleKey} 终态动作应全部置灰并说明原因`
    )
  }
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
