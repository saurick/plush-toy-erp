import { businessModuleDefinitions } from './businessModules.mjs'

/**
 * @typedef {'owner' | 'source_document_owner' | 'source_generated' | 'fact_owner' | 'fact_processing' | 'read_model' | 'workflow_inbox'} BusinessPageRole
 * @typedef {'implemented' | 'partial' | 'deferred'} BusinessPageAvailability
 * @typedef {'not_applicable' | 'implemented' | 'partial' | 'deferred'} WorkflowTaskProducerStatus
 * @typedef {'catalog_fill' | 'source_link' | 'source_query' | 'domain_generate' | 'unscoped_mutation' | 'external_import' | 'post_fact' | 'fact_reversal' | 'lifecycle_transition' | 'process_orchestration' | 'read_projection' | 'source_navigation' | 'print_snapshot'} BusinessFlowType
 *
 * @typedef {object} BusinessFlowContract
 * @property {string} flowKey
 * @property {BusinessFlowType} flowType
 * @property {string} fromPageKey Empty only for a future external_import flow.
 * @property {string} toPageKey
 * @property {string} externalSourceKey Required only for external_import.
 * @property {string} action RPC or aggregate-save action; required for source_query, domain_generate, unscoped_mutation, external_import, post_fact, fact_reversal, lifecycle_transition, and process_orchestration.
 * @property {string} sourceType Canonical discriminator used by read_projection or source_navigation.
 * @property {BusinessPageAvailability} availability
 * @property {string} availabilityNote Required when availability is not implemented.
 *
 * @typedef {object} BusinessPageLineage
 * @property {string} pageKey
 * @property {BusinessPageRole} pageRole
 * @property {readonly string[]} upstreamPageKeys Pages that own the source records used to produce this page's records.
 * @property {readonly string[]} producerActions Real RPC or aggregate-save actions that create records shown on this page.
 * @property {readonly string[]} sourceTypes Canonical source_type values stored by this page's records; direct foreign-key relationships stay in upstreamPageKeys.
 * @property {readonly string[]} downstreamPageKeys Pages that continue the business flow after this page.
 * @property {readonly BusinessFlowContract[]} incomingFlows Typed flows whose target is this page.
 * @property {readonly BusinessFlowContract[]} outgoingFlows Typed flows whose source is this page.
 * @property {readonly string[]} taskGroups Workflow task groups consumed by this page; empty for non-inbox pages.
 * @property {boolean} allowsGenericPageCreate Whether this page owns an unrestricted page-level create entry.
 * @property {BusinessPageAvailability} availability
 * @property {WorkflowTaskProducerStatus} taskProducerStatus Productized task-producer status; explicit for workflow inboxes.
 * @property {string} availabilityNote Required when the page or its task producer is not fully implemented.
 */

export const BUSINESS_PAGE_ROLES = Object.freeze({
  OWNER: 'owner',
  SOURCE_DOCUMENT_OWNER: 'source_document_owner',
  SOURCE_GENERATED: 'source_generated',
  FACT_OWNER: 'fact_owner',
  FACT_PROCESSING: 'fact_processing',
  READ_MODEL: 'read_model',
  WORKFLOW_INBOX: 'workflow_inbox',
})

export const BUSINESS_PAGE_AVAILABILITY = Object.freeze({
  IMPLEMENTED: 'implemented',
  PARTIAL: 'partial',
  DEFERRED: 'deferred',
})

export const WORKFLOW_TASK_PRODUCER_STATUS = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  IMPLEMENTED: 'implemented',
  PARTIAL: 'partial',
  DEFERRED: 'deferred',
})

export const BUSINESS_FLOW_TYPES = Object.freeze({
  CATALOG_FILL: 'catalog_fill',
  SOURCE_LINK: 'source_link',
  SOURCE_QUERY: 'source_query',
  DOMAIN_GENERATE: 'domain_generate',
  UNSCOPED_MUTATION: 'unscoped_mutation',
  EXTERNAL_IMPORT: 'external_import',
  POST_FACT: 'post_fact',
  FACT_REVERSAL: 'fact_reversal',
  LIFECYCLE_TRANSITION: 'lifecycle_transition',
  PROCESS_ORCHESTRATION: 'process_orchestration',
  READ_PROJECTION: 'read_projection',
  SOURCE_NAVIGATION: 'source_navigation',
  PRINT_SNAPSHOT: 'print_snapshot',
})

