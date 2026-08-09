export const DEV_BUSINESS_CHAIN_CATALOG_VERSION =
  'dev-business-chain-catalog/v1'

export const DEV_BUSINESS_CHAIN_OVERVIEW_KEY = 'all'

export const DEV_BUSINESS_CHAIN_KINDS = Object.freeze([
  'primary',
  'supporting',
  'exception',
  'rework',
  'reversal',
])

export const DEV_BUSINESS_CHAIN_LAYERS = Object.freeze([
  'source_document',
  'masterdata_lifecycle',
  'process_runtime',
  'workflow_task',
  'fact_ledger',
  'derived_result',
])

export const DEV_BUSINESS_CHAIN_EDGE_KINDS = Object.freeze([
  'starts_process',
  'creates_task',
  'calls_domain_command',
  'requires',
  'creates_source',
  'posts_fact',
  'derives',
  'reverses',
  'returns',
  'reworks',
])

export const DEV_BUSINESS_CHAIN_RELATION_KINDS = Object.freeze([
  'continues',
  'supplies',
  'branches_to',
  'returns_to',
  'corrects',
  'cross_cuts',
  'reworks',
])

export const DEV_BUSINESS_CHAIN_CROSS_CUTTING_EXCLUSIONS = Object.freeze({
  'master.lifecycle':
    '通用主数据启停词汇会被多条链引用，不代表一条独立业务链。',
  'workflow.task':
    'Workflow Task 是所有协同链共享的执行面，由业务链节点按真实需要显式展示。',
  'workflow.business_projection':
    '业务进度是跨来源投影，不是可以单独驱动事实写入的业务链。',
  'process.instance':
    'ProcessInstance 是运行控制面；真实实例只能按 task_id 单流程读取。',
  'process.node':
    'ProcessNodeInstance 是运行控制面；不能作为跨领域业务节点替代领域事实。',
  'control.customer_config_revision':
    '客户配置修订是控制面审批，不属于 Product Core 业务履约链。',
})

const CHAIN_KIND_SET = new Set(DEV_BUSINESS_CHAIN_KINDS)
const CHAIN_LAYER_SET = new Set(DEV_BUSINESS_CHAIN_LAYERS)
const EDGE_KIND_SET = new Set(DEV_BUSINESS_CHAIN_EDGE_KINDS)
const RELATION_KIND_SET = new Set(DEV_BUSINESS_CHAIN_RELATION_KINDS)

const ARCHITECTURE_REF = 'docs/architecture/业务链与运行轨迹边界.md'
const WORKFLOW_MAP_REF = 'docs/workflow/业务与协同流程地图.md'
const PRODUCT_FLOW_REF = 'docs/product/业务主链路数据流向与字段来源规则.md'
const PROCESS_CONTRACT_REF = 'server/internal/biz/customer_process_contracts.go'
const PROCESS_RUNTIME_REF = 'server/internal/biz/process_runtime.go'

const uniqueStrings = (values) =>
  Object.freeze([
    ...new Set((Array.isArray(values) ? values : []).filter(Boolean)),
  ])

const chainNode = (key, label, layer, options = {}) => ({
  key,
  label,
  layer,
  summary: options.summary || '',
  machineKeys: options.machineKeys || [],
  factKeys:
    options.factKeys ||
    (layer === 'fact_ledger' ? options.machineKeys || [] : []),
  processDefinitionKeys: options.processDefinitionKeys || [],
  responsibleRoleKeys: options.responsibleRoleKeys || [],
  sourceRefs: options.sourceRefs || [],
})

const chainEdge = (from, to, label, kind, options = {}) => ({
  key: options.key || `${from}:${kind}:${to}`,
  from,
  to,
  label,
  kind,
  action: options.action || '',
  factBoundary: options.factBoundary || '',
  sourceRefs: options.sourceRefs || [],
})

const chain = (key, label, kind, summary, nodes, edges, options = {}) => ({
  key,
  label,
  kind,
  summary,
  entryNodeKeys: options.entryNodeKeys || [nodes[0]?.key],
  nodes,
  edges,
  sourceRefs: options.sourceRefs || [],
})

