import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BUSINESS_FLOW_TYPES,
  BUSINESS_PAGE_AVAILABILITY,
  BUSINESS_PAGE_ROLES,
  WORKFLOW_TASK_PRODUCER_STATUS,
  businessPageFlowDefinitions,
  businessPageLineageDefinitions,
  getBusinessPageLineage,
} from './businessPageLineage.mjs'
import { businessModuleDefinitions } from './businessModules.mjs'

const formalModuleKeys = businessModuleDefinitions
  .filter((moduleItem) => moduleItem.pageKind === 'formal-v1')
  .map((moduleItem) => moduleItem.key)

function serviceMethodActions(relativePaths) {
  const actions = new Set()
  const casePattern = /case\s+((?:"[a-z][a-z0-9_]+"\s*,?\s*)+):/gu
  for (const relativePath of relativePaths) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    for (const match of source.matchAll(casePattern)) {
      for (const actionMatch of match[1].matchAll(
        /"([a-z][a-z0-9_]+)"/gu
      )) {
        actions.add(actionMatch[1])
      }
    }
  }
  return actions
}

function apiMethodActions(relativePaths) {
  const actions = new Set()
  const callPatterns = [
    /\.call\(\s*['"]([a-z][a-z0-9_]+)['"]/gu,
    /aggregateMutation\(\s*['"]([a-z][a-z0-9_]+)['"]/gu,
    /\baction\(\s*['"]([a-z][a-z0-9_]+)['"]/gu,
  ]
  for (const relativePath of relativePaths) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    for (const pattern of callPatterns) {
      for (const match of source.matchAll(pattern)) actions.add(match[1])
    }
  }
  return actions
}

const NON_LINEAGE_READ_ACTIONS = Object.freeze([
  // These methods only read the owning page or a raw fact list. Source-specific
  // candidate/projection reads are intentionally not allowed in this list.
  'get_bom_version',
  'get_customer',
  'get_material',
  'get_outsourcing_order',
  'get_process',
  'get_product',
  'get_product_sku',
  'get_production_order',
  'get_production_wip',
  'get_purchase_order',
  'get_purchase_receipt',
  'get_purchase_receipt_adjustment',
  'get_purchase_return',
  'get_quality_inspection',
  'get_sales_order',
  'get_shipment',
  'get_supplier',
  'list_bom_versions',
  'list_contacts_by_owner',
  'list_customers',
  'list_finance_facts',
  'list_materials',
  'list_outsourcing_facts',
  'list_outsourcing_order_items',
  'list_outsourcing_orders',
  'list_processes',
  'list_product_skus',
  'list_production_facts',
  'list_production_orders',
  'list_products',
  'list_purchase_order_items',
  'list_purchase_orders',
  'list_purchase_receipt_adjustments',
  'list_purchase_receipts',
  'list_purchase_returns',
  'list_quality_inspections',
  'list_sales_order_items',
  'list_sales_orders',
  'list_shipments',
  'list_stock_reservations',
  'list_suppliers',
  'list_units',
  'list_warehouses',
])

const NON_LINEAGE_PAGE_LOCAL_CRUD_ACTIONS = Object.freeze([
  // These methods mutate the object already owned by the same page. They do
  // not copy a source document, generate a Fact, post/cancel/release a Fact,
  // or provide a source-specific read model.
  'create_contact',
  'disable_contact',
  'save_customer_with_contacts',
  'save_production_order',
  'save_supplier_with_contacts',
  'set_customer_active',
  'set_material_active',
  'set_primary_contact',
  'set_process_active',
  'set_product_active',
  'set_product_sku_active',
  'set_supplier_active',
  'update_contact',
  'update_customer',
  'update_material',
  'update_process',
  'update_product',
  'update_product_sku',
  'update_supplier',
])

const NON_LINEAGE_CUSTOMER_CONFIG_ACTIONS = Object.freeze([
  // Revision management and explanation do not touch business records.
  // Process start and execute actions are deliberately not allowlisted.
  'activate_customer_config',
  'check_customer_config_transition',
  'explain_module_status',
  'explain_process_definition',
  'get_effective_session',
  'publish_customer_config',
  'rollback_customer_config',
  'validate_customer_config',
])

const FORMAL_UI_PROCESS_RUNTIME_ACTIONS = Object.freeze([
  'start_sales_order_acceptance_process',
  'execute_sales_order_acceptance_submit',
])

const BACKEND_ONLY_PROCESS_RUNTIME_ACTIONS = Object.freeze([
  'start_material_supply_purchase_order_process',
  'execute_material_supply_purchase_receipt_create',
  'execute_material_supply_quality_gate',
  'execute_material_supply_post_inbound',
  'start_finished_goods_delivery_process',
  'execute_finished_goods_delivery_quality_decide',
  'execute_finished_goods_delivery_finance_release',
  'execute_finished_goods_delivery_shipment_ship',
  'execute_finished_goods_delivery_receivable_lead',
])

const NON_LINEAGE_BACKEND_ONLY_ACTIONS = Object.freeze([
  // The formal sales-order UI submits through the customer-config process
  // start + execute command. Keep the server command, but do not advertise a
  // second direct UI lifecycle path.
  'submit_sales_order',
])

test('business page lineage: exactly covers every formal-v1 business module once', () => {
  const lineageKeys = businessPageLineageDefinitions.map(
    (definition) => definition.pageKey
  )

  assert.equal(formalModuleKeys.length, 23)
  assert.equal(new Set(lineageKeys).size, lineageKeys.length)
  assert.deepEqual([...lineageKeys].sort(), [...formalModuleKeys].sort())
  assert.equal(getBusinessPageLineage('inbound')?.pageRole, 'source_generated')
  assert.equal(getBusinessPageLineage('shipments')?.pageRole, 'fact_owner')
  assert.equal(getBusinessPageLineage('not-a-page'), null)
})

test('business page lineage: declares the complete typed flow vocabulary', () => {
  assert.deepEqual(Object.values(BUSINESS_FLOW_TYPES), [
    'catalog_fill',
    'source_link',
    'source_query',
    'domain_generate',
    'unscoped_mutation',
    'external_import',
    'post_fact',
    'fact_reversal',
    'lifecycle_transition',
    'process_orchestration',
    'read_projection',
    'source_navigation',
    'print_snapshot',
  ])
})

test('business page lineage: flow contracts are immutable and well typed', () => {
  const knownPageKeys = new Set(formalModuleKeys)
  const knownFlowTypes = new Set(Object.values(BUSINESS_FLOW_TYPES))
  const knownAvailability = new Set(Object.values(BUSINESS_PAGE_AVAILABILITY))
  const actionFlowTypes = new Set([
    BUSINESS_FLOW_TYPES.SOURCE_QUERY,
    BUSINESS_FLOW_TYPES.DOMAIN_GENERATE,
    BUSINESS_FLOW_TYPES.UNSCOPED_MUTATION,
    BUSINESS_FLOW_TYPES.EXTERNAL_IMPORT,
    BUSINESS_FLOW_TYPES.POST_FACT,
    BUSINESS_FLOW_TYPES.FACT_REVERSAL,
    BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION,
    BUSINESS_FLOW_TYPES.PROCESS_ORCHESTRATION,
  ])
  const discriminatorFlowTypes = new Set([
    BUSINESS_FLOW_TYPES.READ_PROJECTION,
    BUSINESS_FLOW_TYPES.SOURCE_NAVIGATION,
  ])
  const flowKeys = new Set()

  assert.equal(Object.isFrozen(businessPageFlowDefinitions), true)
  for (const flowDefinition of businessPageFlowDefinitions) {
    assert.equal(Object.isFrozen(flowDefinition), true)
    assert.equal(knownFlowTypes.has(flowDefinition.flowType), true)
    assert.equal(knownAvailability.has(flowDefinition.availability), true)
    assert.equal(knownPageKeys.has(flowDefinition.toPageKey), true)

    for (const field of [
      'flowKey',
      'flowType',
      'fromPageKey',
      'toPageKey',
      'externalSourceKey',
      'action',
      'sourceType',
      'availabilityNote',
    ]) {
      assert.equal(typeof flowDefinition[field], 'string', field)
      assert.equal(
        flowDefinition[field].trim(),
        flowDefinition[field],
        `${flowDefinition.flowKey}.${field}`
      )
    }

    assert.equal(
      flowKeys.has(flowDefinition.flowKey),
      false,
      flowDefinition.flowKey
    )
    flowKeys.add(flowDefinition.flowKey)

    if (flowDefinition.flowType === BUSINESS_FLOW_TYPES.EXTERNAL_IMPORT) {
      assert.equal(flowDefinition.fromPageKey, '')
      assert.equal(flowDefinition.externalSourceKey.length > 0, true)
    } else {
      assert.equal(knownPageKeys.has(flowDefinition.fromPageKey), true)
      assert.equal(flowDefinition.externalSourceKey, '')
    }

    assert.equal(
      Boolean(flowDefinition.action),
      actionFlowTypes.has(flowDefinition.flowType),
      `${flowDefinition.flowKey} action contract`
    )
    assert.equal(
      Boolean(flowDefinition.sourceType),
      discriminatorFlowTypes.has(flowDefinition.flowType),
      `${flowDefinition.flowKey} source type contract`
    )
    if (
      flowDefinition.availability !== BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
    ) {
      assert.equal(flowDefinition.availabilityNote.length > 0, true)
    }
  }
})

test('business page lineage: uses known page keys and immutable typed fields', () => {
  const knownPageKeys = new Set(formalModuleKeys)
  const knownRoles = new Set(Object.values(BUSINESS_PAGE_ROLES))
  const knownAvailability = new Set(Object.values(BUSINESS_PAGE_AVAILABILITY))
  const knownTaskProducerStatuses = new Set(
    Object.values(WORKFLOW_TASK_PRODUCER_STATUS)
  )

  for (const definition of businessPageLineageDefinitions) {
    assert.equal(Object.isFrozen(definition), true)
    assert.equal(knownRoles.has(definition.pageRole), true)
    assert.equal(knownAvailability.has(definition.availability), true)
    assert.equal(
      knownTaskProducerStatuses.has(definition.taskProducerStatus),
      true
    )
    assert.equal(typeof definition.allowsGenericPageCreate, 'boolean')
    assert.equal(typeof definition.availabilityNote, 'string')

    for (const field of [
      'upstreamPageKeys',
      'producerActions',
      'sourceTypes',
      'downstreamPageKeys',
      'taskGroups',
    ]) {
      assert.equal(Array.isArray(definition[field]), true, field)
      assert.equal(Object.isFrozen(definition[field]), true, field)
      assert.equal(
        definition[field].every(
          (value) =>
            typeof value === 'string' && value.trim() === value && value
        ),
        true,
        field
      )
      assert.equal(new Set(definition[field]).size, definition[field].length)
    }

    for (const relatedPageKey of [
      ...definition.upstreamPageKeys,
      ...definition.downstreamPageKeys,
    ]) {
      assert.equal(
        knownPageKeys.has(relatedPageKey),
        true,
        `${definition.pageKey} references unknown page ${relatedPageKey}`
      )
    }

    for (const field of ['incomingFlows', 'outgoingFlows']) {
      assert.equal(Array.isArray(definition[field]), true, field)
      assert.equal(Object.isFrozen(definition[field]), true, field)
    }
    assert.deepEqual(
      definition.incomingFlows,
      businessPageFlowDefinitions.filter(
        (flowDefinition) => flowDefinition.toPageKey === definition.pageKey
      )
    )
    assert.deepEqual(
      definition.outgoingFlows,
      businessPageFlowDefinitions.filter(
        (flowDefinition) => flowDefinition.fromPageKey === definition.pageKey
      )
    )
  }
})

test('business page lineage: every legacy page relation has an explicit typed flow', () => {
  const typedPairs = new Set(
    businessPageFlowDefinitions
      .filter(
        (flowDefinition) =>
          flowDefinition.flowType !== BUSINESS_FLOW_TYPES.SOURCE_NAVIGATION
      )
      .map(
        (flowDefinition) =>
          `${flowDefinition.fromPageKey}->${flowDefinition.toPageKey}`
      )
  )

  for (const definition of businessPageLineageDefinitions) {
    for (const upstreamPageKey of definition.upstreamPageKeys) {
      const pair = `${upstreamPageKey}->${definition.pageKey}`
      assert.equal(typedPairs.has(pair), true, `untyped upstream ${pair}`)
    }
    for (const downstreamPageKey of definition.downstreamPageKeys) {
      const pair = `${definition.pageKey}->${downstreamPageKey}`
      assert.equal(typedPairs.has(pair), true, `untyped downstream ${pair}`)
    }
  }
})

test('business page lineage: source-driven and read-only pages never advertise generic create', () => {
  const noGenericCreateRoles = new Set([
    BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    BUSINESS_PAGE_ROLES.READ_MODEL,
    BUSINESS_PAGE_ROLES.WORKFLOW_INBOX,
  ])

  for (const definition of businessPageLineageDefinitions) {
    if (noGenericCreateRoles.has(definition.pageRole)) {
      assert.equal(
        definition.allowsGenericPageCreate,
        false,
        definition.pageKey
      )
    }

    const ownsCreate =
      definition.pageRole === BUSINESS_PAGE_ROLES.OWNER ||
      definition.pageRole === BUSINESS_PAGE_ROLES.SOURCE_DOCUMENT_OWNER ||
      definition.pageRole === BUSINESS_PAGE_ROLES.FACT_OWNER
    if (!ownsCreate) {
      assert.equal(
        definition.upstreamPageKeys.length > 0 ||
          definition.availability === BUSINESS_PAGE_AVAILABILITY.DEFERRED ||
          definition.taskProducerStatus ===
            WORKFLOW_TASK_PRODUCER_STATUS.DEFERRED,
        true,
        `${definition.pageKey} needs an upstream page or an explicit deferred producer`
      )
    }
  }
})

test('business page lineage: source-generated and fact pages name real producers and explicit availability', () => {
  const sourceDrivenRoles = new Set([
    BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    BUSINESS_PAGE_ROLES.FACT_OWNER,
    BUSINESS_PAGE_ROLES.FACT_PROCESSING,
  ])

  for (const definition of businessPageLineageDefinitions) {
    if (!sourceDrivenRoles.has(definition.pageRole)) continue

    assert.notEqual(
      definition.availability,
      BUSINESS_PAGE_AVAILABILITY.DEFERRED
    )
    assert.equal(
      definition.producerActions.length > 0,
      true,
      definition.pageKey
    )
    assert.equal(
      definition.upstreamPageKeys.length > 0,
      true,
      definition.pageKey
    )
    if (definition.availability === BUSINESS_PAGE_AVAILABILITY.PARTIAL) {
      assert.equal(definition.availabilityNote.length > 0, true)
    }
  }
})

test('business page lineage: source-driven producers match domain-generate flows', () => {
  const sourceDrivenRoles = new Set([
    BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    BUSINESS_PAGE_ROLES.FACT_PROCESSING,
  ])

  for (const definition of businessPageLineageDefinitions) {
    if (!sourceDrivenRoles.has(definition.pageRole)) continue

    const flowActions = [
      ...new Set(
        definition.incomingFlows
          .filter(
            (flowDefinition) =>
              flowDefinition.flowType === BUSINESS_FLOW_TYPES.DOMAIN_GENERATE
          )
          .map((flowDefinition) => flowDefinition.action)
      ),
    ].sort()
    assert.deepEqual(
      flowActions,
      [...definition.producerActions].sort(),
      definition.pageKey
    )
  }

  const shipment = getBusinessPageLineage('shipments')
  assert.equal(shipment?.pageRole, BUSINESS_PAGE_ROLES.FACT_OWNER)
  assert.equal(shipment?.allowsGenericPageCreate, true)
  assert.deepEqual(shipment?.producerActions, ['create_shipment_with_items'])
  assert.equal(
    shipment?.incomingFlows.some(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.DOMAIN_GENERATE
    ),
    false,
    '出货草稿是通用聚合保存并逐行保留销售订单来源，不是由销售订单直接生成的业务事实'
  )
})

test('business page lineage: producer and typed flow actions are backed by current RPC contracts', () => {
  const contractSource = [
    '../api/bomApi.mjs',
    '../api/customerConfigApi.mjs',
    '../api/masterDataOrderApi.mjs',
    '../api/operationalFactApi.mjs',
    '../api/productionOrderApi.mjs',
    '../api/productionWipApi.mjs',
    '../api/purchaseApi.mjs',
    '../api/qualityApi.mjs',
    '../../../../server/internal/service/jsonrpc_production_wip.go',
    '../../../../server/internal/service/jsonrpc_quality.go',
    '../../../../server/internal/service/jsonrpc_customer_config.go',
  ]
    .map((relativePath) =>
      readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    )
    .join('\n')

  for (const definition of businessPageLineageDefinitions) {
    for (const action of definition.producerActions) {
      assert.equal(
        contractSource.includes(`'${action}'`) ||
          contractSource.includes(`"${action}"`),
        true,
        `${definition.pageKey} producer action is not backed by a current RPC contract: ${action}`
      )
    }
  }

  for (const flowDefinition of businessPageFlowDefinitions) {
    if (!flowDefinition.action) continue
    assert.equal(
      contractSource.includes(`'${flowDefinition.action}'`) ||
        contractSource.includes(`"${flowDefinition.action}"`),
      true,
      `${flowDefinition.flowKey} is not backed by a current RPC contract`
    )
  }
})

test('business page lineage: every source-derived action is covered by the server source-read contract in both directions', () => {
  const sourcePermissionContract = readFileSync(
    new URL(
      '../../../../server/internal/biz/source_action_permission.go',
      import.meta.url
    ),
    'utf8'
  )
  const contractedActions = new Set(
    [...sourcePermissionContract.matchAll(/Method:\s*"([a-z][a-z0-9_]+)"/gu)].map(
      (match) => match[1]
    )
  )
  const sourceDerivedFlowTypes = new Set([
    BUSINESS_FLOW_TYPES.SOURCE_QUERY,
    BUSINESS_FLOW_TYPES.DOMAIN_GENERATE,
    BUSINESS_FLOW_TYPES.PROCESS_ORCHESTRATION,
  ])
  const requiredActions = new Set(
    businessPageFlowDefinitions
      .filter(
        (flowDefinition) =>
          flowDefinition.availability ===
            BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED &&
          sourceDerivedFlowTypes.has(flowDefinition.flowType)
      )
      .map((flowDefinition) => flowDefinition.action)
  )
  for (const aggregateSourceAction of [
    'create_production_order',
    'save_production_order',
    'create_shipment_with_items',
  ]) {
    requiredActions.add(aggregateSourceAction)
  }

  for (const action of requiredActions) {
    assert.equal(
      contractedActions.has(action),
      true,
      `source-derived action lacks an exact source-read permission contract: ${action}`
    )
  }

  const registeredLineageActions = new Set(
    businessPageFlowDefinitions
      .map((flowDefinition) => flowDefinition.action)
      .filter(Boolean)
  )
  registeredLineageActions.add('create_production_order')
  registeredLineageActions.add('save_production_order')
  registeredLineageActions.add('create_shipment_with_items')
  assert.deepEqual(
    [...contractedActions]
      .filter((action) => !registeredLineageActions.has(action))
      .sort(),
    [],
    'server source-read contracts must stay visible in the page-lineage truth'
  )
})

test('business page lineage: real source and lifecycle service actions are classified in reverse', () => {
  const serviceActions = serviceMethodActions([
    '../../../../server/internal/service/jsonrpc_bom.go',
    '../../../../server/internal/service/jsonrpc_sales_order.go',
    '../../../../server/internal/service/jsonrpc_purchase_order.go',
    '../../../../server/internal/service/jsonrpc_outsourcing_order.go',
    '../../../../server/internal/service/jsonrpc_production_order.go',
    '../../../../server/internal/service/jsonrpc_operational_fact.go',
    '../../../../server/internal/service/jsonrpc_purchase.go',
    '../../../../server/internal/service/jsonrpc_quality.go',
    '../../../../server/internal/service/jsonrpc_production_wip.go',
    '../../../../server/internal/service/jsonrpc_customer_config.go',
  ])
  const apiActions = apiMethodActions([
    '../api/bomApi.mjs',
    '../api/customerConfigApi.mjs',
    '../api/masterDataOrderApi.mjs',
    '../api/operationalFactApi.mjs',
    '../api/productionOrderApi.mjs',
    '../api/productionWipApi.mjs',
    '../api/purchaseApi.mjs',
    '../api/qualityApi.mjs',
  ])
  const discoveredActions = new Set([...serviceActions, ...apiActions])
  const registeredActions = new Set(
    [
      ...businessPageFlowDefinitions.map((flowDefinition) =>
        String(flowDefinition.action || '').trim()
      ),
      ...businessPageLineageDefinitions.flatMap(
        (definition) => definition.producerActions
      ),
    ].filter(Boolean)
  )
  const excludedActions = new Set([
    ...NON_LINEAGE_READ_ACTIONS,
    ...NON_LINEAGE_PAGE_LOCAL_CRUD_ACTIONS,
    ...NON_LINEAGE_CUSTOMER_CONFIG_ACTIONS,
    ...NON_LINEAGE_BACKEND_ONLY_ACTIONS,
  ])

  assert.equal(
    serviceActions.has('list_shipment_source_candidates'),
    true,
    '出货来源候选必须由真实 operational_fact RPC 提供，不能回退前端全量拼接'
  )
  for (const processRuntimeAction of [
    ...FORMAL_UI_PROCESS_RUNTIME_ACTIONS,
    ...BACKEND_ONLY_PROCESS_RUNTIME_ACTIONS,
  ]) {
    assert.equal(
      serviceActions.has(processRuntimeAction),
      true,
      `missing customer-config process runtime action: ${processRuntimeAction}`
    )
    assert.equal(
      registeredActions.has(processRuntimeAction),
      true,
      `unregistered customer-config process runtime action: ${processRuntimeAction}`
    )
    assert.equal(excludedActions.has(processRuntimeAction), false)
  }
  const unclassifiedActions = [...discoveredActions]
    .filter(
      (action) =>
        !registeredActions.has(action) && !excludedActions.has(action)
    )
    .sort()
  assert.deepEqual(
    unclassifiedActions,
    [],
    '每个真实 service/API 动作都必须登记为血缘动作，或明确归类为只读 / 页面内 CRUD'
  )
  for (const action of excludedActions) {
    assert.equal(
      discoveredActions.has(action),
      true,
      `stale non-lineage allowlist action: ${action}`
    )
  }
})

test('business page lineage: backend-only process commands never claim implemented formal UI reachability', () => {
  assert.equal(BACKEND_ONLY_PROCESS_RUNTIME_ACTIONS.length, 9)

  for (const action of [
    ...BACKEND_ONLY_PROCESS_RUNTIME_ACTIONS,
    'add_purchase_receipt_item',
  ]) {
    const actionFlows = businessPageFlowDefinitions.filter(
      (flowDefinition) => flowDefinition.action === action
    )
    assert.equal(actionFlows.length > 0, true, action)
    for (const flowDefinition of actionFlows) {
      assert.equal(
        flowDefinition.availability,
        BUSINESS_PAGE_AVAILABILITY.PARTIAL,
        `${flowDefinition.flowKey} must remain backend-only`
      )
      assert.match(flowDefinition.availabilityNote, /backend-only/u)
      assert.match(flowDefinition.availabilityNote, /正式 Web UI 无调用入口/u)
    }
  }

  const purchaseReceiptPageSource = readFileSync(
    new URL('../pages/V1PurchaseReceiptsPage.jsx', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(
    purchaseReceiptPageSource,
    /addPurchaseReceiptItem|add_purchase_receipt_item/u,
    '追加采购入库行没有正式页面入口时不得冒充当前 UI 流程'
  )
})

test('business page lineage: sales-order submit has one formal UI path through process start and execute', () => {
  const customerConfigApiSource = readFileSync(
    new URL('../api/customerConfigApi.mjs', import.meta.url),
    'utf8'
  )
  const masterDataOrderApiSource = readFileSync(
    new URL('../api/masterDataOrderApi.mjs', import.meta.url),
    'utf8'
  )
  const salesOrderPageConfigSource = readFileSync(
    new URL(
      '../components/sales-orders/salesOrderPageConfig.mjs',
      import.meta.url
    ),
    'utf8'
  )

  for (const action of FORMAL_UI_PROCESS_RUNTIME_ACTIONS) {
    const actionFlows = businessPageFlowDefinitions.filter(
      (flowDefinition) => flowDefinition.action === action
    )
    assert.equal(actionFlows.length > 0, true, action)
    assert.equal(
      actionFlows.every(
        (flowDefinition) =>
          flowDefinition.availability ===
          BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
      ),
      true,
      action
    )
  }
  assert.match(
    customerConfigApiSource,
    /submitSalesOrderAcceptanceProcess[\s\S]{0,1800}startSalesOrderAcceptanceProcess\([\s\S]{0,900}executeSalesOrderAcceptanceSubmit\(/u
  )
  assert.match(
    salesOrderPageConfigSource,
    /run:\s*submitSalesOrderAcceptanceProcess/u
  )
  assert.doesNotMatch(
    masterDataOrderApiSource,
    /submitSalesOrder|submit_sales_order/u
  )
  assert.deepEqual(
    businessPageFlowDefinitions.filter(
      (flowDefinition) => flowDefinition.action === 'submit_sales_order'
    ),
    [],
    '正式 UI 不得同时登记直连 submit_sales_order 和 process start + execute 双轨'
  )
})

test('business page lineage: invoice facts cannot advertise settlement', () => {
  const settledPageKeys = businessPageFlowDefinitions
    .filter(
      (flowDefinition) => flowDefinition.action === 'settle_finance_fact'
    )
    .map((flowDefinition) => flowDefinition.fromPageKey)

  assert.deepEqual(settledPageKeys, [
    'payables',
    'receivables',
    'reconciliation',
  ])
  assert.equal(settledPageKeys.includes('invoices'), false)
})

test('business page lineage: carry-over, generation, WIP quality, and reversal semantics stay distinct', () => {
  const flowsForAction = (action) =>
    businessPageFlowDefinitions.filter(
      (flowDefinition) => flowDefinition.action === action
    )

  for (const genericAggregateAction of [
    'create_production_order',
    'create_shipment_with_items',
  ]) {
    assert.deepEqual(
      flowsForAction(genericAggregateAction),
      [],
      `${genericAggregateAction} is a page aggregate save, not cross-document generation`
    )
  }
  assert.equal(
    businessPageFlowDefinitions.some(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.SOURCE_LINK &&
        flowDefinition.fromPageKey === 'sales-orders' &&
        flowDefinition.toPageKey === 'shipments'
    ),
    true
  )
  assert.equal(
    businessPageFlowDefinitions.some(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.SOURCE_LINK &&
        flowDefinition.fromPageKey === 'processing-contracts' &&
        flowDefinition.toPageKey === 'production-progress'
    ),
    true,
    'WIP outsourcing allocation persists the outsourcing order item source link'
  )
  assert.equal(
    getBusinessPageLineage('production-progress')?.upstreamPageKeys.includes(
      'processing-contracts'
    ),
    true
  )
  assert.equal(
    getBusinessPageLineage('processing-contracts')?.downstreamPageKeys.includes(
      'production-progress'
    ),
    true,
    'WIP outsourcing source links stay visible from both legacy lineage directions'
  )
  assert.equal(
    flowsForAction('list_shipment_source_candidates')[0]?.flowType,
    BUSINESS_FLOW_TYPES.SOURCE_QUERY
  )
  assert.equal(
    flowsForAction('list_production_order_material_requirements')[0]?.flowType,
    BUSINESS_FLOW_TYPES.SOURCE_QUERY
  )
  assert.equal(
    flowsForAction('copy_bom_version')[0]?.flowType,
    BUSINESS_FLOW_TYPES.DOMAIN_GENERATE
  )
  for (const action of [
    'create_outsourcing_material_issue_from_order',
    'create_outsourcing_return_receipt_from_order',
    'release_production_order',
    'execute_production_wip_action',
  ]) {
    assert.equal(
      flowsForAction(action).some(
        (flowDefinition) =>
          flowDefinition.flowType === BUSINESS_FLOW_TYPES.DOMAIN_GENERATE
      ),
      true,
      action
    )
  }
  for (const action of [
    'cancel_purchase_receipt',
    'cancel_purchase_return',
    'cancel_purchase_receipt_adjustment',
    'cancel_outsourcing_order',
    'cancel_production_fact',
    'cancel_outsourcing_fact',
    'cancel_shipment',
    'cancel_finance_fact',
  ]) {
    assert.equal(
      flowsForAction(action).some(
        (flowDefinition) =>
          flowDefinition.flowType ===
          BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION
      ),
      true,
      action
    )
    assert.equal(flowsForAction(action).length > 0, true, action)
  }
  for (const action of [
    'cancel_purchase_receipt',
    'cancel_purchase_return',
    'cancel_purchase_receipt_adjustment',
    'cancel_production_fact',
    'cancel_outsourcing_fact',
    'cancel_shipment',
  ]) {
    assert.equal(
      flowsForAction(action).some(
        (flowDefinition) =>
          flowDefinition.flowType === BUSINESS_FLOW_TYPES.FACT_REVERSAL &&
          flowDefinition.toPageKey === 'inventory'
      ),
      true,
      `${action} inventory reversal`
    )
  }
  for (const action of [
    'start_sales_order_acceptance_process',
    'start_material_supply_purchase_order_process',
    'start_finished_goods_delivery_process',
    'execute_finished_goods_delivery_finance_release',
    'execute_material_supply_quality_gate',
  ]) {
    assert.equal(
      flowsForAction(action)[0]?.flowType,
      BUSINESS_FLOW_TYPES.PROCESS_ORCHESTRATION,
      action
    )
  }
  for (const action of [
    'create_purchase_receipt_from_purchase_order',
    'execute_material_supply_purchase_receipt_create',
    'add_purchase_receipt_item',
  ]) {
    assert.equal(
      flowsForAction(action).some(
        (flowDefinition) =>
          flowDefinition.flowType === BUSINESS_FLOW_TYPES.DOMAIN_GENERATE &&
          flowDefinition.toPageKey === 'quality-inspections'
      ),
      true,
      `${action} atomically creates incoming inspections`
    )
  }
  for (const action of [
    'submit_quality_inspection',
    'pass_quality_inspection',
    'reject_quality_inspection',
    'cancel_quality_inspection',
  ]) {
    assert.equal(
      flowsForAction(action).some(
        (flowDefinition) =>
          flowDefinition.flowType ===
            BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION &&
          flowDefinition.fromPageKey === 'quality-inspections' &&
          flowDefinition.toPageKey === 'inventory'
      ),
      true,
      `${action} can change the linked inventory lot lifecycle`
    )
  }
  assert.equal(
    flowsForAction('release_stock_reservation').some(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION
    ),
    true
  )
  assert.equal(
    flowsForAction('release_stock_reservation').some(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.FACT_REVERSAL
    ),
    false,
    '释放预留只结束预留事实，不伪造库存交易冲正'
  )
  assert.equal(
    flowsForAction('execute_finished_goods_delivery_quality_decide').some(
      (flowDefinition) =>
        flowDefinition.fromPageKey === 'shipments' &&
        flowDefinition.toPageKey === 'quality-inspections'
    ),
    true
  )
  assert.equal(
    flowsForAction('execute_material_supply_quality_gate')[0]?.fromPageKey,
    'inbound'
  )
  assert.equal(
    businessPageFlowDefinitions.some(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.SOURCE_NAVIGATION &&
        flowDefinition.sourceType === 'OUTSOURCING_ORDER' &&
        flowDefinition.fromPageKey === 'processing-contracts' &&
        flowDefinition.toPageKey === 'processing-contracts'
    ),
    true
  )
})

test('business page lineage: source lifecycle actions preserve every workflow projection target', () => {
  const flowsForAction = (action) =>
    businessPageFlowDefinitions.filter(
      (flowDefinition) => flowDefinition.action === action
    )
  const hasFlow = (action, flowType, fromPageKey, toPageKey) =>
    flowsForAction(action).some(
      (flowDefinition) =>
        flowDefinition.flowType === flowType &&
        flowDefinition.fromPageKey === fromPageKey &&
        flowDefinition.toPageKey === toPageKey
    )

  for (const action of [
    'close_production_order',
    'cancel_production_order',
  ]) {
    assert.equal(
      hasFlow(
        action,
        BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION,
        'production-orders',
        'production-orders'
      ),
      true,
      `${action} source lifecycle`
    )
    assert.equal(
      hasFlow(
        action,
        BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION,
        'production-orders',
        'production-scheduling'
      ),
      true,
      `${action} production-scheduling projection`
    )
  }

  assert.equal(
    hasFlow(
      'ship_shipment',
      BUSINESS_FLOW_TYPES.POST_FACT,
      'shipments',
      'inventory'
    ),
    true,
    'ship_shipment inventory posting'
  )
  assert.equal(
    hasFlow(
      'ship_shipment',
      BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION,
      'shipments',
      'shipping-release'
    ),
    true,
    'ship_shipment shipping-release projection'
  )
  for (const [flowType, toPageKey] of [
    [BUSINESS_FLOW_TYPES.FACT_REVERSAL, 'inventory'],
    [BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION, 'shipments'],
    [BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION, 'shipping-release'],
  ]) {
    assert.equal(
      hasFlow('cancel_shipment', flowType, 'shipments', toPageKey),
      true,
      `cancel_shipment ${toPageKey}`
    )
  }
})

test('business page lineage: draft lot creation is visible without claiming inventory posting', () => {
  const flowsForAction = (action) =>
    businessPageFlowDefinitions.filter(
      (flowDefinition) => flowDefinition.action === action
    )
  const draftLotActions = [
    'create_purchase_receipt_from_purchase_order',
    'execute_material_supply_purchase_receipt_create',
    'add_purchase_receipt_item',
    'create_production_completion_from_order',
    'create_outsourcing_return_receipt_from_order',
  ]

  for (const action of draftLotActions) {
    assert.equal(
      flowsForAction(action).some(
        (flowDefinition) =>
          flowDefinition.flowType === BUSINESS_FLOW_TYPES.DOMAIN_GENERATE &&
          flowDefinition.toPageKey === 'inventory'
      ),
      true,
      `${action} visible inventory-lot read model`
    )
    assert.equal(
      flowsForAction(action).some(
        (flowDefinition) =>
          flowDefinition.flowType === BUSINESS_FLOW_TYPES.POST_FACT
      ),
      false,
      `${action} draft lot preparation must not claim inventory posting`
    )
  }

  const purchaseRepoSource = readFileSync(
    new URL(
      '../../../../server/internal/data/purchase_receipt_repo.go',
      import.meta.url
    ),
    'utf8'
  )
  const operationalFactRepoSource = readFileSync(
    new URL(
      '../../../../server/internal/data/operational_fact_repo.go',
      import.meta.url
    ),
    'utf8'
  )
  const productionRepoSource = readFileSync(
    new URL(
      '../../../../server/internal/data/operational_fact_production_repo.go',
      import.meta.url
    ),
    'utf8'
  )
  const outsourcingRepoSource = readFileSync(
    new URL(
      '../../../../server/internal/data/operational_fact_outsourcing_repo.go',
      import.meta.url
    ),
    'utf8'
  )
  const inventoryPageSource = readFileSync(
    new URL('../pages/V1InventoryLedgerPage.jsx', import.meta.url),
    'utf8'
  )

  assert.match(
    purchaseRepoSource,
    /InventoryLot\.Create\(\)[\s\S]{0,500}SetStatus\(biz\.InventoryLotHold\)/u
  )
  assert.match(
    operationalFactRepoSource,
    /resolveOrCreateSourceInboundLot[\s\S]{0,2400}InventoryLot\.Create\(\)[\s\S]{0,500}SetStatus\(biz\.InventoryLotActive\)/u
  )
  assert.match(
    productionRepoSource,
    /resolveOrCreateSourceInboundLot\(ctx, tx, in\)[\s\S]{0,500}createProductionFactDraftWithClient/u
  )
  assert.match(
    outsourcingRepoSource,
    /resolveOrCreateSourceInboundLot\(ctx, tx, resolved\)[\s\S]{0,500}createOutsourcingFactDraftWithClient/u
  )
  assert.match(inventoryPageSource, /listInventoryLots/u)
})

test('business page lineage: shipment source query is governed by create and source-read permissions', () => {
  const permissionUsageSource = readFileSync(
    new URL(
      '../../../../server/internal/biz/permission_usage.go',
      import.meta.url
    ),
    'utf8'
  )
  const sourcePermissionContract = readFileSync(
    new URL(
      '../../../../server/internal/biz/source_action_permission.go',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(
    permissionUsageSource,
    /shipmentCreateMethods\s*:=\s*append\([\s\S]{0,500}list_shipment_source_candidates/u
  )
  assert.match(
    sourcePermissionContract,
    /Method:\s*"list_shipment_source_candidates"[\s\S]{0,220}PermissionSalesOrderRead,\s*PermissionSalesOrderItemRead/u
  )
  assert.match(permissionUsageSource, /applySourceActionReadPermissionUsages/u)
})

test('business page lineage: current Product Core has no external import flow', () => {
  assert.deepEqual(
    businessPageFlowDefinitions.filter(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.EXTERNAL_IMPORT
    ),
    []
  )
})

test('business page lineage: outsourcing material fill and finished-goods quality entry stay explicit', () => {
  const materialFill = businessPageFlowDefinitions.find(
    (flowDefinition) =>
      flowDefinition.flowType === BUSINESS_FLOW_TYPES.CATALOG_FILL &&
      flowDefinition.fromPageKey === 'materials' &&
      flowDefinition.toPageKey === 'processing-contracts'
  )
  assert.ok(materialFill)
  assert.equal(
    getBusinessPageLineage('processing-contracts')?.upstreamPageKeys.includes(
      'materials'
    ),
    true
  )

  const finishedGoodsQualityLink = businessPageFlowDefinitions.find(
    (flowDefinition) =>
      flowDefinition.flowType === BUSINESS_FLOW_TYPES.SOURCE_LINK &&
      flowDefinition.fromPageKey === 'shipments' &&
      flowDefinition.toPageKey === 'quality-inspections'
  )
  assert.equal(
    finishedGoodsQualityLink?.availability,
    BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
  )
  assert.match(
    finishedGoodsQualityLink?.availabilityNote || '',
    /不启动 Workflow/u
  )
})

test('business page lineage: inventory projections preserve every fact discriminator', () => {
  const projectionSourceTypes = businessPageFlowDefinitions
    .filter(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.READ_PROJECTION &&
        flowDefinition.toPageKey === 'inventory'
    )
    .map((flowDefinition) => flowDefinition.sourceType)

  assert.deepEqual(
    projectionSourceTypes,
    getBusinessPageLineage('inventory')?.sourceTypes
  )
})

test('business page lineage: product images enter print drafts only as snapshots', () => {
  const printSnapshotPairs = businessPageFlowDefinitions
    .filter(
      (flowDefinition) =>
        flowDefinition.flowType === BUSINESS_FLOW_TYPES.PRINT_SNAPSHOT
    )
    .map(
      (flowDefinition) =>
        `${flowDefinition.fromPageKey}->${flowDefinition.toPageKey}`
    )

  assert.deepEqual(printSnapshotPairs, [
    'products->material-bom',
    'products->processing-contracts',
  ])
})

test('business page lineage: sourceTypes only names stored discriminators, not direct foreign keys', () => {
  assert.deepEqual(getBusinessPageLineage('inventory')?.sourceTypes, [
    'PURCHASE_RECEIPT',
    'PURCHASE_RETURN',
    'PURCHASE_RECEIPT_ADJUSTMENT',
    'PRODUCTION_FACT',
    'OUTSOURCING_FACT',
    'SHIPMENT',
  ])
  assert.deepEqual(getBusinessPageLineage('outbound')?.sourceTypes, [])
  assert.deepEqual(getBusinessPageLineage('shipments')?.sourceTypes, [])
  assert.deepEqual(getBusinessPageLineage('quality-inspections')?.sourceTypes, [
    'PURCHASE_RECEIPT',
    'OUTSOURCING_FACT',
    'PRODUCTION_WIP',
    'SHIPMENT',
  ])
  assert.equal(
    getBusinessPageLineage('quality-inspections')?.availability,
    BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
  )
})

test('business page lineage: shipment finished-goods quality producer is wired from the source page', () => {
  const shipmentPageSource = readFileSync(
    new URL('../pages/ShipmentsPage.jsx', import.meta.url),
    'utf8'
  )
  const qualityApiSource = readFileSync(
    new URL('../api/qualityApi.mjs', import.meta.url),
    'utf8'
  )

  assert.match(shipmentPageSource, /createFinishedGoodsQualityInspectionDraft/u)
  assert.match(shipmentPageSource, /listAllFinishedGoodsQualityInspections/u)
  assert.match(
    qualityApiSource,
    /create_finished_goods_quality_inspection_draft/u
  )
})

test('business page lineage: workflow inboxes declare exact source task producers', () => {
  const workflowDefinitions = businessPageLineageDefinitions.filter(
    (definition) => definition.pageRole === BUSINESS_PAGE_ROLES.WORKFLOW_INBOX
  )

  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.pageKey),
    ['production-scheduling', 'production-exceptions', 'shipping-release']
  )
  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.taskGroups[0]),
    ['production_scheduling', 'production_exception', 'shipment_release']
  )

  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.upstreamPageKeys),
    [['production-orders'], ['production-progress'], ['shipments']]
  )
  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.producerActions),
    [
      ['release_production_order'],
      ['post_production_fact'],
      ['submit_shipment_release'],
    ]
  )
  assert.deepEqual(
    workflowDefinitions.map((definition) => definition.sourceTypes),
    [['production-orders'], ['production-progress'], ['shipments']]
  )
  for (const definition of workflowDefinitions) {
    assert.equal(definition.taskGroups.length, 1)
    assert.equal(
      definition.availability,
      BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED
    )
    assert.equal(
      definition.taskProducerStatus,
      WORKFLOW_TASK_PRODUCER_STATUS.IMPLEMENTED
    )
    assert.equal(definition.availabilityNote.length > 0, true)
  }
})

test('business page registry describes the same source-generated workflow truth', () => {
  const byKey = new Map(
    businessModuleDefinitions.map((definition) => [definition.key, definition])
  )
  const sourceRefs = [
    ['production-scheduling', 'production_orders'],
    ['production-exceptions', 'production_facts'],
    ['shipping-release', 'shipments'],
  ]
  for (const [pageKey, sourceRef] of sourceRefs) {
    const definition = byKey.get(pageKey)
    assert.equal(definition.sourceRefs.includes(sourceRef), true, pageKey)
    assert.doesNotMatch(definition.description, /尚未接入/u)
    assert.equal(
      definition.currentScope.some((scope) => /生成/u.test(scope)),
      true,
      pageKey
    )
  }
})

test('business page registry keeps current quality and WIP source facts complete', () => {
  const byKey = new Map(
    businessModuleDefinitions.map((definition) => [definition.key, definition])
  )
  const quality = byKey.get('quality-inspections')
  for (const sourceRef of [
    'purchase_receipts',
    'outsourcing_facts',
    'production_wip_batches',
    'shipments',
  ]) {
    assert.equal(quality.sourceRefs.includes(sourceRef), true, sourceRef)
  }
  assert.doesNotMatch(quality.description, /待接入/u)
  assert.doesNotMatch(quality.currentScope.join('\n'), /待接入/u)

  const productionOrders = byKey.get('production-orders')
  for (const sourceRef of ['outsourcing_orders', 'outsourcing_order_items']) {
    assert.equal(
      productionOrders.sourceRefs.includes(sourceRef),
      true,
      sourceRef
    )
    assert.match(productionOrders.factSource, new RegExp(sourceRef, 'u'))
  }
})
