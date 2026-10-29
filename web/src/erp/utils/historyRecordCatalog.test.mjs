import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HISTORY_RECORD_SOURCES,
  buildHistoryListParams,
  getAvailableHistorySources,
  getHistoryCenterSources,
  normalizeHistoryRecords,
  resolveHistoryStatusCounts,
} from './historyRecordCatalog.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import { yoyoosunRoleFlowMatrix } from '../../../../config/customers/yoyoosun/roleFlowMatrix.mjs'

test('历史集中入口按当前岗位有效职责开放，保留执行岗位的来源查询', () => {
  const retained = new Set(['boss', 'sales', 'purchase', 'finance', 'engineering', 'pmc', 'production'])
  for (const role of yoyoosunRoleFlowMatrix.roles) {
    const options = {
      visibleMenuPaths: businessModuleDefinitions.filter((page) => role.menuSurfaces.includes(page.key)).map((page) => page.path),
      canReadPermission: (permission) => role.capabilityKeys.includes(permission),
    }
    assert.equal(getHistoryCenterSources(options).length > 0, retained.has(role.roleKey), role.roleKey)
    if (['warehouse', 'quality'].includes(role.roleKey)) {
      assert.ok(getAvailableHistorySources(options).length > 0, '隐藏集中入口不撤销模块历史来源')
    }
  }
})

test('历史入口不凭岗位名称或执行权限放行，自定义职责与多岗合并使用相同能力判断', () => {
  const permissions = new Set([PermissionCode.PROCESS_READ, PermissionCode.PRODUCTION_WIP_EXECUTE])
  const options = {
    visibleMenuPaths: ['/erp/engineering/processes'],
    canReadPermission: (permission) => permissions.has(permission),
  }
  assert.deepEqual(getHistoryCenterSources(options), [])
  permissions.add(PermissionCode.PRODUCTION_WIP_ASSIGN)
  assert.deepEqual(getHistoryCenterSources(options).map((source) => source.key), ['processes'])
  permissions.delete(PermissionCode.PRODUCTION_WIP_ASSIGN)
  permissions.add(PermissionCode.FINANCE_PAYABLE_READ)
  assert.equal(getHistoryCenterSources(options).length, 1, '兼任财务后可集中核对原有可读来源')
  permissions.delete(PermissionCode.FINANCE_PAYABLE_READ)
  assert.deepEqual(getHistoryCenterSources(options), [], '撤销管理职责后收回集中入口')
})

test('工程的引用读取权不开放加工环节、往来方或其他岗位的历史来源', () => {
  const role = yoyoosunRoleFlowMatrix.roles.find((item) => item.roleKey === 'engineering')
  for (const permission of ['process.read', 'customer.read', 'supplier.read']) {
    assert.ok(role.capabilityKeys.includes(permission), `${permission} 引用读取必须保留`)
  }
  const sources = getHistoryCenterSources({
    visibleMenuPaths: businessModuleDefinitions.filter((page) => role.menuSurfaces.includes(page.key)).map((page) => page.path),
    canReadPermission: (permission) => role.capabilityKeys.includes(permission),
  })
  assert.deepEqual(sources.map((source) => source.key), ['materials', 'products', 'product_skus', 'sales_orders', 'bom_versions'])
})

test('历史入口无来源、客户收窄或权限未就绪时关闭，超级管理员也不绕过来源权限', () => {
  const paths = ['/erp/engineering/processes']
  assert.deepEqual(getHistoryCenterSources(), [])
  assert.deepEqual(getHistoryCenterSources({ canReadPermission: () => true }), [])
  assert.deepEqual(getHistoryCenterSources({ visibleMenuPaths: paths, canReadPermission: (p) => p === PermissionCode.PROCESS_UPDATE }), [])
  assert.deepEqual(getHistoryCenterSources({ visibleMenuPaths: paths, isSuperAdmin: true }), [])
  assert.deepEqual(getHistoryCenterSources({ isSuperAdmin: true, canReadPermission: () => true }), [])
  assert.equal(getHistoryCenterSources({ visibleMenuPaths: paths, isSuperAdmin: true, canReadPermission: (p) => p === PermissionCode.PROCESS_READ }).length, 1)
})

