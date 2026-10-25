import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

// Read-only explanations of domain actions. These rows never decide whether a live action is allowed.
const DATA = 'server/internal/data/'
const BIZ = 'server/internal/biz/'
const SERVICE = 'server/internal/service/'
const assignmentSources = [
  `${BIZ}workflow_assignment.go`,
  `${DATA}workflow_repo.go`,
  `${SERVICE}jsonrpc_workflow_assignment.go`,
]
const sourceActionAuthority =
  '由具有对应单据动作权限的人员办理；后端复核当前版本、原因、幂等回执和关联对象。'

export const DEV_FLOW_ACTION_RULES = {
  'workflow.task': [
    {
      key: 'reassign',
      label: '指定或改派办理人',
      states: ['ready', 'blocked'],
      authority:
        '操作人须在职、可见该任务并有任务转交权限；接收人须在职、属于当前责任岗位，并具备该任务的读取、更新、办理及来源访问资格。',
      permission: [PermissionCode.WORKFLOW_TASK_ASSIGN],
      condition:
        '任务尚未结束，明确选择接收人，填写 1–255 字原因；携带当前任务版本和幂等键。',
      blocked:
        '任务已完成、退回或撤回；接收人不合格；重复指定原办理人；版本过期或同一幂等键的意图不同。',
      effect:
        '只修改办理人并递增版本，保留任务主状态和责任岗位；产生转交事件及审计记录，不产生库存或财务事实。',
      recovery:
        '版本冲突后刷新再判断；同一次请求重试沿用原幂等键。需要纠正时再次正式改派，保留前后责任记录。',
      sourceRefs: assignmentSources,
    },
    {
      key: 'return_to_pool',
      label: '退回责任池',
      states: ['ready', 'blocked'],
      authority:
        '操作人资格与改派相同；退回的是原责任岗位，不支持借此更换责任岗位。',
      permission: [PermissionCode.WORKFLOW_TASK_ASSIGN],
      condition:
        '任务尚未结束且已有办理人；明确清空办理人，填写原因并校验版本和幂等键。',
      blocked:
        '任务已结束、原本没有办理人、无转交权限或版本冲突；省略办理人参数不等于主动清空。',
      effect:
        '清空个人办理人，原责任池继续负责；主状态不变，产生退回责任池事件和审计记录。',
      recovery:
        '之后由符合资格的人员办理，或通过正式改派指定办理人；不能以清空办理人解除业务阻塞。',
      sourceRefs: assignmentSources,
    },
  ],
  'fact.shipment': [
    {
      key: 'ship',
      label: '确认实际出货',
      states: ['DRAFT'],
      authority: '按出货流程的正式领域命令执行；财务放行与实际出货分别留证。',
      condition:
        '财务已放行；来源、累计数量、价格及净重快照有效；可用库存和本订单预留满足要求。没有有效成品质检时可继续；已有有效质检须全部合格或让步接收。',
      blocked:
        '财务未放行；有效质检待处理或拒绝；超出来源剩余量；库存不足、占用其他订单预留或快照不完整。',
      effect:
        '同一事务写入出库流水、扣减库存、消耗匹配预留并记录出货；任务完成或财务放行本身不会产生这些事实。',
      recovery:
        '先补齐对应条件，再从原办理入口继续；重复执行核对已有出库证据，不重复扣库。已出货错误走取消与库存冲正。',
      sourceRefs: [
        `${DATA}operational_fact_shipment_repo.go`,
        `${BIZ}operational_fact.go`,
      ],
    },
    {
      key: 'cancel',
      label: '取消草稿或冲正已出货',
      states: ['DRAFT', 'SHIPPED'],
      authority: '由出货取消入口校验权限和相关流程；不直接修改状态字段。',
      condition:
        '没有仍在运行的成品交付流程、待处理的成品质检，以及未取消的应收或发票事实。',
      blocked:
        '交付流程仍 active；存在草稿／已提交质检；存在未取消的应收或发票。',
      effect:
        '草稿只取消；已出货追加反向库存流水并标记原领域影响已补偿，保留原出货及审计记录。',
      recovery:
        '先通过正式入口处理关联流程、质检和财务依赖，再重试取消；取消后没有通用恢复到草稿动作。',
      sourceRefs: [`${DATA}operational_fact_shipment_repo.go`],
    },
  ],
  'source.sales_order': [
    {
      key: 'close',
      label: '正常关单或短结',
      states: ['active'],
      authority: sourceActionAuthority,
      condition:
        '没有出货草稿、有效库存预留和未结束生产单；正常关单要求开放订单行已足量出货，短结必须填写原因。',
      blocked: '存在未处理出货、预留或生产依赖；正常关单仍欠交；短结缺少原因。',
      effect:
        '关闭单据及开放行，记录履约数量和结清方式；不补造出货、收款或发票。',
      recovery:
        '先处理依赖；确需少交结束时按短结办理。已经关闭没有通用重开动作。',
      sourceRefs: [
        `${DATA}sales_order_repo.go`,
        `${BIZ}source_order_lifecycle.go`,
      ],
    },
    {
      key: 'cancel',
      label: '取消销售订单',
      states: ['draft', 'submitted', 'active'],
      authority: sourceActionAuthority,
      condition:
        '填写原因；关联出货和生产单均已取消，没有有效预留；正式取消入口同时协调订单接单流程。',
      blocked:
        '任何未取消的出货、生产单或有效预留；不能把已出货的订单直接改成取消。',
      effect:
        '取消源单及开放行，按正式流程撤回相关待办；不自动撤销其他领域事实。',
      recovery:
        '先处理关联单据和事实，再取消来源；需要后续业务时另走正式建单路径。',
      sourceRefs: [
        `${DATA}sales_order_repo.go`,
        `${BIZ}source_order_lifecycle.go`,
      ],
    },
  ],
  'source.purchase_order': [
    {
      key: 'close',
      label: '正常关单或短结',
      states: ['approved'],
      authority: sourceActionAuthority,
      condition:
        '不存在仍待入库的有效采购收货行，物料供应流程不在运行；正常关单按有效收货量核对开放行，短结必须填写原因。',
      blocked: '收货仍待办理、供应流程未结束、正常关单未足量收货或短结缺原因。',
      effect: '关闭采购订单和开放行，保留已发生的收货、退货、调整与应付事实。',
      recovery:
        '先完成或取消待办；数量不足且确定不再收货时办理短结，不补造入库数量。',
      sourceRefs: [
        `${DATA}purchase_order_repo.go`,
        `${DATA}purchase_order_receipt_progress_repo.go`,
        `${BIZ}source_order_lifecycle.go`,
      ],
    },
    {
      key: 'cancel',
      label: '取消采购订单',
      states: ['draft', 'submitted', 'approved'],
      authority: sourceActionAuthority,
      condition:
        '填写原因，所有关联采购收货单已取消；由正式取消入口协调供应流程。',
      blocked: '存在任何未取消收货单，包括草稿与已入库记录。',
      effect: '取消源单和开放行，不绕过收货、库存及应付事实的纠正规则。',
      recovery: '按事实依赖顺序处理应付、退货／调整、收货，再取消来源。',
      sourceRefs: [
        `${DATA}purchase_order_repo.go`,
        `${BIZ}source_order_lifecycle.go`,
      ],
    },
  ],
  'source.outsourcing_order': [
    {
      key: 'close',
      label: '正常关单或短结',
      states: ['confirmed'],
      authority: sourceActionAuthority,
      condition:
        '关联在制批次已结束，委外事实均已过账或取消；正常关单还须满足逐行结清数量，短结必须填写原因。',
      blocked: '存在未结束在制批次、未结算事实草稿或未满足正常结清数量。',
      effect: '关闭委外订单与开放行，已发生发料、回货、质检及应付继续留存。',
      recovery:
        '先处理批次和事实；确定不再继续的欠量按短结办理，不伪造回货或结算。',
      sourceRefs: [
        `${DATA}outsourcing_order_repo.go`,
        `${BIZ}source_order_lifecycle.go`,
      ],
    },
    {
      key: 'cancel',
      label: '取消委外订单',
      states: ['draft', 'submitted', 'confirmed'],
      authority: sourceActionAuthority,
      condition:
        '填写原因，全部关联委外事实已取消，并满足在制批次的来源依赖限制。',
      blocked: '仍有有效发料、回货或其他委外事实，以及不能解除的在制批次关联。',
      effect: '取消源单及开放行，不能代替发料／回货冲正。',
      recovery: '先纠正依赖事实与批次，再取消源单；保留原委外和供应商历史。',
      sourceRefs: [
        `${DATA}outsourcing_order_repo.go`,
        `${BIZ}source_order_lifecycle.go`,
      ],
    },
  ],
  'source.production_order': [
    {
      key: 'close',
      label: '关闭生产单',
      states: ['RELEASED'],
      authority: sourceActionAuthority,
      condition:
        '无未解决异常和活动在制批次，生产事实均已过账或取消；成品未足量入库时必须填写关闭原因。',
      blocked: '异常处置、在制批次或事实草稿尚未结束；欠量关闭未说明原因。',
      effect:
        '关闭生产承诺，保留冻结的生产依据与全部已发生事实；关闭不等于补足产量。',
      recovery:
        '按实际阻断处理异常、批次和事实，再关闭；不通过修改汇总数量绕过检查。',
      sourceRefs: [
        `${DATA}production_order_repo.go`,
        `${BIZ}production_order.go`,
      ],
    },
    {
      key: 'cancel',
      label: '取消生产单',
      states: ['DRAFT', 'RELEASED'],
      authority: sourceActionAuthority,
      condition:
        '关联生产事实均已取消；正式取消入口校验版本并处理已发布生产单的协同关联。',
      blocked: '存在已过账生产事实，或任何未取消的生产事实草稿。',
      effect: '取消生产单，保留来源和历史；不直接冲正领料或成品入库。',
      recovery: '先按各事实的依赖规则取消或冲正，再取消生产单。',
      sourceRefs: [
        `${DATA}production_order_repo.go`,
        `${BIZ}production_order.go`,
      ],
    },
  ],
  'fact.purchase_receipt': [
    {
      key: 'post',
      label: '办理采购入库',
      states: ['DRAFT', 'POSTED'],
      authority:
        '按仓库数据范围和入库动作权限办理；流程完成回执还要满足全部交接条件。',
      condition:
        '按行核对质检放行、仓库范围及采购剩余量；可先入库已就绪行。已有入库行不能重复入库。',
      blocked:
        '无可入库行且没有已入库行；质检待定或拒收；新增入库时已有有效应付；超采购可收数量。',
      effect:
        '仅对本次就绪行写库存流水；单头状态不能单独证明所有行已完成交接，全部完成后才确认流程结果。',
      recovery:
        '继续处理未就绪行的质检或拒收处置；纠错走收货取消、退货或调整，不能抹除已入库行。',
      sourceRefs: [
        `${DATA}purchase_receipt_repo.go`,
        `${DATA}purchase_receipt_inbound.go`,
      ],
    },
    {
      key: 'cancel',
      label: '取消收货与冲正入库',
      states: ['DRAFT', 'POSTED'],
      authority: '按收货取消权限、仓库范围和正式流程交接规则办理。',
      condition:
        '分别核对未入库行和已入库行；处理有效应付、退货、调整及质检／交接依赖，库存须允许反向扣回。',
      blocked:
        '存在有效应付、退货或调整；质检／交接状态不允许取消，或入库库存已被后续业务消耗而不足冲回。',
      effect:
        '已入库行追加反向库存流水；未入库行只结算取消与交接，不生成不存在的反向库存。',
      recovery:
        '先处理后续事实再重试；主数据停用不应被解释为删除原事实或自动禁止合法历史纠正。',
      sourceRefs: [
        `${DATA}purchase_receipt_repo.go`,
        `${DATA}purchase_receipt_inbound.go`,
      ],
    },
  ],
  'fact.production': [
    {
      key: 'post',
      label: '生产事实过账',
      states: ['DRAFT'],
      authority:
        '从正式领料、成品入库或返工入口办理，复核权限、版本与重复执行回执。',
      condition:
        '来源生产单、明细、冻结材料或在制批次匹配；按事实类型核对可领量、可入库量和可用库存。返工使用自己的来源及新批次规则。',
      blocked:
        '来源或批次不匹配、超可办理量、库存不足、重复请求意图不一致；不能仅凭任务完成过账。',
      effect:
        '在事务内写本类生产事实及对应库存／批次影响，不把返工一律当作普通成品入库。',
      recovery: '修正来源、数量和库存条件后再办理；已生效错误走正式冲正。',
      sourceRefs: [
        `${DATA}operational_fact_production_repo.go`,
        `${BIZ}operational_fact.go`,
      ],
    },
    {
      key: 'cancel',
      label: '取消生产草稿或冲正',
      states: ['DRAFT', 'POSTED'],
      authority: '通过事实取消入口校验版本、操作者、原因和同意图回执。',
      condition:
        '逐类型核对来源和后续影响；成品入库检查关联包装／返工，返工检查已生成批次是否仍可取消，冲正还须满足库存约束。',
      blocked: '后续批次或返工已推进、相关事实未解除，或反向库存不足。',
      effect:
        '草稿取消不写反向库存；已过账追加反向影响，原事实和关联事件继续保留。',
      recovery: '先处理实际后续依赖；不能把已投入生产的返工批次强改为未开始。',
      sourceRefs: [`${DATA}operational_fact_production_repo.go`],
    },
  ],
  'fact.outsourcing': [
    {
      key: 'post',
      label: '委外发料或回货过账',
      states: ['DRAFT'],
      authority: '按委外事实入口校验权限、版本、来源和幂等回执。',
      condition:
        '来源委外订单、明细、工序、数量及在制分配一致；发料满足库存，回货按来源可回数量和批次约束办理。',
      blocked: '来源不允许继续、数量越界、在制分配不匹配或可用库存不足。',
      effect:
        '只产生本次发料／回货事实及对应库存、批次影响；回货不自动等于质检通过或应付已生成。',
      recovery: '修正源单、批次和数量条件再办理；已生效错误按取消与冲正处理。',
      sourceRefs: [`${DATA}operational_fact_outsourcing_repo.go`],
    },
    {
      key: 'cancel',
      label: '取消委外草稿或冲正',
      states: ['DRAFT', 'POSTED'],
      authority: '正式取消动作校验版本、原因及事实依赖。',
      condition:
        '发料冲回后仍满足已开始在制批次的分配；回货没有有效质检和应付；库存允许反向处理。',
      blocked:
        '取消发料会破坏已开始批次的用料，或回货仍被有效质检／应付引用，或库存不足冲回。',
      effect: '只对已过账部分追加反向库存，保留原发料／回货与供应商历史。',
      recovery:
        '先处理质检、财务和在制依赖，再按原事实冲正；不通过取消委外源单代替。',
      sourceRefs: [`${DATA}operational_fact_outsourcing_repo.go`],
    },
  ],
  'fact.finance': [
    {
      key: 'cancel',
      label: '取消财务草稿或已过账事实',
      states: ['DRAFT', 'POSTED'],
      authority: '财务取消动作校验权限、版本、原因和重复请求意图。',
      condition:
        '没有有效对账、核销和红冲依赖；已结清事实不能直接取消，须先由正式反向记录恢复可处理余额。',
      blocked: '仍有有效对账、核销或红冲；状态为已结清；版本或取消意图不一致。',
      effect: '保留原记录与取消依据，不删除核销流水，不把已结清直接改回草稿。',
      recovery:
        '按实际依赖先做冲正或反向红冲；余额恢复时由后端重新计算结清状态，再判断能否取消。',
      sourceRefs: [
        `${DATA}operational_fact_finance_repo.go`,
        `${DATA}operational_fact_finance_payment_repo.go`,
      ],
    },
  ],
  'fact.finance_payment': [
    {
      key: 'post',
      label: '收付款过账与核销',
      states: ['APPROVED'],
      authority: '通过收付款流程的领域命令过账；审批与实际记账分别留证。',
      condition:
        '已审批；普通收付款的核销合计等于金额，目标方向、往来单位、币种匹配且不超过未结余额；预收付／退款不带普通核销明细，另查现金来源。',
      blocked: '未审批、核销合计不符、超余额、目标不匹配或退款来源不满足条件。',
      effect: '追加不可变核销记录并更新余额；余额归零才结清相应财务事实。',
      recovery: '先修正核销或来源；已过账错误走冲正，不改写原核销记录。',
      sourceRefs: [
        `${DATA}operational_fact_finance_payment_repo.go`,
        `${BIZ}finance_payment.go`,
      ],
    },
    {
      key: 'reverse',
      label: '冲正收付款',
      states: ['POSTED'],
      authority: '通过冲正权限办理，提交当前版本和非空原因。',
      condition: '原收付款已过账，且没有草稿、已批准或已过账的关联退款。',
      blocked:
        '原单未过账、关联退款仍有效、版本过期或重试原因／操作者与原回执不符。',
      effect:
        '新增反向核销记录，原记录不变；恢复未结余额，必要时使已结清财务事实回到已过账，并记录领域影响已补偿。',
      recovery:
        '先处理关联退款，再冲正原收付款；正确业务重新按正式收付款流程办理。',
      sourceRefs: [
        `${DATA}operational_fact_finance_payment_repo.go`,
        `${BIZ}finance_payment.go`,
      ],
    },
  ],
  'source.production_exception_execution': [
    {
      key: 'execute',
      label: '执行已批准异常方案',
      states: ['PENDING'],
      authority: '通过异常处置流程的领域命令执行，复核仓库范围和当前版本。',
      condition:
        '生产单仍已发布，异常审批已通过且批准数量有效，执行状态待执行；报废、返工、重做、让步接收各自检查原批次与目标。超领批准只授予额度，不走此执行动作。',
      blocked:
        '生产单已结束、未批准、已执行、数量／版本不符、批次或目标不合格，或把超领当成普通执行。',
      effect:
        '按方案写批次、库存和执行回执；审批通过本身不能证明处置已经发生。',
      recovery:
        '先补齐具体条件再继续；需要纠正已执行结果时走异常撤销，保留原方案与批次关联。',
      sourceRefs: [
        `${DATA}production_exception_decision_repo.go`,
        `${DATA}production_exception_execution.go`,
      ],
    },
    {
      key: 'reverse',
      label: '撤销执行或收回未用超领额度',
      states: ['PENDING', 'APPLIED'],
      authority: '通过异常撤销权限办理，校验仓库范围、版本和原因。',
      condition:
        '生产单仍已发布且方案已批准；普通方案须已执行，超领须仍待执行且额度未使用；返工／重做新批次、让步接收及库存须满足对应反向条件。',
      blocked:
        '额度已使用、后续批次已推进、已有依赖事实、可冲回数量不足或生产单已结束。',
      effect:
        '记录已撤销及补偿证据；按类型恢复原批次状态或追加反向库存，保留原审批和执行历史。',
      recovery:
        '先处理可合法解除的后续依赖；不提供任意回退状态。需要新方案时按重新决策规则办理。',
      sourceRefs: [
        `${DATA}production_exception_decision_repo.go`,
        `${DATA}production_exception_execution.go`,
      ],
    },
  ],
}

