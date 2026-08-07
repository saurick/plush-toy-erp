export const DEV_FACT_LEDGER_CATALOG_VERSION = 'dev-fact-ledger-catalog/v1'

export const DEV_FACT_LEDGER_RUNTIME_QUERY = Object.freeze({
  availability: 'unavailable',
  label: '未提供运行凭证查询',
  reason:
    '当前后端没有跨领域、按事实凭证 ID 读取 Fact/Ledger 的统一只读接口；观察台只展示定义和代码证据。',
})

export const DEV_FACT_LEDGER_DISPLAY_GROUPS = Object.freeze(
  [
    { key: 'procurement_quality', label: '采购与质量' },
    { key: 'production_inventory', label: '生产与库存' },
    { key: 'outsourcing_rework', label: '委外与返工' },
    { key: 'shipping_finance', label: '出货与财务' },
  ].map((group) => Object.freeze({ ...group, navigationOnly: true }))
)

const FACT_SCOPE_KEY = 'fact_ledger'
const FACT_DISPLAY_GROUP_KEYS = new Set(
  DEV_FACT_LEDGER_DISPLAY_GROUPS.map((group) => group.key)
)

const fact = (factKey, label, options) => ({
  factKey,
  label,
  machineKey: options.machineKey || factKey,
  displayGroupKey: options.displayGroupKey,
  occurrenceCondition: options.occurrenceCondition,
  sourceDocument: options.sourceDocument,
  authority: options.authority,
  businessImpact: options.businessImpact,
  voucher: options.voucher,
  idempotencyRule: options.idempotencyRule,
  correction: options.correction,
  sourceRefs: options.sourceRefs,
})

