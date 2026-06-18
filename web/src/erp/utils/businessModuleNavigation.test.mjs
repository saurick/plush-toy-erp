import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  assert.deepEqual(
    formalShellModules.map((item) => item.key),
    ['production-scheduling', 'production-exceptions', 'shipping-release']
  )
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

test('formal business shell: 预览页文案不冒充真实业务写入', () => {
  const source = readFileSync(
    new URL('../pages/FormalBusinessModulePage.jsx', import.meta.url),
    'utf8'
  )

  for (const text of [
    '新建排程',
    '新建异常',
    '新建放行单',
    '生成生产任务',
    '生成出货放行',
    '导出当前结果',
    '导出预览字段',
    '关联单据',
    '状态变更',
    '业务编号',
    '业务对象',
    '批量删除',
    '回收站',
    '加工合同打印',
    'openPrintWorkspaceWindow',
    'PROCESSING_CONTRACT_TEMPLATE_KEY',
  ]) {
    assert.equal(
      source.includes(text),
      false,
      `formal shell page should not expose misleading copy: ${text}`
    )
  }

  for (const text of [
    '预览排程字段',
    '预览异常字段',
    '预览放行字段',
    '查看排程接入边界',
    '预览导出待接入',
    '真实保存待接入',
    '当前页面仍是待接入预览页',
    'listWorkflowTasks',
    'updateWorkflowTaskStatus',
    'urgeWorkflowTask',
    'SHIPPING_RELEASE_MODULE_KEY',
    'source_type: SHIPPING_RELEASE_MODULE_KEY',
    '出货放行协同任务已刷新',
    'shipment_release_page_scope',
  ]) {
    assert.equal(
      source.includes(text),
      true,
      `formal shell page should expose preview/boundary copy: ${text}`
    )
  }

  assert.equal(
    source.includes('暂无远端数据刷新'),
    true,
    'formal shell page should explain that global refresh has no remote data source'
  )
  assert.equal(
    source.includes('return false'),
    true,
    'formal shell refresh handler should not let the app shell show a fake refresh success'
  )
})
