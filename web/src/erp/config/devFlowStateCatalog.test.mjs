import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  getCustomerPackage,
  listCustomerPackageKeys,
} from '../../../../config/customers/index.mjs'
import { DEV_STATUS_FLOWS_ROUTE } from './devRoutes.mjs'
import {
  DEV_FLOW_STATE_CATALOG,
  DEV_FLOW_STATE_ROUTE,
  buildDevFlowStateCatalog,
  buildDevFlowStateMermaid,
  canDevFlowStateTransition,
  filterDevFlowStateCatalog,
  flowLayers,
  getDevFlowState,
  getDevFlowStateMachine,
  getDevFlowStateTransitions,
  processDefinitions,
} from './devFlowStateCatalog.mjs'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const EXPECTED_FLOW_KEYS = [
  'source.sales_order',
  'source.purchase_order',
  'source.outsourcing_order',
  'source.production_order',
  'source.order_item',
  'master.bom',
  'master.lifecycle',
  'workflow.task',
  'workflow.business_projection',
  'process.instance',
  'process.node',
  'fact.purchase_receipt',
  'fact.purchase_return',
  'fact.purchase_receipt_adjustment',
  'fact.quality_inspection',
  'fact.shipment',
  'fact.production',
  'fact.outsourcing',
  'fact.stock_reservation',
  'fact.finance',
  'fact.inventory_lot',
  'fact.production_wip_batch',
  'fact.production_packaging_confirmation',
  'fact.sales_return',
  'fact.production_exception_decision',
  'fact.production_exception_execution',
  'fact.purchase_rejection_disposition',
  'fact.outsourcing_return_disposition',
  'fact.finance_payment',
  'fact.finance_allocation',
  'fact.finance_credit_note',
  'fact.shipment_finance_release',
  'fact.inventory_operation',
  'control.customer_config_revision',
]

const EXPECTED_LAYER_KEYS = [
  'business',
  'state',
  'workflow',
  'approval',
  'task',
  'exception',
  'notification',
  'automation',
  'fact',
]

const expectedProcessNodes = {
  'sales_order_acceptance/approval_pmc': [
    [
      'submit_sales_order',
      'domain_command',
      '提交销售订单',
      'SalesOrderUsecase.SubmitSalesOrder',
      ['sales_order.submit'],
    ],
    [
      'order_approval',
      'approval',
      '订单审批',
      null,
      ['workflow.task.approve'],
    ],
    [
      'activate_sales_order',
      'domain_command',
      '生效销售订单',
      'SalesOrderUsecase.ActivateSalesOrderForProcessCommand',
      ['workflow.task.approve'],
    ],
    [
      'order_review',
      'human_task',
      '订单评审',
      null,
      ['workflow.task.complete'],
    ],
    ['end', 'end', '结束', null, []],
  ],
  'sales_order_acceptance/approval_engineering_pmc': [
    [
      'submit_sales_order',
      'domain_command',
      '提交销售订单',
      'SalesOrderUsecase.SubmitSalesOrder',
      ['sales_order.submit'],
    ],
    [
      'order_approval',
      'approval',
      '订单审批',
      null,
      ['workflow.task.approve'],
    ],
    [
      'activate_sales_order',
      'domain_command',
      '生效销售订单',
      'SalesOrderUsecase.ActivateSalesOrderForProcessCommand',
      ['workflow.task.approve'],
    ],
    [
      'engineering_data',
      'human_task',
      '工程资料',
      null,
      ['workflow.task.complete'],
    ],
    [
      'order_review',
      'human_task',
      '订单评审',
      null,
      ['workflow.task.complete'],
    ],
    ['end', 'end', '结束', null, []],
  ],
  'material_supply/purchase_order_approval': [
    [
      'submit_purchase_order',
      'domain_command',
      '提交采购订单',
      'PurchaseOrderUsecase.SubmitPurchaseOrderForProcessCommand',
      ['purchase.order.update'],
    ],
    [
      'purchase_order_approval',
      'approval',
      '采购订单审批',
      null,
      ['workflow.task.approve'],
    ],
    [
      'approve_purchase_order',
      'domain_command',
      '批准采购订单',
      'PurchaseOrderUsecase.ApprovePurchaseOrder',
      ['workflow.task.approve'],
    ],
    ['end', 'end', '结束', null, []],
  ],
  'finished_goods_delivery/shipment_finance_approval': [
    [
      'shipment_finance_approval',
      'approval',
      '出货财务审批',
      null,
      ['workflow.task.approve'],
    ],
    [
      'shipment_finance_release',
      'domain_command',
      '记录财务放行',
      'OperationalFactUsecase.RecordShipmentFinanceRelease',
      ['finance.receivable.confirm'],
    ],
    ['end', 'end', '结束', null, []],
  ],
}