const FACT_DEFINITIONS = [
  fact('fact.purchase_receipt', '采购入库', {
    displayGroupKey: 'procurement_quality',
    occurrenceCondition: '采购收货确认并由采购入库领域用例完成正式过账。',
    sourceDocument: '采购订单与采购收货单',
    authority: 'purchase_receipts / purchase_receipt_items 与库存事务',
    businessImpact: '增加合格库存，并保留采购来源与批次关联。',
    voucher: '采购入库单及其过账状态；本观察台不能按凭证 ID 读回。',
    idempotencyRule: '同一来源单与幂等键不得重复生成入库影响。',
    correction: '已过账记录不改写；通过采购退货、入库调整或正式冲正纠正。',
    sourceRefs: [
      'server/internal/biz/purchase_receipt.go',
      'server/internal/data/purchase_receipt_repo.go',
    ],
  }),
  fact('fact.purchase_return', '采购退货', {
    displayGroupKey: 'procurement_quality',
    occurrenceCondition: '采购退货单满足可退数量并完成退货过账。',
    sourceDocument: '已过账采购入库与采购退货单',
    authority: 'purchase_returns / purchase_return_items 与库存事务',
    businessImpact: '扣减对应采购库存并留下来源入库关联。',
    voucher: '采购退货单及其过账状态；本观察台不能按凭证 ID 读回。',
    idempotencyRule: '来源入库、退货单和幂等键共同阻止重复扣减。',
    correction: '通过退货冲正恢复原库存影响，不物理删除已过账记录。',
    sourceRefs: [
      'server/internal/biz/purchase_return.go',
      'server/internal/data/purchase_return_repo.go',
    ],
  }),
  fact('fact.purchase_receipt_adjustment', '采购入库调整', {
    displayGroupKey: 'procurement_quality',
    occurrenceCondition: '对已过账采购入库提交合法差异并完成调整过账。',
    sourceDocument: '已过账采购入库与采购入库调整单',
    authority: 'purchase_receipt_adjustments / items 与对应库存调整事务',
    businessImpact: '以差额修正采购库存、批次和来源应付投影。',
    voucher: '采购入库调整单及其过账状态；本观察台不能按凭证 ID 读回。',
    idempotencyRule: '调整单版本、来源入库和幂等键必须一致。',
    correction: '通过调整冲正撤销差额影响，再创建新的正式调整。',
    sourceRefs: [
      'server/internal/biz/purchase_receipt_adjustment.go',
      'server/internal/data/purchase_receipt_adjustment_repo.go',
    ],
  }),
  fact('fact.quality_inspection', '质量检验', {
    displayGroupKey: 'procurement_quality',
    occurrenceCondition: '检验单由质量领域用例作出并持久化正式判定。',
    sourceDocument: '采购收货、委外回货或生产批次',
    authority: 'quality_inspections',
    businessImpact: '决定放行、隔离、拒收或返工，并可驱动受控库存/在制动作。',
    voucher: '质量检验单；Workflow 任务完成不是检验事实凭证。',
    idempotencyRule: '同一检验对象、阶段和版本不得重复确认。',
    correction: '按质量纠正合同创建新的处置或纠正记录，不覆盖审计历史。',
    sourceRefs: [
      'server/internal/biz/quality_inspection.go',
      'server/internal/service/jsonrpc_quality.go',
    ],
  }),
  fact('fact.shipment', '出货事实', {
    displayGroupKey: 'shipping_finance',
    occurrenceCondition: '出货单满足放行条件后，由出货领域用例记录真实出货。',
    sourceDocument: '销售订单与出货单',
    authority: 'shipments / shipment_items 与库存出库事务',
    businessImpact: '扣减成品库存并形成真实 shipped 业务时点。',
    voucher: '出货单与库存出库记录；财务放行或流程结束都不是 shipped 凭证。',
    idempotencyRule: '出货单版本、来源销售行和幂等键阻止重复出库。',
    correction: '按出货取消、退回或返工回厂合同生成可审计纠正记录。',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/service/jsonrpc_operational_fact_shipment.go',
    ],
  }),
  fact('fact.production', '生产事实', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '生产领域用例确认投料、完工或返工等正式生产动作。',
    sourceDocument: '生产订单、在制批次与生产确认单',
    authority: '生产事实读模型与对应库存事务',
    businessImpact: '更新在制、材料消耗、产出及成品库存来源。',
    voucher: '生产确认记录及关联库存事务；流程节点完成不是生产事实。',
    idempotencyRule: '生产订单、批次、动作类型和幂等键必须唯一。',
    correction: '通过命名的生产纠正或返工动作保留原记录并生成反向影响。',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/service/jsonrpc_operational_fact.go',
    ],
  }),
  fact('fact.outsourcing', '委外事实', {
    displayGroupKey: 'outsourcing_rework',
    occurrenceCondition: '委外发料、回货或修正由委外领域用例正式确认。',
    sourceDocument: '委外订单、发料单与回货单',
    authority: '委外事实读模型与库存事务',
    businessImpact: '记录委外材料流出、回货和相应库存变化。',
    voucher: '委外发料/回货记录及库存事务。',
    idempotencyRule: '委外订单行、动作类型和幂等键不得重复生效。',
    correction: '使用委外处置或反向库存事务纠正，保留原事实。',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/service/jsonrpc_operational_fact.go',
    ],
  }),
  fact('fact.stock_reservation', '库存预留', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '销售需求通过库存预留领域用例成功占用可用量。',
    sourceDocument: '销售订单行',
    authority: '库存预留记录',
    businessImpact: '减少可承诺量，但不等于实物已出库。',
    voucher: '库存预留记录；本观察台不能按凭证 ID 读回。',
    idempotencyRule: '同一来源销售行与预留意图只能生成一个有效影响。',
    correction: '释放或取消预留，不能用 Workflow 状态代替库存释放。',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/data/operational_fact_repo.go',
    ],
  }),
  fact('fact.finance', '业务财务事实', {
    displayGroupKey: 'shipping_finance',
    occurrenceCondition: '真实出货、采购入库等受支持来源满足财务生成条件。',
    sourceDocument: '真实业务来源单据',
    authority: 'finance_facts',
    businessImpact: '形成应收、应付等财务义务，不代表已经收付款或核销。',
    voucher: '财务事实记录及来源关联；本观察台不提供跨域凭证查询。',
    idempotencyRule: '来源类型、来源 ID、事实类型和业务唯一键不得重复。',
    correction: '通过红冲或反向事实纠正，不覆盖已生效财务记录。',
    sourceRefs: [
      'server/internal/biz/operational_fact.go',
      'server/internal/data/model/schema/finance_fact.go',
    ],
  }),
  fact('fact.inventory_lot', '库存批次', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '库存领域用例完成入库、出库、调整或反向事务。',
    sourceDocument: '对应采购、生产、委外、出货或调整来源单据',
    authority: 'inventory_txns / inventory_balances / inventory_lots',
    businessImpact: '改变批次余额、可用量或隔离状态。',
    voucher: '库存事务及其来源单据；派生余额不是独立写入凭证。',
    idempotencyRule: '来源、事务类型、批次与幂等键阻止重复影响。',
    correction: '只追加反向或调整事务，已过账事务不可改删。',
    sourceRefs: [
      'server/internal/biz/inventory.go',
      'server/internal/core/status/inventory_lot.go',
    ],
  }),
  fact('fact.production_wip_batch', '生产在制批次', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '生产订单释放并由生产领域用例建立或推进在制批次。',
    sourceDocument: '生产订单',
    authority: '生产在制批次与操作记录',
    businessImpact: '记录在制数量、阶段和 HOLD/释放状态。',
    voucher: '在制批次与操作记录。',
    idempotencyRule: '生产订单、批次和操作序号必须一致且不可重复推进。',
    correction: '通过在制纠正、质检处置或返工动作调整，不覆盖历史。',
    sourceRefs: [
      'server/internal/biz/production_wip.go',
      'server/internal/data/production_wip_repo.go',
    ],
  }),
  fact('fact.production_packaging_confirmation', '生产包材确认', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '生产批次在规定节点完成包材核对并提交确认。',
    sourceDocument: '生产在制批次与包材核对记录',
    authority: '生产包材确认记录',
    businessImpact: '证明包材确认发生，不自动证明生产完工或成品入库。',
    voucher: '包材确认记录。',
    idempotencyRule: '同一批次和确认阶段只能保留一个有效确认版本。',
    correction: '按生产在制合同重新确认并保留版本与审计。',
    sourceRefs: [
      'server/internal/biz/production_wip.go',
      'server/internal/data/production_wip_repo.go',
    ],
  }),
  fact('fact.rework_intake', '返工回厂', {
    displayGroupKey: 'outsourcing_rework',
    occurrenceCondition: '原出货来源通过返工回厂领域用例正式收回。',
    sourceDocument: '原出货单与返工回厂单',
    authority: '返工回厂单、明细及关联库存事务',
    businessImpact: '形成返工 HOLD 库存和后续生产返工来源。',
    voucher: '返工回厂单及入库事务。',
    idempotencyRule: '原出货行、返工回厂行和幂等键不得重复入库。',
    correction: '按返工回厂取消/纠正合同生成反向记录，保留原来源链。',
    sourceRefs: [
      'server/internal/biz/rework_intake.go',
      'server/internal/data/operational_fact_rework_intake_repo.go',
    ],
  }),
  fact('fact.production_exception_decision', '生产异常决策', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '异常审批完成后保存明确、版本一致的处置决策。',
    sourceDocument: '生产异常任务与受影响生产对象',
    authority: '生产异常决策记录',
    businessImpact: '只确定处置方向；决策本身不等于库存或生产动作已执行。',
    voucher: '异常决策记录与审批证据。',
    idempotencyRule: '同一异常对象和决策版本只允许一个有效结果。',
    correction: '通过新的受控决策版本纠正，不删除原决策。',
    sourceRefs: [
      'server/internal/biz/production_exception_decision.go',
      'server/internal/data/production_exception_decision_repo.go',
    ],
  }),
  fact('fact.production_exception_execution', '生产异常执行状态', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '已批准的异常决策由命名领域命令实际执行并记录结果。',
    sourceDocument: '生产异常决策',
    authority: '生产异常执行记录及其领域事实',
    businessImpact:
      '更新受影响在制、生产或库存对象；只有执行成功才代表动作发生。',
    voucher: '异常执行记录和目标领域凭证。',
    idempotencyRule: '决策版本与执行幂等键阻止重复执行。',
    correction: '进入明确的失败重试、补偿或新的纠正决策。',
    sourceRefs: [
      'server/internal/biz/production_exception_decision.go',
      'server/internal/data/production_exception_decision_repo.go',
    ],
  }),
  fact('fact.purchase_rejection_disposition', '采购拒收处置', {
    displayGroupKey: 'procurement_quality',
    occurrenceCondition: '采购质检拒绝后保存并执行明确的退货、隔离或调整处置。',
    sourceDocument: '采购质检单与采购收货单',
    authority: '采购拒收处置记录',
    businessImpact: '决定并记录不合格采购物料如何退出或留在库存。',
    voucher: '采购拒收处置单及后续退货/调整凭证。',
    idempotencyRule: '同一质检拒绝与处置版本不得重复执行。',
    correction: '通过新的处置版本或下游正式冲正纠正。',
    sourceRefs: [
      'server/internal/biz/purchase_rejection_disposition.go',
      'server/internal/data/purchase_rejection_disposition_repo.go',
    ],
  }),
  fact('fact.outsourcing_return_disposition', '委外回货处置', {
    displayGroupKey: 'outsourcing_rework',
    occurrenceCondition: '委外回货质检拒绝后完成明确处置。',
    sourceDocument: '委外回货与质量检验单',
    authority: '委外回货处置记录',
    businessImpact: '驱动退回供应商、隔离库存或委外事实修正。',
    voucher: '委外回货处置单及目标领域记录。',
    idempotencyRule: '同一回货质检结果与处置版本不得重复执行。',
    correction: '通过新的处置或反向库存/委外事实纠正。',
    sourceRefs: [
      'server/internal/biz/outsourcing_return_disposition.go',
      'server/internal/data/outsourcing_return_disposition_repo.go',
    ],
  }),
  fact('fact.finance_payment', '收付款单', {
    displayGroupKey: 'shipping_finance',
    occurrenceCondition: '收付款单批准后由财务领域用例完成正式过账。',
    sourceDocument: '收付款单与待核销财务事实',
    authority: 'finance_payments 与不可变核销记录',
    businessImpact: '记录真实收款或付款，并可减少对应未结金额。',
    voucher: '已过账收付款单与核销记录；审批完成不是付款凭证。',
    idempotencyRule: '支付单、来源事实、金额和幂等键必须一致。',
    correction: '已过账单只能以冲正生成反向核销，不允许取消或改写。',
    sourceRefs: [
      'server/internal/biz/finance_payment.go',
      'server/internal/data/operational_fact_finance_payment_repo.go',
    ],
  }),
  fact('fact.finance_allocation', '财务核销记录', {
    displayGroupKey: 'shipping_finance',
    occurrenceCondition: '收付款过账时对指定应收/应付生成不可变核销分配。',
    sourceDocument: '已过账收付款单与待核销财务事实',
    authority: 'finance_allocations',
    businessImpact: '减少未结金额并保留款项与业务事实的对应关系。',
    voucher: '核销记录。',
    idempotencyRule: '支付、目标财务事实和分配序号必须唯一。',
    correction: '通过反向核销记录纠正，原核销不删除。',
    sourceRefs: [
      'server/internal/biz/finance_payment.go',
      'server/internal/data/model/schema/finance_allocation.go',
    ],
  }),
  fact('fact.finance_credit_note', '财务红冲单', {
    displayGroupKey: 'shipping_finance',
    occurrenceCondition: '对已生效财务事实执行有理由、有权限的正式红冲。',
    sourceDocument: '原财务事实或已过账收付款单',
    authority: 'finance_credit_notes 与反向财务记录',
    businessImpact: '以反向记录抵消原事实，不抹除原账。',
    voucher: '财务红冲单及其原事实关联。',
    idempotencyRule: '原事实、红冲原因和幂等键不得重复生成反向影响。',
    correction: '红冲本身保持不可变；后续错误通过新的正式记录处理。',
    sourceRefs: [
      'server/internal/biz/finance_payment.go',
      'server/internal/data/model/schema/finance_credit_note.go',
    ],
  }),
  fact('fact.shipment_finance_release', '出货财务放行', {
    displayGroupKey: 'shipping_finance',
    occurrenceCondition: '出货财务审批节点通过并由出货领域命令记录版本化放行。',
    sourceDocument: '出货单与财务审批任务',
    authority: 'shipment 的版本化财务放行字段与审计记录',
    businessImpact: '只允许后续出货步骤继续，不代表货物已经 shipped。',
    voucher: '出货财务放行记录；不是出货或应收凭证。',
    idempotencyRule: '出货单版本和流程节点 attempt 必须匹配。',
    correction: '通过出货领域拒绝/重新审批合同纠正放行状态。',
    sourceRefs: [
      'server/internal/biz/shipment_process_command.go',
      'server/internal/data/model/schema/shipment.go',
    ],
  }),
  fact('fact.inventory_operation', '库存操作单', {
    displayGroupKey: 'production_inventory',
    occurrenceCondition: '库存操作单批准后由库存领域用例完成正式过账。',
    sourceDocument: '库存操作单',
    authority: 'inventory_operations 与库存事务/余额/批次',
    businessImpact: '按命名操作增加、扣减或调整库存。',
    voucher: '已过账库存操作单与库存事务。',
    idempotencyRule: '操作单版本、来源仓库/批次与幂等键必须一致。',
    correction: '已过账操作通过命名冲正或反向库存事务纠正。',
    sourceRefs: [
      'server/internal/biz/inventory_operation.go',
      'server/internal/data/inventory_operation_repo.go',
    ],
  }),
]

