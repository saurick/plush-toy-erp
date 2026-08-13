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
  DEV_FLOW_PATH_KINDS,
  DEV_FLOW_PATH_KIND_REGISTRY,
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
import {
  collectObservedSchemaStatusOwners,
  readCanonicalProcessContractCatalog,
  readCanonicalSchemaStatusOwners,
  readCanonicalStatusContract,
} from '../../../../scripts/qa/dev-flow-state-canonical-contract.mjs'

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
  'source.production_exception_decision',
  'source.production_exception_execution',
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
    ['order_approval', 'approval', '订单审批', null, ['workflow.task.approve']],
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
    [
      'reject_sales_order',
      'domain_command',
      '驳回销售订单',
      'SalesOrderUsecase.RejectSalesOrderForProcessCommand',
      ['workflow.task.reject'],
    ],
    ['sales_order_rejected_end', 'end', '销售订单审批驳回结束', null, []],
  ],
  'sales_order_acceptance/approval_engineering_pmc': [
    [
      'submit_sales_order',
      'domain_command',
      '提交销售订单',
      'SalesOrderUsecase.SubmitSalesOrder',
      ['sales_order.submit'],
    ],
    ['order_approval', 'approval', '订单审批', null, ['workflow.task.approve']],
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
    [
      'reject_sales_order',
      'domain_command',
      '驳回销售订单',
      'SalesOrderUsecase.RejectSalesOrderForProcessCommand',
      ['workflow.task.reject'],
    ],
    ['sales_order_rejected_end', 'end', '销售订单审批驳回结束', null, []],
  ],
  'material_supply/purchase_order_approval': [
    [
      'submit_purchase_order',
      'domain_command',
      '提交采购订单',
      'PurchaseOrderUsecase.SubmitPurchaseOrderForProcessCommand',
      ['purchase.order.submit'],
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
    [
      'reject_purchase_order',
      'domain_command',
      '驳回采购订单',
      'PurchaseOrderUsecase.RejectPurchaseOrderForProcessCommand',
      ['workflow.task.reject'],
    ],
    ['purchase_order_rejected_end', 'end', '采购订单审批驳回结束', null, []],
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
    [
      'shipment_finance_reject',
      'domain_command',
      '记录财务驳回',
      'OperationalFactUsecase.RecordShipmentFinanceRejection',
      ['workflow.task.reject'],
    ],
    ['shipment_finance_rejected_end', 'end', '出货财务驳回结束', null, []],
  ],
  'finance_payment_approval/approval_post': [
    [
      'finance_payment_approval',
      'approval',
      '收付款审批',
      null,
      ['finance.payment.approve'],
    ],
    [
      'approve_finance_payment',
      'domain_command',
      '批准收付款',
      'OperationalFactUsecase.ApproveFinancePaymentForProcessCommand',
      ['workflow.task.approve'],
    ],
    [
      'finance_payment_execution',
      'human_task',
      '收付款执行',
      null,
      ['workflow.task.complete'],
    ],
    [
      'post_finance_payment',
      'domain_command',
      '过账并核销收付款',
      'OperationalFactUsecase.PostFinancePaymentForProcessCommand',
      ['finance.payment.post'],
    ],
    ['end', 'end', '结束', null, []],
    [
      'reject_finance_payment',
      'domain_command',
      '驳回收付款',
      'OperationalFactUsecase.RejectFinancePaymentForProcessCommand',
      ['workflow.task.reject'],
    ],
    ['rejected_end', 'end', '驳回结束', null, []],
  ],
  'inventory_adjustment_approval/manual_adjustment_approval': [
    [
      'submit_inventory_adjustment',
      'domain_command',
      '提交人工库存调整',
      'InventoryUsecase.SubmitInventoryOperationForProcessCommand',
      ['warehouse.adjustment.create'],
    ],
    [
      'inventory_adjustment_approval',
      'approval',
      '人工库存调整审批',
      null,
      ['warehouse.adjustment.approve'],
    ],
    [
      'approve_inventory_adjustment',
      'domain_command',
      '批准人工库存调整',
      'InventoryUsecase.ApproveInventoryOperationForProcessCommand',
      ['workflow.task.approve'],
    ],
    [
      'inventory_adjustment_execution',
      'human_task',
      '人工库存调整执行',
      null,
      ['workflow.task.complete'],
    ],
    [
      'post_inventory_adjustment',
      'domain_command',
      '过账人工库存调整',
      'InventoryUsecase.PostInventoryOperationForProcessCommand',
      ['warehouse.adjustment.create'],
    ],
    ['end', 'end', '结束', null, []],
    [
      'reject_inventory_adjustment',
      'domain_command',
      '驳回人工库存调整',
      'InventoryUsecase.RejectInventoryOperationForProcessCommand',
      ['workflow.task.reject'],
    ],
    ['rejected_end', 'end', '驳回结束', null, []],
  ],
  'production_exception_approval/exception_decision_approval': [
    [
      'production_exception_decision_approval',
      'approval',
      '生产异常决策审批',
      null,
      ['production.exception.approve'],
    ],
    [
      'approve_production_exception',
      'domain_command',
      '批准生产异常决策',
      'OperationalFactUsecase.ApproveProductionExceptionForProcessCommand',
      ['workflow.task.approve'],
    ],
    [
      'production_exception_execution',
      'human_task',
      '报废或在制让步执行',
      null,
      ['workflow.task.complete'],
    ],
    [
      'execute_production_exception',
      'domain_command',
      '执行生产异常处置',
      'OperationalFactUsecase.ExecuteProductionExceptionForProcessCommand',
      ['production.fact.post'],
    ],
    ['end', 'end', '处置执行结束', null, []],
    [
      'reject_production_exception',
      'domain_command',
      '驳回生产异常决策',
      'OperationalFactUsecase.RejectProductionExceptionForProcessCommand',
      ['workflow.task.reject'],
    ],
    ['rejected_end', 'end', '拒绝结束', null, []],
    ['over_issue_end', 'end', '超领额度批准结束', null, []],
  ],
}