const masterObjects = [
  [
    'material',
    '材料',
    PermissionCode.MATERIAL_DISABLE,
    '采购、BOM 和手工事实的新引用检查材料启用状态；原有单据引用与冻结快照保留。',
    [`${BIZ}purchase_order.go`, `${BIZ}inventory.go`],
  ],
  [
    'product',
    '产品',
    PermissionCode.PRODUCT_DISABLE,
    '销售、BOM、规格和手工事实的新引用检查产品启用状态；不级联停用已有规格或改写订单快照。',
    [`${BIZ}sales_order.go`, `${BIZ}inventory.go`],
  ],
  [
    'customer',
    '客户',
    PermissionCode.CUSTOMER_DISABLE,
    '销售订单和新建收款来源检查客户启用状态；历史销售、应收和联系人记录保留。',
    [`${BIZ}sales_order.go`, `${DATA}operational_fact_finance_payment_repo.go`],
  ],
  [
    'supplier',
    '供应商',
    PermissionCode.SUPPLIER_DISABLE,
    '采购、委外和新建付款来源检查供应商启用状态；历史采购、委外、应付和联系人记录保留。',
    [
      `${BIZ}purchase_order.go`,
      `${BIZ}outsourcing_order.go`,
      `${DATA}operational_fact_finance_payment_repo.go`,
    ],
  ],
]

