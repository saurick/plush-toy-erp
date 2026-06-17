import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBusinessModuleQuery,
  parseBusinessModuleQuery,
} from './businessModuleNavigation.mjs'
import {
  getBusinessModule,
  getFormalBusinessShellModules,
  getFormalShellFormFieldLabels,
} from '../config/businessModules.mjs'

test('businessModuleNavigation: 单状态钻取使用兼容查询参数', () => {
  const query = buildBusinessModuleQuery({
    businessStatusKeys: ['project_pending'],
  })

  assert.equal(query, 'business_status_key=project_pending')
  assert.deepEqual(parseBusinessModuleQuery(query).businessStatusKeys, [
    'project_pending',
  ])
})

test('businessModuleNavigation: 多状态钻取收口为业务页筛选参数', () => {
  const query = buildBusinessModuleQuery({
    businessStatusKeys: [
      'material_preparing',
      'production_ready',
      'material_preparing',
      'invalid-status',
    ],
  })

  assert.equal(
    query,
    'business_status_keys=material_preparing%2Cproduction_ready'
  )
  assert.deepEqual(parseBusinessModuleQuery(query).businessStatusKeys, [
    'material_preparing',
    'production_ready',
  ])
})

test('formal business shell: 表单字段按产品核心模块区分', () => {
  const formalShellModules = getFormalBusinessShellModules()

  assert.ok(formalShellModules.length > 0)
  for (const moduleItem of formalShellModules) {
    assert.ok(
      getFormalShellFormFieldLabels(moduleItem.key).length >= 6,
      `${moduleItem.key} should declare product-core fields`
    )
  }

  assert.deepEqual(
    getFormalShellFormFieldLabels('production-scheduling').slice(0, 4),
    ['销售订单', '产品 / BOM', '排程日期', '生产负责人']
  )
  assert.equal(getBusinessModule('materials')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('material-bom')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('processes')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('accessories-purchase')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('inventory')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('processing-contracts')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('production-progress')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('outbound')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('receivables')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('payables')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('invoices')?.pageKind, 'formal-v1')
  assert.equal(getBusinessModule('reconciliation')?.pageKind, 'formal-v1')
  assert.equal(
    getBusinessModule('production-scheduling')?.pageKind,
    'formal-shell'
  )
  assert.equal(
    getBusinessModule('production-exceptions')?.pageKind,
    'formal-shell'
  )
  assert.equal(getBusinessModule('shipping-release')?.pageKind, 'formal-shell')
  assert.equal(
    formalShellModules.some((item) => item.key === 'accessories-purchase'),
    false
  )
  assert.equal(
    formalShellModules.some((item) => item.key === 'processing-contracts'),
    false
  )
  assert.equal(
    formalShellModules.some((item) => item.key === 'receivables'),
    false
  )
  assert.equal(
    formalShellModules.some((item) => item.key === 'production-scheduling'),
    true
  )
  assert.deepEqual(getFormalShellFormFieldLabels('materials'), [])
  assert.deepEqual(getFormalShellFormFieldLabels('material-bom'), [])
  assert.deepEqual(getFormalShellFormFieldLabels('processes'), [])
  assert.deepEqual(getFormalShellFormFieldLabels('accessories-purchase'), [])
  assert.deepEqual(getFormalShellFormFieldLabels('inventory'), [])
  assert.deepEqual(getFormalShellFormFieldLabels('receivables'), [])
  assert.deepEqual(getFormalShellFormFieldLabels('outbound'), [])
})
