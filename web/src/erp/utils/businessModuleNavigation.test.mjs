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

test('formal business shell: 三个遗留 shell 已收口为 Workflow V1 页面', () => {
  const formalShellModules = getFormalBusinessShellModules()

  assert.deepEqual(formalShellModules, [])
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
    'formal-v1'
  )
  assert.equal(
    getBusinessModule('production-exceptions')?.pageKind,
    'formal-v1'
  )
  assert.equal(getBusinessModule('shipping-release')?.pageKind, 'formal-v1')
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
    false
  )
})

test('workflow business modules: 三页不冒充事实写入', () => {
  const source = readFileSync(
    new URL('../pages/WorkflowBusinessModulePage.jsx', import.meta.url),
    'utf8'
  )
  const routerSource = readFileSync(
    new URL('../router.jsx', import.meta.url),
    'utf8'
  )

  for (const text of [
    '新建放行单',
    '生成生产任务',
    '生成出货放行',
    '导出预览字段',
    '预览导出待接入',
    '预览排程字段',
    '预览异常字段',
    '预览放行字段',
    '加工合同打印',
    'openPrintWorkspaceWindow',
    'PROCESSING_CONTRACT_TEMPLATE_KEY',
  ]) {
    assert.equal(
      source.includes(text),
      false,
      `workflow V1 page should not expose misleading copy: ${text}`
    )
  }

  for (const text of [
    'Workflow V1',
    '不写事实层',
    '新建排程协同',
    '登记异常协同',
    '新建放行协同',
    'createWorkflowTask',
    'listWorkflowTasks',
    'updateWorkflowTaskStatus',
    'urgeWorkflowTask',
    "taskGroup: 'shipment_release'",
    'workflow_page_scope',
    'BusinessListToolbarActions',
    '当前 Workflow V1 只处理协同任务，不导出业务数据。',
    '不会生成生产、库存、出货、财务事实',
  ]) {
    assert.equal(
      source.includes(text),
      true,
      `workflow V1 page should expose real workflow scope: ${text}`
    )
  }

  for (const text of ['不提供批量删除', '当前没有回收站主路径']) {
    assert.equal(
      source.includes(text),
      false,
      `workflow V1 page should not keep placeholder delete/trash copy: ${text}`
    )
  }

  assert.equal(
    routerSource.includes('FormalBusinessModulePage'),
    false,
    'router should not expose the legacy formal shell page'
  )
})
