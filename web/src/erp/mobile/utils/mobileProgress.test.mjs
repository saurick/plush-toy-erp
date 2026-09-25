import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mobileProgressAccess,
  mobileProgressDefaultView,
  readMobileProgressState,
  mobileProgressTaskOwner,
} from './mobileProgress.mjs'

const permissions = [
  'erp.business_dashboard.read',
  'sales_order.read',
  'sales_order_item.read',
  'pmc.plan.read',
]
const profile = {
  id: 7,
  is_super_admin: false,
  permissions,
  effective_session: {
    source: 'active_customer_config_revision',
    customer: { key: 'example' },
    actions: permissions,
  },
}
test('进度入口由真实读取权限决定，普通老板无需管理员身份', () => {
  assert.equal(mobileProgressAccess(profile).enabled, true)
  assert.equal(
    mobileProgressAccess({
      ...profile,
      permissions: ['mobile.warehouse.access'],
    }).enabled,
    false
  )
  assert.equal(
    mobileProgressAccess({
      ...profile,
      effective_session: {
        ...profile.effective_session,
        actions: ['pmc.plan.read'],
      },
    }).enabled,
    false
  )
  assert.equal(
    mobileProgressAccess({ ...profile, effective_session: null }).enabled,
    false
  )
  assert.equal(
    mobileProgressAccess({
      ...profile,
      permissions: ['erp.business_dashboard.read'],
    }).enabled,
    false
  )
})
test('岗位只影响默认视图，不扩大可见数据范围', () => {
  assert.equal(
    mobileProgressDefaultView('boss', { sales: true, production: true }),
    'orders'
  )
  assert.equal(
    mobileProgressDefaultView('pmc', { sales: true, production: true }),
    'production'
  )
  assert.equal(
    mobileProgressDefaultView('pmc', { sales: true, production: false }),
    'orders'
  )
})
test('返回和刷新恢复查询与选择，账号、权限或岗位改变不复用旧历史', () => {
  const history = {
    mobileProgress: {
      scope: 'user7|boss|v1',
      query: {
        q: 'SO-0025',
        view: 'orders',
        page: 2,
        from: '2026-09-01',
        to: '2026-09-30',
      },
      selection: { id: 25, view: 'orders', orderNo: 'SO-0025' },
      scrollTop: 340,
    },
  }
  const restored = readMobileProgressState(history, 'user7|boss|v1', 'orders')
  assert.equal(restored.query.q, 'SO-0025')
  assert.equal(restored.query.page, 1)
  assert.equal(restored.query.from, '')
  assert.equal(restored.query.to, '')
  assert.equal(restored.selection.id, 25)
  assert.equal(restored.scrollTop, 340)
  const legacyOwner = readMobileProgressState(
    {
      mobileProgress: {
        scope: 'user7|boss|v1',
        query: { owner: '旧负责人条件' },
      },
    },
    'user7|boss|v1',
    'orders'
  )
  assert.equal(legacyOwner.query.q, '旧负责人条件')
  assert.equal(legacyOwner.query.owner, '')
  for (const scope of [
    'user8|boss|v1',
    'user7|warehouse|v1',
    'user7|boss|v2',
  ]) {
    const result = readMobileProgressState(history, scope, 'production')
    assert.equal(result.query.q, '')
    assert.equal(result.query.view, 'production')
    assert.equal(result.selection, null)
    assert.equal(result.scrollTop, 0)
  }
})
test('并行任务不虚构唯一处理人，未领取展示责任岗位', () => {
  assert.equal(
    mobileProgressTaskOwner(
      { open_tasks: 2, attention_owner: '甲' },
      () => '采购岗'
    ),
    '2 项待处理 · 查看关联任务'
  )
  assert.equal(
    mobileProgressTaskOwner(
      { open_tasks: 1, attention_role: 'purchase' },
      () => '采购岗'
    ),
    '采购岗待领取'
  )
})
