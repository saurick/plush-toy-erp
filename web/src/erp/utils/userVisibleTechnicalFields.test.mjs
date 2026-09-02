import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_RPC_ERROR_MESSAGES } from '../../common/consts/errorCodes.js'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import {
  dashboardHealthModules,
  dashboardModules,
} from '../config/dashboardModules.mjs'
import {
  ERP_MENU_PERMISSION_GROUPS,
  getMobileRolePermissionLabel,
  getPermissionLabel,
} from '../config/menuPermissions.mjs'
import {
  buildTaskFactRows,
  resolveMobileTaskDueLabel,
  resolveTaskSourceLabel,
} from '../mobile/utils/mobileRoleTaskModel.mjs'
import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceTypeLabel,
} from './dashboardTaskDisplay.mjs'
import {
  financeCollectionTypeText,
  financeInvoiceCategoryText,
  financePaymentTermText,
} from './financeFactDisplay.mjs'
import { resolveFinishedGoodsSourceNo } from './finishedGoodsFlow.mjs'
import {
  formatUnitDisplayName,
  salesOrderFreightTermsText,
  salesOrderTaxModeText,
  statusText,
} from './masterDataOrderView.mjs'
import { getMobileTaskDueStatusLabel } from './mobileTaskView.mjs'
import {
  getPermissionCenterRoleName,
  getRoleTypeLabel,
} from './permissionCenterAccess.mjs'
import { resolvePayableSourceNo } from './payableReconciliationFlow.mjs'
import {
  customerOption,
  inventoryLotOption,
  materialOption,
  productOption,
  productSKUOption,
  referenceLabel,
  salesOrderOption,
  shipmentOption,
  supplierOption,
  unitOption,
} from './referenceSelectOptions.mjs'
import { getRoleDisplayName } from './roleKeys.mjs'
import {
  getWorkflowTaskBusinessStatusLabel,
  getWorkflowTaskOwnerRoleLabel,
} from './workflowTaskBoard.mjs'

const SENTINEL_ID = 987654321
const RAW_FIELD_PATTERN =
  /\b(?:expected_version|idempotency_key|intent_hash|task_version|owner_role_key|permission_key|role_key|source_type|source_id|source_line_id|payload|[a-z][a-z0-9]*_(?:id|key))\b/iu
const ARCHITECTURE_TERM_PATTERN =
  /\b(?:RBAC|Workflow|Fact|API|usecase|schema|runtime|revision|fallback)\b/iu
const INTERNAL_COPY_PATTERN =
  /(?:内部主键|内部引用|内部流水|权限码|数据真源|Product Core|customer key)/iu
const VISIBLE_KEYS = new Set([
  'boundary',
  'description',
  'emptyDescription',
  'emptyText',
  'hint',
  'label',
  'message',
  'name',
  'note',
  'pageSummary',
  'placeholder',
  'searchHint',
  'shortLabel',
  'shortTitle',
  'summary',
  'title',
])

function visibleCatalogCopy(value, key = '') {
  if (typeof value === 'string') {
    return VISIBLE_KEYS.has(key) ? [value] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => visibleCatalogCopy(item, key))
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([childKey, childValue]) =>
    visibleCatalogCopy(childValue, childKey)
  )
}

function assertNoTechnicalLeak(values, message) {
  const strings = values.flat(Infinity).map((value) => String(value ?? ''))
  for (const value of strings) {
    assert.doesNotMatch(value, RAW_FIELD_PATTERN, `${message}: ${value}`)
    assert.doesNotMatch(
      value,
      ARCHITECTURE_TERM_PATTERN,
      `${message}: ${value}`
    )
    assert.doesNotMatch(value, INTERNAL_COPY_PATTERN, `${message}: ${value}`)
    assert.doesNotMatch(value, new RegExp(String(SENTINEL_ID), 'u'), message)
  }
}