function projectProcessNodes(definition) {
  return definition.nodes.map((node) => [
    node.key,
    node.type,
    node.label,
    node.action,
    [...node.permission],
  ])
}

function collectSourceRefs(value) {
  const refs = new Set()
  const seen = new WeakSet()
  const visit = (current) => {
    if (!current || typeof current !== 'object') return
    if (seen.has(current)) return
    seen.add(current)
    if (Array.isArray(current.sourceRefs)) {
      current.sourceRefs.forEach((ref) => refs.add(ref))
    }
    if (Array.isArray(current.evidence)) {
      current.evidence.forEach((item) => refs.add(item.ref))
    }
    Object.values(current).forEach(visit)
  }
  visit(value)
  return [...refs]
}

test('devFlowStateCatalog: route 与只读边界使用唯一真源', () => {
  assert.equal(DEV_FLOW_STATE_ROUTE, DEV_STATUS_FLOWS_ROUTE)
  assert.equal(DEV_FLOW_STATE_CATALOG.route, DEV_STATUS_FLOWS_ROUTE)
  assert.equal(DEV_FLOW_STATE_CATALOG.readOnly, true)
  assert.equal(
    DEV_FLOW_STATE_CATALOG.runtimeAuthority,
    'read_only_observation'
  )
  assert.equal(DEV_FLOW_STATE_CATALOG.allowsActionExecution, false)
  assert.equal(DEV_FLOW_STATE_CATALOG.allowsGenericStatusWrite, false)
  assert.equal(DEV_FLOW_STATE_CATALOG.unknownStatePolicy, 'fail_closed')
  assert.deepEqual(DEV_FLOW_STATE_CATALOG.writeApis, [])
})

test('devFlowStateCatalog: 覆盖清单固定为 34 个当前对象', () => {
  assert.deepEqual(
    DEV_FLOW_STATE_CATALOG.flows.map((flow) => flow.key),
    EXPECTED_FLOW_KEYS
  )
  assert.equal(new Set(EXPECTED_FLOW_KEYS).size, 34)

  for (const flow of DEV_FLOW_STATE_CATALOG.flows) {
    assert.equal(flow.runtimeAuthority, 'backend_domain_contract')
    assert.equal(flow.readOnly, true)
    assert.equal(flow.allowsActionExecution, false)
    assert.equal(flow.allowsGenericStatusWrite, false)
    assert(flow.states.length > 0)
    assert(flow.sourceRefs.length > 0)
    assert(flow.evidence.length > 0)
    assert.equal(typeof flow.terminalPolicy, 'string')

    if (['state_machine', 'runtime'].includes(flow.kind)) {
      assert(flow.initialStates.length > 0)
      assert(flow.transitions.length > 0)
      if (flow.terminalStates.length === 0) {
        assert.match(flow.terminalPolicy, /^none_/u)
      }
    }
    if (['taxonomy', 'projection'].includes(flow.kind)) {
      assert.deepEqual(flow.transitions, [])
    }

    for (const edge of flow.transitions) {
      assert(flow.states.some((item) => item.key === edge.from))
      assert(flow.states.some((item) => item.key === edge.to))
      assert(edge.guard)
      assert(edge.action)
      assert(edge.factBoundary)
      assert(Array.isArray(edge.permission))
      assert.doesNotMatch(edge.action, /(?:set|update|upsert)[._-]?status$/iu)
    }
  }
})

