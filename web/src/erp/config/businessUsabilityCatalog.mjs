import {
  businessModuleDefinitions,
  getBusinessModule,
} from './businessModules.mjs'
import { getBusinessPageLineage } from './businessPageLineage.mjs'
import { ROLE_HELP_GUIDES } from './roleHelpContent.mjs'

export const BUSINESS_HELP_TYPES = Object.freeze({
  TERM: 'term',
  FORMULA: 'formula',
  SOURCE: 'source',
  FLOW: 'flow',
  DISABLED: 'disabled',
})

export const BUSINESS_HELP_TYPE_PRESENTATION = Object.freeze({
  [BUSINESS_HELP_TYPES.TERM]: Object.freeze({
    label: '名词解释',
    shortLabel: '名词',
  }),
  [BUSINESS_HELP_TYPES.FORMULA]: Object.freeze({
    label: '怎么算',
    shortLabel: '公式',
  }),
  [BUSINESS_HELP_TYPES.SOURCE]: Object.freeze({
    label: '从哪里来',
    shortLabel: '来源',
  }),
  [BUSINESS_HELP_TYPES.FLOW]: Object.freeze({
    label: '办理流程',
    shortLabel: '流程',
  }),
  [BUSINESS_HELP_TYPES.DISABLED]: Object.freeze({
    label: '为什么不能操作',
    shortLabel: '禁用原因',
  }),
})

export const BUSINESS_USABILITY_STATUS = Object.freeze({
  COVERED: 'covered',
  PARTIAL: 'partial',
  MISSING: 'missing',
})

export const BUSINESS_USABILITY_STATUS_PRESENTATION = Object.freeze({
  [BUSINESS_USABILITY_STATUS.COVERED]: Object.freeze({
    label: '已覆盖',
    description: '页面已接入统一说明，当前必需的解释类型齐全。',
  }),
  [BUSINESS_USABILITY_STATUS.PARTIAL]: Object.freeze({
    label: '部分覆盖',
    description: '页面已有任务或边界文案，但还没有统一的页内解释。',
  }),
  [BUSINESS_USABILITY_STATUS.MISSING]: Object.freeze({
    label: '缺失',
    description: '当前没有可复用的页面说明。',
  }),
})

function helpItem(type, key, title, explanation, options = {}) {
  return Object.freeze({
    type,
    key,
    title,
    explanation,
    source: options.source || '',
    example: options.example || '',
    effect: options.effect || '',
    updateRule: options.updateRule || '',
  })
}

function guide(definition) {
  return Object.freeze({
    ...definition,
    requiredHelpTypes: Object.freeze([...definition.requiredHelpTypes]),
    flowSteps: Object.freeze([...definition.flowSteps]),
    items: Object.freeze([...definition.items]),
  })
}