test('shared reference formatters never turn internal ids into visible labels', () => {
  const labels = [
    referenceLabel([], SENTINEL_ID, '客户'),
    customerOption({ id: SENTINEL_ID })?.label,
    supplierOption({ id: SENTINEL_ID })?.label,
    materialOption({ id: SENTINEL_ID })?.label,
    productOption({ id: SENTINEL_ID })?.label,
    productSKUOption({ id: SENTINEL_ID })?.label,
    salesOrderOption({ id: SENTINEL_ID })?.label,
    shipmentOption({ id: SENTINEL_ID })?.label,
    inventoryLotOption({ id: SENTINEL_ID })?.label,
    unitOption({ id: SENTINEL_ID })?.label,
    formatUnitDisplayName(SENTINEL_ID, new Map()),
  ]

  assert.deepEqual(labels, [
    '客户已关联',
    '客户已关联',
    '供应商已关联',
    '材料已关联',
    '产品已关联',
    'SKU已关联',
    '销售订单已关联',
    '出货单已关联',
    '批次已关联',
    '单位已关联',
    '单位已关联',
  ])
  assertNoTechnicalLeak(labels, '引用 formatter 不得泄露内部 ID')
})

test('shared role, status and source formatters fail closed to business language', () => {
  const labels = [
    getRoleDisplayName('unknown_role_key'),
    getPermissionCenterRoleName({ role_key: 'unknown_role_key' }),
    getRoleTypeLabel({ role_type: 'unknown_role_type' }),
    getWorkflowTaskOwnerRoleLabel({ owner_role_key: 'unknown_role_key' }),
    getPermissionLabel('unknown.permission.key'),
    getMobileRolePermissionLabel('unknown_role_key'),
    statusText('unknown_status_key'),
    getWorkflowTaskBusinessStatusLabel({
      business_status_key: 'unknown_status_key',
    }),
    getWorkflowTaskSourceTypeLabel('unknown_source_type'),
    formatWorkflowTaskSource({
      source_type: 'unknown_source_type',
      source_id: SENTINEL_ID,
    }),
  ]

  assert.deepEqual(labels, [
    '已配置岗位',
    '已配置岗位',
    '岗位',
    '负责岗位',
    '菜单权限',
    '岗位入口',
    '业务状态',
    '未知业务状态',
    '业务来源',
    '已关联业务来源',
  ])
  assertNoTechnicalLeak(labels, '角色、状态和来源 formatter 不得透出 raw key')
})

test('mobile and fact presentation preserve zero values without exposing raw keys', () => {
  const rows = buildTaskFactRows({
    payload: { quantity: 0, qc_result: 'unknown_qc_result_key' },
  })
  const labels = [
    getMobileTaskDueStatusLabel('unknown_due_status_key'),
    resolveMobileTaskDueLabel({ due_status: 'unknown_due_status_key' }),
    resolveTaskSourceLabel({
      source_type: 'unknown_source_type',
      source_id: SENTINEL_ID,
    }),
    resolveFinishedGoodsSourceNo({ id: SENTINEL_ID }),
    resolvePayableSourceNo({ id: SENTINEL_ID }),
    ...rows.flat(),
  ]

  assert.deepEqual(rows, [
    ['数量', '0'],
    ['IQC 结果', '质检已记录'],
  ])
  assert.deepEqual(labels.slice(0, 5), [
    '到期状态',
    '到期状态',
    '已关联业务来源',
    '',
    '',
  ])
  assertNoTechnicalLeak(labels, '移动任务和事实展示不得透出 raw key 或内部 ID')
})

test('enum formatters never use unknown enum keys as visible fallback', () => {
  const labels = [
    salesOrderTaxModeText('unknown_tax_mode'),
    salesOrderFreightTermsText('unknown_freight_terms'),
    financeCollectionTypeText('unknown_collection_type'),
    financeInvoiceCategoryText('unknown_invoice_category'),
    financePaymentTermText(
      { payment_term: 'unknown_payment_term', payment_term_days: 30 },
      {}
    ),
  ]

  assert.deepEqual(labels, [
    '税费方式待核对',
    '运费条件待核对',
    '待核对',
    '待核对',
    '待核对',
  ])
  assertNoTechnicalLeak(labels, '枚举 formatter 不得回显未知 key')
})

test('formal visible catalogs and mapped errors contain business copy only', () => {
  const visibleCopy = [
    ...visibleCatalogCopy(businessModuleDefinitions),
    ...visibleCatalogCopy(dashboardModules),
    ...visibleCatalogCopy(dashboardHealthModules),
    ...visibleCatalogCopy(ERP_MENU_PERMISSION_GROUPS),
    ...Object.values(DEFAULT_RPC_ERROR_MESSAGES),
  ]

  assert(visibleCopy.length > 100, '正式可见目录必须提供非空业务文案样本')
  assertNoTechnicalLeak(visibleCopy, '正式可见目录不得泄露技术字段或架构术语')
})
