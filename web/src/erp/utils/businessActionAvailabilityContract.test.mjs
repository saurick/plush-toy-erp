import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveBusinessActionAvailability,
  resolveContextualBusinessActionAvailability,
  resolveBusinessLifecycleActions,
  selectStableBusinessActionIndexes,
} from './businessActionAvailability.mjs'
import { yoyoosunRoleFlowMatrix } from '../../../../config/customers/yoyoosun/roleFlowMatrix.mjs'

test('业务动作可用性：无权限、不适用和完成后隐藏，前置条件不足和忙碌保留原因', () => {
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
      visible: false,
      disabled: true,
      disabledReason: '',
    }
  )
  assert.deepEqual(
    resolveBusinessActionAvailability({
      authorized: true,
      selected: true,
      completed: true,
    }),
    {
      visible: false,
      disabled: true,
      disabledReason: '',
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

test('上下文动作：没有选中或记录不相关时不占操作位，相关记录的临时忙碌仍保留说明', () => {
  for (const input of [
    { authorized: false, selected: true, relevant: true },
    { authorized: true, selected: false, relevant: true },
    { authorized: true, selected: true, relevant: false },
  ]) {
    assert.deepEqual(resolveContextualBusinessActionAvailability(input), {
      visible: false,
      disabled: true,
      disabledReason: '',
    })
  }

  assert.deepEqual(
    resolveContextualBusinessActionAvailability({
      authorized: true,
      selected: true,
      relevant: true,
      busy: true,
      busyReason: '资料加载完成后可查看',
    }),
    {
      visible: true,
      disabled: true,
      disabledReason: '资料加载完成后可查看',
    }
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

test('生命周期动作槽：未选择展示有权限的禁用入口，选中后随合法阶段变化', () => {
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
  assert.equal(active.showPrimarySlot, true)
  assert.equal(closed.showPrimarySlot, false)
  assert.equal(empty.showPrimarySlot, true)
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
  assert.deepEqual(
    closed.secondaryActions.map((action) => action.key),
    []
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
    assert.equal(
      state.actionStates.submit.disabledReason.length > 0,
      state.actionStates.submit.disabled
    )
    assert.equal(
      state.actionStates.close.disabledReason.length > 0,
      state.actionStates.close.disabled
    )
    assert.equal(
      state.actionStates.cancel.disabledReason.length > 0,
      state.actionStates.cancel.disabled
    )
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
  assert.equal(unselectedSubmitOnly.primaryAction.key, 'submit')
  assert.deepEqual(unselectedSubmitOnly.secondaryActions, [])
})

test('九个岗位未选择时展示已授权的禁用动作，选中后仅展示合法生命周期动作', () => {
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
    assert.equal(available.primaryAction?.key, authorizedKeys[0])
    assert.equal(empty.primaryAction?.key, authorizedKeys[0])
    assert.equal(terminal.primaryAction, null)
    assert.deepEqual(terminal.secondaryActions, [])
    assert.deepEqual(
      empty.secondaryActions.map((action) => action.key),
      authorizedKeys.slice(1)
    )
    assert.deepEqual(empty.availableActions, [])
    assert.deepEqual(Object.keys(empty.actionStates), authorizedKeys)
    assert(
      Object.values(empty.actionStates).every(
        (state) =>
          !state.available &&
          state.disabled &&
          state.disabledReason === `请先选择 ${role.displayName} 待办理记录`
      ),
      `${role.roleKey} 未选择记录时入口应可发现，但不能办理`
    )
    assert(
      Object.values(terminal.actionStates).every(
        (state) => state.disabled && state.disabledReason
      ),
      `${role.roleKey} 内部状态继续解释非法转移，页面不渲染终态动作`
    )
  }
})

test('空间不足时按固定优先级收纳，状态和 loading 不改变直接入口', () => {
  const descriptors = [
    { index: 0, actionable: true, enabled: false, score: 40, width: 72 },
    { index: 1, actionable: true, enabled: true, score: 100, width: 88 },
    { index: 2, actionable: true, enabled: true, score: 40, width: 72 },
    { index: 3, actionable: false, enabled: false, score: -1 },
  ]
  const toggledDescriptors = descriptors.map((item) => ({
    ...item,
    enabled: !item.enabled,
  }))

  const space = { availableWidth: 248, moreWidth: 96, gap: 8 }
  assert.deepEqual(selectStableBusinessActionIndexes(descriptors, space), [0, 1, 2])
  space.availableWidth = 247
  assert.deepEqual(selectStableBusinessActionIndexes(descriptors, space), [1])
  assert.deepEqual(
    selectStableBusinessActionIndexes(toggledDescriptors, space),
    [1]
  )
})

test('所有动作放得下时直接显示，辅助、例外和危险动作不固定折叠', () => {
  const actions = [
    { index: 0, actionable: true, enabled: true, score: 20, width: 80 },
    { index: 1, actionable: true, enabled: false, score: 10, width: 88 },
    { index: 2, actionable: true, enabled: true, score: 60, width: 72 },
  ]
  assert.deepEqual(selectStableBusinessActionIndexes(actions, { availableWidth: 256, moreWidth: 96 }), [0, 1, 2])
  assert.deepEqual(selectStableBusinessActionIndexes(actions, { availableWidth: 255, moreWidth: 96 }), [2])
  assert.deepEqual(selectStableBusinessActionIndexes(actions, { availableWidth: 0, moreWidth: 96 }), [])
  assert.deepEqual(selectStableBusinessActionIndexes(actions, { availableWidth: 256 }), [0, 1, 2])
})

test('分类标题与组间留白参与测宽，少量同类动作仍完整直达', () => {
  const actions = [
    { index: 0, actionable: true, group: 'business', score: 100, width: 52 },
    { index: 1, actionable: true, group: 'query', score: 60, width: 52 },
  ]
  const space = { availableWidth: 160, moreWidth: 60, gap: 8, groupGap: 16, groupMinWidths: { business: 64, query: 80 } }
  assert.deepEqual(selectStableBusinessActionIndexes(actions, space), [0, 1])
  assert.deepEqual(selectStableBusinessActionIndexes(actions, { ...space, availableWidth: 159 }), [0])
  assert.deepEqual(selectStableBusinessActionIndexes(actions.map((item) => ({ ...item, group: 'query' })), { ...space, availableWidth: 112 }), [0, 1])
})

test('分组原子性、隐藏空组和更多入口宽度共同参与空间计算', () => {
  const groups = [
    { index: 0, actionable: true, score: 100, width: 160 },
    { index: 1, actionable: true, score: 60, width: 80 },
    { index: 2, actionable: true, score: 20, width: 72 },
    { index: 3, actionable: true, score: 100, width: 0 },
    { index: 4, actionable: false, score: 200, width: 50 },
  ]
  assert.deepEqual(selectStableBusinessActionIndexes(groups, { availableWidth: 328, moreWidth: 96 }), [0, 1, 2])
  assert.deepEqual(selectStableBusinessActionIndexes(groups, { availableWidth: 327, moreWidth: 96 }), [0])
  assert.deepEqual(selectStableBusinessActionIndexes(groups, { availableWidth: 184, moreWidth: 96 }), [1])
})