const GUIDE_BY_PAGE_KEY = Object.freeze({
  'sales-orders': guide({
    completion:
      '订单号、客户、产品、数量、价格和提交状态都能查到；需要审批的事项已经生成。只有显示“已生效”的订单，才可以继续按已批准订单办理。',
    handoff:
      '已生效订单交给 PMC、工程和生产继续准备；实际出货、应收、发票和收款仍分别到对应页面办理。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.FORMULA,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '销售核对客户、产品、数量、价格和交期后保存订单。',
      '提交订单并等待审批；被退回时按原因修正后重新提交。',
      '订单显示“已生效”后，PMC、工程和生产再继续准备。',
      '仓库确认实际出货后，财务再办理应收、发票和收款。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'active-order',
        '什么是“已生效订单”',
        '表示订单已经走完当前审批，可以作为后续排产、预留和出货的正式来源；“已提交”只表示正在等待处理。',
        {
          example:
            '订单提交后仍显示“已提交”，不能当作已批准；状态变为“已生效”后才能继续交接。',
          effect: '不会因为任务显示完成就自动出货、扣库存或生成应收。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.FORMULA,
        'line-amount',
        '订单金额怎么算',
        '每行金额按“订购数量 × 单价”自动计算，金额合计是所有明细行金额相加。',
        {
          source: '销售订单每一行的订购数量和单价。',
          example: '100 件 × 单价 12.50（当前币种）= 1,250.00（当前币种）。',
          effect: '切换产品、单位或修改数量后，要重新核对这一行金额。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'customer-product-source',
        '客户和产品从哪里来',
        '客户来自客户档案，产品和规格来自产品档案；选择后系统带入可用资料，订单保存后以当前订单记录为准。',
        {
          updateRule:
            '切换客户、产品或规格时必须重新核对旧值；档案以后变化不会被当作订单已经重新确认。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'sales-order-action-disabled',
        '为什么按钮不能操作',
        '先选择一张订单，再核对订单状态、当前账号权限和是否仍有其他操作正在进行；被退回或已经关闭的订单只能走当前允许的处理。'
      ),
    ],
  }),
  'material-bom': guide({
    completion:
      '产品、版本号、材料、单件用量、损耗率和版本状态都能查到；需要用于新生产订单时，必须明确哪一个版本已经生效。',
    handoff:
      '生效版本交给 PMC 和生产作为新生产订单的工程资料；采购和库存仍按真实需求及业务单据办理。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.FORMULA,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '工程先选择产品，建立物料清单版本并维护材料明细。',
      '核对每种材料的单位、单件用量和损耗率。',
      '确认无误后激活正确版本；同一产品只保留一个当前生效版本。',
      '新生产订单发布时读取并冻结当时的工程资料，后续变更不偷偷改写旧订单。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'active-bom-version',
        '什么是“当前生效版本”',
        '表示新生产订单应采用的当前工程版本；草稿用于编辑，归档版本只供历史追溯。',
        {
          effect:
            '激活新版本不会自动改写已经发布的生产订单，也不会直接生成采购或库存记录。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.FORMULA,
        'loss-rate',
        '损耗率怎么理解',
        '损耗率表示在净用量之外需要考虑的额外比例；页面维护的是工程参数，实际生产需求以生产订单发布时冻结的结果为准。',
        {
          source: '物料清单明细中的单件用量和损耗率。',
          example: '净用量 100，损耗率 5%，可理解为额外考虑 5。',
          effect: '这里只解释参数，不会因此自动建立采购订单或改变库存。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'bom-master-data-source',
        '产品、材料和单位从哪里来',
        '产品和规格来自产品档案，材料来自材料档案，单位来自单位资料。',
        {
          updateRule:
            '切换产品或材料时要清理并重新核对旧明细；已经发布订单使用自己的冻结快照。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'bom-action-disabled',
        '为什么不能编辑或激活',
        '先选择一个版本，再核对版本状态和当前账号权限；已归档版本不能继续当作当前工程资料修改。'
      ),
    ],
  }),
  'accessories-purchase': guide({
    completion:
      '采购单号、供应商、材料、数量、单价、预计到货日期和状态都能查到；审批通过只代表采购承诺成立，不代表已经到货。',
    handoff:
      '审批通过的采购订单交给采购继续跟催；实际到料后从订单生成入库草稿，再交品质和仓库办理。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.FORMULA,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '采购核对供应商、材料、单位、数量、价格和预计到货日期。',
      '保存并提交采购订单，等待审批；被退回时按原因修改。',
      '订单审批通过后跟催到货，并从订单生成入库草稿。',
      '品质和仓库完成检验、实收与过账后，库存和应付才分别形成。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'purchase-commitment',
        '采购订单为什么不是入库单',
        '采购订单记录向供应商采购什么、多少和何时到货；只有仓库确认入库过账后，库存才会变化。',
        {
          effect: '订单审批、任务完成或供应商口头确认都不会自动增加库存。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.FORMULA,
        'purchase-line-amount',
        '采购金额怎么算',
        '每行金额按“采购数量 × 单价”自动计算，不允许用手填的不同金额覆盖计算结果。',
        {
          source: '采购订单每一行的采购数量、单价和已填写金额。',
          example: '200 个 × 单价 3.50（当前币种）= 700.00（当前币种）。',
          effect: '金额合计是所有采购明细金额相加。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'supplier-material-source',
        '供应商和材料从哪里来',
        '供应商来自供应商与加工厂档案，材料和默认单位来自材料档案。',
        {
          updateRule:
            '切换供应商或材料时重新核对联系人、单位、价格和交期，不能沿用不匹配的旧值。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'purchase-action-disabled',
        '为什么不能提交、审核或生成入库草稿',
        '先选择采购订单，再核对当前状态、必填明细、剩余可收数量和账号权限；已经关闭、取消或没有剩余数量时不能继续生成。'
      ),
    ],
  }),
  inbound: guide({
    completion:
      '入库来源、实收数量、检验要求、仓库、批次和状态都能查到；只有显示“已过账”时才表示本次入库已经写入库存。',
    handoff:
      '需要检验的先交品质判定；合格或允许接收后由仓库确认过账，过账结果再供库存和财务查询。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '从已审核采购订单生成入库草稿，核对来源行和剩余可收数量。',
      '仓库登记实收、仓库和批次；需要检验时先进入待质检。',
      '品质给出合格、让步接收或不合格结论。',
      '仓库确认过账后库存才增加；差异通过退货或调整继续追溯。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'receipt-status',
        '待收货、待质检和已过账有什么区别',
        '待收货表示正在核对实物，待质检表示等待质量结论，已过账才表示库存已经正式增加。',
        {
          effect: '任务完成或入库草稿保存都不等于库存已经增加。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'receipt-source',
        '入库明细从哪里来',
        '正式入库草稿来自已审核采购订单及其明细，供应商、材料和订单数量由来源带入。',
        {
          updateRule:
            '页面不允许脱离采购来源随意补造明细；实收差异要保留来源并按退货或调整办理。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'receipt-action-disabled',
        '为什么不能确认入库',
        '先核对是否完成收货、必需质检是否已有允许接收的结论、仓库和批次是否完整，以及当前记录是否仍可过账。'
      ),
    ],
  }),
  'quality-inspections': guide({
    completion:
      '检验来源、送检批次、当前关口、判定、估算不良比例和原因都能查到；下游岗位已经能看到本次结论。',
    handoff:
      '合格或让步接收交回来源岗位继续办理；不合格时停止放行，并交采购、生产、委外或仓库按来源处理。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.FORMULA,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '从采购入库、委外回货、生产在制批次或出货单发起检验。',
      '品质核对来源、批次、当前检验关口和现场结果。',
      '提交合格、让步接收或不合格，并填写估算不良比例和必要说明。',
      '来源岗位根据判定继续入库、返工、退厂、补换或出货。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'concession-acceptance',
        '什么是“让步接收”',
        '表示虽然存在已知偏差，但经明确判断允许本次来源继续办理；它不是“完全合格”，原因必须保留。',
        {
          effect: '让步接收只影响当前检验来源，不会自动完成入库、生产或出货。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.FORMULA,
        'defect-rate',
        '估算不良比例怎么理解',
        '这是检验人员对当前来源记录填写的估算比例，不由系统根据数量自动推算，也不会自动换算退货或返工数量。',
        {
          source: '当前检验结果和现场判断。',
          example: '填写约 5%，表示大约每 100 件有 5 件异常。',
          effect: '实际退货、返工或隔离数量仍由对应来源业务单独确认。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'inspection-source',
        '检验来源从哪里来',
        '检验必须从采购入库、委外回货、生产在制批次或出货单等明确来源发起。',
        {
          updateRule:
            '每张质检单只代表当前来源和当前关口，不能把一次判定当作其他批次或其他关口也已完成。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'inspection-action-disabled',
        '为什么不能提交判定',
        '先选择质检单，确认当前状态允许判定，并补齐判定、估算不良比例和必需说明；已经终结或取消的记录不能再次判定。'
      ),
    ],
  }),
  inventory: guide({
    completion:
      '材料或产品、规格、仓库、单位、批次、账面数量、已预留、可用量和来源变动都能查到；库存作业只有过账后才改变库存。',
    handoff:
      '查询结果用于采购、PMC、生产、仓库和销售判断；差异必须从来源单据或受控库存作业继续办理。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.FORMULA,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '先按材料或产品、规格、仓库、单位和批次定位真实库存余额。',
      '核对账面数量、已预留和可用量，再追溯对应变动记录。',
      '盘点、调拨或人工调整必须从选中的真实余额建立草稿。',
      '草稿经过必要审批并过账后才改变库存；取消时保留反向记录。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'inventory-balance-reservation',
        '账面数量、已预留和可用量',
        '账面数量是已经过账的库存；已预留是为销售订单保留但尚未出货的数量；可用量是当前还能继续使用的数量。',
        {
          effect: '释放预留不会增加账面库存，确认出货才会形成库存出库。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.FORMULA,
        'available-quantity',
        '可用量怎么算',
        '可用量 = 账面数量 − 当前有效预留数量。',
        {
          source: '后端库存余额和有效销售预留。',
          example: '账面 100，已预留 30，可用量是 70。',
          effect: '可用量不足时不能继续预留或出货，不能靠前端修改显示值绕过。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'inventory-source',
        '库存数量从哪里来',
        '库存来自已经过账的采购入库、生产完工入库、委外发料或回货、正式出货以及受控库存调整。',
        {
          updateRule:
            '任务完成、业务草稿或审批通过本身不会直接改变库存；必须核对对应业务记录是否已经过账。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'inventory-action-disabled',
        '为什么不能盘点、调拨或调整',
        '先选择一条精确库存余额，并核对仓库、单位、批次、数量、当前作业状态和账号权限；没有明确余额来源时不能建立作业。'
      ),
    ],
  }),
  'processing-contracts': guide({
    completion:
      '加工合同号、加工厂、产品、工序、数量、单价、金额和状态都能查到；确认合同只表示约定成立，发料和回货仍需分别办理。',
    handoff:
      '确认合同交生产或委外经办人办理发料和回货；回货后交品质检验，合格或让步接收后再交仓库和财务。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.FORMULA,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '核对加工厂、产品、工序、数量、价格和交期后保存加工合同。',
      '提交并确认合同；确认只表示双方约定成立。',
      '从已确认合同行分别登记委外发料和回货草稿，并确认真实数量。',
      '回货需要检验时先交品质，合格或让步后再形成库存和应付来源。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'confirmed-outsourcing-contract',
        '合同确认为什么不等于已经发料或回货',
        '合同确认只表示加工约定已经确认；实物发出、实物回厂、质量结论和应付都必须在各自业务记录中办理。',
        {
          effect: '不能把合同状态当作库存、质检或财务结果。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.FORMULA,
        'outsourcing-line-amount',
        '加工金额怎么算',
        '默认金额按“委托加工数量 × 单价”计算，金额合计是所有明细金额相加。',
        {
          source: '加工合同每一行的加工数量和单价。',
          example: '500 件 × 单价 1.20（当前币种）= 600.00（当前币种）。',
          effect:
            '打印内容允许按已确认合同金额核对，但不能改变已经保存的业务事实。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'outsourcing-master-data-source',
        '加工厂、产品和工序从哪里来',
        '加工厂来自供应商与加工厂档案，产品来自产品档案，工序来自加工环节。',
        {
          updateRule:
            '切换加工厂、产品或工序时要重新核对旧数量、价格和交期，不能保留不匹配的旧值。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'outsourcing-action-disabled',
        '为什么不能确认、发料或回货',
        '先选择合同并核对当前状态、明细剩余数量、必填来源和账号权限；未确认、已关闭或没有剩余数量的合同不能继续办理。'
      ),
    ],
  }),
  'production-orders': guide({
    completion:
      '生产订单号、产品与规格、计划数量、冻结物料需求、固定工序路线、当前状态和交接记录都能查到。',
    handoff:
      '发布后交 PMC 排程和生产执行；缺料交采购，质量关口交品质，完工报告交仓库核对实收并确认入库。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '从销售来源、产品和当前生效物料清单准备生产订单。',
      '发布时冻结产品、物料需求和固定工序路线，并生成 PMC 排程待办。',
      '生产按在制批次推进布料加工、车缝、手工、包装及必要质检。',
      '生产提交完工报告，仓库核对实收并确认入库后，库存才增加。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'production-wip',
        '什么是在制品（WIP）',
        '表示已经投入生产、但还没有完成并入库的数量；它会在工序之间流转，不能当成成品库存。',
        {
          effect: '工序完成或任务完成都不等于成品已经入库。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'production-order-source',
        '产品、物料需求和工序从哪里来',
        '产品和规格来自产品档案，物料需求来自发布时采用的生效物料清单，工序路线在发布时冻结。',
        {
          updateRule:
            '物料清单以后变化不会偷偷改写已发布订单；需要变更时必须按当前业务规则重新处理。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'production-order-action-disabled',
        '为什么不能发布或继续推进',
        '先选择生产订单，核对产品、规格、数量、物料需求、工序路线、当前状态和账号权限；资料不完整时不能发布。'
      ),
    ],
  }),
  shipments: guide({
    completion:
      '出货单号、客户、销售来源、产品与规格、仓库、批次、数量、质检和财务放行状态都能查到；只有“已出货”才表示实际出货和库存扣减完成。',
    handoff:
      '需要检验时先交品质，随后交财务放行，最后由仓库确认实际出货；已出货结果再交销售和财务办理应收及开票。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '从销售订单准备出货草稿，核对客户、产品、规格、仓库、批次和数量。',
      '需要出货前检验时由品质完成合格或让步接收判定。',
      '启动财务放行并等待当前出货单版本审批通过。',
      '仓库确认实际出货后才扣减库存，再由财务生成应收或发票记录。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'release-vs-shipped',
        '“财务放行”和“已出货”有什么区别',
        '财务放行表示这张出货单可以继续发货；已出货表示仓库已经确认实物发出并记录库存出库。',
        {
          effect: '审批通过或任务完成都不等于已经出货。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'shipment-source',
        '客户、产品和可出货数量从哪里来',
        '客户、产品和销售来源来自销售订单；仓库、批次、库存和预留来自当前库存记录。',
        {
          updateRule:
            '切换销售来源、产品、仓库或批次时必须重新核对数量，不能沿用不匹配的旧值。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'shipment-action-disabled',
        '为什么不能启动放行或确认出货',
        '先选择出货单，核对明细、库存、预留、必要质检、财务放行、当前版本和账号权限；任一条件不满足都不能继续。'
      ),
    ],
  }),
  'finance-payments': guide({
    completion:
      '收付款单号、方向、往来方、币种、金额、核销明细和状态都能查到；只有过账后才真正减少对应应收或应付的未核销金额。',
    handoff:
      '过账结果交财务继续对账；发现业务来源、往来方、币种或金额不一致时，停止核销并退回对应来源岗位核对。',
    requiredHelpTypes: [
      BUSINESS_HELP_TYPES.TERM,
      BUSINESS_HELP_TYPES.FORMULA,
      BUSINESS_HELP_TYPES.SOURCE,
      BUSINESS_HELP_TYPES.FLOW,
      BUSINESS_HELP_TYPES.DISABLED,
    ],
    flowSteps: [
      '选择收款或付款方向，填写真实往来方、币种、金额和日期。',
      '系统只列出同一往来方、同一币种且仍有未核销金额的应收或应付。',
      '填写每一笔核销金额并核对合计，提交后再按当前流程审批或过账。',
      '需要纠正时使用冲销或红冲保留反向审计，不删除原记录。',
    ],
    items: [
      helpItem(
        BUSINESS_HELP_TYPES.TERM,
        'allocation-reversal',
        '核销、冲销和红冲分别是什么',
        '核销是把真实收付款分配到应收或应付；冲销是撤回已过账收付款的影响；红冲是用独立反向记录调整应收或应付。',
        {
          effect: '三种操作都会保留原记录和审计，不提供物理删除。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.FORMULA,
        'allocation-amount',
        '核销金额怎么核对',
        '每笔核销金额不能超过该应收或应付当前未核销金额，全部核销金额合计不能超过本次收付款金额。',
        {
          source: '本次收付款金额和候选应收或应付的当前未核销金额。',
          example:
            '收款 1,000（当前币种），可以核销两张应收 600 和 400；不能合计核销 1,100。',
          effect: '部分核销后，剩余未核销金额继续保留。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.SOURCE,
        'payment-source',
        '可核销单据从哪里来',
        '收款只匹配同一客户、同一币种的已过账应收；付款只匹配同一供应商或加工厂、同一币种的已过账应付。',
        {
          updateRule:
            '切换方向、往来方或币种时，原核销选择必须清空并重新选择，不能保留旧分配。',
        }
      ),
      helpItem(
        BUSINESS_HELP_TYPES.DISABLED,
        'payment-action-disabled',
        '为什么不能提交、过账或冲销',
        '先选择记录，核对方向、往来方、币种、金额、核销合计、当前状态和账号权限；已经冲销或没有可核销余额时不能重复办理。'
      ),
    ],
  }),
})

function roleHelpKeysForPath(path = '') {
  return ROLE_HELP_GUIDES.filter(
    (guideItem) =>
      guideItem.key !== 'admin' &&
      guideItem.priorities.some((priority) => priority.path === path)
  ).map((guideItem) => guideItem.key)
}

function pageLabels(pageKeys = []) {
  return pageKeys
    .map((pageKey) => getBusinessModule(pageKey)?.label || '')
    .filter(Boolean)
}

function buildCoverageStatus(moduleItem, pageGuide) {
  if (!moduleItem?.description && !moduleItem?.boundary) {
    return BUSINESS_USABILITY_STATUS.MISSING
  }
  if (!pageGuide) return BUSINESS_USABILITY_STATUS.PARTIAL

  const coveredTypes = new Set(pageGuide.items.map((item) => item.type))
  if (pageGuide.flowSteps.length >= 2) {
    coveredTypes.add(BUSINESS_HELP_TYPES.FLOW)
  }
  if (
    pageGuide.requiredHelpTypes.every((type) => coveredTypes.has(type)) &&
    pageGuide.completion &&
    pageGuide.handoff
  ) {
    return BUSINESS_USABILITY_STATUS.COVERED
  }
  return BUSINESS_USABILITY_STATUS.PARTIAL
}

export const BUSINESS_USABILITY_CATALOG = Object.freeze(
  businessModuleDefinitions.map((moduleItem) => {
    const pageGuide = GUIDE_BY_PAGE_KEY[moduleItem.key] || null
    const businessModule = getBusinessModule(moduleItem.key)
    const lineage = getBusinessPageLineage(moduleItem.key)
    const helpTypeKeys = pageGuide
      ? [
          ...new Set([
            ...pageGuide.items.map((item) => item.type),
            ...(pageGuide.flowSteps.length >= 2
              ? [BUSINESS_HELP_TYPES.FLOW]
              : []),
          ]),
        ]
      : []

    return Object.freeze({
      key: moduleItem.key,
      sectionKey: moduleItem.sectionKey,
      sectionTitle: businessModule?.sectionTitle || '',
      title: moduleItem.title,
      path: moduleItem.path,
      task: moduleItem.description || '',
      boundary: moduleItem.boundary || '',
      completion: pageGuide?.completion || '',
      handoff: pageGuide?.handoff || '',
      flowSteps: pageGuide?.flowSteps || Object.freeze([]),
      items: pageGuide?.items || Object.freeze([]),
      requiredHelpTypes: pageGuide?.requiredHelpTypes || Object.freeze([]),
      helpTypeKeys: Object.freeze(helpTypeKeys),
      upstreamLabels: Object.freeze(
        pageLabels(lineage?.upstreamPageKeys || [])
      ),
      downstreamLabels: Object.freeze(
        pageLabels(lineage?.downstreamPageKeys || [])
      ),
      roleHelpKeys: Object.freeze(roleHelpKeysForPath(moduleItem.path)),
      status: buildCoverageStatus(moduleItem, pageGuide),
      hasPageHelp: Boolean(pageGuide),
    })
  })
)

const BUSINESS_USABILITY_BY_KEY = new Map(
  BUSINESS_USABILITY_CATALOG.map((entry) => [entry.key, entry])
)

export function getBusinessUsabilityEntry(pageKey = '') {
  return BUSINESS_USABILITY_BY_KEY.get(String(pageKey || '').trim()) || null
}

export function getBusinessHelpItem(pageKey = '', itemKey = '') {
  const entry = getBusinessUsabilityEntry(pageKey)
  if (!entry) return null
  return (
    entry.items.find((item) => item.key === String(itemKey || '').trim()) ||
    null
  )
}

export function getBusinessUsabilityTargetPageKeys() {
  return Object.keys(GUIDE_BY_PAGE_KEY)
}
