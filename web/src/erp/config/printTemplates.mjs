import {
  createProcessingContractDraft,
  processingContractTemplateMeta,
} from '../data/processingContractTemplate.mjs'
import {
  COLOR_CARD_TEMPLATE_KEY,
  DEFAULT_COLOR_CARD_SAMPLE,
  DEFAULT_MATERIAL_DETAIL_SAMPLE,
  DEFAULT_WORK_INSTRUCTION_SAMPLE,
  MATERIAL_DETAIL_TEMPLATE_KEY,
  WORK_INSTRUCTION_TEMPLATE_KEY,
  createColorCardDraft,
  createMaterialDetailDraft,
  createWorkInstructionDraft,
} from '../data/engineeringPrintTemplates.mjs'

export const PRINT_TEMPLATE_FACT_BOUNDARY = 'read_snapshot_only'

export const printTemplateCatalog = [
  {
    key: 'material-purchase-contract',
    title: '采购合同',
    shortTitle: '采购合同',
    category: '采购订单 / 材料采购',
    readiness: 'source_grounded',
    runtimeStatus: 'official_template',
    factBoundary: PRINT_TEMPLATE_FACT_BOUNDARY,
    moduleKeys: ['purchase_orders'],
    summary:
      '基于“模板-材料与加工合同.xlsx”的 `C类辅料合同` 工作表，收口采购合同的固定版式、材料明细和条款区。',
    scene: '材料采购下单、供应商确认、财务留档',
    layout:
      'A4 竖版合同，包含双栏头信息、采购明细表、来货要求、合同约定、结算方式和签字区。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '这张模板适合采购发起材料采购下单、供应商确认和财务留档；辅料、包材等都来自材料主数据。',
      '当前已支持可编辑打印工作台、独立 PDF 预览窗口 / 下载 PDF / 浏览器打印；还未开始后端 PDF 坐标回填和 Excel 母版回写。',
      '当前纸面已按实拍样本收口为“只有中间采购明细区是表格”，合同头、条款和签字区都保持普通排版。',
      '采购金额默认按数量 × 单价带值，但工作台允许按合同快照手工改写金额列；编辑区会显示人民币前缀，实际快照仍保存纯数字金额。',
      '工作台上插 / 下插明细行时会新增真正空白行，不再复制当前行的订单号、产品号、单位或其他字段。',
      '签字区默认按纸质合同留给手写签名，不带电子印章。',
    ],
    tags: ['固定版式', '采购合同', 'PDF / 打印', '纸质签字'],
    previewLines: ['普通合同头', '采购明细 / 合计', '条款 / 手写签字'],
    sourceFiles: [
      '客户来源样本：模板-材料与加工合同.xlsx（C类辅料合同 / 原辅料采购汇总表 / 材料厂商编号）',
      '客户来源样本：采购合同纸面照片',
    ],
    fieldTruth: [
      '采购订单号、产品订单编号、产品编号、产品名称来自采购订单或合同快照。',
      '供应商名称、联系人、联系电话、供应商地址来自材料厂商编号 sheet，是 partner 快照，不是当前页面手填自由文本。',
      '采购数量、单价、采购金额是合同快照；金额默认按数量 × 单价带值，也允许按合同快照手工改写，编辑时显示人民币前缀但底层仍按纯数字快照保存，后续都不能反写已经打印的合同。',
      '备注保留包装说明和工艺说明，不并入材料主档。',
    ],
    fieldRequirements: [
      {
        key: 'purchase_header_snapshot',
        label: '采购合同头',
        source: '采购订单或合同快照',
        boundary: '业务带值必须显式生成草稿；打印中心样例不能兜底真实业务缺值',
      },
      {
        key: 'supplier_snapshot',
        label: '供应商快照',
        source: '供应商主数据 / 材料厂商编号来源样本',
        boundary: '只读快照；打印编辑不反写供应商主数据',
      },
      {
        key: 'purchase_line_snapshots',
        label: '采购明细快照',
        source: '采购订单明细或合同明细草稿',
        boundary: '数量、单价、金额和备注随合同草稿冻结，不自动生成采购事实',
      },
      {
        key: 'contract_clauses',
        label: '合同条款与签字区',
        source: '正式模板正文',
        boundary: '纸面文本可编辑，但不代表审批、签收或财务事实',
      },
    ],
    helpNotes: [
      '这张模板适合采购发起材料采购下单、供应商确认和财务留档；辅料、包材等都来自材料主数据。',
      '当前已支持可编辑打印工作台、独立 PDF 预览窗口 / 下载 PDF / 浏览器打印；还未开始后端 PDF 坐标回填和 Excel 母版回写。',
      '当前纸面已按实拍样本收口为“只有中间采购明细区是表格”，合同头、条款和签字区都保持普通排版。',
      '采购金额默认按数量 × 单价带值，但工作台允许按合同快照手工改写金额列；编辑区会显示人民币前缀，实际快照仍保存纯数字金额。',
      '签字区默认按纸质合同留给手写签名，不带电子印章。',
    ],
    sample: {
      contractNo: 'A26022832',
      orderDateText: '260228',
      returnDateText: '3月1日',
      supplierName: '示例供应商',
      supplierContact: '供应商联系人',
      supplierPhone: '供应商联系电话',
      supplierAddress: '供应商地址',
      buyerCompany: '本公司',
      buyerContact: '采购负责人',
      buyerPhone: '公司联系电话',
      buyerAddress: '公司地址',
      buyerSigner: '签字人',
      supplierSigner: '供应商签字人',
      signDateText: '2026/2/28',
      supplierSignDateText: '2026/2/28',
      lines: [
        {
          contractNo: 'A26022832',
          productOrderNo: 'XM260202',
          productNo: '23145-1',
          productName: '双熊猫发箍-\n续然',
          materialName: '黑色发箍头胶套',
          vendorCode: 'GY-001',
          spec: '12mm',
          unit: 'PCS',
          unitPrice: '0.12',
          quantity: '4000',
          amount: '480.00',
          remark: '示例包装说明',
        },
        {
          contractNo: 'A26022832',
          productOrderNo: 'XM260202',
          productNo: '23145-1',
          productName: '双熊猫发箍-\n续然',
          materialName: '黑色铁发箍包黑\n色丁布',
          vendorCode: 'GY-002',
          spec: '0.04*18*18+2.5CM',
          unit: 'PCS',
          unitPrice: '0.18',
          quantity: '2000',
          amount: '360.00',
          remark: '示例工艺说明',
        },
      ],
      clauses: {
        delivery: [
          '按订单明细分别打包，并标明产品编号。',
          '请严格按定单数量发货，尺码必须足量。如有尾货或存货不足时，及时与我司采购沟通确认。否则我司将拒绝收货。',
          '必须保证商品品质，保证商品的颜色、克重与样品一致。',
        ],
        contract: [
          '在订单约定日期前交货。如因货期延误影响上货计划，每延误一天按 100 元 / 款处罚，直接从货款扣除。',
          '如因特殊原因不能按期交货，须提前与我司采购沟通确认，经同意后方可延期，否则订单作废或按约收取违约金。',
          '因乙方产品质量问题造成经济纠纷，或者延误交期造成的损失均由乙方负责。',
        ],
        settlement: [
          '按我仓库确认收到货物日期，次月开始对账，每月 15 号之前完成对账。',
          '对完账后，次月支付货款，供货方开具等额增值税专用发票。',
        ],
      },
      buyerStampVisible: false,
    },
  },
  {
    ...processingContractTemplateMeta,
    sample: createProcessingContractDraft(),
  },
  {
    key: MATERIAL_DETAIL_TEMPLATE_KEY,
    title: '物料分析明细表',
    shortTitle: '物料明细',
    category: '工程资料 / 板房发料',
    readiness: 'source_grounded',
    runtimeStatus: 'official_template',
    factBoundary: PRINT_TEMPLATE_FACT_BOUNDARY,
    moduleKeys: ['material_bom'],
    summary:
      '基于 yoyoosun 原始 Excel 的 `材料分析明细表-1` 工作表，收口板房工程部给仓库发料核对的材料明细打印模板。',
    scene: '板房工程部整理物料明细，打印给仓库按物料、部位和工艺方式发料。',
    layout:
      'A4 竖版明细表，包含产品头信息、右上产品图、材料明细、审核制表和页底产品图槽。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '物料明细是工程资料打印快照，不写采购、库存、生产或财务事实。',
      '右上角和页底图片槽只进入当前打印草稿和输出，不替代业务附件归档。',
      '从 BOM 管理选中版本带值打开时，只带当前产品、版本和 BOM 明细快照；缺失字段保持空白。',
    ],
    tags: ['工程资料', '物料明细', '图片槽', 'PDF / 打印'],
    previewLines: ['产品头信息', '材料明细 / 用量', '右上与页底图片槽'],
    sourceFiles: [
      '客户来源样本：docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx（材料分析明细表-1）',
    ],
    fieldTruth: [
      '产品编号、产品名称、BOM 版本和材料明细优先来自 BOM 版本及其明细快照。',
      '单位用量、损耗率、部位、备注来自 BOM 明细或当前打印草稿，不反写 BOM。',
      '图片槽来自当前打印窗口上传的图片快照，不作为业务附件事实。',
    ],
    fieldRequirements: [
      {
        key: 'bom_header_snapshot',
        label: 'BOM / 产品头快照',
        source: 'BOM 版本、产品主数据或打印草稿',
        boundary: '只读打印快照；打印中心样例不能兜底真实业务缺值',
      },
      {
        key: 'material_detail_snapshots',
        label: '材料明细快照',
        source: 'BOM 明细或打印草稿行',
        boundary: '发料核对用，不生成采购需求、库存事实或成本',
      },
      {
        key: 'print_image_slots',
        label: '右上和页底图片槽',
        source: '当前打印窗口上传的图片快照',
        boundary: '随当前 PDF / 打印输出冻结，不替代正式附件归档事实',
      },
    ],
    helpNotes: [
      '色卡和物料明细均服务板房工程部，打印后给仓库发料核对。',
      'BOM 页面带值只使用已有产品和材料明细，不把 Excel 样张字段新增为数据库字段。',
    ],
    sample: createMaterialDetailDraft(DEFAULT_MATERIAL_DETAIL_SAMPLE),
  },
  {
    key: COLOR_CARD_TEMPLATE_KEY,
    title: '色卡',
    shortTitle: '色卡',
    category: '工程资料 / 板房发料',
    readiness: 'source_grounded',
    runtimeStatus: 'official_template',
    factBoundary: PRINT_TEMPLATE_FACT_BOUNDARY,
    moduleKeys: ['material_bom'],
    summary:
      '基于 yoyoosun 原始 Excel 的 `色卡` 工作表，收口板房打印后贴布料和物料、给仓库对色发料的色卡模板。',
    scene: '板房工程部打印色卡，贴上布料和物料样本后交给仓库对照发料。',
    layout: 'A4 竖版双栏色卡，按物料分块列出厂商和部位 / 加工方式。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '色卡本身是打印核对资料，贴样动作在线下完成，不写材料主数据或库存事实。',
      '从 BOM 管理带值时按 BOM 明细生成物料分块，无法确认的颜色 / 加工方式保持空白。',
    ],
    tags: ['工程资料', '色卡', '对色发料', 'PDF / 打印'],
    previewLines: ['产品信息', '物料分块', '制卡 / 审核 / 复核'],
    sourceFiles: [
      '客户来源样本：docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx（色卡）',
    ],
    fieldTruth: [
      '产品编号、产品名称来自 BOM 版本的产品快照或打印草稿。',
      '色卡分块来自 BOM 明细 / 材料快照或当前打印草稿，不反写材料主数据。',
      '制卡、审核和复核是打印草稿字段，不代表 Workflow 审批或 Fact posted。',
    ],
    fieldRequirements: [
      {
        key: 'color_card_product_snapshot',
        label: '色卡产品头快照',
        source: 'BOM 版本、产品主数据或打印草稿',
        boundary: '只读打印快照；真实缺值保持空白',
      },
      {
        key: 'color_card_material_blocks',
        label: '物料色卡分块',
        source: 'BOM 明细、材料主数据或打印草稿',
        boundary: '只服务线下贴样和仓库对照，不写库存或采购事实',
      },
    ],
    helpNotes: ['色卡用途是板房线下贴样，打印输出不自动留档、不回写业务记录。'],
    sample: createColorCardDraft(DEFAULT_COLOR_CARD_SAMPLE),
  },
  {
    key: WORK_INSTRUCTION_TEMPLATE_KEY,
    title: '作业指导书',
    shortTitle: '作业指导书',
    category: '工程资料 / 生产指导',
    readiness: 'source_grounded',
    runtimeStatus: 'official_template',
    factBoundary: PRINT_TEMPLATE_FACT_BOUNDARY,
    moduleKeys: ['material_bom'],
    summary:
      '基于 yoyoosun 原始 Excel 的 `Sheet1` 工作表，收口内部生产 / 品质参考和外发加工厂执行共用的作业指导书打印模板。',
    scene:
      '工程部准备产品作业资料，生产 / 品质内部参考；委外订单可按加工厂外发场景带入加工项目、数量和回货上下文。',
    layout:
      'A4 竖版作业指导书，包含产品头信息、右上产品图、可变标题 / 编号 / 文本正文行；正文行默认等高，编号行可维护行内图片。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '作业指导书可从 BOM 管理带产品 / 工程资料上下文打开，也可从委外订单带加工厂、加工项目、数量和回货上下文打开；两者都只生成当前打印草稿。',
      '右上产品图和编号行图片只进入当前打印草稿；正文行可添加并切换为标题行、编号行或文本行，图片只允许放在编号行。',
    ],
    tags: ['工程资料', '作业指导', '加工厂', '图片槽'],
    previewLines: ['产品头信息', '可变正文行', '编号行 / 图片槽'],
    sourceFiles: [
      '客户来源样本：docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx（Sheet1 作业指导书）',
    ],
    fieldTruth: [
      '产品编号、产品名称和 BOM 版本来自 BOM 版本、委外订单明细、产品主数据或打印草稿；加工厂、加工项目、委外数量和回货日期只在委外入口作为外发打印上下文带入。',
      '标题行、编号行和文本行都属于打印草稿正文，不固定为裁床、刺绣 / 印花或车缝，不写生产、质检或库存事实。',
      '右上图片和编号行图片来自当前打印窗口上传的图片快照。',
    ],
    fieldRequirements: [
      {
        key: 'work_instruction_header_snapshot',
        label: '作业指导书头信息',
        source: 'BOM 版本、委外订单明细、产品主数据或打印草稿',
        boundary: '只读打印快照；不生成委外事实或质检事实',
      },
      {
        key: 'work_instruction_steps',
        label: '可变正文行和注意事项',
        source: '模板正文、BOM / 工程资料、委外明细上下文或打印草稿',
        boundary: '可编辑打印内容，不代表 Workflow 完成或 Fact posted',
      },
      {
        key: 'work_instruction_image_slots',
        label: '右上和编号行图片槽',
        source: '当前打印窗口上传的图片快照',
        boundary: '随当前 PDF / 打印输出冻结，不替代正式附件归档事实',
      },
    ],
    helpNotes: [
      '作业指导书是工程资料打印件：BOM 管理负责内部工程资料上下文，委外订单负责外发加工厂上下文；打印不回写生产、委外、质检或库存事实。',
    ],
    sample: createWorkInstructionDraft(DEFAULT_WORK_INSTRUCTION_SAMPLE),
  },
]

const printTemplateIndex = Object.fromEntries(
  printTemplateCatalog.map((item) => [item.key, item])
)

export const printTemplateStats = {
  total: printTemplateCatalog.length,
  sourceGrounded: printTemplateCatalog.filter(
    (item) => item.readiness === 'source_grounded'
  ).length,
}

export function getPrintTemplateByKey(templateKey) {
  return printTemplateIndex[templateKey] || null
}
