import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildBusinessModuleQuery,
  parseBusinessModuleQuery,
} from './businessModuleNavigation.mjs'
import {
  businessModuleDefinitions,
  getBusinessModule,
} from '../config/businessModules.mjs'

test('businessModuleNavigation: 单状态钻取使用单值查询参数', () => {
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

test('business modules: 正式入口不再登记预览壳页', () => {
  assert(businessModuleDefinitions.length > 0)
  assert(
    businessModuleDefinitions.every(
      (moduleItem) => moduleItem.pageKind === 'formal-v1'
    )
  )
  assert.equal(
    getBusinessModule('production-scheduling')?.pageKind,
    'formal-v1'
  )
  assert.equal(getBusinessModule('production-orders')?.pageKind, 'formal-v1')
  assert.equal(
    getBusinessModule('production-exceptions')?.pageKind,
    'formal-v1'
  )
  assert.equal(getBusinessModule('shipping-release')?.pageKind, 'formal-v1')
})

test('production-orders module declares WIP route truth without claiming inventory facts', () => {
  const moduleItem = getBusinessModule('production-orders')
  assert.match(moduleItem.description, /布料加工、车缝、手工、包装/u)
  assert.match(moduleItem.description, /WIP/u)
  assert.match(moduleItem.description, /分段质检与包材确认/u)
  assert.match(moduleItem.factSource, /production_wip_batches/u)
  assert.match(moduleItem.factSource, /quality_inspections/u)
  assert.match(moduleItem.boundary, /不等于库存事实/u)
  assert.match(moduleItem.boundary, /只有已过账生产事实/u)
  assert(
    moduleItem.currentScope.some((value) => value.includes('车缝 / 手工逐工序'))
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
  const workflowApiSource = readFileSync(
    new URL('../api/workflowApi.mjs', import.meta.url),
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
    '发起排程协同',
    '登记异常协同',
    '发起放行协同',
    'createWorkflowTask',
  ]) {
    assert.equal(
      source.includes(text),
      false,
      `workflow V1 page should not expose misleading copy: ${text}`
    )
  }

  for (const text of [
    '待办任务',
    '业务处理分开完成',
    'listWorkflowTasks',
    'completeWorkflowTaskAction',
    'blockWorkflowTaskAction',
    'rejectWorkflowTaskAction',
    'resumeWorkflowTaskAction',
    'urgeWorkflowTask',
    "taskGroup: 'shipment_release'",
    "surface_key: 'workflow_business_module'",
    "entry_path: moduleItem?.path || ''",
    'BusinessListToolbarActions',
    '当前页面只用于处理任务，暂不提供业务数据导出。',
    '当前操作只更新任务状态；生产、库存、出货、财务、开票和收付款仍需在对应业务页面完成。',
  ]) {
    assert.equal(
      source.includes(text),
      true,
      `workflow V1 page should expose real workflow scope: ${text}`
    )
  }

  for (const text of [
    'resolveWorkflowTaskSourceEntryPath',
    'selectedTaskSourceEntryPath',
    '查看来源',
  ]) {
    assert.equal(
      source.includes(text),
      false,
      `workflow V1 page should not keep retired source navigation without a visible consumer: ${text}`
    )
  }

  for (const text of [
    'explainWorkflowActionAccess',
    'explain_action_access',
    'explainWorkflowTaskAssignment',
    'explain_task_assignment',
  ]) {
    assert.equal(
      workflowApiSource.includes(text),
      true,
      `workflow API client should expose backend explain contract: ${text}`
    )
  }

  for (const text of ['workflow_page_action', 'workflow_page_scope']) {
    assert.equal(
      source.includes(text),
      false,
      `workflow V1 page should not submit retired payload field: ${text}`
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

test('workflow business modules: 桌面页把唯一任务分组交给服务端查询与响应校验', () => {
  const source = readFileSync(
    new URL('../pages/WorkflowBusinessModulePage.jsx', import.meta.url),
    'utf8'
  )

  assert.equal(source.includes('source_type: moduleKey'), false)
  for (const text of [
    'buildWorkflowBusinessTaskQuery({',
    'taskGroup: config.taskGroup',
    'requireWorkflowBusinessTaskPage(data, {',
  ]) {
    assert.equal(
      source.includes(text),
      true,
      `workflow desktop page should preserve the server task-group contract: ${text}`
    )
  }
})

test('business list toolbar: 不提供通用删除和回收站壳能力', () => {
  const source = readFileSync(
    new URL(
      '../components/business-list/BusinessListToolbarActions.jsx',
      import.meta.url
    ),
    'utf8'
  )

  for (const text of [
    '批量删除',
    '回收站',
    'DeleteOutlined',
    'InboxOutlined',
  ]) {
    assert.equal(
      source.includes(text),
      false,
      `shared business list toolbar should not expose generic delete/trash: ${text}`
    )
  }

  for (const text of ['导出筛选结果', '列顺序']) {
    assert.equal(
      source.includes(text),
      true,
      `shared business list toolbar should keep supported action: ${text}`
    )
  }
})

test('print template business entries: 工程资料和委外打印入口归属正确页面', () => {
  const bomPageSource = readFileSync(
    new URL('../pages/BOMVersionsPage.jsx', import.meta.url),
    'utf8'
  )
  const outsourcingPageSource = readFileSync(
    new URL('../pages/V1OutsourcingOrdersPage.jsx', import.meta.url),
    'utf8'
  )

  for (const text of [
    'MATERIAL_DETAIL_TEMPLATE_KEY',
    'COLOR_CARD_TEMPLATE_KEY',
    'WORK_INSTRUCTION_TEMPLATE_KEY',
    'buildWorkInstructionDraftFromBOMVersion',
    '打印作业指导书',
  ]) {
    assert.equal(
      bomPageSource.includes(text),
      true,
      `BOM page should own engineering print entry: ${text}`
    )
  }

  assert.equal(
    outsourcingPageSource.includes('PROCESSING_CONTRACT_TEMPLATE_KEY'),
    true
  )
  assert.equal(outsourcingPageSource.includes('加工合同打印'), true)

  for (const text of [
    'WORK_INSTRUCTION_TEMPLATE_KEY',
    'buildWorkInstructionDraftFromOutsourcingOrder',
    '作业指导书打印',
  ]) {
    assert.equal(
      outsourcingPageSource.includes(text),
      true,
      `outsourcing page should expose work instruction print entry: ${text}`
    )
  }
})

test('business delete governance: 删除必须走引用检查和业务生命周期替代', () => {
  const agentsSource = readFileSync(
    new URL('../../../../AGENTS.md', import.meta.url),
    'utf8'
  )
  const currentTruthSource = readFileSync(
    new URL('../../../../docs/当前真源与交接顺序.md', import.meta.url),
    'utf8'
  )
  const lifecycleUiPolicySource = readFileSync(
    new URL(
      '../../../../docs/product/业务数据生命周期与页面动作规则.md',
      import.meta.url
    ),
    'utf8'
  )

  for (const text of [
    '只有后端 usecase、RBAC、审计、引用检查和测试闭环后才允许删除/恢复',
    '主数据默认启用/停用',
    'Source Document 取消/关闭/归档',
    'Fact/Ledger 取消、冲正、调整或只读',
    '归档不是回收站',
    '已生效、过账或被引用对象不得物理删除',
  ]) {
    assert.equal(
      agentsSource.includes(text),
      true,
      `AGENTS should keep delete lifecycle governance: ${text}`
    )
  }

  for (const text of [
    '检查状态和引用关系',
    '允许删除的草稿 / 误建记录',
    '返回可读原因',
    '筛选、状态过滤或归档视图',
    '管理员级数据修复 / 合并 / 迁移专项',
    '归档记录不进入回收站',
    '已归档',
    '不使用“回收站 / 还原删除”语义',
    '当前业务模块不提供通用回收站',
  ]) {
    assert.equal(
      currentTruthSource.includes(text),
      true,
      `current truth should keep delete lifecycle boundary: ${text}`
    )
  }

  for (const text of [
    '当前业务页面不提供通用删除、批量删除、回收站或还原删除入口',
    'MasterData 主数据',
    'Source Document 源单据',
    'Fact / Ledger 事实与台账',
    'Workflow 协同任务',
    '尚未满足条件时，直接不展示删除 / 回收站入口',
  ]) {
    assert.equal(
      lifecycleUiPolicySource.includes(text),
      true,
      `lifecycle UI policy should keep page action boundary: ${text}`
    )
  }
})