const BACKEND_ONLY_FORMAL_UI_ACTIONS = new Set([
  'add_purchase_receipt_item',
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

const BACKEND_ONLY_FORMAL_UI_NOTE =
  '服务端 JSON-RPC 已实现，但当前正式 Web UI 无调用入口；该动作仅登记为 backend-only 能力，不得作为页面可达的 implemented 链路。'

function businessFlow(definition) {
  const normalized = {
    fromPageKey: '',
    externalSourceKey: '',
    action: '',
    sourceType: '',
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    availabilityNote: '',
    ...definition,
  }
  if (BACKEND_ONLY_FORMAL_UI_ACTIONS.has(normalized.action)) {
    normalized.availability = BUSINESS_PAGE_AVAILABILITY.PARTIAL
    normalized.availabilityNote = BACKEND_ONLY_FORMAL_UI_NOTE
  }
  const flowKey = [
    normalized.flowType,
    normalized.fromPageKey || normalized.externalSourceKey,
    normalized.toPageKey,
    normalized.action || normalized.sourceType || 'link',
  ].join(':')
  return Object.freeze({ flowKey, ...normalized })
}

/**
 * Typed flow truth for formal pages. Page-internal source selection is
 * catalog_fill or source_link; it must not be represented as external_import.
 * No external_import flow is registered until a real audited backend importer
 * exists.
 *
 * @type {readonly BusinessFlowContract[]}
 */
export const businessPageFlowDefinitions = Object.freeze(
  [
    // Master-data catalog selection and field carry-over.
    ['customers', 'sales-orders'],
    ['products', 'sales-orders'],
    ['products', 'material-bom'],
    ['materials', 'material-bom'],
    ['suppliers', 'accessories-purchase'],
    ['materials', 'accessories-purchase'],
    ['suppliers', 'processing-contracts'],
    ['products', 'processing-contracts'],
    ['materials', 'processing-contracts'],
    ['processes', 'processing-contracts'],
    ['products', 'production-orders'],
    ['products', 'shipments'],
  ]
    .map(([fromPageKey, toPageKey]) =>
      businessFlow({
        flowType: BUSINESS_FLOW_TYPES.CATALOG_FILL,
        fromPageKey,
        toPageKey,
      })
    )
    .concat(
      [
        // Persisted provenance, eligibility, or responsibility links. These
        // links do not claim that the target record was generated or posted.
        ['materials', 'inbound'],
        ['materials', 'inventory'],
        ['sales-orders', 'production-orders'],
        ['sales-orders', 'shipments'],
        ['shipments', 'sales-returns'],
        ['material-bom', 'production-orders'],
        [
          'processing-contracts',
          'production-progress',
          BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
          'WIP 外发分配把已确认委外合同行持久化为 outsourcing_order_item_id 分配锚点。',
        ],
        ['accessories-purchase', 'inbound'],
        ['inbound', 'quality-inspections'],
        ['quality-inspections', 'inventory'],
        ['quality-inspections', 'payables'],
        ['quality-inspections', 'shipments'],
        ['processing-contracts', 'quality-inspections'],
        [
          'shipments',
          'quality-inspections',
          BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
          '草稿出货单可按产品 / SKU、仓库和批次送检粒度发起出货前成品检验；该来源关联不启动 Workflow。',
        ],
        ['shipping-release', 'shipments'],
        ['outbound', 'inventory'],
        ['outbound', 'shipments'],
        ['shipments', 'outbound'],
        ['sales-returns', 'inventory'],
        ['receivables', 'finance-payments'],
        ['payables', 'finance-payments'],
      ].map(
        ([
          fromPageKey,
          toPageKey,
          availability = BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
          availabilityNote = '',
        ]) =>
          businessFlow({
            flowType: BUSINESS_FLOW_TYPES.SOURCE_LINK,
            fromPageKey,
            toPageKey,
            availability,
            availabilityNote,
          })
      )
    )
    .concat(
      [
        // Server-owned candidate and source-specific read models. These reads
        // do not create the target record and must remain separate from the
        // persisted source_link and the later aggregate save.
        [
          'sales-orders',
          'production-orders',
          'list_production_order_reference_options',
        ],
        [
          'production-orders',
          'production-progress',
          'list_production_order_material_requirements',
        ],
        ['sales-orders', 'shipments', 'list_shipment_source_candidates'],
        [
          'processing-contracts',
          'quality-inspections',
          'list_outsourcing_return_quality_inspections',
        ],
        [
          'production-progress',
          'quality-inspections',
          'list_production_stage_quality_inspections',
        ],
        [
          'shipments',
          'quality-inspections',
          'list_finished_goods_quality_inspections',
        ],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.SOURCE_QUERY,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [
        // Explicit backend actions that create a downstream record or draft.
        ['material-bom', 'material-bom', 'copy_bom_version'],
        [
          'accessories-purchase',
          'inbound',
          'create_purchase_receipt_from_purchase_order',
        ],
        [
          'accessories-purchase',
          'quality-inspections',
          'create_purchase_receipt_from_purchase_order',
        ],
        [
          'accessories-purchase',
          'inventory',
          'create_purchase_receipt_from_purchase_order',
        ],
        [
          'accessories-purchase',
          'inbound',
          'execute_material_supply_purchase_receipt_create',
        ],
        [
          'accessories-purchase',
          'quality-inspections',
          'execute_material_supply_purchase_receipt_create',
        ],
        [
          'accessories-purchase',
          'inventory',
          'execute_material_supply_purchase_receipt_create',
        ],
        ['accessories-purchase', 'inbound', 'add_purchase_receipt_item'],
        [
          'accessories-purchase',
          'quality-inspections',
          'add_purchase_receipt_item',
        ],
        ['accessories-purchase', 'inventory', 'add_purchase_receipt_item'],
        ['inbound', 'inbound', 'create_purchase_return_from_receipt'],
        [
          'quality-inspections',
          'inbound',
          'create_purchase_return_from_quality_inspection',
        ],
        [
          'inbound',
          'inbound',
          'create_purchase_receipt_adjustment_from_receipt',
        ],
        ['inbound', 'quality-inspections', 'create_quality_inspection_draft'],
        [
          'processing-contracts',
          'quality-inspections',
          'create_quality_inspection_from_outsourcing_return',
        ],
        [
          'production-orders',
          'production-progress',
          'create_production_material_issue_from_order',
        ],
        [
          'production-orders',
          'production-progress',
          'create_production_completion_from_order',
        ],
        [
          'production-orders',
          'inventory',
          'create_production_completion_from_order',
        ],
        [
          'production-progress',
          'production-progress',
          'create_production_rework_from_completion',
        ],
        [
          'production-progress',
          'quality-inspections',
          'execute_production_wip_action',
        ],
        [
          'processing-contracts',
          'processing-contracts',
          'create_outsourcing_material_issue_from_order',
        ],
        [
          'processing-contracts',
          'processing-contracts',
          'create_outsourcing_return_receipt_from_order',
        ],
        [
          'processing-contracts',
          'inventory',
          'create_outsourcing_return_receipt_from_order',
        ],
        [
          'production-orders',
          'production-scheduling',
          'release_production_order',
        ],
        [
          'production-orders',
          'production-progress',
          'release_production_order',
        ],
        [
          'production-progress',
          'production-exceptions',
          'post_production_fact',
        ],
        [
          'sales-orders',
          'outbound',
          'create_stock_reservation_from_sales_order',
        ],
        ['shipments', 'shipping-release', 'submit_shipment_release'],
        ['inbound', 'payables', 'create_payable_from_purchase_receipt'],
        [
          'processing-contracts',
          'payables',
          'create_payable_from_outsourcing_return',
        ],
        ['shipments', 'receivables', 'create_receivable_from_shipment'],
        [
          'shipments',
          'receivables',
          'execute_finished_goods_delivery_receivable_lead',
        ],
        ['shipments', 'invoices', 'create_invoice_from_shipment'],
        [
          'payables',
          'reconciliation',
          'create_reconciliation_from_finance_fact',
        ],
        [
          'receivables',
          'reconciliation',
          'create_reconciliation_from_finance_fact',
        ],
        [
          'invoices',
          'reconciliation',
          'create_reconciliation_from_finance_fact',
        ],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.DOMAIN_GENERATE,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat([
      businessFlow({
        flowType: BUSINESS_FLOW_TYPES.DOMAIN_GENERATE,
        fromPageKey: 'shipments',
        toPageKey: 'quality-inspections',
        action: 'create_finished_goods_quality_inspection_draft',
        availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
        availabilityNote:
          '从草稿出货单按产品 / SKU、仓库和批次生成质检草稿；同一送检粒度原子防重，取消后可重建。',
      }),
    ])
    .concat(
      [
        // Lifecycle actions that make a Fact effective. They are deliberately
        // separate from draft generation and from read-only projection.
        ['inbound', 'inventory', 'post_purchase_receipt'],
        ['inbound', 'inventory', 'post_purchase_return'],
        ['inbound', 'inventory', 'post_purchase_receipt_adjustment'],
        ['production-progress', 'inventory', 'post_production_fact'],
        ['processing-contracts', 'inventory', 'post_outsourcing_fact'],
        ['shipments', 'inventory', 'ship_shipment'],
        [
          'shipments',
          'inventory',
          'execute_finished_goods_delivery_shipment_ship',
        ],
        ['inbound', 'inventory', 'execute_material_supply_post_inbound'],
        ['payables', 'payables', 'post_finance_fact'],
        ['receivables', 'receivables', 'post_finance_fact'],
        ['invoices', 'invoices', 'post_finance_fact'],
        ['reconciliation', 'reconciliation', 'post_finance_fact'],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.POST_FACT,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [
        // Cancelling a posted inventory-affecting fact writes an auditable
        // reversal instead of deleting or merely relabelling the source fact.
        ['inbound', 'inventory', 'cancel_purchase_receipt'],
        ['inbound', 'inventory', 'cancel_purchase_return'],
        ['inbound', 'inventory', 'cancel_purchase_receipt_adjustment'],
        ['production-progress', 'inventory', 'cancel_production_fact'],
        ['processing-contracts', 'inventory', 'cancel_outsourcing_fact'],
        ['shipments', 'inventory', 'cancel_shipment'],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.FACT_REVERSAL,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [
        // Source-document and Fact lifecycle changes are not downstream
        // generation. Fact reversals above remain separately visible from
        // their source record's lifecycle transition.
        ['material-bom', 'material-bom', 'activate_bom_version'],
        ['material-bom', 'material-bom', 'archive_bom_version'],
        [
          'sales-orders',
          'sales-orders',
          'execute_sales_order_acceptance_submit',
        ],
        ['sales-orders', 'sales-orders', 'activate_sales_order'],
        ['sales-orders', 'sales-orders', 'close_sales_order'],
        ['sales-orders', 'sales-orders', 'cancel_sales_order'],
        [
          'accessories-purchase',
          'accessories-purchase',
          'submit_purchase_order',
        ],
        [
          'accessories-purchase',
          'accessories-purchase',
          'approve_purchase_order',
        ],
        [
          'accessories-purchase',
          'accessories-purchase',
          'close_purchase_order',
        ],
        [
          'accessories-purchase',
          'accessories-purchase',
          'cancel_purchase_order',
        ],
        [
          'processing-contracts',
          'processing-contracts',
          'submit_outsourcing_order',
        ],
        [
          'processing-contracts',
          'processing-contracts',
          'confirm_outsourcing_order',
        ],
        [
          'processing-contracts',
          'processing-contracts',
          'close_outsourcing_order',
        ],
        [
          'processing-contracts',
          'processing-contracts',
          'cancel_outsourcing_order',
        ],
        ['production-orders', 'production-orders', 'release_production_order'],
        ['production-orders', 'production-orders', 'close_production_order'],
        [
          'production-orders',
          'production-scheduling',
          'close_production_order',
        ],
        ['production-orders', 'production-orders', 'cancel_production_order'],
        [
          'production-orders',
          'production-scheduling',
          'cancel_production_order',
        ],
        ['inbound', 'inbound', 'cancel_purchase_receipt'],
        ['inbound', 'inbound', 'cancel_purchase_return'],
        ['inbound', 'inbound', 'cancel_purchase_receipt_adjustment'],
        [
          'quality-inspections',
          'quality-inspections',
          'submit_quality_inspection',
        ],
        ['quality-inspections', 'inventory', 'submit_quality_inspection'],
        [
          'quality-inspections',
          'quality-inspections',
          'cancel_quality_inspection',
        ],
        ['quality-inspections', 'inventory', 'cancel_quality_inspection'],
        [
          'quality-inspections',
          'quality-inspections',
          'pass_quality_inspection',
        ],
        ['quality-inspections', 'inventory', 'pass_quality_inspection'],
        [
          'quality-inspections',
          'production-progress',
          'pass_quality_inspection',
        ],
        [
          'quality-inspections',
          'quality-inspections',
          'reject_quality_inspection',
        ],
        ['quality-inspections', 'inventory', 'reject_quality_inspection'],
        [
          'quality-inspections',
          'production-progress',
          'reject_quality_inspection',
        ],
        [
          'shipments',
          'quality-inspections',
          'execute_finished_goods_delivery_quality_decide',
        ],
        [
          'quality-inspections',
          'inventory',
          'execute_finished_goods_delivery_quality_decide',
        ],
        [
          'production-progress',
          'production-progress',
          'execute_production_wip_action',
        ],
        [
          'production-progress',
          'production-progress',
          'cancel_production_fact',
        ],
        [
          'processing-contracts',
          'processing-contracts',
          'cancel_outsourcing_fact',
        ],
        ['outbound', 'outbound', 'release_stock_reservation'],
        ['shipments', 'shipping-release', 'ship_shipment'],
        ['shipments', 'shipments', 'cancel_shipment'],
        ['shipments', 'shipping-release', 'cancel_shipment'],
        ['payables', 'payables', 'settle_finance_fact'],
        ['payables', 'payables', 'cancel_finance_fact'],
        ['receivables', 'receivables', 'settle_finance_fact'],
        ['receivables', 'receivables', 'cancel_finance_fact'],
        ['invoices', 'invoices', 'cancel_finance_fact'],
        ['reconciliation', 'reconciliation', 'settle_finance_fact'],
        ['reconciliation', 'reconciliation', 'cancel_finance_fact'],
        ['sales-returns', 'sales-returns', 'approve_sales_return'],
        ['sales-returns', 'sales-returns', 'cancel_sales_return'],
        ['inventory', 'inventory', 'cancel_inventory_operation'],
        [
          'quality-inspections',
          'quality-inspections',
          'post_purchase_rejection_disposition',
        ],
        [
          'quality-inspections',
          'quality-inspections',
          'cancel_purchase_rejection_disposition',
        ],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.LIFECYCLE_TRANSITION,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [['shipments', 'sales-returns', 'create_sales_return']].map(
        ([fromPageKey, toPageKey, action]) =>
          businessFlow({
            flowType: BUSINESS_FLOW_TYPES.DOMAIN_GENERATE,
            fromPageKey,
            toPageKey,
            action,
          })
      )
    )
    .concat(
      [
        ['inventory', 'inventory', 'create_inventory_operation'],
        ['finance-payments', 'finance-payments', 'create_finance_payment'],
        ['finance-payments', 'finance-payments', 'create_finance_credit_note'],
        [
          'quality-inspections',
          'quality-inspections',
          'create_purchase_rejection_disposition',
        ],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.UNSCOPED_MUTATION,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [
        ['inventory', 'inventory', 'post_inventory_operation'],
        ['sales-returns', 'inventory', 'receive_sales_return'],
        ['finance-payments', 'finance-payments', 'post_finance_payment'],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.POST_FACT,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [
        ['finance-payments', 'finance-payments', 'reverse_finance_payment'],
        ['finance-payments', 'finance-payments', 'reverse_finance_credit_note'],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.FACT_REVERSAL,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [
        // Customer-config process runtime may orchestrate the same domain
        // records. Start/gate/release actions listed here only advance the
        // process; domain-writing wrappers stay classified by their actual
        // generate/post/lifecycle effect above.
        [
          'sales-orders',
          'sales-orders',
          'start_sales_order_acceptance_process',
        ],
        [
          'accessories-purchase',
          'accessories-purchase',
          'start_material_supply_purchase_order_process',
        ],
        ['shipments', 'shipments', 'start_finished_goods_delivery_process'],
        [
          'shipments',
          'shipments',
          'execute_finished_goods_delivery_finance_release',
        ],
        ['inbound', 'inbound', 'execute_material_supply_quality_gate'],
      ].map(([fromPageKey, toPageKey, action]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.PROCESS_ORCHESTRATION,
          fromPageKey,
          toPageKey,
          action,
        })
      )
    )
    .concat(
      [
        // Read-only inventory projections retain the authoritative Fact type.
        ['inbound', 'inventory', 'PURCHASE_RECEIPT'],
        ['inbound', 'inventory', 'PURCHASE_RETURN'],
        ['inbound', 'inventory', 'PURCHASE_RECEIPT_ADJUSTMENT'],
        ['production-progress', 'inventory', 'PRODUCTION_FACT'],
        ['processing-contracts', 'inventory', 'OUTSOURCING_FACT'],
        ['shipments', 'inventory', 'SHIPMENT'],
      ].map(([fromPageKey, toPageKey, sourceType]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.READ_PROJECTION,
          fromPageKey,
          toPageKey,
          sourceType,
        })
      )
    )
    .concat(
      [
        // Only direct routes supported by businessSourceNavigation are listed.
        ['inbound', 'accessories-purchase', 'PURCHASE_ORDER'],
        ['inbound', 'inbound', 'PURCHASE_RECEIPT'],
        ['inbound', 'quality-inspections', 'QUALITY_INSPECTION'],
        ['quality-inspections', 'inbound', 'PURCHASE_RECEIPT'],
        ['quality-inspections', 'shipments', 'SHIPMENT'],
        ['production-progress', 'production-orders', 'PRODUCTION_ORDER'],
        ['production-progress', 'production-progress', 'PRODUCTION_FACT'],
        ['processing-contracts', 'processing-contracts', 'OUTSOURCING_ORDER'],
        ['processing-contracts', 'processing-contracts', 'OUTSOURCING_FACT'],
        ['quality-inspections', 'processing-contracts', 'OUTSOURCING_FACT'],
        ['outbound', 'sales-orders', 'SALES_ORDER'],
        ['shipments', 'sales-orders', 'SALES_ORDER'],
        ['inventory', 'inbound', 'PURCHASE_RECEIPT'],
        ['inventory', 'production-progress', 'PRODUCTION_FACT'],
        ['inventory', 'shipments', 'SHIPMENT'],
        ['payables', 'inbound', 'PURCHASE_RECEIPT'],
        ['receivables', 'shipments', 'SHIPMENT'],
        ['invoices', 'shipments', 'SHIPMENT'],
      ].map(([fromPageKey, toPageKey, sourceType]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.SOURCE_NAVIGATION,
          fromPageKey,
          toPageKey,
          sourceType,
        })
      )
    )
    .concat(
      [
        ['products', 'material-bom'],
        ['products', 'processing-contracts'],
      ].map(([fromPageKey, toPageKey]) =>
        businessFlow({
          flowType: BUSINESS_FLOW_TYPES.PRINT_SNAPSHOT,
          fromPageKey,
          toPageKey,
        })
      )
    )
)

function lineage(definition) {
  return Object.freeze({
    ...definition,
    upstreamPageKeys: Object.freeze([...definition.upstreamPageKeys]),
    producerActions: Object.freeze([...definition.producerActions]),
    sourceTypes: Object.freeze([...definition.sourceTypes]),
    downstreamPageKeys: Object.freeze([...definition.downstreamPageKeys]),
    incomingFlows: Object.freeze(
      businessPageFlowDefinitions.filter(
        (flowDefinition) => flowDefinition.toPageKey === definition.pageKey
      )
    ),
    outgoingFlows: Object.freeze(
      businessPageFlowDefinitions.filter(
        (flowDefinition) => flowDefinition.fromPageKey === definition.pageKey
      )
    ),
    taskGroups: Object.freeze([...definition.taskGroups]),
  })
}

const LINEAGE_BY_PAGE_KEY = Object.freeze({
  customers: {
    pageRole: BUSINESS_PAGE_ROLES.OWNER,
    upstreamPageKeys: [],
    producerActions: ['create_customer'],
    sourceTypes: [],
    downstreamPageKeys: ['sales-orders'],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  suppliers: {
    pageRole: BUSINESS_PAGE_ROLES.OWNER,
    upstreamPageKeys: [],
    producerActions: ['create_supplier'],
    sourceTypes: [],
    downstreamPageKeys: ['accessories-purchase', 'processing-contracts'],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  products: {
    pageRole: BUSINESS_PAGE_ROLES.OWNER,
    upstreamPageKeys: [],
    producerActions: ['create_product', 'create_product_sku'],
    sourceTypes: [],
    downstreamPageKeys: [
      'sales-orders',
      'material-bom',
      'processing-contracts',
      'production-orders',
      'shipments',
    ],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  materials: {
    pageRole: BUSINESS_PAGE_ROLES.OWNER,
    upstreamPageKeys: [],
    producerActions: ['create_material'],
    sourceTypes: [],
    downstreamPageKeys: [
      'material-bom',
      'accessories-purchase',
      'processing-contracts',
      'inbound',
      'inventory',
    ],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  'sales-orders': {
    pageRole: BUSINESS_PAGE_ROLES.SOURCE_DOCUMENT_OWNER,
    upstreamPageKeys: ['customers', 'products'],
    producerActions: ['save_sales_order_with_items'],
    sourceTypes: [],
    downstreamPageKeys: ['production-orders', 'outbound', 'shipments'],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  'sales-returns': {
    pageRole: BUSINESS_PAGE_ROLES.FACT_OWNER,
    upstreamPageKeys: ['shipments'],
    producerActions: ['create_sales_return'],
    sourceTypes: ['SHIPMENT'],
    downstreamPageKeys: ['inventory'],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote:
      '退货审核不改变库存；确认收回才写入库存，取消已收回退货通过反向库存记录恢复。',
  },
  'material-bom': {
    pageRole: BUSINESS_PAGE_ROLES.OWNER,
    upstreamPageKeys: ['products', 'materials'],
    producerActions: ['save_bom_with_items', 'copy_bom_version'],
    sourceTypes: [],
    downstreamPageKeys: ['production-orders'],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  processes: {
    pageRole: BUSINESS_PAGE_ROLES.OWNER,
    upstreamPageKeys: [],
    producerActions: ['create_process'],
    sourceTypes: [],
    downstreamPageKeys: ['processing-contracts'],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  'accessories-purchase': {
    pageRole: BUSINESS_PAGE_ROLES.SOURCE_DOCUMENT_OWNER,
    upstreamPageKeys: ['suppliers', 'materials'],
    producerActions: ['save_purchase_order_with_items'],
    sourceTypes: [],
    downstreamPageKeys: ['inbound', 'quality-inspections', 'inventory'],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  inbound: {
    pageRole: BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    upstreamPageKeys: ['accessories-purchase', 'quality-inspections'],
    producerActions: [
      'create_purchase_receipt_from_purchase_order',
      'execute_material_supply_purchase_receipt_create',
      'add_purchase_receipt_item',
      'create_purchase_return_from_receipt',
      'create_purchase_return_from_quality_inspection',
      'create_purchase_receipt_adjustment_from_receipt',
    ],
    sourceTypes: ['PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'QUALITY_INSPECTION'],
    downstreamPageKeys: ['quality-inspections', 'inventory', 'payables'],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote:
      '正式页面和公开写接口均只允许从已审核采购订单生成；追加行继续强制同一采购订单行来源。',
  },
  'quality-inspections': {
    pageRole: BUSINESS_PAGE_ROLES.SOURCE_GENERATED,
    upstreamPageKeys: [
      'accessories-purchase',
      'inbound',
      'processing-contracts',
      'production-progress',
      'shipments',
    ],
    producerActions: [
      'create_purchase_receipt_from_purchase_order',
      'execute_material_supply_purchase_receipt_create',
      'add_purchase_receipt_item',
      'create_quality_inspection_draft',
      'create_quality_inspection_from_outsourcing_return',
      'execute_production_wip_action',
      'create_finished_goods_quality_inspection_draft',
    ],
    sourceTypes: [
      'PURCHASE_RECEIPT',
      'OUTSOURCING_FACT',
      'PRODUCTION_WIP',
      'SHIPMENT',
    ],
    downstreamPageKeys: [
      'inbound',
      'inventory',
      'production-progress',
      'shipments',
      'payables',
    ],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote:
      '采购来料由入库准备生成，委外回货从委外页面发起；生产 WIP 完工/回仓在工序需要质量关口时原子生成检验草稿；出货前成品检验从草稿出货单按送检批次发起。它们都生成独立质检 Fact，不由 Workflow 任务完成代写。',
  },
  inventory: {
    pageRole: BUSINESS_PAGE_ROLES.FACT_OWNER,
    upstreamPageKeys: [
      'accessories-purchase',
      'inbound',
      'processing-contracts',
      'production-orders',
      'production-progress',
      'outbound',
      'shipments',
    ],
    producerActions: ['create_inventory_operation'],
    sourceTypes: [
      'PURCHASE_RECEIPT',
      'PURCHASE_RETURN',
      'PURCHASE_RECEIPT_ADJUSTMENT',
      'PRODUCTION_FACT',
      'OUTSOURCING_FACT',
      'SHIPMENT',
    ],
    downstreamPageKeys: [],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  'processing-contracts': {
    pageRole: BUSINESS_PAGE_ROLES.SOURCE_DOCUMENT_OWNER,
    upstreamPageKeys: ['suppliers', 'products', 'materials', 'processes'],
    producerActions: [
      'save_outsourcing_order_with_items',
      'create_outsourcing_material_issue_from_order',
      'create_outsourcing_return_receipt_from_order',
    ],
    sourceTypes: [],
    downstreamPageKeys: [
      'production-progress',
      'quality-inspections',
      'inventory',
      'payables',
    ],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  'production-orders': {
    pageRole: BUSINESS_PAGE_ROLES.SOURCE_DOCUMENT_OWNER,
    upstreamPageKeys: ['sales-orders', 'material-bom', 'products'],
    producerActions: ['create_production_order'],
    sourceTypes: [],
    downstreamPageKeys: [
      'production-scheduling',
      'production-progress',
      'inventory',
    ],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  'production-scheduling': {
    pageRole: BUSINESS_PAGE_ROLES.WORKFLOW_INBOX,
    upstreamPageKeys: ['production-orders'],
    producerActions: ['release_production_order'],
    sourceTypes: ['production-orders'],
    downstreamPageKeys: [],
    taskGroups: ['production_scheduling'],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.IMPLEMENTED,
    availabilityNote:
      '生产订单从草稿发布时原子生成 PMC 排程待办；任务完成只结束排程协同，不生成领料、完工或库存事实。',
  },
  'production-progress': {
    pageRole: BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    upstreamPageKeys: ['production-orders', 'processing-contracts'],
    producerActions: [
      'release_production_order',
      'create_production_material_issue_from_order',
      'create_production_completion_from_order',
      'create_production_rework_from_completion',
    ],
    sourceTypes: ['PRODUCTION_ORDER', 'PRODUCTION_FACT'],
    downstreamPageKeys: ['production-exceptions', 'inventory'],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote:
      'WIP 外发分配持久化已确认委外合同行锚点，外发回仓按该锚点重验来源，不从名称或前端快照猜测合同。',
  },
  'production-exceptions': {
    pageRole: BUSINESS_PAGE_ROLES.WORKFLOW_INBOX,
    upstreamPageKeys: ['production-progress'],
    producerActions: ['post_production_fact'],
    sourceTypes: ['production-progress'],
    downstreamPageKeys: [],
    taskGroups: ['production_exception'],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.IMPLEMENTED,
    availabilityNote:
      '返工生产记录过账时原子生成生产异常待办；普通领料或完工过账不生成异常任务，任务完成也不代替返工事实。',
  },
  'shipping-release': {
    pageRole: BUSINESS_PAGE_ROLES.WORKFLOW_INBOX,
    upstreamPageKeys: ['shipments'],
    producerActions: ['submit_shipment_release'],
    sourceTypes: ['shipments'],
    downstreamPageKeys: ['shipments'],
    taskGroups: ['shipment_release'],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.IMPLEMENTED,
    availabilityNote:
      '草稿出货单由显式提交动作生成仓库放行待办；放行完成只形成可发货协同状态，不等于确认出货、库存扣减或财务事实。',
  },
  outbound: {
    pageRole: BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    upstreamPageKeys: ['sales-orders'],
    producerActions: ['create_stock_reservation_from_sales_order'],
    sourceTypes: [],
    downstreamPageKeys: ['inventory', 'shipments'],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  shipments: {
    pageRole: BUSINESS_PAGE_ROLES.FACT_OWNER,
    upstreamPageKeys: ['sales-orders', 'products'],
    producerActions: ['create_shipment_with_items'],
    sourceTypes: [],
    downstreamPageKeys: [
      'outbound',
      'quality-inspections',
      'shipping-release',
      'inventory',
      'receivables',
      'invoices',
    ],
    taskGroups: [],
    allowsGenericPageCreate: true,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  reconciliation: {
    pageRole: BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    upstreamPageKeys: ['payables', 'receivables', 'invoices'],
    producerActions: ['create_reconciliation_from_finance_fact'],
    sourceTypes: ['FINANCE_FACT'],
    downstreamPageKeys: [],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  'finance-payments': {
    pageRole: BUSINESS_PAGE_ROLES.FACT_OWNER,
    upstreamPageKeys: ['payables', 'receivables'],
    producerActions: ['create_finance_payment', 'create_finance_credit_note'],
    sourceTypes: ['FINANCE_FACT'],
    downstreamPageKeys: [],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote:
      '收付款以真实往来方和币种核销；冲销和红冲保留原事实及反向审计，不替代总账或税控。',
  },
  payables: {
    pageRole: BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    upstreamPageKeys: ['inbound', 'processing-contracts'],
    producerActions: [
      'create_payable_from_purchase_receipt',
      'create_payable_from_outsourcing_return',
    ],
    sourceTypes: ['PURCHASE_RECEIPT', 'OUTSOURCING_FACT'],
    downstreamPageKeys: ['reconciliation'],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  receivables: {
    pageRole: BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    upstreamPageKeys: ['shipments'],
    producerActions: [
      'create_receivable_from_shipment',
      'execute_finished_goods_delivery_receivable_lead',
    ],
    sourceTypes: ['SHIPMENT'],
    downstreamPageKeys: ['reconciliation'],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
  invoices: {
    pageRole: BUSINESS_PAGE_ROLES.FACT_PROCESSING,
    upstreamPageKeys: ['shipments'],
    producerActions: ['create_invoice_from_shipment'],
    sourceTypes: ['SHIPMENT'],
    downstreamPageKeys: ['reconciliation'],
    taskGroups: [],
    allowsGenericPageCreate: false,
    availability: BUSINESS_PAGE_AVAILABILITY.IMPLEMENTED,
    taskProducerStatus: WORKFLOW_TASK_PRODUCER_STATUS.NOT_APPLICABLE,
    availabilityNote: '',
  },
})

const formalBusinessPageKeys = businessModuleDefinitions
  .filter((moduleItem) => moduleItem.pageKind === 'formal-v1')
  .map((moduleItem) => moduleItem.key)
const registeredBusinessPageKeys = Object.keys(LINEAGE_BY_PAGE_KEY)
const formalBusinessPageKeySet = new Set(formalBusinessPageKeys)
const missingBusinessPageKeys = formalBusinessPageKeys.filter(
  (pageKey) => !LINEAGE_BY_PAGE_KEY[pageKey]
)
const extraBusinessPageKeys = registeredBusinessPageKeys.filter(
  (pageKey) => !formalBusinessPageKeySet.has(pageKey)
)

if (missingBusinessPageKeys.length > 0 || extraBusinessPageKeys.length > 0) {
  throw new Error(
    `business page lineage registry mismatch: missing=${missingBusinessPageKeys.join(',') || '-'} extra=${extraBusinessPageKeys.join(',') || '-'}`
  )
}

/** @type {readonly BusinessPageLineage[]} */
export const businessPageLineageDefinitions = Object.freeze(
  formalBusinessPageKeys.map((pageKey) =>
    lineage({
      pageKey,
      ...LINEAGE_BY_PAGE_KEY[pageKey],
    })
  )
)

const businessPageLineageMap = new Map(
  businessPageLineageDefinitions.map((definition) => [
    definition.pageKey,
    definition,
  ])
)

/**
 * @param {string} pageKey
 * @returns {BusinessPageLineage | null}
 */
export function getBusinessPageLineage(pageKey = '') {
  return businessPageLineageMap.get(String(pageKey || '').trim()) || null
}
