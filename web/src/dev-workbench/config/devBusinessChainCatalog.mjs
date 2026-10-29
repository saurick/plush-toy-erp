import { BUSINESS_RULES } from '../../../../scripts/qa/lib/business-rule-catalog.mjs'
import { PurchaseSourceActions } from '../../common/consts/purchaseSourceActions.mjs'
import {
  DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS,
  DEV_BUSINESS_CHAIN_EVIDENCE_MODES,
  DEV_BUSINESS_CHAIN_SCENARIO_KINDS,
  DEV_BUSINESS_CHAIN_STEP_CONTRACT_DEFINITIONS,
} from './devBusinessChainStepContracts.mjs'

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
  'creates_fact_draft',
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
const SCENARIO_KIND_SET = new Set(DEV_BUSINESS_CHAIN_SCENARIO_KINDS)
const EVIDENCE_MODE_SET = new Set(DEV_BUSINESS_CHAIN_EVIDENCE_MODES)
const DATA_STAGE_KEY_SET = new Set(DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS)
const RESPONSIBILITY_MODE_SET = new Set(['human', 'system', 'derived'])
const STATE_REF_PHASE_SET = new Set(['precondition', 'result'])

const ARCHITECTURE_REF = 'docs/architecture/业务链与运行轨迹边界.md'
const WORKFLOW_MAP_REF = 'docs/workflow/业务与协同流程地图.md'
const PRODUCT_FLOW_REF = 'docs/product/业务主链路数据流向与字段来源规则.md'
const PROCESS_CONTRACT_REF = 'server/internal/biz/customer_process_contracts.go'
const PROCESS_RUNTIME_REF = 'server/internal/biz/process_runtime.go'

const uniqueStrings = (values) =>
  Object.freeze([
    ...new Set((Array.isArray(values) ? values : []).filter(Boolean)),
  ])

const uniqueBy = (values, keyOf) =>
  Object.freeze([
    ...new Map(
      (Array.isArray(values) ? values : []).map((value) => [
        keyOf(value),
        value,
      ])
    ).values(),
  ])