const BUSINESS_CHAIN_DEFINITIONS = [
  chain(
    'sales_to_production',
    '销售受理到生产准备',
    'primary',
    '销售订单经审批、工程资料和 PMC 评审后，关联有效 BOM、形成库存预留并进入生产准备。',
    [
      chainNode('sales_order', '销售订单与订单行', 'source_document', {
        machineKeys: ['source.sales_order', 'source.order_item'],
        sourceRefs: ['server/internal/biz/sales_order.go'],
      }),
      chainNode('sales_acceptance', '销售订单受理流程', 'process_runtime', {
        processDefinitionKeys: [
          'sales_order_acceptance/approval_pmc',
          'sales_order_acceptance/approval_engineering_pmc',
        ],
        sourceRefs: [PROCESS_CONTRACT_REF, PROCESS_RUNTIME_REF],
      }),
      chainNode('sales_tasks', '审批、工程与 PMC 任务', 'workflow_task', {
        sourceRefs: ['server/internal/biz/workflow_source_tasks.go'],
      }),
      chainNode('effective_bom', '有效 BOM 版本', 'masterdata_lifecycle', {
        machineKeys: ['master.bom'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
      chainNode('stock_reservation', '销售库存预留', 'fact_ledger', {
        machineKeys: ['fact.stock_reservation'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('production_order', '生产订单', 'source_document', {
        machineKeys: ['source.production_order'],
        sourceRefs: ['server/internal/biz/production_order.go'],
      }),
    ],
    [
      chainEdge(
        'sales_order',
        'sales_acceptance',
        '提交后启动受理',
        'starts_process',
        {
          action: 'SalesOrderUsecase.SubmitSalesOrder',
          factBoundary: 'source_document_only',
          sourceRefs: [
            'server/internal/biz/sales_order.go',
            'server/internal/biz/sales_order_process_command.go',
          ],
        }
      ),
      chainEdge(
        'sales_acceptance',
        'sales_tasks',
        '按业务分支创建岗位任务',
        'creates_task',
        {
          action: 'ProcessRuntime materialize human_task / approval',
          factBoundary: 'orchestration_only',
          sourceRefs: [
            PROCESS_RUNTIME_REF,
            'server/internal/biz/process_runtime_workflow.go',
          ],
        }
      ),
      chainEdge(
        'sales_tasks',
        'sales_acceptance',
        '办理结果推进流程节点',
        'calls_domain_command',
        {
          action: 'Workflow task decision / completion',
          factBoundary: 'workflow_and_process_only',
          sourceRefs: ['server/internal/biz/workflow.go', PROCESS_RUNTIME_REF],
        }
      ),
      chainEdge(
        'sales_acceptance',
        'effective_bom',
        '生产准备要求有效版本',
        'requires',
        {
          action: 'validate active BOM snapshot',
          factBoundary: 'masterdata_reference_only',
          sourceRefs: ['server/internal/biz/production_order.go'],
        }
      ),
      chainEdge(
        'sales_acceptance',
        'stock_reservation',
        '按销售来源建立预留',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.CreateStockReservationFromSalesOrder',
          factBoundary: 'stock_reservation_fact',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'effective_bom',
        'production_order',
        '形成生产来源单',
        'creates_source',
        {
          action: 'ProductionOrderUsecase.CreateDraft / Release',
          factBoundary: 'source_document_only',
          sourceRefs: ['server/internal/biz/production_order.go'],
        }
      ),
    ]
  ),
  chain(
    'purchase_to_inventory',
    '采购下单到合格入库',
    'primary',
    '采购订单经审批后生成采购收货，质量判定通过后才形成可用库存批次。',
    [
      chainNode('purchase_order', '采购订单与订单行', 'source_document', {
        machineKeys: ['source.purchase_order', 'source.order_item'],
        sourceRefs: ['server/internal/biz/purchase_order.go'],
      }),
      chainNode('purchase_approval', '采购审批流程', 'process_runtime', {
        processDefinitionKeys: ['material_supply/purchase_order_approval'],
        sourceRefs: [PROCESS_CONTRACT_REF, PROCESS_RUNTIME_REF],
      }),
      chainNode('purchase_task', '采购审批任务', 'workflow_task', {
        sourceRefs: ['server/internal/biz/workflow_source_tasks.go'],
      }),
      chainNode('purchase_receipt', '采购收货单', 'fact_ledger', {
        machineKeys: ['fact.purchase_receipt'],
        sourceRefs: ['server/internal/biz/purchase_receipt.go'],
      }),
      chainNode('purchase_quality', '采购质量检验', 'fact_ledger', {
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: ['server/internal/biz/quality_inspection.go'],
      }),
      chainNode('purchase_lot', '合格库存批次', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
    ],
    [
      chainEdge(
        'purchase_order',
        'purchase_approval',
        '提交后启动审批',
        'starts_process',
        {
          action: 'PurchaseOrderUsecase.SubmitPurchaseOrderForProcessCommand',
          factBoundary: 'source_document_only',
          sourceRefs: ['server/internal/biz/purchase_order.go'],
        }
      ),
      chainEdge(
        'purchase_approval',
        'purchase_task',
        '创建采购审批任务',
        'creates_task',
        {
          action: 'ProcessRuntime materialize approval',
          factBoundary: 'orchestration_only',
          sourceRefs: [
            PROCESS_RUNTIME_REF,
            'server/internal/biz/process_runtime_workflow.go',
          ],
        }
      ),
      chainEdge(
        'purchase_task',
        'purchase_approval',
        '审批决定推进流程',
        'calls_domain_command',
        {
          action: 'PurchaseOrderUsecase.ApprovePurchaseOrderForProcessCommand',
          factBoundary: 'source_document_only',
          sourceRefs: ['server/internal/biz/purchase_order.go'],
        }
      ),
      chainEdge(
        'purchase_approval',
        'purchase_receipt',
        '从采购来源生成收货',
        'creates_source',
        {
          action: 'InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder',
          factBoundary: 'purchase_receipt_draft',
          sourceRefs: ['server/internal/biz/purchase_receipt.go'],
        }
      ),
      chainEdge(
        'purchase_receipt',
        'purchase_quality',
        '建立采购质检',
        'creates_source',
        {
          action: 'InventoryUsecase.CreateQualityInspectionFromPurchaseReceipt',
          factBoundary: 'quality_inspection_fact',
          sourceRefs: ['server/internal/biz/quality_inspection.go'],
        }
      ),
      chainEdge(
        'purchase_quality',
        'purchase_lot',
        '检验通过并过账入库',
        'posts_fact',
        {
          action:
            'InventoryUsecase.PassQualityInspection / PostPurchaseReceipt',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/quality_inspection.go',
            'server/internal/biz/purchase_receipt.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'production_to_inventory',
    '生产执行到成品入库',
    'primary',
    '生产订单释放后进入在制批次，经过工序、包材确认和完工过账形成成品库存。',
    [
      chainNode(
        'released_production_order',
        '已释放生产订单',
        'source_document',
        {
          machineKeys: ['source.production_order'],
          sourceRefs: ['server/internal/biz/production_order.go'],
        }
      ),
      chainNode('wip_batch', '生产在制批次', 'fact_ledger', {
        machineKeys: ['fact.production_wip_batch'],
        sourceRefs: ['server/internal/biz/production_wip.go'],
      }),
      chainNode('packaging_confirmation', '包材确认', 'fact_ledger', {
        machineKeys: ['fact.production_packaging_confirmation'],
        sourceRefs: ['server/internal/biz/production_wip.go'],
      }),
      chainNode('production_completion', '生产完工事实', 'fact_ledger', {
        machineKeys: ['fact.production'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('finished_goods_lot', '成品库存批次', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
    ],
    [
      chainEdge(
        'released_production_order',
        'wip_batch',
        '释放后建立在制执行',
        'posts_fact',
        {
          action: 'ProductionOrderUsecase.Release',
          factBoundary: 'production_wip',
          sourceRefs: [
            'server/internal/biz/production_order.go',
            'server/internal/biz/production_wip.go',
          ],
        }
      ),
      chainEdge(
        'wip_batch',
        'packaging_confirmation',
        '包装工序确认包材',
        'requires',
        {
          action:
            'ProductionOrderUsecase.ConfirmProductionWIPPackagingMaterial',
          factBoundary: 'production_wip_and_packaging_confirmation',
          sourceRefs: ['server/internal/biz/production_wip.go'],
        }
      ),
      chainEdge(
        'packaging_confirmation',
        'production_completion',
        '完成生产并生成事实',
        'posts_fact',
        {
          action:
            'OperationalFactUsecase.CreateProductionFactFromOrder / PostProductionFact',
          factBoundary: 'production_fact',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'production_completion',
        'finished_goods_lot',
        '完工过账增加成品库存',
        'posts_fact',
        {
          action: 'InventoryUsecase.CreateInventoryTxn',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/operational_fact.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'outsourcing_to_inventory',
    '委外发料到合格回货',
    'supporting',
    '委外订单确认后记录发料与回货事实，回货经质检通过后进入可用库存。',
    [
      chainNode('outsourcing_order', '委外订单', 'source_document', {
        machineKeys: ['source.outsourcing_order'],
        sourceRefs: ['server/internal/biz/outsourcing_order.go'],
      }),
      chainNode('outsourcing_issue', '委外发料事实', 'fact_ledger', {
        machineKeys: ['fact.outsourcing'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('outsourcing_return', '委外回货事实', 'fact_ledger', {
        machineKeys: ['fact.outsourcing'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('outsourcing_quality', '委外回货质检', 'fact_ledger', {
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: ['server/internal/biz/quality_inspection.go'],
      }),
      chainNode('outsourcing_lot', '合格库存批次', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
    ],
    [
      chainEdge(
        'outsourcing_order',
        'outsourcing_issue',
        '确认订单并记录发料',
        'posts_fact',
        {
          action:
            'OperationalFactUsecase.CreateOutsourcingMaterialIssueFromOrder / PostOutsourcingFact',
          factBoundary: 'outsourcing_issue_and_inventory',
          sourceRefs: [
            'server/internal/biz/outsourcing_order.go',
            'server/internal/biz/operational_fact.go',
          ],
        }
      ),
      chainEdge(
        'outsourcing_issue',
        'outsourcing_return',
        '按来源登记回货',
        'returns',
        {
          action:
            'OperationalFactUsecase.CreateOutsourcingReturnReceiptFromOrder',
          factBoundary: 'outsourcing_return_receipt',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'outsourcing_return',
        'outsourcing_quality',
        '回货创建质检',
        'creates_source',
        {
          action:
            'InventoryUsecase.CreateQualityInspectionFromOutsourcingReturn',
          factBoundary: 'quality_inspection_fact',
          sourceRefs: ['server/internal/biz/quality_inspection.go'],
        }
      ),
      chainEdge(
        'outsourcing_quality',
        'outsourcing_lot',
        '检验通过后入库',
        'posts_fact',
        {
          action: 'InventoryUsecase.PassQualityInspection',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/quality_inspection.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'delivery_to_settlement',
    '成品出货到应收结清',
    'primary',
    '出货单经财务放行后才能执行真实出货；真实出货完成后再产生应收或发票，收款过账后形成核销与结清。',
    [
      chainNode('shipment_draft', '出货单', 'fact_ledger', {
        machineKeys: ['fact.shipment'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode(
        'shipment_release_process',
        '出货财务放行流程',
        'process_runtime',
        {
          processDefinitionKeys: [
            'finished_goods_delivery/shipment_finance_approval',
          ],
          sourceRefs: [PROCESS_CONTRACT_REF, PROCESS_RUNTIME_REF],
        }
      ),
      chainNode('shipment_release_task', '出货财务审批任务', 'workflow_task', {
        sourceRefs: ['server/internal/biz/workflow_source_tasks.go'],
      }),
      chainNode('shipment_release', '财务放行结果', 'derived_result', {
        machineKeys: ['fact.shipment_finance_release'],
        factKeys: ['fact.shipment_finance_release'],
        sourceRefs: ['server/internal/biz/shipment_process_command.go'],
      }),
      chainNode('shipped', '真实出货事实', 'fact_ledger', {
        machineKeys: ['fact.shipment'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('receivable', '应收与发票事实', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('payment_process', '收付款审批流程', 'process_runtime', {
        processDefinitionKeys: ['finance_payment_approval/approval_post'],
        sourceRefs: [PROCESS_CONTRACT_REF, PROCESS_RUNTIME_REF],
      }),
      chainNode('payment_task', '收付款审批与执行任务', 'workflow_task', {
        sourceRefs: ['server/internal/biz/workflow_source_tasks.go'],
      }),
      chainNode('payment', '收款事实', 'fact_ledger', {
        machineKeys: ['fact.finance_payment'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
      chainNode('allocation', '核销记录', 'fact_ledger', {
        machineKeys: ['fact.finance_allocation'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
      chainNode('credit_note', '红冲单', 'fact_ledger', {
        machineKeys: ['fact.finance_credit_note'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
    ],
    [
      chainEdge(
        'shipment_draft',
        'shipment_release_process',
        '提交财务放行',
        'starts_process',
        {
          action: 'OperationalFactUsecase.SubmitShipmentRelease',
          factBoundary: 'shipment_release_not_shipped',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'shipment_release_process',
        'shipment_release_task',
        '创建财务审批任务',
        'creates_task',
        {
          action: 'ProcessRuntime materialize approval',
          factBoundary: 'orchestration_only',
          sourceRefs: [
            PROCESS_RUNTIME_REF,
            'server/internal/biz/process_runtime_workflow.go',
          ],
        }
      ),
      chainEdge(
        'shipment_release_task',
        'shipment_release',
        '审批结果写入放行',
        'calls_domain_command',
        {
          action:
            'OperationalFactUsecase.RecordShipmentFinanceRelease / Rejection',
          factBoundary: 'shipment_release_via_domain_usecase',
          sourceRefs: ['server/internal/biz/shipment_process_command.go'],
        }
      ),
      chainEdge('shipment_release', 'shipped', '放行后执行出货', 'posts_fact', {
        action: 'OperationalFactUsecase.ShipShipmentWithActor',
        factBoundary: 'shipment_and_inventory',
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainEdge('shipped', 'receivable', '真实出货后生成应收', 'posts_fact', {
        action:
          'OperationalFactUsecase.CreateReceivableFromShipment / CreateInvoiceFromShipment',
        factBoundary: 'finance_fact_after_shipped',
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainEdge(
        'receivable',
        'payment_process',
        '收款单启动审批',
        'starts_process',
        {
          action: 'OperationalFactUsecase.CreateFinancePayment',
          factBoundary: 'finance_payment_source_document',
          sourceRefs: [
            'server/internal/biz/finance_payment.go',
            'server/internal/biz/finance_process_command.go',
          ],
        }
      ),
      chainEdge(
        'payment_process',
        'payment_task',
        '创建审批与执行任务',
        'creates_task',
        {
          action: 'ProcessRuntime materialize approval / human_task',
          factBoundary: 'orchestration_only',
          sourceRefs: [
            PROCESS_RUNTIME_REF,
            'server/internal/biz/process_runtime_workflow.go',
          ],
        }
      ),
      chainEdge(
        'payment_task',
        'payment',
        '领域命令过账收款',
        'calls_domain_command',
        {
          action: 'OperationalFactUsecase.PostFinancePaymentForProcessCommand',
          factBoundary: 'finance_payment_post_via_domain_usecase',
          sourceRefs: [
            'server/internal/biz/finance_payment_process_command.go',
          ],
        }
      ),
      chainEdge('payment', 'allocation', '按明细生成核销', 'posts_fact', {
        action: 'OperationalFactUsecase.PostFinancePayment',
        factBoundary: 'finance_payment_and_allocations',
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
      chainEdge('allocation', 'receivable', '派生结清或重开余额', 'derives', {
        action: 'recalculate finance fact outstanding amount',
        factBoundary: 'finance_fact_projection',
        sourceRefs: [
          'server/internal/biz/finance_payment.go',
          'server/internal/biz/operational_fact.go',
        ],
      }),
      chainEdge('credit_note', 'receivable', '红冲减少或恢复应收', 'reverses', {
        action:
          'OperationalFactUsecase.CreateFinanceCreditNote / ReverseFinanceCreditNote',
        factBoundary: 'finance_credit_note_and_fact_balance',
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
    ],
    { entryNodeKeys: ['shipment_draft', 'credit_note'] }
  ),
  chain(
    'finance_payment_and_reversal',
    '收付款、核销与冲正',
    'reversal',
    '收付款过账形成核销；冲正删除有效核销影响并在余额重新出现时把应收应付从结清重开。',
    [
      chainNode('open_finance_fact', '未结应收 / 应付', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode(
        'finance_payment_process',
        '收付款审批流程',
        'process_runtime',
        {
          processDefinitionKeys: ['finance_payment_approval/approval_post'],
          sourceRefs: [PROCESS_CONTRACT_REF, PROCESS_RUNTIME_REF],
        }
      ),
      chainNode('finance_payment', '收付款单', 'fact_ledger', {
        machineKeys: ['fact.finance_payment'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
      chainNode('finance_allocation', '核销记录', 'fact_ledger', {
        machineKeys: ['fact.finance_allocation'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
      chainNode('settled_finance_fact', '结清或重开结果', 'derived_result', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
      chainNode('finance_credit_note', '红冲单', 'fact_ledger', {
        machineKeys: ['fact.finance_credit_note'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
    ],
    [
      chainEdge(
        'open_finance_fact',
        'finance_payment_process',
        '创建收付款并审批',
        'starts_process',
        {
          action: 'OperationalFactUsecase.CreateFinancePayment',
          factBoundary: 'finance_payment_source_document',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'finance_payment_process',
        'finance_payment',
        '领域命令批准并过账',
        'calls_domain_command',
        {
          action: 'OperationalFactUsecase.PostFinancePaymentForProcessCommand',
          factBoundary: 'finance_payment_post_via_domain_usecase',
          sourceRefs: [
            'server/internal/biz/finance_payment_process_command.go',
          ],
        }
      ),
      chainEdge(
        'finance_payment',
        'finance_allocation',
        '生成核销记录',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.PostFinancePayment',
          factBoundary: 'finance_payment_and_allocations',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'finance_allocation',
        'settled_finance_fact',
        '余额为零派生结清',
        'derives',
        {
          action: 'settle finance fact from allocations',
          factBoundary: 'finance_fact_projection',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'finance_payment',
        'open_finance_fact',
        '冲正后恢复未结余额',
        'reverses',
        {
          action: 'OperationalFactUsecase.ReverseFinancePayment',
          factBoundary: 'reverse_payment_allocations_and_reopen_fact',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'open_finance_fact',
        'finance_credit_note',
        '创建红冲单',
        'creates_source',
        {
          action: 'OperationalFactUsecase.CreateFinanceCreditNote',
          factBoundary: 'finance_credit_note',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'finance_credit_note',
        'settled_finance_fact',
        '红冲调整未结余额',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.CreateFinanceCreditNote',
          factBoundary: 'credit_note_and_fact_balance',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'finance_credit_note',
        'open_finance_fact',
        '反向红冲恢复余额',
        'reverses',
        {
          action: 'OperationalFactUsecase.ReverseFinanceCreditNote',
          factBoundary: 'reverse_credit_note_and_reopen_fact',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
    ]
  ),
  chain(
    'inventory_adjustment',
    '人工库存调整',
    'supporting',
    '人工库存操作单经审批和领域命令过账后，才产生库存交易与批次余额变化。',
    [
      chainNode('inventory_operation', '库存操作单', 'source_document', {
        machineKeys: ['fact.inventory_operation'],
        factKeys: ['fact.inventory_operation'],
        sourceRefs: ['server/internal/biz/inventory_operation.go'],
      }),
      chainNode(
        'inventory_adjustment_process',
        '库存调整审批流程',
        'process_runtime',
        {
          processDefinitionKeys: [
            'inventory_adjustment_approval/manual_adjustment_approval',
          ],
          sourceRefs: [PROCESS_CONTRACT_REF, PROCESS_RUNTIME_REF],
        }
      ),
      chainNode(
        'inventory_adjustment_task',
        '库存调整审批任务',
        'workflow_task',
        {
          sourceRefs: ['server/internal/biz/workflow_source_tasks.go'],
        }
      ),
      chainNode('adjusted_inventory_lot', '库存交易与批次余额', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
    ],
    [
      chainEdge(
        'inventory_operation',
        'inventory_adjustment_process',
        '提交后启动审批',
        'starts_process',
        {
          action: 'InventoryUsecase.SubmitInventoryOperation',
          factBoundary: 'inventory_operation_source_only',
          sourceRefs: ['server/internal/biz/inventory_operation.go'],
        }
      ),
      chainEdge(
        'inventory_adjustment_process',
        'inventory_adjustment_task',
        '创建审批任务',
        'creates_task',
        {
          action: 'ProcessRuntime materialize approval',
          factBoundary: 'orchestration_only',
          sourceRefs: [
            PROCESS_RUNTIME_REF,
            'server/internal/biz/process_runtime_workflow.go',
          ],
        }
      ),
      chainEdge(
        'inventory_adjustment_task',
        'inventory_adjustment_process',
        '审批结果推进流程',
        'calls_domain_command',
        {
          action: 'InventoryUsecase.ApproveInventoryOperationForProcessCommand',
          factBoundary: 'inventory_operation_approval_only',
          sourceRefs: ['server/internal/biz/inventory_process_command.go'],
        }
      ),
      chainEdge(
        'inventory_adjustment_process',
        'adjusted_inventory_lot',
        '领域命令执行过账',
        'posts_fact',
        {
          action: 'InventoryUsecase.PostInventoryOperationForProcessCommand',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/inventory_process_command.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'production_exception',
    '生产异常决策与执行',
    'exception',
    '生产异常先形成决策单；拒绝或取消后结束，超领批准后由正常领料路径消费额度，只有报废或在制让步会进入独立执行任务和领域命令。',
    [
      chainNode(
        'production_exception_decision',
        '生产异常决策单',
        'source_document',
        {
          machineKeys: ['source.production_exception_decision'],
          sourceRefs: ['server/internal/biz/production_exception_decision.go'],
        }
      ),
      chainNode(
        'production_exception_process',
        '生产异常审批流程',
        'process_runtime',
        {
          processDefinitionKeys: [
            'production_exception_approval/exception_decision_approval',
          ],
          sourceRefs: [PROCESS_CONTRACT_REF, PROCESS_RUNTIME_REF],
        }
      ),
      chainNode('production_exception_task', '异常审批任务', 'workflow_task', {
        responsibleRoleKeys: ['boss'],
        sourceRefs: [
          'server/internal/biz/workflow_source_tasks.go',
          'server/internal/biz/customer_process_contracts.go',
        ],
      }),
      chainNode(
        'production_exception_rejected',
        '拒绝或取消后结束',
        'source_document',
        {
          machineKeys: ['source.production_exception_decision'],
          sourceRefs: [
            'server/internal/biz/production_exception_decision.go',
            'server/internal/biz/customer_process_contracts.go',
          ],
        }
      ),
      chainNode(
        'production_exception_over_issue',
        '超领批准额度',
        'source_document',
        {
          machineKeys: ['source.production_exception_decision'],
          sourceRefs: [
            'server/internal/biz/production_exception_decision.go',
            'server/internal/biz/customer_process_contracts.go',
          ],
        }
      ),
      chainNode(
        'production_exception_execution_task',
        '报废或在制让步执行任务',
        'workflow_task',
        {
          responsibleRoleKeys: ['production'],
          processDefinitionKeys: [
            'production_exception_approval/exception_decision_approval',
          ],
          sourceRefs: [
            'server/internal/biz/workflow_source_tasks.go',
            'server/internal/biz/customer_process_contracts.go',
          ],
        }
      ),
      chainNode(
        'production_exception_execution',
        '异常单执行与额度状态',
        'source_document',
        {
          machineKeys: ['source.production_exception_execution'],
          sourceRefs: [
            'server/internal/data/model/schema/production_exception_decision.go',
            'server/internal/data/production_exception_decision_repo.go',
          ],
        }
      ),
      chainNode('affected_wip', '受影响在制批次', 'fact_ledger', {
        machineKeys: ['fact.production_wip_batch'],
        sourceRefs: ['server/internal/biz/production_wip.go'],
      }),
      chainNode('affected_production_fact', '后续正常生产事实', 'fact_ledger', {
        machineKeys: ['fact.production'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
    ],
    [
      chainEdge(
        'production_exception_decision',
        'production_exception_process',
        '提交后启动审批',
        'starts_process',
        {
          action: 'OperationalFactUsecase.SubmitProductionException',
          factBoundary: 'exception_decision_only',
          sourceRefs: ['server/internal/biz/production_exception_decision.go'],
        }
      ),
      chainEdge(
        'production_exception_process',
        'production_exception_task',
        '创建异常审批任务',
        'creates_task',
        {
          action: 'ProcessRuntime materialize approval',
          factBoundary: 'orchestration_only',
          sourceRefs: [
            PROCESS_RUNTIME_REF,
            'server/internal/biz/process_runtime_workflow.go',
          ],
        }
      ),
      chainEdge(
        'production_exception_task',
        'production_exception_rejected',
        '拒绝或取消后结束，不进入执行',
        'returns',
        {
          action:
            'OperationalFactUsecase.RejectProductionExceptionForProcessCommand / CancelProductionExceptionDecision',
          factBoundary: 'source_document_only',
          sourceRefs: [
            'server/internal/biz/production_exception_decision.go',
            'server/internal/biz/customer_process_contracts.go',
          ],
        }
      ),
      chainEdge(
        'production_exception_task',
        'production_exception_over_issue',
        '批准超领额度，转正常领料路径使用',
        'returns',
        {
          action:
            'OperationalFactUsecase.ApproveProductionExceptionForProcessCommand',
          factBoundary: 'source_document_allowance_only',
          sourceRefs: [
            'server/internal/biz/production_exception_decision.go',
            'server/internal/biz/customer_process_contracts.go',
            'server/internal/biz/exception_approval_branch_policy.go',
          ],
        }
      ),
      chainEdge(
        'production_exception_task',
        'production_exception_execution_task',
        '批准报废或在制让步后创建执行任务',
        'creates_task',
        {
          action:
            'OperationalFactUsecase.ApproveProductionExceptionForProcessCommand',
          factBoundary: 'workflow_and_source_document_only',
          sourceRefs: [
            'server/internal/biz/customer_process_contracts.go',
            'server/internal/biz/exception_approval_branch_policy.go',
          ],
        }
      ),
      chainEdge(
        'production_exception_execution_task',
        'production_exception_execution',
        '人员办理后写回异常单执行状态',
        'calls_domain_command',
        {
          action:
            'OperationalFactUsecase.ExecuteProductionExceptionForProcessCommand',
          factBoundary: 'source_document_execution_status_and_wip_effect',
          sourceRefs: [
            'server/internal/biz/production_exception_process_command.go',
            'server/internal/biz/customer_process_contracts.go',
          ],
        }
      ),
      chainEdge(
        'production_exception_execution',
        'affected_wip',
        '报废或让步更新在制状态与事件',
        'reworks',
        {
          action:
            'OperationalFactUsecase.ExecuteProductionExceptionForProcessCommand',
          factBoundary: 'production_wip_batch_and_event',
          sourceRefs: [
            'server/internal/biz/production_exception_process_command.go',
            'server/internal/biz/production_wip.go',
          ],
        }
      ),
      chainEdge(
        'affected_wip',
        'affected_production_fact',
        '后续按正常生产路径形成事实',
        'derives',
        {
          action: 'ProductionOrderUsecase.ApplyProductionWIPAction',
          factBoundary: 'later_normal_production_fact_only',
          sourceRefs: [
            'server/internal/biz/production_wip.go',
            'server/internal/biz/operational_fact.go',
          ],
        }
      ),
      chainEdge(
        'production_exception_over_issue',
        'affected_production_fact',
        '额度只供后续正常领料，领料另行形成事实',
        'derives',
        {
          action: 'OperationalFactUsecase.PostProductionFact',
          factBoundary: 'later_material_issue_fact_only',
          sourceRefs: [
            'server/internal/biz/operational_fact.go',
            'server/internal/data/operational_fact_production_repo.go',
            'server/internal/data/production_exception_decision_repo.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'purchase_quality_disposition',
    '采购拒收处置',
    'exception',
    '采购质检拒绝后必须登记处置，退供应商、返工、让步接收或报废分别进入受控事实路径。',
    [
      chainNode('rejected_purchase_quality', '采购质检拒绝', 'fact_ledger', {
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: ['server/internal/biz/quality_inspection.go'],
      }),
      chainNode('purchase_disposition', '采购拒收处置单', 'fact_ledger', {
        machineKeys: ['fact.purchase_rejection_disposition'],
        sourceRefs: ['server/internal/biz/purchase_rejection_disposition.go'],
      }),
      chainNode('purchase_return', '采购退货单', 'fact_ledger', {
        machineKeys: ['fact.purchase_return'],
        sourceRefs: ['server/internal/biz/purchase_return.go'],
      }),
      chainNode('purchase_adjustment', '采购入库调整单', 'fact_ledger', {
        machineKeys: ['fact.purchase_receipt_adjustment'],
        sourceRefs: ['server/internal/biz/purchase_receipt_adjustment.go'],
      }),
      chainNode('disposed_purchase_lot', '隔离或调整后库存', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
    ],
    [
      chainEdge(
        'rejected_purchase_quality',
        'purchase_disposition',
        '创建拒收处置',
        'creates_source',
        {
          action: 'InventoryUsecase.CreatePurchaseRejectionDisposition',
          factBoundary: 'purchase_rejection_disposition',
          sourceRefs: ['server/internal/biz/purchase_rejection_disposition.go'],
        }
      ),
      chainEdge(
        'purchase_disposition',
        'purchase_return',
        '退供应商形成退货单',
        'returns',
        {
          action: 'InventoryUsecase.CreatePurchaseReturnFromQualityInspection',
          factBoundary: 'purchase_return_fact',
          sourceRefs: ['server/internal/biz/purchase_return.go'],
        }
      ),
      chainEdge(
        'purchase_disposition',
        'purchase_adjustment',
        '让步或报废形成调整',
        'creates_source',
        {
          action: 'InventoryUsecase.CreatePurchaseReceiptAdjustmentFromReceipt',
          factBoundary: 'purchase_receipt_adjustment_fact',
          sourceRefs: ['server/internal/biz/purchase_receipt_adjustment.go'],
        }
      ),
      chainEdge(
        'purchase_return',
        'disposed_purchase_lot',
        '退货过账扣减库存',
        'posts_fact',
        {
          action: 'InventoryUsecase.PostPurchaseReturn',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/purchase_return.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
      chainEdge(
        'purchase_adjustment',
        'disposed_purchase_lot',
        '调整过账修正库存',
        'posts_fact',
        {
          action: 'InventoryUsecase.PostPurchaseReceiptAdjustment',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/purchase_receipt_adjustment.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'outsourcing_quality_disposition',
    '委外不合格回货处置',
    'exception',
    '委外回货质检拒绝后登记退回处置，过账后修正委外事实及库存影响。',
    [
      chainNode(
        'rejected_outsourcing_quality',
        '委外回货质检拒绝',
        'fact_ledger',
        {
          machineKeys: ['fact.quality_inspection'],
          sourceRefs: ['server/internal/biz/quality_inspection.go'],
        }
      ),
      chainNode('outsourcing_disposition', '委外回货处置单', 'fact_ledger', {
        machineKeys: ['fact.outsourcing_return_disposition'],
        sourceRefs: ['server/internal/biz/outsourcing_return_disposition.go'],
      }),
      chainNode('outsourcing_correction', '委外事实修正', 'fact_ledger', {
        machineKeys: ['fact.outsourcing'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('outsourcing_quarantine_lot', '隔离或扣减库存', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
    ],
    [
      chainEdge(
        'rejected_outsourcing_quality',
        'outsourcing_disposition',
        '创建委外处置',
        'creates_source',
        {
          action: 'OperationalFactUsecase.CreateOutsourcingReturnDisposition',
          factBoundary: 'outsourcing_return_disposition',
          sourceRefs: ['server/internal/biz/outsourcing_return_disposition.go'],
        }
      ),
      chainEdge(
        'outsourcing_disposition',
        'outsourcing_correction',
        '过账处置并修正回货',
        'returns',
        {
          action: 'OperationalFactUsecase.PostOutsourcingReturnDisposition',
          factBoundary: 'outsourcing_return_correction',
          sourceRefs: [
            'server/internal/biz/outsourcing_return_disposition.go',
            'server/internal/biz/operational_fact.go',
          ],
        }
      ),
      chainEdge(
        'outsourcing_correction',
        'outsourcing_quarantine_lot',
        '同步库存隔离或扣减',
        'posts_fact',
        {
          action: 'InventoryUsecase.CreateInventoryTxn',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: ['server/internal/biz/inventory.go'],
        }
      ),
    ]
  ),
  chain(
    'purchase_posting_corrections',
    '采购入库的退货、调整与冲正',
    'reversal',
    '采购入库过账后不直接改历史；数量或价值差异通过退货、调整及各自冲正路径保留审计。',
    [
      chainNode('posted_purchase_receipt', '已过账采购入库', 'fact_ledger', {
        machineKeys: ['fact.purchase_receipt'],
        sourceRefs: ['server/internal/biz/purchase_receipt.go'],
      }),
      chainNode('purchase_return_correction', '采购退货', 'fact_ledger', {
        machineKeys: ['fact.purchase_return'],
        sourceRefs: ['server/internal/biz/purchase_return.go'],
      }),
      chainNode(
        'purchase_adjustment_correction',
        '采购入库调整',
        'fact_ledger',
        {
          machineKeys: ['fact.purchase_receipt_adjustment'],
          sourceRefs: ['server/internal/biz/purchase_receipt_adjustment.go'],
        }
      ),
      chainNode(
        'corrected_purchase_inventory',
        '修正后库存批次',
        'fact_ledger',
        {
          machineKeys: ['fact.inventory_lot'],
          sourceRefs: ['server/internal/biz/inventory.go'],
        }
      ),
      chainNode(
        'corrected_purchase_finance',
        '修正后应付事实',
        'derived_result',
        {
          machineKeys: ['fact.finance'],
          sourceRefs: [
            'server/internal/biz/operational_fact_finance_source.go',
          ],
        }
      ),
    ],
    [
      chainEdge(
        'posted_purchase_receipt',
        'purchase_return_correction',
        '按原入库生成退货',
        'returns',
        {
          action:
            'InventoryUsecase.CreatePurchaseReturnFromReceipt / PostPurchaseReturn',
          factBoundary: 'purchase_return_and_inventory',
          sourceRefs: ['server/internal/biz/purchase_return.go'],
        }
      ),
      chainEdge(
        'posted_purchase_receipt',
        'purchase_adjustment_correction',
        '按原入库生成调整',
        'creates_source',
        {
          action:
            'InventoryUsecase.CreatePurchaseReceiptAdjustmentFromReceipt / PostPurchaseReceiptAdjustment',
          factBoundary: 'purchase_receipt_adjustment_and_inventory',
          sourceRefs: ['server/internal/biz/purchase_receipt_adjustment.go'],
        }
      ),
      chainEdge(
        'purchase_return_correction',
        'corrected_purchase_inventory',
        '退货过账扣减库存',
        'posts_fact',
        {
          action: 'InventoryUsecase.PostPurchaseReturn',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/purchase_return.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
      chainEdge(
        'purchase_adjustment_correction',
        'corrected_purchase_inventory',
        '调整过账修正库存',
        'posts_fact',
        {
          action: 'InventoryUsecase.PostPurchaseReceiptAdjustment',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/purchase_receipt_adjustment.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
      chainEdge(
        'corrected_purchase_inventory',
        'corrected_purchase_finance',
        '重新计算采购来源应付',
        'derives',
        {
          action: 'OperationalFactUsecase.CreatePayableFromPurchaseReceipt',
          factBoundary: 'finance_fact_projection',
          sourceRefs: [
            'server/internal/biz/operational_fact_finance_source.go',
          ],
        }
      ),
      chainEdge(
        'purchase_return_correction',
        'posted_purchase_receipt',
        '正式冲正恢复原影响',
        'reverses',
        {
          action: 'reverse purchase return through repository transaction',
          factBoundary: 'reversal_audit_and_inventory',
          sourceRefs: ['server/internal/biz/purchase_return.go'],
        }
      ),
      chainEdge(
        'purchase_adjustment_correction',
        'posted_purchase_receipt',
        '正式冲正恢复原影响',
        'reverses',
        {
          action:
            'reverse purchase receipt adjustment through repository transaction',
          factBoundary: 'reversal_audit_and_inventory',
          sourceRefs: ['server/internal/biz/purchase_receipt_adjustment.go'],
        }
      ),
    ]
  ),
]

const BUSINESS_CHAIN_OVERVIEW_DEFINITION = {
  key: DEV_BUSINESS_CHAIN_OVERVIEW_KEY,
  label: '全部业务链（设计总图）',
  summary:
    '先看销售、供给、生产、出货与结算怎样衔接，再下钻主链、支撑链、异常链、返工链或冲正链。',
  lanes: [
    {
      key: 'primary',
      label: '履约主链',
      summary: '从销售受理、生产执行到成品出货和结算。',
      chainKeys: [
        'sales_to_production',
        'production_to_inventory',
        'delivery_to_settlement',
      ],
    },
    {
      key: 'supply',
      label: '供给与库存支撑',
      summary: '采购、委外和人工库存调整为履约提供材料与库存。',
      chainKeys: [
        'purchase_to_inventory',
        'outsourcing_to_inventory',
        'inventory_adjustment',
      ],
    },
    {
      key: 'exception',
      label: '异常与返工',
      summary: '不合格与生产异常分别回到受控领域路径。',
      chainKeys: [
        'production_exception',
        'purchase_quality_disposition',
        'outsourcing_quality_disposition',
      ],
    },
    {
      key: 'correction',
      label: '冲正与纠正',
      summary: '已过账结果不直接改历史，通过核销、红冲、退货或调整纠正。',
      chainKeys: [
        'finance_payment_and_reversal',
        'purchase_posting_corrections',
      ],
    },
  ],
  relations: [
    {
      fromChainKey: 'sales_to_production',
      toChainKey: 'production_to_inventory',
      label: '生产准备进入执行',
      kind: 'continues',
    },
    {
      fromChainKey: 'production_to_inventory',
      toChainKey: 'delivery_to_settlement',
      label: '成品入库后安排出货',
      kind: 'continues',
    },
    {
      fromChainKey: 'purchase_to_inventory',
      toChainKey: 'production_to_inventory',
      label: '合格材料供应生产',
      kind: 'supplies',
    },
    {
      fromChainKey: 'outsourcing_to_inventory',
      toChainKey: 'production_to_inventory',
      label: '合格回货进入库存与生产',
      kind: 'supplies',
    },
    {
      fromChainKey: 'inventory_adjustment',
      toChainKey: 'purchase_to_inventory',
      label: '横切修正采购库存',
      kind: 'cross_cuts',
    },
    {
      fromChainKey: 'inventory_adjustment',
      toChainKey: 'outsourcing_to_inventory',
      label: '横切修正委外库存',
      kind: 'cross_cuts',
    },
    {
      fromChainKey: 'inventory_adjustment',
      toChainKey: 'production_to_inventory',
      label: '横切修正生产库存',
      kind: 'cross_cuts',
    },
    {
      fromChainKey: 'purchase_to_inventory',
      toChainKey: 'purchase_quality_disposition',
      label: '质检拒绝进入处置',
      kind: 'branches_to',
    },
    {
      fromChainKey: 'purchase_to_inventory',
      toChainKey: 'purchase_posting_corrections',
      label: '过账后退货或调整',
      kind: 'corrects',
    },
    {
      fromChainKey: 'outsourcing_to_inventory',
      toChainKey: 'outsourcing_quality_disposition',
      label: '回货不合格进入处置',
      kind: 'branches_to',
    },
    {
      fromChainKey: 'production_to_inventory',
      toChainKey: 'production_exception',
      label: '在制异常进入决策',
      kind: 'branches_to',
    },
    {
      fromChainKey: 'production_exception',
      toChainKey: 'production_to_inventory',
      label: '执行结果返回生产',
      kind: 'returns_to',
    },
    {
      fromChainKey: 'delivery_to_settlement',
      toChainKey: 'finance_payment_and_reversal',
      label: '结算后进入核销与冲正',
      kind: 'corrects',
    },
  ],
  sourceRefs: [ARCHITECTURE_REF, WORKFLOW_MAP_REF, PRODUCT_FLOW_REF],
}

function normalizeBusinessChainOverview(rawOverview, chains) {
  if (
    rawOverview?.key !== DEV_BUSINESS_CHAIN_OVERVIEW_KEY ||
    !rawOverview?.label ||
    !rawOverview?.summary
  ) {
    throw new Error('business chain overview has an invalid header')
  }
  const chainByKey = new Map(chains.map((item) => [item.key, item]))
  const sourceRefs = uniqueStrings(rawOverview.sourceRefs)
  if (sourceRefs.length === 0) {
    throw new Error('business chain overview has no source refs')
  }
  const lanes = Object.freeze(
    rawOverview.lanes.map((lane) => {
      const chainKeys = uniqueStrings(lane.chainKeys)
      if (
        !lane?.key ||
        !lane?.label ||
        !lane?.summary ||
        chainKeys.length === 0
      ) {
        throw new Error('business chain overview has an invalid lane')
      }
      const unknownChainKeys = chainKeys.filter((key) => !chainByKey.has(key))
      if (unknownChainKeys.length > 0) {
        throw new Error(
          `${lane.key} references unknown business chains: ${unknownChainKeys.join(', ')}`
        )
      }
      return Object.freeze({
        ...lane,
        chainKeys,
        sourceRefs,
        readOnly: true,
      })
    })
  )
  if (new Set(lanes.map((lane) => lane.key)).size !== lanes.length) {
    throw new Error('business chain overview has duplicate lane keys')
  }
  const overviewChainKeys = lanes.flatMap((lane) => lane.chainKeys)
  if (
    overviewChainKeys.length !== chains.length ||
    new Set(overviewChainKeys).size !== chains.length ||
    chains.some((item) => !overviewChainKeys.includes(item.key))
  ) {
    throw new Error('business chain overview must include every chain once')
  }
  const relations = Object.freeze(
    rawOverview.relations.map((relation) => {
      if (
        !chainByKey.has(relation?.fromChainKey) ||
        !chainByKey.has(relation?.toChainKey) ||
        relation.fromChainKey === relation.toChainKey ||
        !relation?.label ||
        !RELATION_KIND_SET.has(relation?.kind)
      ) {
        throw new Error('business chain overview has an invalid relation')
      }
      return Object.freeze({
        ...relation,
        key: `${relation.fromChainKey}:${relation.kind}:${relation.toChainKey}`,
        sourceRefs,
        readOnly: true,
      })
    })
  )
  if (
    new Set(relations.map((relation) => relation.key)).size !== relations.length
  ) {
    throw new Error('business chain overview has duplicate relations')
  }
  return Object.freeze({
    ...rawOverview,
    lanes,
    relations,
    chainKeys: Object.freeze(overviewChainKeys),
    sourceRefs,
    readOnly: true,
    allowsActionExecution: false,
    runtimeAuthority: 'design_projection_only',
  })
}

function normalizeNode(
  rawNode,
  chainSourceRefs,
  flowKeys,
  processByKey,
  factKeys
) {
  if (!rawNode?.key || !rawNode?.label || !CHAIN_LAYER_SET.has(rawNode.layer)) {
    throw new Error('business chain has an invalid node')
  }
  const machineKeys = uniqueStrings(rawNode.machineKeys)
  const referencedFactKeys = uniqueStrings(rawNode.factKeys)
  const processDefinitionKeys = uniqueStrings(rawNode.processDefinitionKeys)
  const responsibleRoleKeys = uniqueStrings(rawNode.responsibleRoleKeys)
  const unknownMachineKeys = machineKeys.filter((key) => !flowKeys.has(key))
  if (unknownMachineKeys.length > 0) {
    throw new Error(
      `${rawNode.key} references unknown state machines: ${unknownMachineKeys.join(', ')}`
    )
  }
  const unknownProcessKeys = processDefinitionKeys.filter(
    (key) => !processByKey.has(key)
  )
  if (unknownProcessKeys.length > 0) {
    throw new Error(
      `${rawNode.key} references unknown process definitions: ${unknownProcessKeys.join(', ')}`
    )
  }
  const unknownFactKeys = referencedFactKeys.filter((key) => !factKeys.has(key))
  if (unknownFactKeys.length > 0) {
    throw new Error(
      `${rawNode.key} references unknown fact definitions: ${unknownFactKeys.join(', ')}`
    )
  }
  if (rawNode.layer === 'fact_ledger' && referencedFactKeys.length === 0) {
    throw new Error(`${rawNode.key} has an invalid fact definition boundary`)
  }
  const sourceRefs = uniqueStrings([
    ...chainSourceRefs,
    ...(rawNode.sourceRefs || []),
  ])
  if (sourceRefs.length === 0) {
    throw new Error(`${rawNode.key} has no source refs`)
  }
  return Object.freeze({
    ...rawNode,
    machineKeys,
    factKeys: referencedFactKeys,
    processDefinitionKeys,
    responsibleRoleKeys,
    processKeys: uniqueStrings(
      processDefinitionKeys.map((key) => processByKey.get(key).processKey)
    ),
    sourceRefs,
    readOnly: true,
  })
}

function normalizeEdge(rawEdge, chainSourceRefs, nodeKeys) {
  if (
    !rawEdge?.key ||
    !rawEdge?.label ||
    !nodeKeys.has(rawEdge.from) ||
    !nodeKeys.has(rawEdge.to) ||
    !EDGE_KIND_SET.has(rawEdge.kind) ||
    !rawEdge.action ||
    !rawEdge.factBoundary
  ) {
    throw new Error('business chain has an invalid edge')
  }
  const sourceRefs = uniqueStrings([
    ...chainSourceRefs,
    ...(rawEdge.sourceRefs || []),
  ])
  if (sourceRefs.length === 0) {
    throw new Error(`${rawEdge.key} has no source refs`)
  }
  return Object.freeze({ ...rawEdge, sourceRefs, readOnly: true })
}

function assertReachable(chainDefinition) {
  const reachable = new Set(chainDefinition.entryNodeKeys)
  const pending = [...chainDefinition.entryNodeKeys]
  while (pending.length > 0) {
    const currentNodeKey = pending.shift()
    for (const edge of chainDefinition.edges) {
      if (edge.from === currentNodeKey && !reachable.has(edge.to)) {
        reachable.add(edge.to)
        pending.push(edge.to)
      }
    }
  }
  const missing = chainDefinition.nodes
    .map((node) => node.key)
    .filter((key) => !reachable.has(key))
  if (missing.length > 0) {
    throw new Error(
      `${chainDefinition.key} has unreachable nodes: ${missing.join(', ')}`
    )
  }
}

function normalizeChain(rawChain, flowKeys, processByKey, factKeys) {
  if (
    !rawChain?.key ||
    !rawChain?.label ||
    !rawChain?.summary ||
    !CHAIN_KIND_SET.has(rawChain.kind)
  ) {
    throw new Error('business chain has an invalid header')
  }
  const sourceRefs = uniqueStrings([
    ARCHITECTURE_REF,
    WORKFLOW_MAP_REF,
    ...(rawChain.sourceRefs || []),
  ])
  const nodes = Object.freeze(
    rawChain.nodes.map((node) =>
      normalizeNode(node, sourceRefs, flowKeys, processByKey, factKeys)
    )
  )
  const nodeKeys = new Set(nodes.map((node) => node.key))
  if (nodeKeys.size !== nodes.length) {
    throw new Error(`${rawChain.key} has duplicate node keys`)
  }
  const entryNodeKeys = uniqueStrings(rawChain.entryNodeKeys)
  if (
    entryNodeKeys.length === 0 ||
    entryNodeKeys.some((key) => !nodeKeys.has(key))
  ) {
    throw new Error(`${rawChain.key} has an invalid entry node`)
  }
  const edges = Object.freeze(
    rawChain.edges.map((edge) => normalizeEdge(edge, sourceRefs, nodeKeys))
  )
  if (new Set(edges.map((edge) => edge.key)).size !== edges.length) {
    throw new Error(`${rawChain.key} has duplicate edge keys`)
  }
  const normalized = Object.freeze({
    ...rawChain,
    entryNodeKeys,
    nodes,
    edges,
    sourceRefs,
    readOnly: true,
    allowsActionExecution: false,
    runtimeAuthority: 'design_projection_only',
  })
  assertReachable(normalized)
  return normalized
}

export function buildDevBusinessChainCatalog({
  flows,
  processDefinitions,
  factDefinitions,
}) {
  const safeFlows = Array.isArray(flows) ? flows : []
  const safeProcessDefinitions = Array.isArray(processDefinitions)
    ? processDefinitions
    : []
  const safeFactDefinitions = Array.isArray(factDefinitions)
    ? factDefinitions
    : []
  const flowKeys = new Set(safeFlows.map((flow) => flow.key))
  const processByKey = new Map(
    safeProcessDefinitions.map((definition) => [definition.key, definition])
  )
  const factKeys = new Set(
    safeFactDefinitions.map((definition) => definition.factKey)
  )
  if (factKeys.size !== safeFactDefinitions.length) {
    throw new Error('business chain received duplicate fact definitions')
  }
  const unknownExclusions = Object.keys(
    DEV_BUSINESS_CHAIN_CROSS_CUTTING_EXCLUSIONS
  ).filter((key) => !flowKeys.has(key))
  if (unknownExclusions.length > 0) {
    throw new Error(
      `business chain exclusions reference unknown machines: ${unknownExclusions.join(', ')}`
    )
  }
  const chains = Object.freeze(
    BUSINESS_CHAIN_DEFINITIONS.map((definition) =>
      normalizeChain(definition, flowKeys, processByKey, factKeys)
    )
  )
  if (new Set(chains.map((item) => item.key)).size !== chains.length) {
    throw new Error('business chain catalog has duplicate chain keys')
  }
  const overview = normalizeBusinessChainOverview(
    BUSINESS_CHAIN_OVERVIEW_DEFINITION,
    chains
  )

  const coveredMachineKeys = uniqueStrings(
    chains.flatMap((item) => item.nodes.flatMap((node) => node.machineKeys))
  )
  const excludedMachineKeys = uniqueStrings(
    Object.keys(DEV_BUSINESS_CHAIN_CROSS_CUTTING_EXCLUSIONS)
  )
  const requiredMachineKeys = uniqueStrings(
    safeFlows
      .map((flow) => flow.key)
      .filter((key) => !excludedMachineKeys.includes(key))
  )
  const missingMachineKeys = requiredMachineKeys.filter(
    (key) => !coveredMachineKeys.includes(key)
  )
  if (missingMachineKeys.length > 0) {
    throw new Error(
      `business chain catalog misses state machines: ${missingMachineKeys.join(', ')}`
    )
  }

  const coveredProcessDefinitionKeys = uniqueStrings(
    chains.flatMap((item) =>
      item.nodes.flatMap((node) => node.processDefinitionKeys)
    )
  )
  const requiredProcessDefinitionKeys = uniqueStrings(
    safeProcessDefinitions.map((definition) => definition.key)
  )
  const missingProcessDefinitionKeys = requiredProcessDefinitionKeys.filter(
    (key) => !coveredProcessDefinitionKeys.includes(key)
  )
  if (missingProcessDefinitionKeys.length > 0) {
    throw new Error(
      `business chain catalog misses process definitions: ${missingProcessDefinitionKeys.join(', ')}`
    )
  }

  const coveredFactKeys = uniqueStrings(
    chains.flatMap((item) => item.nodes.flatMap((node) => node.factKeys))
  )
  const requiredFactKeys = uniqueStrings(
    safeFactDefinitions.map((definition) => definition.factKey)
  )
  const missingFactKeys = requiredFactKeys.filter(
    (key) => !coveredFactKeys.includes(key)
  )
  if (missingFactKeys.length > 0) {
    throw new Error(
      `business chain catalog misses fact definitions: ${missingFactKeys.join(', ')}`
    )
  }

  return Object.freeze({
    version: DEV_BUSINESS_CHAIN_CATALOG_VERSION,
    readOnly: true,
    allowsActionExecution: false,
    runtimeAuthority: 'design_projection_only',
    chains,
    overview,
    coverage: Object.freeze({
      complete: true,
      chainCount: chains.length,
      overviewComplete: true,
      overviewKey: overview.key,
      overviewLaneCount: overview.lanes.length,
      overviewRelationCount: overview.relations.length,
      overviewChainKeys: overview.chainKeys,
      requiredMachineKeys,
      coveredMachineKeys,
      excludedMachineKeys,
      exclusionReasons: DEV_BUSINESS_CHAIN_CROSS_CUTTING_EXCLUSIONS,
      requiredProcessDefinitionKeys,
      coveredProcessDefinitionKeys,
      requiredFactKeys,
      coveredFactKeys,
    }),
  })
}
