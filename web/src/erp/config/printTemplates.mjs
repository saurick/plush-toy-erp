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

const APPENDIX_IMAGE_FIELD_REQUIREMENT = {
  key: 'appendix_image_snapshots',
  label: '末尾附图',
  source: '当前打印窗口添加的图片',
  boundary:
    '图片数量不设业务上限；普通图片自动两张一行，长图自动整行，可逐张切换排版；只随当前草稿、PDF / 打印输出，不替代正式附件归档',
}

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
    summary: '用于材料采购下单的合同模板，包含采购明细、合同条款和签字区。',
    scene: '材料采购下单、供应商确认、财务留档',
    layout:
      'A4 竖版合同，包含双栏头信息、采购明细表、来货要求、合同约定、结算方式和签字区。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '这张模板适合采购发起材料采购下单、供应商确认和财务留档；辅料、包材等都来自材料资料。',
      '当前支持可编辑打印、独立 PDF 预览、下载 PDF 和浏览器打印。',
      '当前纸面版式保持合同头、采购明细、条款和签字区的正式布局。',
      '采购金额默认按数量 × 单价带入，也可按合同内容手工调整金额列；编辑区显示人民币前缀，保存时仍保留纯数字金额。',
      '工作台上插 / 下插明细行时会新增真正空白行，不再复制当前行的订单号、产品号、单位或其他字段。',
      '签字区默认按纸质合同留给手写签名，不带电子印章。',
    ],
    tags: ['固定版式', '采购合同', 'PDF / 打印', '纸质签字'],
    previewLines: ['普通合同头', '采购明细 / 合计', '条款 / 手写签字'],
    sourceFiles: [
      '来源样本：材料与加工合同工作簿（C类辅料合同 / 原辅料采购汇总表 / 材料厂商编号）',
      '来源样本：采购合同纸面照片',
    ],
    fieldTruth: [
      '采购订单号、产品订单编号、产品编号和产品名称来自采购订单或本次合同内容。',
      '供应商名称、联系人、联系电话和地址来自供应商资料；在打印窗口修改不会更新供应商资料。',
      '采购数量、单价和采购金额属于本次合同内容；金额默认按数量 × 单价带入，也可在打印前手工调整。',
      '备注保留包装说明和工艺说明，不并入材料主档。',
    ],
    fieldRequirements: [
      {
        key: 'purchase_header_snapshot',
        label: '采购合同头',
        source: '采购订单或本次合同内容',
        boundary:
          '业务内容必须从对应业务页面生成；模板示例不会补充缺失的业务信息',
      },
      {
        key: 'supplier_snapshot',
        label: '供应商资料',
        source: '供应商资料或材料厂商资料',
        boundary: '编辑只影响本次打印，不会修改供应商资料',
      },
      {
        key: 'purchase_line_snapshots',
        label: '采购明细',
        source: '采购订单明细或合同明细草稿',
        boundary: '数量、单价、金额和备注只用于本次合同，不会自动生成采购记录',
      },
      {
        key: 'contract_clauses',
        label: '合同条款与签字区',
        source: '正式模板正文',
        boundary: '纸面文本可编辑；审批、签收和财务处理仍需在对应业务流程完成',
      },
      APPENDIX_IMAGE_FIELD_REQUIREMENT,
    ],
    helpNotes: [
      '这张模板适合采购发起材料采购下单、供应商确认和财务留档；辅料、包材等都来自材料资料。',
      '当前支持可编辑打印、独立 PDF 预览、下载 PDF 和浏览器打印。',
      '当前纸面版式保持合同头、采购明细、条款和签字区的正式布局。',
      '采购金额默认按数量 × 单价带入，也可按合同内容手工调整金额列；编辑区显示人民币前缀，保存时仍保留纯数字金额。',
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
      appendixImages: [],
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
          '在订单约定日期前交货。如因货期延误，影响到我司正常上货计划的，我司将对供应商收取违约金。实际交货日期比合同货期延误一天以上的，每延误一天，按100元/款来处罚，直接从货款扣除。',
          '交货中，如因特殊原因不能按期交货，须提前与我司采购沟通确认，经同意后方可延期， 否则订单作废或上款收取违约金；',
          '违约责任和解决合同纠纷的方式：按《经济合同法》和《购销合同条例》规定，需承担的责任进行友好协商或按《合同法》办理。',
          '因乙方产品质量问题造成经济纠纷，或者延误交期造成的损失均由乙方负责。',
        ],
        settlement: [
          '按我仓库确认收到货物日期，次月开始对账，每月15号之前完成对账。',
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
    summary: '供板房工程部整理物料明细并交给仓库核对发料。',
    scene: '板房工程部整理物料明细，打印给仓库按物料、部位和工艺方式发料。',
    layout:
      'A4 竖版明细表，包含产品头信息、右上 0–2 张产品图、材料明细、审核制表和按顺序追加的末尾附图。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '物料明细用于工程资料打印和仓库发料核对，不会自动生成采购、库存、生产或财务记录。',
      '从 BOM 打开时，右上角优先带入产品基础信息中的 0–2 张产品图；打印窗口仍可只为当前草稿替换或清空。末尾附图继续由打印窗口维护。',
      '从物料清单（BOM）页面选中版本打开时，只带入当前产品、版本和 BOM 明细；缺失内容保持空白。',
    ],
    tags: ['工程资料', '物料明细', '图片槽', 'PDF / 打印'],
    previewLines: ['产品头信息', '材料明细 / 用量', '右上产品图 / 末尾附图'],
    sourceFiles: ['来源样本：材料分析明细工作表'],
    fieldTruth: [
      '产品编号、产品名称、BOM 版本和材料明细优先来自所选 BOM 版本及其明细。',
      '单位用量、损耗率、部位、备注来自 BOM 明细或当前打印草稿，不反写 BOM。',
      '右上图片可来自产品基础信息中的产品图或当前打印窗口；末尾附图来自当前打印窗口。草稿修改不会反向修改产品主档或业务附件。',
    ],
    fieldRequirements: [
      {
        key: 'bom_header_snapshot',
        label: '产品与版本资料',
        source: 'BOM 版本、产品资料或打印草稿',
        boundary: '只读打印内容；模板示例不会补充缺失的业务信息',
      },
      {
        key: 'material_detail_snapshots',
        label: '材料明细',
        source: 'BOM 明细或打印草稿行',
        boundary: '仅用于发料核对，不会自动生成采购需求、库存变动或成本记录',
      },
      {
        key: 'print_image_slots',
        label: '右上产品图 1 / 2',
        source: '产品基础信息的产品图快照，或当前打印窗口上传的图片',
        boundary:
          '打开时冻结到当前草稿；打印窗口修改不会反向修改产品主档或业务附件',
      },
      APPENDIX_IMAGE_FIELD_REQUIREMENT,
    ],
    helpNotes: [
      '色卡和物料明细均服务板房工程部，打印后给仓库发料核对。',
      '只会带入系统中已有的产品和材料明细，缺少的内容请在打印前补充。',
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
    summary: '供板房打印后粘贴布料和物料样本，并交给仓库对色发料。',
    scene: '板房工程部打印色卡，贴上布料和物料样本后交给仓库对照发料。',
    layout: 'A4 竖版双栏色卡，按物料分块列出厂商和部位 / 加工方式。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '色卡用于打印核对，贴样在线下完成，不会自动修改材料档案或库存记录。',
      '从物料清单（BOM）页面带值时按 BOM 明细生成物料分块，无法确认的颜色 / 加工方式保持空白。',
    ],
    tags: ['工程资料', '色卡', '对色发料', 'PDF / 打印'],
    previewLines: ['产品信息', '物料分块', '制卡 / 审核 / 复核'],
    sourceFiles: ['来源样本：色卡工作表'],
    fieldTruth: [
      '产品编号和产品名称来自所选 BOM 版本的产品资料或打印草稿。',
      '色卡分块来自 BOM 明细、材料资料或当前打印草稿；修改只影响本次打印。',
      '制卡、审核和复核只是打印内容，不表示审批流程已经完成。',
    ],
    fieldRequirements: [
      {
        key: 'color_card_product_snapshot',
        label: '色卡产品资料',
        source: 'BOM 版本、产品资料或打印草稿',
        boundary: '只用于本次打印；缺失内容保持空白',
      },
      {
        key: 'color_card_material_blocks',
        label: '物料色卡分块',
        source: 'BOM 明细、材料资料或打印草稿',
        boundary: '只用于线下贴样和仓库对照，不会自动生成库存或采购记录',
      },
      APPENDIX_IMAGE_FIELD_REQUIREMENT,
    ],
    helpNotes: [
      '色卡用于板房线下贴样；打印不会自动保存为附件，也不会修改系统中的业务资料。',
    ],
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
    summary: '供生产、品质和外发加工厂查看产品加工要求。',
    scene:
      '工程部准备产品作业资料，供生产和品质参考；从委外订单进入时可带入加工项目、数量和回货信息。',
    layout:
      'A4 竖版作业指导书，包含产品头信息、右上 0–2 张产品图、可变标题 / 编号 / 文本正文行；正文行默认等高，编号行可维护行内图片。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '作业指导书可从物料清单（BOM）页面带入产品和工程资料，也可从委外订单带入加工厂、加工项目、数量和回货信息；两者都只生成当前打印草稿。',
      '从单一产品的 BOM 或委外订单打开时，右上角优先带入产品基础信息中的 0–2 张产品图；多产品委外不猜测首行产品。右上产品图和编号行图片都只进入当前打印草稿。',
    ],
    tags: ['工程资料', '作业指导', '加工厂', '图片槽'],
    previewLines: ['产品头信息', '可变正文行', '编号行 / 图片槽'],
    sourceFiles: ['来源样本：作业指导工作表'],
    fieldTruth: [
      '产品编号、产品名称和 BOM 版本来自 BOM 版本、委外订单明细、产品资料或打印草稿；加工厂、加工项目、委外数量和回货日期只在从委外订单打开时带入。',
      '标题行、编号行和文本行都属于打印正文，不固定为裁床、刺绣 / 印花或车缝，也不会自动生成生产、质检或库存记录。',
      '右上图片可来自产品基础信息中的产品图快照或当前打印窗口；编号行图片来自当前打印窗口。',
    ],
    fieldRequirements: [
      {
        key: 'work_instruction_header_snapshot',
        label: '作业指导书头信息',
        source: 'BOM 版本、委外订单明细、产品资料或打印草稿',
        boundary: '只读打印内容；不会自动生成委外或质检记录',
      },
      {
        key: 'work_instruction_steps',
        label: '可变正文行和注意事项',
        source: '模板正文、BOM / 工程资料、委外明细或打印草稿',
        boundary: '可编辑打印内容；不表示待办任务已经完成',
      },
      {
        key: 'work_instruction_image_slots',
        label: '右上产品图 1 / 2 和编号行图片槽',
        source: '产品基础信息的产品图快照，以及当前打印窗口上传的图片',
        boundary:
          '随当前 PDF / 打印输出保留；打印窗口修改不会反向修改产品主档或业务附件',
      },
      APPENDIX_IMAGE_FIELD_REQUIREMENT,
    ],
    helpNotes: [
      '从物料清单（BOM）页面进入时会带入产品资料；从委外订单进入时会带入加工厂和加工内容。打印不会自动更新生产、委外、质检或库存记录。',
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
