import assert from 'node:assert/strict'
import test from 'node:test'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { TASK_BOARD_ROLE_OPTIONS } from './workflowTaskBoard.mjs'
import { documentTaskAccess, progressBoardAccess, progressBoardViews, scopeProgressBoardQuery } from './progressBoardAccess.mjs'

function profile(roles, permissions, effectiveRoles = roles) {
  return {
    id: 1,
    roles: roles.map((role_key) => ({ role_key })),
    permissions,
    effective_session: { roles: effectiveRoles, actions: permissions },
  }
}

test('task permission opens the document task grouping without granting a business progress view', () => {
  for (const { value } of TASK_BOARD_ROLE_OPTIONS) {
    const account = profile([value], [PermissionCode.WORKFLOW_TASK_READ])
    for (const mobileRole of [undefined, value]) {
      assert.deepEqual(documentTaskAccess(account, mobileRole).roles.map((role) => role.value), [value])
      assert.deepEqual(progressBoardViews(progressBoardAccess(account, mobileRole)), [])
    }
  }
  const narrowed = profile(['sales', 'finance'], [PermissionCode.WORKFLOW_TASK_READ], ['sales'])
  assert.deepEqual(documentTaskAccess(narrowed, 'finance').roles, [])
})

test('sales and global views use separate source rights', () => {
  const permissions = [PermissionCode.WORKFLOW_TASK_READ, PermissionCode.SALES_ORDER_READ,
    PermissionCode.SALES_ORDER_ITEM_READ, PermissionCode.PMC_PLAN_READ,
    PermissionCode.FINANCE_RECEIVABLE_READ, PermissionCode.FIELD_FINANCE_SETTLEMENT_READ]
  const sales = progressBoardAccess(profile(['sales'], permissions))
  assert.deepEqual(progressBoardViews(sales).map((view) => view.value), ['orders'])
  const request = scopeProgressBoardQuery({ view: 'production', blocked_only: true, owner: '其他岗位', offset: 20 }, 'orders', sales)
  assert.equal(request.display, 'lines')
  assert.equal(request.blocked_only, false)
  assert.equal(request.owner, '')
  assert.equal(request.offset, 20)
  const boss = progressBoardAccess(profile(['boss'], [...permissions, PermissionCode.ERP_BUSINESS_DASHBOARD_READ]))
  assert.deepEqual(progressBoardViews(boss).map((view) => view.value), ['orders', 'production', 'statistics'])
})

test('cross-role follow-up requires both board and workflow supervision permission', () => {
  const read = PermissionCode.WORKFLOW_TASK_READ
  const supervise = PermissionCode.WORKFLOW_TASK_SUPERVISE
  const global = PermissionCode.ERP_BUSINESS_DASHBOARD_READ
  assert.equal(documentTaskAccess(profile(['boss'], [read, global])).supervise, false)
  assert.equal(documentTaskAccess(profile(['boss'], [read, supervise])).supervise, false)
  assert.equal(documentTaskAccess(profile(['boss'], [global, supervise])).supervise, false)
  const manager = profile(['boss'], [read, global, supervise])
  for (const mobileRole of [undefined, 'boss']) {
    const access = documentTaskAccess(manager, mobileRole)
    assert.equal(access.supervise, true)
    assert.deepEqual(access.roles.map(({ value }) => value), ['boss'])
    assert.equal(access.supervise, true)
  }
  const managerWithoutBusinessRole = documentTaskAccess(profile([], [read, global, supervise]))
  assert.equal(managerWithoutBusinessRole.supervise, true)
})
