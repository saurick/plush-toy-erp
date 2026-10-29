// Read-only descriptions of the task owners in fulfillment_tasks.go,
// workflow_derived_tasks.go, workflow_downstream_tasks.go and the domain chains.
// They describe one task's work, never a whole flow's participants or live access.
const relationRefs = {
  finished_goods_qc: [['finished_quality', 'quality']],
  incoming_quality: [['incoming_quality', 'inspect']],
  cutting_quality: [['cutting_quality', 'inspect']],
  shell_quality: [['shell_quality', 'inspect']],
  finished_quality: [['finished_quality', 'quality']],
  material_inbound: [['incoming_quality', 'inbound']],
  finished_goods_inbound: [['finished_inbound', 'inbound']],
  finished_inbound: [['finished_inbound', 'inbound']],
  cutting_return: [['cutting_return', '']],
  cutting_issue: [['cutting_issue', 'issue']],
  sewing_return: [['sewing_execute', 'return']],
  sewing_issue: [['sewing_execute', 'issue']],
  sewing_execute: [
    ['sewing_execute', 'route'],
    ['sewing_execute', 'internal'],
  ],
  handwork_return: [['handwork_execute', 'return']],
  handwork_issue: [['handwork_execute', 'issue']],
  handwork_execute: [
    ['handwork_execute', 'route'],
    ['handwork_execute', 'internal'],
  ],
  production_schedule: [['cutting_issue', 'create']],
  production_fact: [['finished_inbound', 'inbound']],
}
const duties = (keys, roleKeys, input, handoff, extra = {}) =>
  keys.split(' ').map((key) => [
    key,
    {
      roleKeys,
      input,
      handoff,
      relationRefs: relationRefs[key] || [],
      ...extra,
    },
  ])

