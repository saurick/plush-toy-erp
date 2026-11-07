import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getFinanceWorkspaceViews,
  resolveFinanceWorkspaceView,
} from './financeWorkspaceViews.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

const profileFor = (permissions) => ({
  permissions,
  effective_session: { actions: permissions },
})
const fullProfile = {
  ...profileFor(Object.values(PermissionCode)),
  is_super_admin: true,
}
const pages = [
  '/erp/finance/receivables',
  '/erp/finance/payables',
  '/erp/finance/reconciliation',
  '/erp/finance/payments',
]
const keys = (moduleKey, profile = fullProfile, visiblePages = pages) =>
  getFinanceWorkspaceViews(moduleKey, profile, visiblePages).map(
    (view) => view.value
  )

test('财务按账款、资金与对账组织入口，采购差额归应付', () => {
  assert.deepEqual(keys('finance-payments'), ['payments'])
  assert.deepEqual(keys('receivables'), ['list', 'due', 'credits'])
  assert.deepEqual(keys('payables'), [
    'list',
    'due',
    'credits',
    'source-adjustments',
  ])
  assert.deepEqual(keys('reconciliation'), ['records', 'statement'])
})

test('应收应付入口不会因搬入调整和对账而扩大读取权限', () => {
  const profile = profileFor([
    'finance.receivable.read',
    'finance.payable.read',
    'finance.reconciliation.read',
  ])
  assert.deepEqual(keys('receivables', profile), ['list', 'due'])
  assert.deepEqual(keys('payables', profile), ['list', 'due'])
  assert.deepEqual(keys('reconciliation', profile), ['records'])
  assert.deepEqual(keys('finance-payments', profile), ['payments'])
})

test('仅开放收付款页面的岗位保留原可读记录，采购差额仍需全部来源权限', () => {
  const profile = profileFor(['finance.payment.read', 'finance.payable.read'])
  assert.deepEqual(
    keys('finance-payments', profile, ['/erp/finance/payments']),
    ['payments', 'credits', 'statement']
  )
  assert.deepEqual(
    keys('finance-payments', profileFor(['finance.payment.read']), [
      '/erp/finance/payments',
    ]),
    ['payments', 'credits']
  )
  assert.deepEqual(
    keys('finance-payments', fullProfile, ['/erp/finance/payments']),
    ['payments', 'credits', 'statement', 'source-adjustments']
  )
})

test('页面恢复只允许当前可用视图，来源定位优先于旧的期间对账选择', () => {
  const views = getFinanceWorkspaceViews('reconciliation', fullProfile, pages)
  assert.equal(
    resolveFinanceWorkspaceView({ views, savedView: 'credits' }),
    'records'
  )
  assert.equal(
    resolveFinanceWorkspaceView({
      views,
      savedView: 'statement',
      hasRecordContext: true,
    }),
    'records'
  )
  assert.equal(
    resolveFinanceWorkspaceView({ views, requestedView: 'records' }),
    'records'
  )
  assert.equal(
    resolveFinanceWorkspaceView({
      views: [{ value: 'records' }],
      requestedView: 'statement',
      savedView: 'statement',
    }),
    'records'
  )
})