const requiredTextFields = Object.freeze([
  'factKey',
  'label',
  'machineKey',
  'displayGroupKey',
  'occurrenceCondition',
  'sourceDocument',
  'authority',
  'businessImpact',
  'voucher',
  'idempotencyRule',
  'correction',
])

const exactText = (value) =>
  typeof value === 'string' && value.trim() === value && value.length > 0

const freezeDefinition = (definition) =>
  Object.freeze({
    ...definition,
    sourceRefs: Object.freeze([...definition.sourceRefs]),
    readOnly: true,
    runtimeProofQuery: 'unavailable',
  })

export function buildDevFactLedgerCatalog({ flows } = {}) {
  const safeFlows = Array.isArray(flows) ? flows : []
  const factFlows = safeFlows.filter(
    (flow) => flow?.scopeKey === FACT_SCOPE_KEY
  )
  const factFlowKeys = new Set(factFlows.map((flow) => flow.key))
  if (factFlowKeys.size !== factFlows.length) {
    throw new Error('fact ledger catalog received duplicate fact machine keys')
  }

  const definitions = Object.freeze(
    FACT_DEFINITIONS.map((definition) => {
      if (
        requiredTextFields.some((field) => !exactText(definition[field])) ||
        !FACT_DISPLAY_GROUP_KEYS.has(definition.displayGroupKey) ||
        !Array.isArray(definition.sourceRefs) ||
        definition.sourceRefs.length === 0 ||
        definition.sourceRefs.some((sourceRef) => !exactText(sourceRef))
      ) {
        throw new Error('fact ledger catalog has an incomplete definition')
      }
      return freezeDefinition(definition)
    })
  )
  const factKeys = definitions.map((definition) => definition.factKey)
  if (new Set(factKeys).size !== factKeys.length) {
    throw new Error('fact ledger catalog has duplicate fact keys')
  }
  if (
    DEV_FACT_LEDGER_DISPLAY_GROUPS.some(
      (group) =>
        !definitions.some(
          (definition) => definition.displayGroupKey === group.key
        )
    )
  ) {
    throw new Error('fact ledger catalog has an empty display group')
  }

  const unknownFactKeys = factKeys.filter((key) => !factFlowKeys.has(key))
  const missingFactKeys = [...factFlowKeys].filter(
    (key) => !factKeys.includes(key)
  )
  if (unknownFactKeys.length > 0 || missingFactKeys.length > 0) {
    throw new Error(
      `fact ledger catalog coverage mismatch: unknown=${unknownFactKeys.join(',')}; missing=${missingFactKeys.join(',')}`
    )
  }

  return Object.freeze({
    version: DEV_FACT_LEDGER_CATALOG_VERSION,
    readOnly: true,
    allowsActionExecution: false,
    runtimeQuery: DEV_FACT_LEDGER_RUNTIME_QUERY,
    displayGroups: DEV_FACT_LEDGER_DISPLAY_GROUPS,
    definitions,
    coverage: Object.freeze({
      complete: true,
      requiredFactKeys: Object.freeze([...factFlowKeys]),
      coveredFactKeys: Object.freeze([...factKeys]),
    }),
  })
}