test('devFlowStateCatalog: 高风险新增对象保持精确状态词汇', () => {
  const expectedStates = {
    'fact.production_wip_batch': [
      'PLANNED',
      'SPLIT',
      'IN_PROGRESS',
      'OUTSOURCED',
      'WAITING_QUALITY',
      'ACCEPTED',
      'REJECTED',
      'CANCELLED',
    ],
    'fact.production_packaging_confirmation': ['PENDING', 'CONFIRMED'],
    'fact.sales_return': [
      'DRAFT',
      'APPROVED',
      'RECEIVED',
      'CANCELLED',
    ],
    'fact.production_exception_decision': [
      'SUBMITTED',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ],
    'fact.production_exception_execution': [
      'PENDING',
      'APPLIED',
      'REVERSED',
    ],
    'fact.purchase_rejection_disposition': [
      'DRAFT',
      'POSTED',
      'CANCELLED',
    ],
    'fact.outsourcing_return_disposition': [
      'DRAFT',
      'POSTED',
      'CANCELLED',
    ],
    'fact.finance_payment': ['DRAFT', 'POSTED', 'REVERSED'],
    'fact.finance_allocation': ['POSTED', 'REVERSED'],
    'fact.finance_credit_note': ['POSTED', 'REVERSED'],
    'fact.shipment_finance_release': [
      'PENDING',
      'APPROVED',
      'REJECTED',
    ],
    'fact.inventory_operation': ['DRAFT', 'POSTED', 'CANCELLED'],
    'control.customer_config_revision': [
      'building',
      'published',
      'active',
      'superseded',
    ],
  }
  for (const [key, states] of Object.entries(expectedStates)) {
    assert.deepEqual(
      getDevFlowStateMachine(key).states.map((item) => item.key),
      states
    )
  }

  assert.equal(
    getDevFlowStateMachine('fact.finance_credit_note').kind,
    'taxonomy'
  )
  assert.equal(
    getDevFlowStateMachine('fact.finance_allocation').kind,
    'taxonomy'
  )
  assert.equal(
    getDevFlowStateMachine('fact.shipment_finance_release').kind,
    'taxonomy'
  )
  assert.equal(
    getDevFlowStateMachine('control.customer_config_revision')
      .transitionAuthority,
    'object-specific'
  )
  assert.equal(
    getDevFlowStateMachine('master.bom').terminalPolicy,
    'none_reactivatable'
  )
})

test('devFlowStateCatalog: 状态和边查询对未知输入 fail closed', () => {
  assert.equal(getDevFlowStateMachine('unknown'), null)
  assert.equal(getDevFlowStateMachine(' SOURCE.SALES_ORDER '), null)
  assert.equal(getDevFlowState('source.sales_order', 'DRAFT'), null)
  assert.deepEqual(getDevFlowStateTransitions('unknown'), [])
  assert.deepEqual(
    getDevFlowStateTransitions('source.sales_order', 'DRAFT'),
    []
  )
  assert.equal(
    canDevFlowStateTransition('source.sales_order', 'draft', 'submitted'),
    true
  )
  assert.equal(
    canDevFlowStateTransition('source.sales_order', 'submitted', 'closed'),
    false
  )
  assert.equal(
    canDevFlowStateTransition('unknown', 'draft', 'submitted'),
    false
  )
  assert.equal(buildDevFlowStateMermaid('unknown'), '')
  assert.match(
    buildDevFlowStateMermaid('source.sales_order'),
    /^stateDiagram-v2\n {2}direction LR/u
  )
})

test('devFlowStateCatalog: 九个语义层与 scope 分离', () => {
  assert.deepEqual(
    flowLayers.map((layer) => layer.key),
    EXPECTED_LAYER_KEYS
  )
  assert.equal(DEV_FLOW_STATE_CATALOG.flowLayers, flowLayers)
  for (const layer of flowLayers) {
    assert.equal(layer.readOnly, true)
    assert.equal(layer.runtimeAuthority, 'backend_domain_contract')
    assert.equal(layer.allowsActionExecution, false)
    assert.equal(layer.allowsGenericStatusWrite, false)
    assert(layer.boundary)
    assert(layer.sourceRefs.length > 0)
    assert(layer.evidence.length > 0)
  }
  assert(
    DEV_FLOW_STATE_CATALOG.scopes.some(
      (scope) => scope.key === 'customer_config_control'
    )
  )
})

test('devFlowStateCatalog: Product Core 保持 3 process key / 4 variants', () => {
  assert.equal(processDefinitions.length, 4)
  assert.equal(
    new Set(processDefinitions.map((item) => item.processKey)).size,
    3
  )
  assert.equal(
    DEV_FLOW_STATE_CATALOG.processDefinitions,
    processDefinitions
  )
  assert.deepEqual(
    processDefinitions.map((definition) => definition.key),
    Object.keys(expectedProcessNodes)
  )

  for (const definition of processDefinitions) {
    assert.deepEqual(
      projectProcessNodes(definition),
      expectedProcessNodes[definition.key]
    )
    assert.equal(definition.readOnly, true)
    assert.equal(
      definition.runtimeAuthority,
      'backend_domain_contract'
    )
    assert.equal(definition.allowsActionExecution, false)
    assert.equal(definition.edges.length, definition.nodes.length - 1)
    assert.equal(definition.initial, definition.nodes[0].key)
    assert.equal(
      definition.terminal,
      definition.nodes[definition.nodes.length - 1].key
    )
    for (const node of definition.nodes) {
      assert(node.factBoundary)
      assert(node.sourceRefs.length > 0)
      assert(node.evidence.length > 0)
    }
    for (const edge of definition.edges) {
      assert(edge.factBoundary)
      assert(edge.sourceRefs.length > 0)
      assert(edge.evidence.length > 0)
    }
  }
})