export const TASK_HANDLING_DUTIES = Object.freeze(
  Object.fromEntries([
    ...duties(
      'engineering_data',
      ['engineering'],
      '在原 BOM 编辑器编制、导入材料明细并完成工程资料',
      '完成工程资料且订单生效后自动汇总并送审',
      { relationRefs: [['sales_order', 'engineering']] }
    ),
    ...duties(
      'engineering',
      ['engineering'],
      '修改原工程资料并点击“完成工程资料”，校验通过后自动送审；退回后继续修订原资料',
      '老板审核 → 另一位财务复核',
      { label: '工程资料修订与自动送审' }
    ),
    ...duties(
      'sales_order',
      ['sales'],
      '编制订单明细、数量和交期，核对后提交',
      '交订单审批人，按生效配置办理',
      {
        label: '销售订单编制与提交',
        relationRefs: [['sales_order', 'prepare']],
      }
    ),
    ...duties(
      'purchasing',
      ['purchase'],
      '编制采购明细并提交；用料审批生成的采购单不重复送审',
      '独立人工采购单交配置的采购审批人',
      { label: '采购订单编制与提交', relationRefs: [['purchasing', 'source']] }
    ),
    ...duties(
      'finished_goods_qc incoming_quality cutting_quality shell_quality finished_quality needle_quality sampling_quality customer_quality quality_other',
      ['quality'],
      '按来源逐项登记检验数量、结论和差异',
      '合格交下一环节；不合格按来源进入异常处置'
    ),
    ...duties(
      'finished_goods_inbound material_inbound finished_inbound',
      ['warehouse'],
      '核对来源、合格数量和仓库，确认本次入库',
      '入库结果留在来源单据及库存记录'
    ),
    ...duties(
      'finished_goods_rework',
      ['production'],
      '按返工要求安排加工，记录进度和回交结果',
      '返工产出另行交品质复检'
    ),
    ...duties(
      'receivable_registration',
      ['finance'],
      '核对实际出货来源，登记并确认应收',
      '收款、核销另行办理'
    ),
    ...duties(
      'invoice_registration',
      ['finance'],
      '核对正式来源，登记并确认发票记录',
      '保留与来源及账款的关联'
    ),
    ...duties(
      'payable_registration',
      ['finance'],
      '核对采购或委外已过账来源，登记并确认应付',
      '付款、核销另行办理'
    ),
    ...duties(
      'reconciliation',
      ['finance'],
      '按往来单位核对单据、账款及差异，确认对账',
      '差异按对应账款或来源单据处理'
    ),
    ...duties(
      'purchase_count purchase_receipt',
      ['warehouse'],
      '按采购来源登记到货，逐行清点实收数量',
      '交品质检验；点数不等于入库',
      { relationRefs: [['purchase_count', '']] }
    ),
    ...duties(
      'incoming_exception',
      ['purchase'],
      '按拒收结果登记退厂或补换方案，跟进供应商',
      '仓库办理退回或补换实点；品质重新检验'
    ),
    ...duties(
      'packaging_version',
      ['sales'],
      '核对并确认本批次使用的包装版本和用料',
      '交仓库查货与包装',
      { relationRefs: [['packaging', 'version']] }
    ),
    ...duties(
      'packaging',
      ['warehouse'],
      '按已确认包装版本查货、包装并记录完成数量',
      '质量、包装和放行条件齐备后方可发货',
      { relationRefs: [['packaging', 'pack']] }
    ),
    ...duties(
      'cutting_return sewing_return handwork_return outsourcing_return',
      ['warehouse'],
      '核对发出来源，登记回货批次和实点数量',
      '有检验要求时交品质，合格后办理接收'
    ),
    ...duties(
      'cutting_issue sewing_issue handwork_issue',
      ['warehouse'],
      '按加工安排核对批次与数量，登记实际发料',
      '交加工执行，回货另行点数'
    ),
    ...duties(
      'cutting_execute sewing_execute handwork_execute',
      ['production'],
      '安排本工序加工，登记执行进度和交接结果',
      '仓库负责委外收发；品质负责检验'
    ),
    ...duties(
      'cutting_exception sewing_exception handwork_exception production_exception',
      ['sales'],
      '依据质量异常提出返工、让步或报废方案',
      '老板审批后，由生产或仓库按方案执行'
    ),
    ...duties(
      'cutting_decision sewing_decision handwork_decision',
      ['boss'],
      '核对异常依据，批准或退回处置方案',
      '批准与执行分开，执行按库存状态分派'
    ),
    ...duties(
      'outsourcing_contract',
      ['purchase'],
      '补齐加工合同价格、数量和交期，确认合同',
      '交仓库办理加工收发'
    ),
    ...duties(
      'outsourcing_quality_prepare',
      ['quality'],
      '核对加工回货来源，发起本次检验',
      '由品质记录正式检验结果'
    ),
    ...duties(
      'production_schedule',
      ['pmc'],
      '编制生产订单和排程，核对物料、产能与交期后发布',
      '交生产经理安排各工序执行'
    ),
    ...duties(
      'production_fact',
      ['warehouse'],
      '核对产出来源和数量，登记并确认成品入库记录',
      '品质继续办理规定质量关口'
    ),
    ...duties(
      'production_batch',
      [],
      '先定位具体工序，再按执行、收发或检验任务办理',
      '岗位以具体工序任务分派为准'
    ),
    ...duties(
      'shipment',
      ['sales'],
      '编制出货资料并申请放行；条件齐备后确认实际发货',
      '先交配置的财务审批人放行，再确认发货',
      { label: '出货编制与实际发货', relationRefs: [['shipment', 'actual']] }
    ),
    ...duties(
      'payment',
      ['finance'],
      '登记收付款金额、往来单位、用途和凭据，提交审批',
      '老板审批；财务执行和核销另行留痕',
      { label: '收付款申请' }
    ),
    ...duties(
      'inventory',
      ['warehouse'],
      '编制盘点或调整申请；调拨按来源单据核对并确认',
      '盘点与人工调整经老板审批后由仓库过账',
      { label: '库存作业编制与调拨' }
    ),
    ...duties(
      'followup unclassified',
      [],
      '按本次任务填写反馈、原因或办理结果',
      '具体岗位及交接以任务分派为准'
    ),
  ])
)