const expectedProcessEdges = {
  'sales_order_acceptance/approval_pmc': [
    ['submit_sales_order', 'order_approval'],
    ['order_approval', 'activate_sales_order'],
    ['order_approval', 'reject_sales_order'],
    ['activate_sales_order', 'order_review'],
    ['order_review', 'end'],
    ['reject_sales_order', 'sales_order_rejected_end'],
  ],
  'sales_order_acceptance/approval_engineering_pmc': [
    ['submit_sales_order', 'order_approval'],
    ['order_approval', 'activate_sales_order'],
    ['order_approval', 'reject_sales_order'],
    ['activate_sales_order', 'engineering_data'],
    ['engineering_data', 'order_review'],
    ['order_review', 'end'],
    ['reject_sales_order', 'sales_order_rejected_end'],
  ],
  'material_supply/purchase_order_approval': [
    ['submit_purchase_order', 'purchase_order_approval'],
    ['purchase_order_approval', 'approve_purchase_order'],
    ['purchase_order_approval', 'reject_purchase_order'],
    ['approve_purchase_order', 'end'],
    ['reject_purchase_order', 'purchase_order_rejected_end'],
  ],
  'finished_goods_delivery/shipment_finance_approval': [
    ['shipment_finance_approval', 'shipment_finance_release'],
    ['shipment_finance_approval', 'shipment_finance_reject'],
    ['shipment_finance_release', 'end'],
    ['shipment_finance_reject', 'shipment_finance_rejected_end'],
  ],
  'finance_payment_approval/approval_post': [
    ['finance_payment_approval', 'approve_finance_payment'],
    ['finance_payment_approval', 'reject_finance_payment'],
    ['approve_finance_payment', 'finance_payment_execution'],
    ['finance_payment_execution', 'post_finance_payment'],
    ['post_finance_payment', 'end'],
    ['reject_finance_payment', 'rejected_end'],
  ],
  'inventory_adjustment_approval/manual_adjustment_approval': [
    ['submit_inventory_adjustment', 'inventory_adjustment_approval'],
    ['inventory_adjustment_approval', 'approve_inventory_adjustment'],
    ['inventory_adjustment_approval', 'reject_inventory_adjustment'],
    ['approve_inventory_adjustment', 'inventory_adjustment_execution'],
    ['inventory_adjustment_execution', 'post_inventory_adjustment'],
    ['post_inventory_adjustment', 'end'],
    ['reject_inventory_adjustment', 'rejected_end'],
  ],
  'production_exception_approval/exception_decision_approval': [
    ['production_exception_decision_approval', 'approve_production_exception'],
    ['production_exception_decision_approval', 'reject_production_exception'],
    ['approve_production_exception', 'production_exception_execution'],
    ['approve_production_exception', 'over_issue_end'],
    ['production_exception_execution', 'execute_production_exception'],
    ['execute_production_exception', 'end'],
    ['reject_production_exception', 'rejected_end'],
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

function projectProcessEdges(definition) {
  return definition.edges.map((edge) => [edge.from, edge.to])
}

function projectCatalogProcessEdges(definition) {
  return definition.edges.map((edge) => [
    edge.from,
    edge.to,
    edge.branchPolicy || null,
  ])
}

function projectCanonicalProcessNodes(definition) {
  return definition.nodes.map((node) => [
    node.node_key,
    node.node_type,
    node.owner_pool_key || null,
    node.policy_snapshot?.handler || null,
    node.required_capability_key ? [node.required_capability_key] : [],
  ])
}

function projectCatalogProcessNodes(definition) {
  return definition.nodes.map((node) => [
    node.key,
    node.type,
    node.ownerPool,
    node.action,
    [...node.permission],
  ])
}

function deriveCanonicalProcessEdges(definition, branchTargets) {
  const edges = []
  for (const [index, node] of definition.nodes.entries()) {
    const branchPolicy = node.policy_snapshot?.branch_policy_key || null
    if (branchPolicy) {
      const targets = branchTargets[branchPolicy]
      assert(Array.isArray(targets), `missing branch targets: ${branchPolicy}`)
      for (const target of targets) {
        edges.push([node.node_key, target, branchPolicy])
      }
      continue
    }
    if (node.node_type === 'end') continue
    const next = definition.nodes[index + 1]
    assert(next, `missing next node after ${node.node_key}`)
    edges.push([node.node_key, next.node_key, null])
  }
  return edges
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
  assert.equal(DEV_FLOW_STATE_CATALOG.runtimeAuthority, 'read_only_observation')
  assert.equal(DEV_FLOW_STATE_CATALOG.allowsActionExecution, false)
  assert.equal(DEV_FLOW_STATE_CATALOG.allowsGenericStatusWrite, false)
  assert.equal(DEV_FLOW_STATE_CATALOG.unknownStatePolicy, 'fail_closed')
  assert.deepEqual(DEV_FLOW_STATE_CATALOG.writeApis, [])
  assert.equal(DEV_FLOW_STATE_CATALOG.businessChainOverview.key, 'all')
  assert.equal(DEV_FLOW_STATE_CATALOG.businessChainOverview.readOnly, true)
  assert.equal(
    DEV_FLOW_STATE_CATALOG.businessChainOverview.runtimeAuthority,
    'design_projection_only'
  )
  assert.equal(
    DEV_FLOW_STATE_CATALOG.businessChainCoverage.overviewComplete,
    true
  )
})

test('devFlowStateCatalog: 覆盖清单固定为 33 个当前对象', () => {
  assert.deepEqual(
    DEV_FLOW_STATE_CATALOG.flows.map((flow) => flow.key),
    EXPECTED_FLOW_KEYS
  )
  assert.equal(new Set(EXPECTED_FLOW_KEYS).size, 33)

  for (const flow of DEV_FLOW_STATE_CATALOG.flows) {
    assert.equal(flow.runtimeAuthority, 'backend_domain_contract')
    assert.equal(flow.readOnly, true)
    assert.equal(flow.allowsActionExecution, false)
    assert.equal(flow.allowsGenericStatusWrite, false)
    assert(flow.states.length > 0)
    assert(flow.contractRef)
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

test('devFlowStateCatalog: 33 个状态集合与后端 canonical contract 全等', () => {
  for (const flow of DEV_FLOW_STATE_CATALOG.flows) {
    assert.deepEqual(
      flow.states.map((item) => item.key),
      readCanonicalStatusContract(repoRoot, flow.contractRef),
      `${flow.key} status contract drift`
    )
  }
})

test('devFlowStateCatalog: 持久化状态所有者与观察台显式映射全等', () => {
  const canonicalOwners = readCanonicalSchemaStatusOwners(repoRoot)
  const observedOwners = collectObservedSchemaStatusOwners(
    DEV_FLOW_STATE_CATALOG.flows
  )
  assert.deepEqual(
    observedOwners.map(({ path, field }) => ({ path, field })),
    canonicalOwners
  )

  const duplicateRef = canonicalOwners[0]
  assert.throws(
    () =>
      collectObservedSchemaStatusOwners([
        { key: 'first', schemaStatusRefs: [duplicateRef] },
        { key: 'second', schemaStatusRefs: [duplicateRef] },
      ]),
    /is mapped by both first and second/u
  )
})

test('devFlowStateCatalog: 高风险对象登记完整决策、过账、取消与冲正边', () => {
  assert.deepEqual(
    getDevFlowStateMachine('fact.finance_payment').transitions.map(
      (item) => item.key
    ),
    [
      'DRAFT->APPROVED',
      'DRAFT->REJECTED',
      'APPROVED->POSTED',
      'DRAFT->CANCELLED',
      'APPROVED->CANCELLED',
      'POSTED->REVERSED',
    ]
  )
  assert.deepEqual(
    getDevFlowStateMachine('fact.finance').transitions.map((item) => item.key),
    ['DRAFT->POSTED', 'POSTED->SETTLED', 'SETTLED->POSTED', 'POSTED->CANCELLED']
  )
  assert.deepEqual(getDevFlowStateMachine('fact.finance').terminalStates, [
    'CANCELLED',
  ])
  assert.deepEqual(
    getDevFlowStateMachine('fact.inventory_operation').transitions.map(
      (item) => item.key
    ),
    [
      'DRAFT->SUBMITTED',
      'SUBMITTED->APPROVED',
      'SUBMITTED->REJECTED',
      'DRAFT->POSTED',
      'APPROVED->POSTED',
      'DRAFT->CANCELLED',
      'SUBMITTED->CANCELLED',
      'APPROVED->CANCELLED',
      'POSTED->CANCELLED',
    ]
  )
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

test('devFlowStateCatalog: pathKinds 仅来自受限 registry 且无孤儿边', () => {
  assert.deepEqual(DEV_FLOW_PATH_KINDS, [
    'blocked',
    'rejected',
    'cancelled',
    'reversed',
    'adjusted',
    'returned',
    'rework',
    'resumed',
    'reopened',
  ])
  const observedRegistry = {}
  for (const flow of DEV_FLOW_STATE_CATALOG.flows) {
    for (const edge of flow.transitions) {
      for (const pathKind of edge.pathKinds) {
        assert(DEV_FLOW_PATH_KINDS.includes(pathKind))
      }
      if (edge.pathKinds.length === 0) continue
      assert(edge.permission.length > 0)
      assert(edge.guard)
      assert(edge.action)
      assert(edge.factBoundary)
      observedRegistry[`${flow.key}:${edge.key}`] = {
        pathKinds: [...edge.pathKinds],
        pathKindWhen: edge.pathKindWhen,
      }
    }
  }
  assert.deepEqual(
    observedRegistry,
    Object.fromEntries(
      Object.entries(DEV_FLOW_PATH_KIND_REGISTRY).map(([key, value]) => [
        key,
        {
          pathKinds: [...value.pathKinds],
          pathKindWhen: value.pathKindWhen,
        },
      ])
    )
  )
})

test('canonical status contract reader: 未知 kind 与缺失 constraint fail closed', () => {
  assert.throws(
    () =>
      readCanonicalStatusContract(repoRoot, {
        kind: 'unknown',
        path: 'server/internal/data/model/schema/shipment.go',
      }),
    /unsupported canonical status contract kind/u
  )
  assert.throws(
    () =>
      readCanonicalStatusContract(repoRoot, {
        kind: 'ent_check',
        path: 'server/internal/data/model/schema/shipment.go',
        constraint: 'missing_constraint',
        field: 'status',
      }),
    /canonical constraint missing_constraint is missing/u
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

test('devFlowStateCatalog: Process variant、节点、命令与分支边精确对照后端 registry', () => {
  const canonicalCatalog = readCanonicalProcessContractCatalog(repoRoot)
  const canonicalByKey = new Map(
    canonicalCatalog.processDefinitions.map((definition) => [
      `${definition.process_key}/${definition.variant_key}`,
      definition,
    ])
  )
  assert.equal(canonicalByKey.size, 7)
  assert.deepEqual(
    processDefinitions.map((definition) => definition.key),
    [...canonicalByKey.keys()]
  )

  for (const definition of processDefinitions) {
    const canonical = canonicalByKey.get(definition.key)
    assert(canonical, `missing canonical process definition: ${definition.key}`)
    assert.equal(definition.processKey, canonical.process_key)
    assert.equal(definition.processVersion, canonical.process_version)
    assert.equal(definition.variantKey, canonical.variant_key)
    assert.equal(definition.businessRefType, canonical.business_ref_type)
    assert.deepEqual(
      projectCatalogProcessNodes(definition),
      projectCanonicalProcessNodes(canonical),
      `${definition.key} node contract drift`
    )
    assert.deepEqual(
      projectCatalogProcessEdges(definition),
      deriveCanonicalProcessEdges(canonical, canonicalCatalog.branchTargets),
      `${definition.key} edge contract drift`
    )
  }
})

test('devFlowStateCatalog: Product Core 保持 6 process key / 7 variants', () => {
  assert.equal(processDefinitions.length, 7)
  assert.equal(
    new Set(processDefinitions.map((item) => item.processKey)).size,
    6
  )
  assert.equal(DEV_FLOW_STATE_CATALOG.processDefinitions, processDefinitions)
  assert.deepEqual(
    processDefinitions.map((definition) => definition.key),
    Object.keys(expectedProcessNodes)
  )

  for (const definition of processDefinitions) {
    assert.deepEqual(
      projectProcessNodes(definition),
      expectedProcessNodes[definition.key]
    )
    assert.deepEqual(
      projectProcessEdges(definition),
      expectedProcessEdges[definition.key]
    )
    assert.equal(definition.readOnly, true)
    assert.equal(definition.runtimeAuthority, 'backend_domain_contract')
    assert.equal(definition.allowsActionExecution, false)
    assert.equal(definition.initial, definition.nodes[0].key)
    assert(
      definition.nodes.some(
        (node) => node.key === definition.terminal && node.type === 'end'
      )
    )
    const reachable = new Set([definition.initial])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of definition.edges) {
        if (reachable.has(edge.from) && !reachable.has(edge.to)) {
          reachable.add(edge.to)
          changed = true
        }
      }
    }
    assert.equal(reachable.size, definition.nodes.length)
    for (const node of definition.nodes) {
      assert(node.factBoundary)
      assert(node.sourceRefs.length > 0)
      assert(node.evidence.length > 0)
      if (node.type === 'end') {
        assert.equal(
          definition.edges.some((edge) => edge.from === node.key),
          false
        )
      }
    }
    for (const edge of definition.edges) {
      assert(edge.factBoundary)
      assert(edge.sourceRefs.length > 0)
      assert(edge.evidence.length > 0)
    }
  }
})

test('devFlowStateCatalog: Fact / Ledger 定义与状态对象一一对应且不伪造运行查询', () => {
  const factMachines = DEV_FLOW_STATE_CATALOG.flows.filter(
    (flow) => flow.scopeKey === 'fact_ledger'
  )
  assert.equal(DEV_FLOW_STATE_CATALOG.factLedgerCoverage.complete, true)
  assert.deepEqual(
    DEV_FLOW_STATE_CATALOG.factDefinitionGroups.map((group) => group.label),
    ['采购与质量', '生产与库存', '委外与返工', '出货与财务']
  )
  assert.equal(
    DEV_FLOW_STATE_CATALOG.factDefinitions.length,
    factMachines.length
  )
  assert.equal(DEV_FLOW_STATE_CATALOG.factDefinitions.length, 19)
  assert.deepEqual(
    new Set(DEV_FLOW_STATE_CATALOG.factDefinitions.map((item) => item.factKey)),
    new Set(factMachines.map((item) => item.key))
  )
  assert.equal(
    DEV_FLOW_STATE_CATALOG.factRuntimeQuery.availability,
    'unavailable'
  )
  assert.match(
    DEV_FLOW_STATE_CATALOG.factRuntimeQuery.label,
    /未提供运行凭证查询/u
  )
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
    yoyoosun.stateMachines.every((item) => item.comparison.status === 'drift')
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
    assert.match(
      rbacSource,
      new RegExp(`"${permission.replaceAll('.', '\\.')}"`)
    )
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
  assert.deepEqual(result.flows, [])
  assert.deepEqual(
    filterDevFlowStateCatalog({
      query: '生产异常',
      scopeKeys: ['source_document'],
    }).flows.map((flow) => flow.key),
    [
      'source.production_exception_decision',
      'source.production_exception_execution',
    ]
  )
  assert.equal(
    DEV_FLOW_STATE_CATALOG.flows.find(
      (flow) => flow.key === 'source.production_exception_decision'
    )?.scopeKey,
    'source_document'
  )
  assert.equal(DEV_FLOW_STATE_CATALOG.flows.length, 33)
})

test('devFlowStateCatalog: 生产异常决策与执行状态属于同一来源单据且三类路径明确', () => {
  const decision = DEV_FLOW_STATE_CATALOG.flows.find(
    (flow) => flow.key === 'source.production_exception_decision'
  )
  const execution = DEV_FLOW_STATE_CATALOG.flows.find(
    (flow) => flow.key === 'source.production_exception_execution'
  )
  const process = processDefinitions.find(
    (definition) =>
      definition.key ===
      'production_exception_approval/exception_decision_approval'
  )

  assert.equal(decision.scopeKey, 'source_document')
  assert.equal(execution.scopeKey, 'source_document')
  assert.deepEqual(
    decision.transitions.map((item) => [
      item.from,
      item.to,
      item.action,
      [...item.permission],
    ]),
    [
      [
        'SUBMITTED',
        'APPROVED',
        'OperationalFactUsecase.ApproveProductionExceptionForProcessCommand',
        ['production.exception.approve', 'workflow.task.approve'],
      ],
      [
        'SUBMITTED',
        'REJECTED',
        'OperationalFactUsecase.RejectProductionExceptionForProcessCommand',
        ['production.exception.approve', 'workflow.task.reject'],
      ],
      [
        'SUBMITTED',
        'CANCELLED',
        'cancel_production_exception',
        ['production.exception.submit'],
      ],
    ]
  )
  assert.deepEqual(
    execution.transitions.map((item) => [
      item.from,
      item.to,
      item.action,
      [...item.pathKinds],
    ]),
    [
      [
        'PENDING',
        'APPLIED',
        'OperationalFactUsecase.ExecuteProductionExceptionForProcessCommand',
        [],
      ],
      ['PENDING', 'REVERSED', 'reverse_production_exception', ['reversed']],
      ['APPLIED', 'REVERSED', 'reverse_production_exception', ['reversed']],
    ]
  )
  assert.deepEqual(
    process.edges
      .filter((edge) => edge.branchPolicy)
      .map((edge) => edge.branchLabel),
    ['批准', '拒绝', '报废或在制让步', '超领额度']
  )
})