test('devFlowStateCatalog: 客户 overlay 直接派生 registry 且只做预览', () => {
  assert.deepEqual(
    DEV_FLOW_STATE_CATALOG.overlays.map((overlay) => overlay.customerKey),
    listCustomerPackageKeys()
  )
  for (const overlay of DEV_FLOW_STATE_CATALOG.overlays) {
    assert.equal(overlay.definition, getCustomerPackage(overlay.customerKey))
    assert.equal(overlay.previewOnly, true)
    assert.equal(overlay.runtimeAuthority, 'customer_preview_only')
    for (const group of [
      overlay.businessFlows,
      overlay.stateMachines,
      overlay.processPolicies,
    ]) {
      for (const item of group) {
        assert.equal(item.previewOnly, true)
        assert.equal(item.runtimeAuthority, 'customer_preview_only')
        assert.equal(item.allowsActionExecution, false)
      }
    }
    for (const selection of overlay.runtimeProcessSelections) {
      assert.equal(selection.status, 'registered_preview_selection')
      assert.equal(selection.previewOnly, true)
      assert.equal(selection.runtimeAuthority, 'customer_preview_only')
      assert(selection.canonicalProcessDefinition)
      assert.equal(
        selection.canonicalProcessDefinition.processKey,
        selection.processKey
      )
      assert.equal(
        selection.canonicalProcessDefinition.variantKey,
        selection.variantKey
      )
      assert.equal(selection.definition.processKey, selection.processKey)
    }
  }

  const yoyoosun = DEV_FLOW_STATE_CATALOG.overlays.find(
    (overlay) => overlay.customerKey === 'yoyoosun'
  )
  assert(
    yoyoosun.stateMachines.every(
      (item) => item.comparison.status === 'drift'
    )
  )
})

test('devFlowStateCatalog: 未登记流程选择 fail closed', () => {
  const catalog = buildDevFlowStateCatalog({
    customerPackages: [
      {
        sourceRef: 'config/customers/demo/customerPackage.mjs',
        customerPackage: {
          customerKey: 'invalid-preview',
          packageKey: 'invalid-preview-package-v1',
          label: '无效预览',
          status: 'draft',
          businessFlows: [],
          stateMachines: [],
          processPolicies: [],
          runtimeProcessSelections: [
            {
              processKey: 'unknown_process',
              processVersion: 'v1',
              variantKey: 'unknown_variant',
              businessRefType: 'unknown_ref',
            },
          ],
        },
      },
    ],
  })
  const [selection] = catalog.overlays[0].runtimeProcessSelections
  assert.equal(selection.status, 'unknown_process')
  assert.equal(selection.canonicalProcessDefinition, null)
  assert.equal(selection.allowsActionExecution, false)
})

test('devFlowStateCatalog: 所有权限来自当前 RBAC 注册表', () => {
  const rbacSource = readFileSync(
    resolve(repoRoot, 'server/internal/biz/rbac.go'),
    'utf8'
  )
  const permissions = new Set([
    ...DEV_FLOW_STATE_CATALOG.flows.flatMap((flow) =>
      flow.transitions.flatMap((edge) => edge.permission)
    ),
    ...processDefinitions.flatMap((definition) =>
      definition.nodes.flatMap((node) => node.permission)
    ),
  ])
  for (const permission of permissions) {
    assert.match(rbacSource, new RegExp(`"${permission.replaceAll('.', '\\.')}"`))
  }
  assert(!permissions.has('warehouse.inventory.update'))
})

test('devFlowStateCatalog: 所有 sourceRefs 与 evidence 路径真实存在', () => {
  const refs = collectSourceRefs(DEV_FLOW_STATE_CATALOG)
  assert(refs.length > 0)
  for (const ref of refs) {
    assert.equal(
      existsSync(resolve(repoRoot, ref)),
      true,
      `missing source ref: ${ref}`
    )
  }
})

test('devFlowStateCatalog: 搜索和筛选返回新对象且不改原目录', () => {
  const result = filterDevFlowStateCatalog({
    query: '生产异常',
    scopeKeys: ['fact_ledger'],
  })
  assert.deepEqual(
    result.flows.map((flow) => flow.key),
    [
      'fact.production_exception_decision',
      'fact.production_exception_execution',
    ]
  )
  assert.equal(DEV_FLOW_STATE_CATALOG.flows.length, 34)
})
