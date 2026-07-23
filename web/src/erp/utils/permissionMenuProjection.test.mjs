import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLocalPermissionDraftAccess,
  getMissingMenuPermissionKeys,
  getPrimaryPermissionMenuKey,
  menuRequirementsSatisfied,
  normalizePermissionMenuOptions,
  reconcilePermissionSelection,
} from './permissionMenuProjection.mjs'

const menus = [
  {
    key: 'shipping-release',
    label: '出货放行',
    path: '/erp/warehouse/shipping-release',
    required_any: [
      'warehouse.outbound.read',
      'finance.receivable.read',
      'sales_order.read',
    ],
    required_all: [],
  },
  {
    key: 'receivables',
    label: '应收管理',
    path: '/erp/finance/receivables',
    required_any: ['finance.receivable.read'],
    required_all: [],
  },
  {
    key: 'payables',
    label: '应付管理',
    path: '/erp/finance/payables',
    required_any: ['finance.payable.read'],
    required_all: [],
  },
  {
    key: 'inbound',
    label: '入库管理',
    path: '/erp/warehouse/inbound',
    required_any: ['warehouse.inbound.read', 'purchase.receipt.read'],
    required_all: [],
  },
]

const permissions = [
  {
    permission_key: 'finance.receivable.read',
    action: 'read',
    usage: {
      pages: [
        { key: 'shipping-release', control_type: 'section' },
        { key: 'receivables', control_type: 'page' },
      ],
    },
  },
  {
    permission_key: 'finance.receivable.confirm',
    action: 'confirm',
    usage: { pages: [{ key: 'receivables' }] },
  },
  {
    permission_key: 'finance.payable.read',
    action: 'read',
    usage: { pages: [{ key: 'payables' }] },
  },
  {
    permission_key: 'finance.payable.confirm',
    action: 'confirm',
    usage: { pages: [{ key: 'payables' }, { key: 'inbound' }] },
  },
]

test('permission menu projection: 菜单入口合同保留 any/all 语义', () => {
  const normalized = normalizePermissionMenuOptions(menus)
  assert.deepEqual(normalized[1], {
    key: 'receivables',
    label: '应收管理',
    path: '/erp/finance/receivables',
    requiredAny: ['finance.receivable.read'],
    requiredAll: [],
  })
  assert.equal(
    menuRequirementsSatisfied(normalized[1], ['finance.receivable.confirm']),
    false
  )
  assert.deepEqual(
    getMissingMenuPermissionKeys(normalized[1], ['finance.receivable.confirm']),
    {
      missingAny: ['finance.receivable.read'],
      missingAll: [],
    }
  )
})

test('permission menu projection: 页内操作自动补齐唯一明确的页面入口', () => {
  const result = reconcilePermissionSelection({
    previousKeys: [],
    requestedKeys: ['finance.receivable.confirm'],
    permissions,
    menuOptions: menus,
  })
  assert.deepEqual(
    new Set(result.permissionKeys),
    new Set(['finance.receivable.confirm', 'finance.receivable.read'])
  )
  assert.deepEqual(result.autoAdded, [
    {
      permissionKey: 'finance.receivable.read',
      menuKey: 'receivables',
    },
  ])
  assert.equal(
    getPrimaryPermissionMenuKey(permissions[1], menus),
    'receivables'
  )
  assert.equal(
    getPrimaryPermissionMenuKey(permissions[0], menus),
    'receivables',
    '页面入口应优先于共享区域'
  )
})

test('permission menu projection: 跨页面操作只补主办理页面，不连带开启其他页面', () => {
  const result = reconcilePermissionSelection({
    previousKeys: [],
    requestedKeys: ['finance.payable.confirm'],
    permissions,
    menuOptions: menus,
  })
  assert.deepEqual(
    new Set(result.permissionKeys),
    new Set(['finance.payable.confirm', 'finance.payable.read'])
  )
  assert.deepEqual(result.autoAdded, [
    {
      permissionKey: 'finance.payable.read',
      menuKey: 'payables',
    },
  ])
  assert.equal(result.permissionKeys.includes('warehouse.inbound.read'), false)
  assert.equal(result.permissionKeys.includes('purchase.receipt.read'), false)
})

test('permission menu projection: 关闭单一页面入口时移除仅在该页使用的操作', () => {
  const result = reconcilePermissionSelection({
    previousKeys: ['finance.receivable.read', 'finance.receivable.confirm'],
    requestedKeys: ['finance.receivable.confirm'],
    permissions,
    menuOptions: menus,
  })
  assert.deepEqual(result.permissionKeys, [])
  assert.deepEqual(result.autoRemoved, [
    {
      permissionKey: 'finance.receivable.confirm',
      menuKey: 'receivables',
    },
  ])
})

test('permission menu projection: 多页面操作不会因关闭一个入口被误删', () => {
  const result = reconcilePermissionSelection({
    previousKeys: ['finance.payable.read', 'finance.payable.confirm'],
    requestedKeys: ['finance.payable.confirm'],
    permissions,
    menuOptions: menus,
  })
  assert.deepEqual(result.permissionKeys, ['finance.payable.confirm'])
  assert.deepEqual(result.autoRemoved, [])
})

test('permission menu projection: 本地草稿只按后端菜单合同计算页面入口', () => {
  const access = buildLocalPermissionDraftAccess({
    menuOptions: menus,
    permissionKeys: ['finance.receivable.confirm'],
    roleKey: 'finance',
  })
  const receivables = access.pages.find((page) => page.key === 'receivables')
  assert.equal(receivables.rbac_granted, false)
  assert.equal(receivables.effective, false)
  assert.deepEqual(receivables.missing_any, ['finance.receivable.read'])
})