test('历史导出在源字段投影时留空，保留页面占位、真实横杠和明确历史状态', () => {
  for (const source of HISTORY_RECORD_SOURCES) {
    const [exported] = normalizeHistoryRecords(source, [{ id: 1 }], { emptyText: '' })
    for (const field of ['primary', 'secondary', 'summary', 'status']) {
      assert.equal(exported[field], '', `${source.key}.${field}`)
    }
    const [display] = normalizeHistoryRecords(source, [{ id: 1 }])
    assert.equal(display.primary, '未编号记录')
    assert.equal(display.secondary, '-')
    assert.equal(display.summary, '-')
  }
  const source = HISTORY_RECORD_SOURCES.find((item) => item.key === 'customers')
  const [exported] = normalizeHistoryRecords(source, [{ id: 1, code: '-', name: '—', is_active: false, note: '-' }], { emptyText: '' })
  assert.equal(exported.primary, '-')
  assert.equal(exported.secondary, '—')
  assert.equal(exported.summary, '-')
  assert.equal(exported.status, '已停用')
})

test('历史记录源只暴露已有菜单且具备真实读取权限的对象', () => {
  const sources = getAvailableHistorySources({
    visibleMenuPaths: [
      '/erp/master/products',
      '/erp/purchase/accessories',
      '/erp/production/orders',
    ],
    canReadPermission: (permission) =>
      ['product.read', 'purchase.order.read', 'production.wip.read'].includes(
        permission
      ),
  })
  assert.deepEqual(
    sources.map((source) => source.key),
    ['products', 'purchase_orders', 'production_orders']
  )
})

test('历史读取参数始终带只读 history scope，并沿用对象自己的状态字段', () => {
  const purchaseSource = HISTORY_RECORD_SOURCES.find(
    (source) => source.key === 'purchase_orders'
  )
  assert.deepEqual(
    buildHistoryListParams(purchaseSource, {
      keyword: ' PO-1 ',
      status: 'closed',
    }),
    {
      keyword: 'PO-1',
      lifecycle_scope: 'history',
      lifecycle_status: 'closed',
    }
  )
})

test('历史记录只投影岗位可读字段，跳转链接保留所属模块和历史范围', () => {
  const salesSource = HISTORY_RECORD_SOURCES.find(
    (source) => source.key === 'sales_orders'
  )
  const [record] = normalizeHistoryRecords(salesSource, [
    {
      id: 7,
      order_no: 'SO-007',
      customer_snapshot: { name: '示例客户' },
      lifecycle_status: 'closed',
      updated_at: 123,
    },
  ])
  assert.equal(record.primary, 'SO-007')
  assert.equal(record.secondary, '示例客户')
  assert.equal(record.status, '已关闭')
  assert.match(record.link, /scope=history/u)
  assert.match(record.link, /sales_order_id=7/u)
  assert.equal(Object.hasOwn(record, 'id'), false)
})

test('历史状态数量使用完整服务端分组，单状态归档仅使用服务端总数', () => {
  const grouped = { statusCounts: true }
  assert.deepEqual(resolveHistoryStatusCounts(grouped, { total: 3, status_counts: { closed: 40, canceled: 3 } }), { closed: 40, canceled: 3 })
  assert.equal(resolveHistoryStatusCounts(grouped, { total: 3, items: [{ lifecycle_status: 'closed' }] }), null)
  const single = { statusCounts: false, historyStatusOptions: [{ value: '' }, { value: 'ARCHIVED' }] }
  assert.deepEqual(resolveHistoryStatusCounts(single, { total: 47, items: [] }), { ARCHIVED: 47 })
  assert.deepEqual(resolveHistoryStatusCounts(single, { total: 0 }), { ARCHIVED: 0 })
  for (const total of [undefined, -1, '47']) assert.equal(resolveHistoryStatusCounts(single, { total }), null)
  assert.equal(resolveHistoryStatusCounts({ historyStatusOptions: [] }, { total: 9 }), null)
})
