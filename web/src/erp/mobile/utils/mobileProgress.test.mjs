import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mobileProgressAccess,
  mobileProgressDefaultView,
  readMobileProgressState,
  mobileProgressTaskSummary,
  normalizeMobileProgressQuery,
} from './mobileProgress.mjs'
import { withProgressFilters } from '../../utils/businessProgress.mjs'

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
test('手机进度更新和恢复只保留常用条件，姓名与精确日期不再参与查询', () => {
  let query = normalizeMobileProgressQuery({}, 'production')
  for (const changes of [
    { q: '模拟客户' },
    { from: '2026-10-16', to: '2026-10-18', owner: '负责人' },
    { from: '', to: '' },
    { from: '2026-10-16', to: '2026-10-18' },
    { due_status: 'undated' },
    { scope: 'active', due_status: 'all', owner: '', from: '', to: '' },
  ]) {
    query = normalizeMobileProgressQuery(withProgressFilters(query, changes), 'production')
    const restored = readMobileProgressState({ mobileProgress: { scope: 'test', query } }, 'test', 'production')
    assert.deepEqual(restored.query, query)
    assert.equal(query.from, undefined)
    assert.equal(query.to, undefined)
  }
  assert.equal(query.q, '模拟客户')
  assert.equal(query.owner, undefined)
})
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
  assert.equal(restored.query.from, undefined)
  assert.equal(restored.query.to, undefined)
  assert.equal(restored.selection.id, 25)
  assert.equal(restored.scrollTop, 340)
  const ended = readMobileProgressState(
    { mobileProgress: { ...history.mobileProgress, query: { scope: 'ended', due_status: 'overdue' } } },
    'user7|boss|v1',
    'orders'
  )
  assert.equal(ended.query.scope, 'ended')
  assert.equal(ended.query.due_status, 'all')
  const ownerFilter = readMobileProgressState(
    {
      mobileProgress: {
        scope: 'user7|boss|v1',
        query: { owner: '负责人条件' },
      },
    },
    'user7|boss|v1',
    'orders'
  )
  assert.equal(ownerFilter.query.q, '')
  assert.equal(ownerFilter.query.owner, undefined)
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
test('订单与生产各自恢复搜索和条件，账号或权限变化清除两份历史', () => {
  const history = {
    mobileProgress: {
      scope: 'user7|pmc|v1',
      query: { view: 'orders', q: '云朵', due_status: 'overdue' },
      queries: {
        orders: { q: '旧查询', due_status: 'undated' },
        production: { view: 'production', q: '生产一组', unlinked_only: true },
      },
    },
  }
  const restored = readMobileProgressState(history, 'user7|pmc|v1', 'production')
  assert.equal(restored.queries.orders.q, '云朵')
  assert.equal(restored.queries.orders.due_status, 'overdue')
  assert.equal(restored.queries.production.q, '生产一组')
  assert.equal(restored.queries.production.unlinked_only, true)
  for (const scope of ['user8|pmc|v1', 'user7|pmc|v2']) {
    const cleared = readMobileProgressState(history, scope, 'production')
    assert.equal(cleared.query.view, 'production')
    assert.equal(cleared.queries.orders.q, '')
    assert.equal(cleared.queries.production.q, '')
    assert.equal(cleared.queries.production.unlinked_only, false)
  }
})
test('单任务展示岗位名称并仅用精确关联 ID 直达详情', () => {
  assert.deepEqual(
    mobileProgressTaskSummary(
      {
        open_tasks: 1,
        attention_task: 'engineering_data',
        attention_task_id: 101,
        attention_role: 'purchase',
        attention_owner: '甲',
      },
      () => '采购岗'
    ),
    { title: '任务：工程资料', detail: '采购岗 · 甲', taskID: 101 }
  )
  for (const taskID of [undefined, 0, -1, '101', 1.5]) {
    assert.equal(
      mobileProgressTaskSummary(
        { open_tasks: 1, attention_task_id: taskID },
        () => '采购岗'
      ).taskID,
      null
    )
  }
})
test('多任务展示首要事项和责任，仍由关联任务列表选择', () => {
  assert.deepEqual(
    mobileProgressTaskSummary(
      {
        open_tasks: 2,
        attention_task: '确认面料交期',
        attention_task_id: 100,
        attention_role: 'purchase',
      },
      () => '采购岗'
    ),
    {
      title: '2 项待处理',
      detail: '首要：确认面料交期 · 采购岗 · 办理人未提供',
      taskID: null,
    }
  )
  assert.equal(
    mobileProgressTaskSummary(
      { open_tasks: 2, unassigned_tasks: 2, attention_task: '确认面料交期', attention_role: 'purchase' },
      () => '采购岗'
    ).detail,
    '首要：确认面料交期 · 采购岗 · 待领取'
  )
})
test('已无待办时不残留上一任务名称或直达 ID', () => {
  assert.deepEqual(
    mobileProgressTaskSummary(
      {
        open_tasks: 0,
        attention_task: '确认面料交期',
        attention_task_id: 100,
        attention_owner: '甲',
      },
      () => '采购岗'
    ),
    { title: '暂无待处理任务', detail: '', taskID: null }
  )
})