const chainNode = (key, label, layer, options = {}) => ({
  key,
  label,
  layer,
  summary: options.summary || '',
  terminal: options.terminal === true,
  risk: options.risk === true,
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
  condition: options.condition || '',
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
    '订单审批与工程 BOM 可并行准备；条件满足后用料经老板和财务两级审核，按厂商生成采购单。生产订单另行建立并发布；现有成品库存按需显式预留。',
    [
      chainNode('sales_order', '销售订单与订单行', 'source_document', {
        machineKeys: [
          'source.sales_order',
          'source.order_item',
        ],
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
      chainNode('material_request', '工程用料审核', 'source_document', {
        machineKeys: ['source.engineering_material_request'],
        sourceRefs: ['server/internal/biz/engineering_material_request.go'],
      }),
      chainNode(
        'generated_purchase_order',
        '按厂商生成的已批准采购单',
        'source_document',
        {
          machineKeys: ['source.purchase_order'],
          sourceRefs: [
            'server/internal/data/engineering_material_request_repo.go',
          ],
        }
      ),
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
        '完成工程资料并启用 BOM',
        'requires',
        {
          action: 'SalesOrderUsecase.SaveSalesOrderEngineering (complete=true)',
          condition: '校验本单全部有效明细，启用关联 BOM 并保存制造内容指纹；不生成库存或生产事实。',
          factBoundary: 'masterdata_reference_only',
          sourceRefs: ['server/internal/data/sales_order_engineering_repo.go'],
        }
      ),
      chainEdge(
        'sales_order',
        'stock_reservation',
        '按需显式预留现有成品',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.CreateStockReservationFromSalesOrder',
          condition:
            '订单已生效且有可预留成品；不作为生产前置，不由审批自动创建。',
          factBoundary: 'stock_reservation_fact',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'effective_bom',
        'material_request',
        '自动汇总用料并完成两级审核',
        'calls_domain_command',
        {
          action:
            'SalesOrderUsecase.SaveSalesOrderEngineering / ReviewEngineeringMaterialRequest',
          condition:
            '完成工程资料时统一校验并启用 BOM，订单生效且用料来源有效即自动送审；老板通过后由另一位财务复核。',
          factBoundary: 'engineering_material_source_only',
          sourceRefs: ['server/internal/biz/engineering_material_request.go'],
        }
      ),
      chainEdge(
        'material_request',
        'generated_purchase_order',
        '财务通过后按厂商生成采购单',
        'creates_source',
        {
          action: 'SalesOrderUsecase.ReviewEngineeringMaterialRequest',
          condition:
            '用料财务审核通过；批准数量冻结，采购补齐价格与交期，不重复审批。',
          factBoundary: 'approved_purchase_source_only',
          sourceRefs: [
            'server/internal/data/engineering_material_request_repo.go',
          ],
        }
      ),
      chainEdge(
        'material_request',
        'production_order',
        '发布前核对用料与工程版本',
        'requires',
        {
          action: 'ProductionOrderUsecase.Release',
          condition: '工程 BOM 与制造内容指纹仍一致，工程用料已批准。',
          factBoundary: 'source_document_precondition_only',
          sourceRefs: ['server/internal/data/production_order_repo.go'],
        }
      ),
      chainEdge(
        'effective_bom',
        'production_order',
        'PMC 建单并显式发布，冻结 BOM 与路线',
        'creates_source',
        {
          action: 'ProductionOrderUsecase.CreateDraft / Release',
          condition:
            '有效来源与工程用料条件满足；发布生成排程任务，不代表齐料或领料。',
          factBoundary: 'source_document_only',
          sourceRefs: ['server/internal/biz/production_order.go'],
        }
      ),
      chainEdge(
        'sales_tasks',
        'sales_order',
        '审批拒绝后结束本次办理',
        'returns',
        {
          action: 'SalesOrderUsecase.RejectSalesOrderForProcessCommand',
          condition: '审批决定为拒绝',
          factBoundary: 'rejection_without_fact_posting',
          sourceRefs: ['server/internal/biz/customer_process_contracts.go'],
        }
      ),
    ]
  ),
  chain(
    'purchase_to_inventory',
    '采购下单到入库应付',
    'primary',
    '用料生成的采购单已经批准，独立人工单另行审批；采购独立维护交期、补齐缺价，到货提醒与异常汇总读取原单事实。仓库点数、IQC 检验、仓库入库各自办理，生成应付前核对价格依据。',
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
      chainNode('purchase_rejected', '采购审批拒绝 · 本次结束', 'derived_result', { terminal: true, risk: true, machineKeys: ['source.purchase_order'], sourceRefs: ['server/internal/biz/purchase_order.go'] }),
      chainNode('purchase_receipt', '分批到货与实点记录', 'fact_ledger', {
        machineKeys: ['fact.purchase_receipt'],
        sourceRefs: ['server/internal/biz/purchase_receipt.go'],
      }),
      chainNode('purchase_quality', 'IQC 逐项验收', 'fact_ledger', {
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: ['server/internal/biz/quality_inspection.go'],
      }),
      chainNode('purchase_quality_correction', '纠正后新待检记录', 'fact_ledger', {
        summary: '保留原检验判定并记为被替代；另建引用原检验的新记录，按实际检查结果重新判定。',
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: ['server/internal/data/quality_inspection_correction_repo.go'],
      }),
      chainNode('purchase_accepted', '合格行待入库', 'fact_ledger', {
        summary: '逐行检验通过后等待仓库确认；此时尚未增加库存。',
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: ['server/internal/biz/quality_inspection.go'],
      }),
      chainNode('purchase_lot', '已入库的合格批次', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/biz/inventory.go'],
      }),
      chainNode('purchase_payable_draft', '采购应付草稿', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact_finance_source.go'],
      }),
      chainNode('purchase_payable', '已过账采购应付', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
    ],
    [
      chainEdge(
        'purchase_order',
        'purchase_approval',
        '独立人工单提交审批',
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
        '仓库登记到货并清点数量',
        'creates_fact_draft',
        {
          action: 'InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder',
          factBoundary: 'purchase_receipt_draft',
          sourceRefs: ['server/internal/biz/purchase_receipt.go'],
        }
      ),
      chainEdge('purchase_order', 'purchase_receipt', '用料生成且已批准，不重复审批', 'creates_fact_draft', { action: 'InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder', condition: '采购订单已批准，来源为工程用料生成', factBoundary: 'purchase_receipt_draft', sourceRefs: ['server/internal/biz/purchase_receipt.go', 'server/internal/biz/engineering_material_request.go'] }),
      chainEdge(
        'purchase_receipt',
        'purchase_quality',
        '自动建立逐行待检 IQC',
        'creates_fact_draft',
        {
          action: 'InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder',
          factBoundary: 'quality_inspection_fact',
          sourceRefs: ['server/internal/biz/quality_inspection.go'],
        }
      ),
      chainEdge(
        'purchase_quality',
        'purchase_accepted',
        'IQC 确认本行检验通过',
        'posts_fact',
        {
          action: 'InventoryUsecase.PassQualityInspection',
          condition: '按实收数量记录检验结果；通过只确认品质，库存由仓库另行入账',
          factBoundary: 'quality_inspection_fact',
          sourceRefs: [
            'server/internal/biz/quality_inspection.go',
            'server/internal/biz/purchase_receipt.go',
          ],
        }
      ),
      chainEdge('purchase_accepted', 'purchase_lot', '仓库确认本次合格行入库', 'posts_fact', {
        action: 'InventoryUsecase.PostPurchaseReceipt',
        condition: '仅过账已检验通过且尚未入库的行；待检与不合格行保留后续处理，后续合格行可继续入库，已入库行重复请求只读回',
        factBoundary: 'inventory_txn_and_lot',
        sourceRefs: ['server/internal/biz/purchase_receipt.go', 'server/internal/data/purchase_receipt_repo.go'],
      }),
      chainEdge('purchase_quality', 'purchase_quality_correction', '保留原判定，另建纠正待检', 'creates_fact_draft', {
        action: 'QualityInspectionUsecase.CorrectQualityInspectionResult',
        condition: '原检验已通过或拒绝、尚未被替代，采购行尚未实际入库且没有有效拒收处置；有质检异常处置及来源读取权限，填写原因和新检验单号。此入口不适用于在制批次检验。',
        factBoundary: 'quality_correction_creates_new_inspection_original_decision_retained',
        sourceRefs: ['server/internal/data/quality_inspection_correction_repo.go', 'server/internal/service/jsonrpc_quality.go'],
      }),
      chainEdge('purchase_quality_correction', 'purchase_accepted', '新检验独立判定通过后待入库', 'posts_fact', {
        action: 'QualityInspectionUsecase.PassQualityInspection',
        condition: '对新检验记录完成实际检查并正式判定通过；原判定不变，新检验仍可不通过，不自动增加库存。',
        factBoundary: 'quality_inspection_fact',
        sourceRefs: ['server/internal/biz/quality_inspection.go', 'server/internal/data/quality_inspection_correction_repo.go'],
      }),
      chainEdge(
        'purchase_lot',
        'purchase_payable_draft',
        '按已过账来源生成应付草稿',
        'creates_fact_draft',
        {
          action: 'OperationalFactUsecase.CreatePayableFromPurchaseReceipt',
          condition: '收货明细已完成入库或不合格处置，采购价格和结算快照完整；仅按已入库行计入应付',
          factBoundary: 'finance_fact_draft_from_posted_source',
          sourceRefs: [
            'server/internal/biz/operational_fact_finance_source.go',
          ],
        }
      ),
      chainEdge(
        'purchase_payable_draft',
        'purchase_payable',
        '财务确认并过账应付',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.PostFinanceFact',
          factBoundary: 'finance_fact_posted',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'purchase_task',
        'purchase_rejected',
        '审批拒绝后结束本次办理',
        'returns',
        {
          action: 'PurchaseOrderUsecase.RejectPurchaseOrderForProcessCommand',
          condition: '审批决定为拒绝',
          factBoundary: 'rejection_without_fact_posting',
          sourceRefs: ['server/internal/biz/customer_process_contracts.go'],
        }
      ),
    ]
  ),
  chain(
    'production_to_inventory',
    '生产执行、成品入库与包装',
    'primary',
    '按工艺路线完成裁片、车缝、手工及规定检验；手工完成后先正式入成品仓，再完成成品检验、查货和包装，满足放行条件后才能发货。',
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
      chainNode('production_completion', '仓库登记成品入库', 'fact_ledger', {
        machineKeys: ['fact.production'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('finished_goods_lot', '正式成品库存', 'fact_ledger', {
        machineKeys: ['fact.inventory_lot'],
        sourceRefs: ['server/internal/data/production_finished_goods_readiness.go'],
      }),
      chainNode('finished_quality', '成品质量关口', 'fact_ledger', {
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: ['server/internal/biz/production_wip.go'],
      }),
      chainNode('packaging_confirmation', '确认包装用料', 'fact_ledger', {
        machineKeys: ['fact.production_packaging_confirmation'],
        sourceRefs: ['server/internal/biz/production_wip.go'],
      }),
      chainNode('packaging_execution', '仓库查货与包装', 'fact_ledger', {
        machineKeys: ['fact.production_wip_batch'],
        sourceRefs: ['server/internal/data/production_finished_goods_readiness.go'],
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
      chainEdge('wip_batch', 'production_completion', '手工完成后登记并过账入库', 'posts_fact', {
        action: 'OperationalFactUsecase.CreateProductionFactFromOrder / PostProductionFact',
        factBoundary: 'production_fact',
        sourceRefs: ['server/internal/data/operational_fact_production_repo.go'],
      }),
      chainEdge('production_completion', 'finished_goods_lot', '入成品仓，尚未满足发货条件', 'posts_fact', {
        action: 'InventoryUsecase.CreateInventoryTxn',
        factBoundary: 'inventory_txn_and_lot',
        sourceRefs: ['server/internal/data/operational_fact_production_repo.go'],
      }),
      chainEdge('finished_goods_lot', 'finished_quality', '按工艺路线完成成品检验', 'requires', {
        action: 'InventoryUsecase.PassQualityInspection',
        factBoundary: 'quality_inspection_fact',
        sourceRefs: ['server/internal/data/production_wip_quality_inspection_repo_test.go'],
      }),
      chainEdge('finished_quality', 'packaging_confirmation', '质量条件满足后确认包装用料', 'requires', {
        action: 'ProductionOrderUsecase.ConfirmProductionWIPPackagingMaterial',
        factBoundary: 'production_wip_and_packaging_confirmation',
        sourceRefs: ['server/internal/biz/production_wip.go'],
      }),
      chainEdge('packaging_confirmation', 'packaging_execution', '仓库完成查货与包装', 'posts_fact', {
        action: 'ProductionOrderUsecase.StartProductionWIPOperation / CompleteProductionWIPOperation',
        factBoundary: 'production_wip',
        sourceRefs: ['server/internal/data/production_finished_goods_readiness.go'],
      }),
    ]
  ),
  chain(
    'outsourcing_to_inventory',
    '委外发料到回货应付',
    'supporting',
    '普通委外按回货与质检生成应付；工序委外按已验收批次和合同生成应付，材料发料与工序回货分别留存真实事实。',
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
      chainNode('outsourcing_stage', '已验收委外工序', 'fact_ledger', {
        machineKeys: ['fact.production_wip_batch'],
        sourceRefs: ['server/internal/data/outsourcing_order_settlement.go'],
      }),
      chainNode('outsourcing_payable_draft', '委外应付草稿', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact_finance_source.go'],
      }),
      chainNode('outsourcing_payable', '已过账委外应付', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
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
        'creates_fact_draft',
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
      chainEdge(
        'outsourcing_lot',
        'outsourcing_payable_draft',
        '按已过账来源生成应付草稿',
        'creates_fact_draft',
        {
          action: 'OperationalFactUsecase.CreatePayableFromOutsourcingReturn',
          factBoundary: 'finance_fact_draft_from_posted_source',
          sourceRefs: [
            'server/internal/biz/operational_fact_finance_source.go',
          ],
        }
      ),
      chainEdge('outsourcing_order', 'outsourcing_stage', '工序回货与验收', 'posts_fact', {
        action: 'ProductionOrderUsecase.ReceiveProductionWIPOutsourcingReturn / InventoryUsecase.PassQualityInspection',
        factBoundary: 'production_wip',
        sourceRefs: ['server/internal/data/production_wip_repo.go', 'server/internal/data/outsourcing_order_settlement.go'],
      }),
      chainEdge('outsourcing_stage', 'outsourcing_payable_draft', '按已验收合同生成应付', 'creates_fact_draft', {
        action: 'OperationalFactUsecase.CreatePayableFromOutsourcingOrder',
        factBoundary: 'finance_fact_draft_from_posted_source',
        sourceRefs: ['server/internal/data/operational_fact_finance_outsourcing_order_repo.go'],
      }),
      chainEdge(
        'outsourcing_payable_draft',
        'outsourcing_payable',
        '财务确认并过账应付',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.PostFinanceFact',
          factBoundary: 'finance_fact_posted',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
    ]
  ),
  chain(
    'delivery_to_settlement',
    '成品出货到应收建立',
    'primary',
    '出货单经财务放行后才能执行真实出货；真实出货完成后产生应收或发票，取消已出货单时同步冲销出货与库存影响。',
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
      chainNode('shipment_release', '财务放行已通过', 'derived_result', {
        machineKeys: ['fact.shipment_finance_release'],
        factKeys: ['fact.shipment_finance_release'],
        sourceRefs: ['server/internal/biz/shipment_process_command.go'],
      }),
      chainNode('shipment_rejected', '财务审批拒绝 · 本次结束', 'derived_result', { terminal: true, risk: true, machineKeys: ['fact.shipment_finance_release'], summary: '拒绝保持禁止实际出货；重新提交仍按正式放行合同办理。', sourceRefs: ['server/internal/biz/shipment_process_command.go'] }),
      chainNode('shipped', '真实出货事实', 'fact_ledger', {
        machineKeys: ['fact.shipment'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('receivable_draft', '应收或发票草稿', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('receivable', '已过账应收或发票', 'fact_ledger', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainNode('shipment_cancelled', '已取消出货事实', 'fact_ledger', {
        machineKeys: ['fact.shipment'],
        sourceRefs: ['server/internal/biz/operational_fact.go'],
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
          action: 'OperationalFactUsecase.RecordShipmentFinanceRelease',
          condition: '审批决定为通过',
          factBoundary: 'shipment_release_via_domain_usecase',
          sourceRefs: ['server/internal/biz/shipment_process_command.go'],
        }
      ),
      chainEdge('shipment_release', 'shipped', '有效放行且发货条件满足，显式确认实际出货', 'posts_fact', {
        action: 'OperationalFactUsecase.ShipShipmentWithActor',
        factBoundary: 'shipment_and_inventory',
        sourceRefs: ['server/internal/biz/operational_fact.go'],
      }),
      chainEdge(
        'shipped',
        'receivable_draft',
        '真实出货后生成应收或发票草稿',
        'creates_fact_draft',
        {
          action:
            'OperationalFactUsecase.CreateReceivableFromShipment / CreateInvoiceFromShipment',
          factBoundary: 'finance_draft_after_shipped',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'receivable_draft',
        'receivable',
        '财务确认应收或发票过账',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.PostFinanceFact',
          factBoundary: 'finance_fact_after_shipped',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'shipped',
        'shipment_cancelled',
        '取消出货并冲销库存影响',
        'reverses',
        {
          action: 'OperationalFactUsecase.CancelShippedShipmentWithActor',
          factBoundary: 'shipment_and_inventory_correction',
          sourceRefs: ['server/internal/biz/operational_fact.go'],
        }
      ),
      chainEdge(
        'shipment_release_task',
        'shipment_rejected',
        '审批拒绝后结束本次办理',
        'returns',
        {
          action: 'OperationalFactUsecase.RecordShipmentFinanceRejection',
          condition: '审批决定为拒绝',
          factBoundary: 'rejection_without_fact_posting',
          sourceRefs: [
            'server/internal/biz/customer_process_contracts.go',
            'server/internal/biz/shipment_process_command.go',
          ],
        }
      ),
    ],
    { entryNodeKeys: ['shipment_draft'] }
  ),
  chain(
    'finance_payment_and_reversal',
    '首款、结算与退款',
    'reversal',
    '订单首款先确认实际收付并保留余额；真实应收应付产生后抵扣，尾款结清。退款另行审批，撤销抵扣与冲正保留审计。',
    [
      chainNode('payment_order', '首款对应订单 / 合同', 'source_document', {
        machineKeys: ['source.sales_order', 'source.purchase_order', 'source.outsourcing_order'],
        sourceRefs: ['server/internal/data/finance_payment_balance_repo.go'],
      }),
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
      chainNode('settled_finance_fact', '余额结清结果', 'derived_result', {
        machineKeys: ['fact.finance'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
      chainNode('finance_credit_note', '红冲单', 'fact_ledger', {
        machineKeys: ['fact.finance_credit_note'],
        sourceRefs: ['server/internal/biz/finance_payment.go'],
      }),
    ],
    [
      chainEdge('payment_order', 'finance_payment_process', '财务登记订单首款并申请审批', 'starts_process', {
        action: 'OperationalFactUsecase.CreateFinancePayment',
        factBoundary: 'order_advance_cash_without_receivable_or_payable',
        sourceRefs: ['server/internal/data/finance_payment_balance_repo.go'],
      }),
      chainEdge('finance_payment', 'finance_payment_process', '可退余额另建退款单并重新审批', 'starts_process', {
        action: 'OperationalFactUsecase.CreateFinancePayment',
        condition: '原款已过账，退回同一往来方与币种，金额不超过可用余额',
        factBoundary: 'separate_refund_cash_with_original_payment_reference',
        sourceRefs: ['server/internal/data/finance_payment_balance_repo.go'],
      }),
      chainEdge('finance_allocation', 'finance_payment', '撤销抵扣恢复可用余额', 'reverses', {
        action: 'OperationalFactUsecase.ReverseFinanceAllocation',
        factBoundary: 'reverse_allocation_without_cash_movement',
        sourceRefs: ['server/internal/data/finance_payment_balance_repo.go'],
      }),
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
        '审批通过后财务确认实际收付',
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
        '结算款过账核销，首款后续按订单抵扣',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.AllocateFinancePayment',
          condition: '应收应付已经真实过账，方向、往来方、币种匹配；首款还须匹配同一订单',
          factBoundary: 'finance_payment_and_allocations',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'finance_allocation',
        'settled_finance_fact',
        '核销后余额为零才结清',
        'derives',
        {
          action: 'setFinanceFactSettlement',
          condition: '核销后剩余未结金额为零',
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
        '创建已过账红冲记录',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.CreateFinanceCreditNote',
          factBoundary: 'finance_credit_note',
          sourceRefs: ['server/internal/biz/finance_payment.go'],
        }
      ),
      chainEdge(
        'finance_credit_note',
        'settled_finance_fact',
        '红冲后余额为零才结清',
        'posts_fact',
        {
          action: 'OperationalFactUsecase.CreateFinanceCreditNote',
          condition: '红冲后剩余未结金额为零',
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
      chainEdge(
        'finance_allocation',
        'open_finance_fact',
        '部分核销后保留未结余额',
        'derives',
        {
          action: 'PostFinancePaymentForProcessCommand',
          condition: '核销后剩余未结金额大于零',
          factBoundary: 'finance_fact_remains_posted',
          sourceRefs: [
            'server/internal/data/operational_fact_finance_payment_repo.go',
          ],
        }
      ),
      chainEdge(
        'finance_credit_note',
        'open_finance_fact',
        '部分红冲后保留未结余额',
        'derives',
        {
          action: 'OperationalFactUsecase.CreateFinanceCreditNote',
          condition: '红冲后剩余未结金额大于零',
          factBoundary: 'finance_fact_remains_posted',
          sourceRefs: [
            'server/internal/data/operational_fact_finance_payment_repo.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'inventory_adjustment',
    '盘点、调拨与库存调整',
    'supporting',
    '仓库登记所选库存范围与实盘数，盘点和人工调整经他人复核后过账；调拨核对来源与目标仓后过账。零差异只留完成记录，有差异才生成流水，纠错保留原证据。',
    [
      chainNode(
        'inventory_operation',
        '库存操作事实单（草稿）',
        'fact_ledger',
        {
          machineKeys: ['fact.inventory_operation'],
          factKeys: ['fact.inventory_operation'],
          sourceRefs: ['server/internal/biz/inventory_operation.go'],
        }
      ),
      chainNode(
        'inventory_adjustment_process',
        '盘点与调整复核流程',
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
        '盘点与调整复核任务',
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
        '盘点或人工调整提交复核',
        'starts_process',
        {
          action: 'InventoryUsecase.SubmitInventoryOperation',
          condition: '盘点与人工调整必须复核，创建人不能自审；调拨不经过此分支。',
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
          sourceRefs: [
            'server/internal/biz/inventory_adjustment_process_command.go',
          ],
        }
      ),
      chainEdge(
        'inventory_adjustment_process',
        'adjusted_inventory_lot',
        '盘点与调整批准后确认过账',
        'posts_fact',
        {
          action: 'InventoryUsecase.PostInventoryOperationForProcessCommand',
          condition: '盘点账面数须仍匹配；零差异只完成作业，非零差异才写流水。',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: [
            'server/internal/biz/inventory_adjustment_process_command.go',
            'server/internal/biz/inventory.go',
          ],
        }
      ),
      chainEdge(
        'inventory_operation',
        'adjusted_inventory_lot',
        '调拨确认过账',
        'posts_fact',
        {
          action: 'InventoryUsecase.PostInventoryOperation',
          condition:
            '仅调拨草稿，核对来源、目标仓及可用库存。',
          factBoundary: 'inventory_txn_and_lot',
          sourceRefs: ['server/internal/data/inventory_operation_repo.go'],
        }
      ),
      chainEdge(
        'adjusted_inventory_lot',
        'inventory_operation',
        '取消已过账操作，保留反向流水',
        'reverses',
        {
          action: 'InventoryUsecase.CancelInventoryOperation',
          condition:
            '提供原因，核对来源状态、版本、经办资格与可用量；不删除或覆盖原记录。',
          factBoundary: 'inventory_reversal',
          sourceRefs: ['server/internal/data/inventory_operation_repo.go'],
        }
      ),
      chainEdge(
        'inventory_adjustment_task',
        'inventory_operation',
        '审批拒绝后结束本次办理',
        'returns',
        {
          action: 'InventoryUsecase.RejectInventoryOperationForProcessCommand',
          condition: '审批决定为拒绝',
          factBoundary: 'rejection_without_fact_posting',
          sourceRefs: [
            'server/internal/biz/customer_process_contracts.go',
            'server/internal/biz/inventory_adjustment_process_command.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'production_exception',
    '生产异常决策与执行',
    'exception',
    '生产异常先形成决策单；拒绝或取消后结束，超领批准后由正常领料路径消费额度，其他已批准处置按是否正式入库分派给生产或仓库执行。',
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
        '生产或仓库异常执行任务',
        'workflow_task',
        {
          responsibleRoleKeys: ['production', 'warehouse'],
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
      chainNode('scrapped_wip', '报废原批 · 终止', 'fact_ledger', { terminal: true, risk: true, machineKeys: ['fact.production_wip_batch'], summary: '报废执行后原批取消，不进入后续正常生产。', sourceRefs: ['server/internal/data/production_exception_decision_repo.go'] }),
      chainNode('affected_wip', '获批让步原批 / 返工重做新批', 'fact_ledger', { summary: '仅满足后续条件的让步原批或关联新批可继续；不包括报废原批。',
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
        '批准处置后按库存状态分派执行任务',
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
        '让步或返工重做：核对可继续批次',
        'reworks',
        {
          action:
            'OperationalFactUsecase.ExecuteProductionExceptionForProcessCommand',
          condition: '处置方式不是报废；返工或重做必须使用关联新批',
          factBoundary: 'production_wip_batch_and_event',
          sourceRefs: [
            'server/internal/biz/production_exception_process_command.go',
            'server/internal/biz/production_wip.go',
          ],
        }
      ),
      chainEdge('production_exception_execution', 'scrapped_wip', '报废已执行，原批终止', 'reworks', { action: 'OperationalFactUsecase.ExecuteProductionExceptionForProcessCommand', condition: '批准的处理方案为报废且已执行', factBoundary: 'production_wip_batch_and_event', sourceRefs: ['server/internal/data/production_exception_decision_repo.go', 'server/internal/biz/production_exception_process_command.go'] }),
      chainEdge(
        'affected_wip',
        'affected_production_fact',
        '满足后续工序与检验条件后，另行形成事实',
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
    '未入库的拒收来料可退供应商或要求补换。处置不扣减已入库库存；补换生成新的待收记录，再进入收货与检验。',
    [
      chainNode(
        'rejected_purchase_quality',
        '未入库来料质检拒收',
        'fact_ledger',
        {
          machineKeys: ['fact.quality_inspection'],
          sourceRefs: ['server/internal/biz/quality_inspection.go'],
        }
      ),
      chainNode('purchase_disposition', '采购拒收处置单', 'fact_ledger', {
        machineKeys: ['fact.purchase_rejection_disposition'],
        sourceRefs: ['server/internal/biz/purchase_rejection_disposition.go'],
      }),
      chainNode('vendor_return_result', '退供应商处置记录', 'derived_result', {
        machineKeys: ['fact.purchase_rejection_disposition'],
        sourceRefs: [
          'server/internal/data/purchase_rejection_disposition_repo.go',
        ],
      }),
      chainNode('replacement_receipt', '补换待收记录', 'fact_ledger', {
        machineKeys: ['fact.purchase_receipt'],
        sourceRefs: [
          'server/internal/data/purchase_rejection_disposition_repo.go',
        ],
      }),
      chainNode('replacement_quality', '补换来料待检 IQC', 'fact_ledger', {
        machineKeys: ['fact.quality_inspection'],
        sourceRefs: [
          'server/internal/data/purchase_rejection_disposition_repo.go',
        ],
      }),
    ],
    [
      chainEdge(
        'rejected_purchase_quality',
        'purchase_disposition',
        '按拒收质检创建处置',
        'creates_fact_draft',
        {
          action: 'InventoryUsecase.CreatePurchaseRejectionDisposition',
          factBoundary: 'purchase_rejection_disposition_draft_only',
          sourceRefs: ['server/internal/biz/purchase_rejection_disposition.go'],
        }
      ),
      chainEdge(
        'purchase_disposition',
        'vendor_return_result',
        '过账退供应商处置，不扣减库存',
        'returns',
        {
          action: 'InventoryUsecase.PostPurchaseRejectionDisposition',
          condition: '选择退供应商，原收货尚未入库',
          factBoundary: 'unposted_receipt_disposition_only',
          sourceRefs: [
            'server/internal/data/purchase_rejection_disposition_repo.go',
          ],
        }
      ),
      chainEdge(
        'purchase_disposition',
        'replacement_receipt',
        '仓库确认补换实点并生成新待收',
        'creates_fact_draft',
        {
          action: 'InventoryUsecase.PostPurchaseRejectionDisposition',
          condition: '供应商补换实物已到货，仓库实点数量与本笔方案一致，原收货尚未入库',
          factBoundary: 'replacement_receipt_draft_only',
          sourceRefs: [
            'server/internal/data/purchase_rejection_disposition_repo.go',
          ],
        }
      ),
      chainEdge(
        'replacement_receipt',
        'replacement_quality',
        '补换实点确认后建立逐行 IQC',
        'creates_fact_draft',
        {
          action:
            'createPurchaseReplacementReceipt / createPreparedPurchaseReceiptItem',
          factBoundary: 'replacement_quality_pending_receipt_not_posted',
          sourceRefs: [
            'server/internal/data/purchase_rejection_disposition_repo.go',
          ],
        }
      ),
    ]
  ),
  chain(
    'outsourcing_quality_disposition',
    '委外不合格回货处置',
    'exception',
    '普通回货质检拒绝后可分批返厂，过账出库并释放原合同行补回额度；补回已占用额度时先撤销补回，再撤销返厂。',
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
        'creates_fact_draft',
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
        '采购应付与当前余额',
        'fact_ledger',
        {
          machineKeys: ['fact.finance'],
          sourceRefs: [
            'server/internal/biz/operational_fact_finance_source.go',
          ],
        }
      ),
      chainNode('purchase_finance_adjustment', '采购来源账款调整', 'fact_ledger', {
        machineKeys: ['fact.finance_credit_note'],
        sourceRefs: ['server/internal/data/finance_source_adjustment_repo.go'],
      }),
    ],
    [
      chainEdge(
        'posted_purchase_receipt',
        'purchase_return_correction',
        '按原入库生成退货',
        'returns',
        {
          action:
            'InventoryUsecase.CreatePurchaseReturnFromReceipt / CreatePurchaseReturnFromQualityInspection',
          factBoundary: 'purchase_return_draft',
          sourceRefs: ['server/internal/biz/purchase_return.go'],
        }
      ),
      chainEdge(
        'posted_purchase_receipt',
        'purchase_adjustment_correction',
        '按原入库生成调整',
        'creates_fact_draft',
        {
          action:
            'InventoryUsecase.CreatePurchaseReceiptAdjustmentFromReceipt',
          factBoundary: 'purchase_receipt_adjustment_draft',
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
        '按净来源生成应付草稿',
        'creates_fact_draft',
        {
          action: 'OperationalFactUsecase.CreatePayableFromPurchaseReceipt',
          condition: '尚无有效应付时生成草稿；已有草稿须先取消，财务另行确认过账。',
          factBoundary: 'finance_fact_draft',
          sourceRefs: [
            'server/internal/biz/operational_fact_finance_source.go',
          ],
        }
      ),
      chainEdge('corrected_purchase_inventory', 'purchase_finance_adjustment', '财务确认来源差额', 'posts_fact', {
        action: 'OperationalFactUsecase.CreateFinanceSourceAdjustment',
        condition: '应付已过账或结清；退货调减、数量增加调增，超出未核销余额先撤销足额核销。',
        factBoundary: 'finance_credit_note',
        sourceRefs: ['server/internal/data/finance_source_adjustment_repo.go'],
      }),
      chainEdge('purchase_finance_adjustment', 'corrected_purchase_finance', '保留原账并更新未结余额', 'derives', {
        action: 'derive finance balance from posted adjustments and allocations',
        condition: '库存变化不自动改账；移库或批次修正不产生账款差额，真实退款单独办理。',
        factBoundary: 'finance_fact_projection',
        sourceRefs: ['server/internal/data/finance_payment_balance_repo.go'],
      }),
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
  label: '订单全流程（销售到出货）',
  summary:
    '先看销售、供给、生产、出货与结算怎样衔接，再下钻主链、支撑链、异常链、返工链或冲正链。',
  lanes: [
    {
      key: 'primary',
      label: '销售、生产与出货',
      summary: '从销售受理、生产执行到成品出货和结算。',
      chainKeys: [
        'sales_to_production',
        'production_to_inventory',
        'delivery_to_settlement',
      ],
    },
    {
      key: 'supply',
      label: '采购、委外与库存',
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
      label: '收付款与业务纠正',
      summary: '正常收付款与核销，以及已过账业务的退货、调整与冲正。',
      chainKeys: [
        'finance_payment_and_reversal',
        'purchase_posting_corrections',
      ],
    },
  ],
  relations: [
    {
      fromChainKey: 'sales_to_production',
      toChainKey: 'purchase_to_inventory',
      label: '用料批准后按厂商生成采购单',
      kind: 'continues',
    },
    {
      fromChainKey: 'sales_to_production',
      toChainKey: 'production_to_inventory',
      label: '生产准备进入执行',
      kind: 'continues',
    },
    {
      fromChainKey: 'production_to_inventory',
      toChainKey: 'delivery_to_settlement',
      label: '成品入库、质检与包装完成后安排出货',
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
      fromChainKey: 'purchase_posting_corrections',
      toChainKey: 'finance_payment_and_reversal',
      label: '已记账差额由财务确认，核销与退款分别处理',
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
      label: '让步原批或返工重做新批按条件继续；报废原批终止',
      kind: 'returns_to',
    },
    {
      fromChainKey: 'delivery_to_settlement',
      toChainKey: 'finance_payment_and_reversal',
      label: '应收进入收款、核销与冲正',
      kind: 'continues',
    },
    {
      fromChainKey: 'purchase_to_inventory',
      toChainKey: 'finance_payment_and_reversal',
      label: '采购应付进入付款与核销',
      kind: 'continues',
    },
    {
      fromChainKey: 'outsourcing_to_inventory',
      toChainKey: 'finance_payment_and_reversal',
      label: '委外应付进入付款与核销',
      kind: 'continues',
    },
    {
      fromChainKey: 'purchase_quality_disposition',
      toChainKey: 'purchase_to_inventory',
      label: '补换待收重新进入收货与检验',
      kind: 'returns_to',
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

function resolveStateRef(rawRef, flowByKey) {
  const flow = flowByKey.get(rawRef?.machineKey)
  if (!flow || !STATE_REF_PHASE_SET.has(rawRef?.phase)) {
    throw new Error('business chain step references an invalid state')
  }
  const stateDefinition = flow.states.find(
    (candidate) => candidate.key === rawRef.stateKey
  )
  if (!stateDefinition) {
    throw new Error(
      `business chain step references unknown state ${rawRef.machineKey}/${rawRef.stateKey}`
    )
  }
  return Object.freeze({
    machineKey: rawRef.machineKey,
    stateKey: rawRef.stateKey,
    phase: rawRef.phase,
    label: stateDefinition.label,
  })
}

function resolveTransitionRef(rawRef, flowByKey) {
  const flow = flowByKey.get(rawRef?.machineKey)
  const transition = flow?.transitions.find(
    (candidate) => candidate.key === rawRef?.transitionKey
  )
  if (!flow || !transition) {
    throw new Error(
      `business chain step references unknown transition ${rawRef?.machineKey || 'missing'}/${rawRef?.transitionKey || 'missing'}`
    )
  }
  return Object.freeze({
    machineKey: rawRef.machineKey,
    transitionKey: rawRef.transitionKey,
    from: transition.from,
    to: transition.to,
    actionKey: transition.action,
    capabilityKeys: uniqueStrings(transition.permission),
    factBoundary: transition.factBoundary,
    pathKinds: uniqueStrings(transition.pathKinds),
  })
}

function resolveProcessNodeRef(rawRef, processByKey) {
  const definition = processByKey.get(rawRef?.processDefinitionKey)
  const node = definition?.nodes.find(
    (candidate) => candidate.key === rawRef?.nodeKey
  )
  if (!definition || !node) {
    throw new Error(
      `business chain step references unknown process node ${rawRef?.processDefinitionKey || 'missing'}/${rawRef?.nodeKey || 'missing'}`
    )
  }
  return Object.freeze({
    processDefinitionKey: rawRef.processDefinitionKey,
    processKey: definition.processKey,
    nodeKey: rawRef.nodeKey,
    ownerPoolKey: node.ownerPool || '',
    actionKey: node.action || '',
    capabilityKeys: uniqueStrings(node.permission),
    factBoundary: node.factBoundary,
  })
}

function transitionStateRef(ref, phase) {
  return Object.freeze({
    machineKey: ref.machineKey,
    stateKey: phase === 'precondition' ? ref.from : ref.to,
    phase,
  })
}

function normalizeStepContract({
  chainDefinition,
  edge,
  nodeByKey,
  rawStep,
  flowByKey,
  processByKey,
  factKeys,
}) {
  if (!rawStep || !RESPONSIBILITY_MODE_SET.has(rawStep.responsibilityMode)) {
    throw new Error(`${chainDefinition.key}/${edge.key} has no step contract`)
  }
  const sourceActionKeys = uniqueStrings(rawStep.sourceActionKeys || [])
  for (const key of sourceActionKeys) {
    if (!PurchaseSourceActions[key]) throw new Error(`未知采购来源权限合同：${key}`)
  }
  const verificationRuleIds = uniqueStrings(rawStep.verificationRuleIds || [])
  for (const id of verificationRuleIds) {
    if (!BUSINESS_RULES.some((rule) => rule.id === id)) {
      throw new Error(`${chainDefinition.key}/${edge.key} references unknown verification rule: ${id}`)
    }
  }
  const stateTransitionRefs = uniqueBy(
    (rawStep.stateTransitionRefs || []).map((ref) =>
      resolveTransitionRef(ref, flowByKey)
    ),
    (ref) => `${ref.machineKey}/${ref.transitionKey}`
  )
  const declaredStateRefs = uniqueBy(
    (rawStep.stateRefs || []).map((ref) => resolveStateRef(ref, flowByKey)),
    (ref) => `${ref.machineKey}/${ref.stateKey}/${ref.phase}`
  )
  const processNodeRefs = uniqueBy(
    (rawStep.processNodeRefs || []).map((ref) =>
      resolveProcessNodeRef(ref, processByKey)
    ),
    (ref) => `${ref.processDefinitionKey}/${ref.nodeKey}`
  )
  const fromNode = nodeByKey.get(edge.from)
  const toNode = nodeByKey.get(edge.to)
  const ownerPoolKeys = uniqueStrings([
    ...(rawStep.ownerPoolKeys || []),
    ...fromNode.responsibleRoleKeys,
    ...toNode.responsibleRoleKeys,
    ...processNodeRefs.map((ref) => ref.ownerPoolKey),
  ])
  const capabilityKeys = uniqueStrings([
    ...(rawStep.capabilityKeys || []),
    ...stateTransitionRefs.flatMap((ref) => ref.capabilityKeys),
    ...processNodeRefs.flatMap((ref) => ref.capabilityKeys),
  ])
  if (
    rawStep.responsibilityMode === 'human' &&
    ownerPoolKeys.length === 0 &&
    capabilityKeys.length === 0
  ) {
    throw new Error(
      `${chainDefinition.key}/${edge.key} has an unresolved human responsibility`
    )
  }
  const referencedFactKeys = uniqueStrings([
    ...fromNode.factKeys,
    ...toNode.factKeys,
  ])
  const unknownFactKeys = referencedFactKeys.filter((key) => !factKeys.has(key))
  if (unknownFactKeys.length > 0) {
    throw new Error(
      `${chainDefinition.key}/${edge.key} references unknown facts: ${unknownFactKeys.join(', ')}`
    )
  }
  const preconditionStateRefs = uniqueBy(
    [
      ...stateTransitionRefs.map((ref) =>
        transitionStateRef(ref, 'precondition')
      ),
      ...declaredStateRefs.filter((ref) => ref.phase === 'precondition'),
    ],
    (ref) => `${ref.machineKey}/${ref.stateKey}`
  )
  const resultStateRefs = uniqueBy(
    [
      ...stateTransitionRefs.map((ref) => transitionStateRef(ref, 'result')),
      ...declaredStateRefs.filter((ref) => ref.phase === 'result'),
    ],
    (ref) => `${ref.machineKey}/${ref.stateKey}`
  )
  if (
    preconditionStateRefs.length === 0 &&
    resultStateRefs.length === 0 &&
    processNodeRefs.length === 0 &&
    referencedFactKeys.length === 0
  ) {
    throw new Error(
      `${chainDefinition.key}/${edge.key} does not bind a state, process node, or Fact`
    )
  }
  const actionRefs = uniqueBy(
    [
      ...stateTransitionRefs
        .filter((ref) => ref.actionKey)
        .map((ref) =>
          Object.freeze({
            kind: 'state_transition',
            key: ref.actionKey,
            authorityKey: `${ref.machineKey}/${ref.transitionKey}`,
          })
        ),
      ...processNodeRefs
        .filter((ref) => ref.actionKey)
        .map((ref) =>
          Object.freeze({
            kind: 'process_node',
            key: ref.actionKey,
            authorityKey: `${ref.processDefinitionKey}/${ref.nodeKey}`,
          })
        ),
      Object.freeze({
        kind: 'chain_relation',
        key: edge.action,
        authorityKey: edge.key,
      }),
    ],
    (ref) => `${ref.kind}/${ref.authorityKey}/${ref.key}`
  )
  return {
    key: edge.key,
    edgeKey: edge.key,
    fromNodeKey: edge.from,
    toNodeKey: edge.to,
    label: edge.label,
    condition: edge.condition,
    responsibility: Object.freeze({
      mode: rawStep.responsibilityMode,
      ownerPoolKeys,
      capabilityKeys,
    }),
    verificationRuleIds,
    sourceActionKeys,
    preconditionStateRefs,
    stateTransitionRefs,
    processNodeRefs,
    actionRefs,
    resultStateRefs,
    factKeys: referencedFactKeys,
    factBoundary: edge.factBoundary,
    sourceRefs: edge.sourceRefs,
    readOnly: true,
    allowsActionExecution: false,
  }
}

const SCENARIO_META = Object.freeze({
  happy_path: Object.freeze({
    label: '正常主路径',
    expectedOutcome: 'succeeds_and_reads_back',
  }),
  interruption_recovery: Object.freeze({
    label: '阻塞、退回与恢复',
    expectedOutcome: 'registered_interruption_then_recovery',
  }),
  unauthorized: Object.freeze({
    label: '无权限',
    expectedOutcome: 'rejected_without_side_effect',
  }),
  wrong_state: Object.freeze({
    label: '错误状态',
    expectedOutcome: 'rejected_without_side_effect',
  }),
  correction: Object.freeze({
    label: '取消、调整或冲正',
    expectedOutcome: 'correction_applied_with_audit',
  }),
  idempotency: Object.freeze({
    label: '重复提交与幂等',
    expectedOutcome: 'same_intent_replays_original_result',
  }),
})

function scenarioStepKeys(profile, kind) {
  if (kind === 'happy_path') return profile.happyStepKeys
  if (kind === 'interruption_recovery') return profile.interruptionStepKeys
  if (kind === 'correction') return profile.correctionStepKeys
  if (kind === 'unauthorized') return [profile.protectedStepKey]
  if (kind === 'wrong_state') return [profile.wrongStateStepKey]
  return [profile.idempotentStepKey]
}

function scenarioExtraTransitionRefs(profile, kind, flowByKey) {
  const rawRefs =
    kind === 'interruption_recovery'
      ? profile.interruptionTransitionRefs
      : kind === 'correction'
        ? profile.correctionTransitionRefs
        : []
  return rawRefs.map((ref) => resolveTransitionRef(ref, flowByKey))
}

function buildAcceptanceScenarios({
  chainDefinition,
  steps,
  profile,
  flowByKey,
}) {
  if (
    !profile ||
    !Array.isArray(profile.sourceRefs) ||
    profile.sourceRefs.length === 0
  ) {
    throw new Error(`${chainDefinition.key} has no acceptance scenario profile`)
  }
  const stepByKey = new Map(steps.map((item) => [item.key, item]))
  const browserKinds = new Set(profile.browserScenarioKinds || [])
  const scenarios = DEV_BUSINESS_CHAIN_SCENARIO_KINDS.map((kind) => {
    const meta = SCENARIO_META[kind]
    const stepKeys = uniqueStrings(scenarioStepKeys(profile, kind))
    if (stepKeys.length === 0 || stepKeys.some((key) => !stepByKey.has(key))) {
      throw new Error(`${chainDefinition.key}/${kind} references unknown steps`)
    }
    const selectedSteps = stepKeys.map((key) => stepByKey.get(key))
    const stateTransitionRefs = uniqueBy(
      [
        ...selectedSteps.flatMap((item) => item.stateTransitionRefs),
        ...scenarioExtraTransitionRefs(profile, kind, flowByKey),
      ],
      (ref) => `${ref.machineKey}/${ref.transitionKey}`
    )
    const processNodeRefs = uniqueBy(
      selectedSteps.flatMap((item) => item.processNodeRefs),
      (ref) => `${ref.processDefinitionKey}/${ref.nodeKey}`
    )
    const evidenceModes = uniqueStrings([
      'contract_test',
      ...(kind === 'happy_path' || kind === 'correction' ? ['dataset'] : []),
      ...(browserKinds.has(kind) ? ['browser'] : []),
    ])
    if (evidenceModes.some((mode) => !EVIDENCE_MODE_SET.has(mode))) {
      throw new Error(
        `${chainDefinition.key}/${kind} has an unknown evidence mode`
      )
    }
    const dataStageKeys = uniqueStrings([
      ...profile.dataStageKeys,
      ...(selectedSteps.some((step) => step.responsibility.mode === 'human')
        ? ['role']
        : []),
    ])
    if (dataStageKeys.some((key) => !DATA_STAGE_KEY_SET.has(key))) {
      throw new Error(
        `${chainDefinition.key}/${kind} has an unknown data stage`
      )
    }
    return Object.freeze({
      key: `${chainDefinition.key}.${kind}`,
      chainKey: chainDefinition.key,
      kind,
      label: meta.label,
      expectedOutcome: meta.expectedOutcome,
      stepKeys,
      interruptionKinds:
        kind === 'interruption_recovery'
          ? uniqueStrings(profile.interruptionKinds)
          : Object.freeze([]),
      responsibilityRefs: Object.freeze(
        selectedSteps.map((item) => item.responsibility)
      ),
      stateTransitionRefs,
      processNodeRefs,
      factKeys: uniqueStrings(selectedSteps.flatMap((item) => item.factKeys)),
      evidenceModes,
      dataStageKeys,
      sourceRefs: uniqueStrings([
        ...chainDefinition.sourceRefs,
        ...profile.sourceRefs,
      ]),
      readOnly: true,
      allowsActionExecution: false,
    })
  })
  if (
    scenarios.length !== SCENARIO_KIND_SET.size ||
    scenarios.some((scenario) => !SCENARIO_KIND_SET.has(scenario.kind))
  ) {
    throw new Error(
      `${chainDefinition.key} has incomplete acceptance scenarios`
    )
  }
  const scenarioCoveredStepKeys = new Set(
    scenarios
      .filter((scenario) =>
        ['happy_path', 'interruption_recovery', 'correction'].includes(
          scenario.kind
        )
      )
      .flatMap((scenario) => scenario.stepKeys)
  )
  const uncoveredStepKeys = steps
    .map((item) => item.key)
    .filter((key) => !scenarioCoveredStepKeys.has(key))
  if (uncoveredStepKeys.length > 0) {
    throw new Error(
      `${chainDefinition.key} has steps outside registered paths: ${uncoveredStepKeys.join(', ')}`
    )
  }
  return Object.freeze(scenarios)
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

function normalizeChain(rawChain, flowByKey, processByKey, factKeys) {
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
      normalizeNode(
        node,
        sourceRefs,
        new Set(flowByKey.keys()),
        processByKey,
        factKeys
      )
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
  const normalizedEdges = Object.freeze(
    rawChain.edges.map((edge) => normalizeEdge(edge, sourceRefs, nodeKeys))
  )
  if (
    new Set(normalizedEdges.map((edge) => edge.key)).size !==
    normalizedEdges.length
  ) {
    throw new Error(`${rawChain.key} has duplicate edge keys`)
  }
  const contractDefinition =
    DEV_BUSINESS_CHAIN_STEP_CONTRACT_DEFINITIONS[rawChain.key]
  const rawSteps = contractDefinition?.steps || {}
  const rawStepKeys = Object.keys(rawSteps)
  const edgeKeys = normalizedEdges.map((edge) => edge.key)
  const missingStepKeys = edgeKeys.filter((key) => !rawStepKeys.includes(key))
  const unknownStepKeys = rawStepKeys.filter((key) => !edgeKeys.includes(key))
  if (missingStepKeys.length > 0 || unknownStepKeys.length > 0) {
    throw new Error(
      `${rawChain.key} step contract mismatch: missing=${missingStepKeys.join(',')}; unknown=${unknownStepKeys.join(',')}`
    )
  }
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]))
  const baseSteps = normalizedEdges.map((edge) =>
    normalizeStepContract({
      chainDefinition: { ...rawChain, sourceRefs },
      edge,
      nodeByKey,
      rawStep: rawSteps[edge.key],
      flowByKey,
      processByKey,
      factKeys,
    })
  )
  const acceptanceScenarios = buildAcceptanceScenarios({
    chainDefinition: { ...rawChain, sourceRefs },
    steps: baseSteps,
    profile: contractDefinition?.profile,
    flowByKey,
  })
  const scenarioKeysByStep = new Map(
    baseSteps.map((stepDefinition) => [
      stepDefinition.key,
      acceptanceScenarios
        .filter((scenario) => scenario.stepKeys.includes(stepDefinition.key))
        .map((scenario) => scenario.key),
    ])
  )
  const steps = Object.freeze(
    baseSteps.map((stepDefinition) =>
      Object.freeze({
        ...stepDefinition,
        scenarioKeys: Object.freeze([
          ...(scenarioKeysByStep.get(stepDefinition.key) || []),
        ]),
      })
    )
  )
  const edges = Object.freeze(
    normalizedEdges.map((edge) =>
      Object.freeze({
        ...edge,
        stepKey: edge.key,
        scenarioKeys: Object.freeze([
          ...(scenarioKeysByStep.get(edge.key) || []),
        ]),
      })
    )
  )
  const normalized = Object.freeze({
    ...rawChain,
    entryNodeKeys,
    nodes,
    edges,
    steps,
    acceptanceScenarios,
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
  const flowByKey = new Map(safeFlows.map((flow) => [flow.key, flow]))
  const flowKeys = new Set(flowByKey.keys())
  const processByKey = new Map(
    safeProcessDefinitions.map((definition) => [definition.key, definition])
  )
  const factKeys = new Set(
    safeFactDefinitions.map((definition) => definition.factKey)
  )
  if (factKeys.size !== safeFactDefinitions.length) {
    throw new Error('business chain received duplicate fact definitions')
  }
  const definitionKeys = BUSINESS_CHAIN_DEFINITIONS.map((item) => item.key)
  const contractKeys = Object.keys(DEV_BUSINESS_CHAIN_STEP_CONTRACT_DEFINITIONS)
  const missingContractKeys = definitionKeys.filter(
    (key) => !contractKeys.includes(key)
  )
  const unknownContractKeys = contractKeys.filter(
    (key) => !definitionKeys.includes(key)
  )
  if (missingContractKeys.length > 0 || unknownContractKeys.length > 0) {
    throw new Error(
      `business chain step contract coverage mismatch: missing=${missingContractKeys.join(',')}; unknown=${unknownContractKeys.join(',')}`
    )
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
      normalizeChain(definition, flowByKey, processByKey, factKeys)
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

  const scenarioKeys = uniqueStrings(
    chains.flatMap((item) =>
      item.acceptanceScenarios.map((scenario) => scenario.key)
    )
  )
  const stepKeys = uniqueStrings(
    chains.flatMap((item) =>
      item.steps.map((stepDefinition) => `${item.key}/${stepDefinition.key}`)
    )
  )
  const expectedScenarioCount =
    chains.length * DEV_BUSINESS_CHAIN_SCENARIO_KINDS.length
  if (scenarioKeys.length !== expectedScenarioCount) {
    throw new Error(
      `business chain acceptance scenarios are incomplete: expected=${expectedScenarioCount}; actual=${scenarioKeys.length}`
    )
  }

  return Object.freeze({
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
      stepContractComplete: true,
      stepCount: stepKeys.length,
      scenarioContractComplete: true,
      scenarioCount: scenarioKeys.length,
      scenarioKinds: DEV_BUSINESS_CHAIN_SCENARIO_KINDS,
      evidenceModes: DEV_BUSINESS_CHAIN_EVIDENCE_MODES,
      dataStageKeys: DEV_BUSINESS_CHAIN_DATA_STAGE_KEYS,
    }),
  })
}