export const DEV_FLOW_MASTER_LIFECYCLE_RULES = Object.freeze(
  [
    ...masterObjects.map(([key, label, permission, effect, refs]) => ({
      key,
      label,
      field: 'is_active',
      states: [true, false],
      action: `set_${key}_active`,
      permission: [permission],
      condition:
        '对象存在，具备该对象启停权限且对应模块允许写入；启用与停用使用同一专属动作。',
      blocked:
        '无权限、模块不可写或对象不存在。启停动作本身不以“已有历史引用”作为统一禁止条件。',
      effect,
      recovery:
        '通过同一动作重新启用。历史纠正按所属单据／事实规则办理，不自动作废旧单、不删除引用。',
      sourceRefs: [
        `server/internal/data/model/schema/${key}.go`,
        `${SERVICE}jsonrpc_masterdata_${key}.go`,
        `${BIZ}masterdata.go`,
        `${DATA}masterdata_repo.go`,
        ...refs,
      ],
    })),
    {
      key: 'warehouse',
      label: '仓库',
      field: 'is_active',
      states: [true, false],
      action: 'update_warehouse',
      permission: [PermissionCode.WAREHOUSE_MANAGE],
      condition:
        '通过仓库编辑保存启停值；具备仓库管理权限且仓库在可管理数据范围内，编号、名称、类型有效。',
      blocked:
        '停用时仍有正数库存或材料默认仓引用；同时修改类型还须兼容已有库存类别。越权或编号冲突也会阻断保存。',
      effect:
        '停用后不再作为新的可用仓库引用；已有库存流水、历史凭证和仓库身份保留。',
      recovery:
        '先通过正式业务动作处理库存并调整材料默认仓，再停用；重新启用仍由仓库编辑保存，保留原身份。',
      sourceRefs: [
        'server/internal/data/model/schema/warehouse.go',
        `${SERVICE}jsonrpc_warehouse_masterdata.go`,
        `${BIZ}warehouse_classification.go`,
        `${DATA}warehouse_classification_repo.go`,
      ],
    },
  ].map((rule) =>
    Object.freeze({
      ...rule,
      states: Object.freeze(rule.states),
      permission: Object.freeze(rule.permission),
      sourceRefs: Object.freeze(rule.sourceRefs),
    })
  )
)

export function getDevFlowActionRules(flow) {
  const keys = new Set()
  return Object.freeze(
    (DEV_FLOW_ACTION_RULES[flow.key] || []).map((rule) => {
      for (const key of [
        'key',
        'label',
        'authority',
        'condition',
        'blocked',
        'effect',
        'recovery',
      ]) {
        if (!rule[key]?.trim()) {
          throw new Error(`${flow.key} action rule missing ${key}`)
        }
      }
      if (
        !rule.states.length ||
        rule.states.some(
          (key) => !flow.states.some((state) => state.key === key)
        )
      ) {
        throw new Error(
          `${flow.key}.${rule.key} action rule references unknown states`
        )
      }
      if (keys.has(rule.key) || !rule.sourceRefs?.length) {
        throw new Error(
          `${flow.key}.${rule.key} has duplicate or untraceable action rules`
        )
      }
      keys.add(rule.key)
      return Object.freeze({
        ...rule,
        states: Object.freeze([...rule.states]),
        permission: Object.freeze([...(rule.permission || [])]),
        sourceRefs: Object.freeze([...rule.sourceRefs]),
      })
    })
  )
}
