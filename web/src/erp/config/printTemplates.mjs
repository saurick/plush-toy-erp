import {
  createProcessingContractDraft,
  processingContractTemplateMeta,
} from '../data/processingContractTemplate.mjs'

export const printTemplateCatalog = [
  {
    key: 'material-purchase-contract',
    title: '采购合同',
    shortTitle: '采购合同',
    category: '采购 / 辅材 / 包材',
    readiness: 'source_grounded',
    summary:
      '基于“模板-材料与加工合同.xlsx”的 `C类辅料合同` 工作表，收口辅材 / 包材采购合同的固定版式、头部字段和条款区。',
    scene: '辅材 / 包材采购下单、供应商确认、财务留档',
    layout:
      'A4 竖版合同，包含双栏头信息、采购明细表、来货要求、合同约定、结算方式和签字区。',
    output: '在线预览 PDF / 下载 PDF / 打印',
    notes: [
      '这张模板适合采购发起辅料 / 包材下单、供应商确认和财务留档。',
      '当前已支持可编辑打印工作台、PDF 预览 / 下载和浏览器打印；还未开始后端 PDF 坐标回填和 Excel 母版回写。',
      '当前纸面已按实拍样本收口为“只有中间采购明细区是表格”，合同头、条款和签字区都保持普通排版。',
      '签字区默认按纸质合同留给手写签名，不带电子印章。',
    ],
    tags: ['固定版式', '采购合同', 'PDF / 打印', '纸质签字'],
    previewLines: ['普通合同头', '采购明细 / 合计', '条款 / 手写签字'],
    sourceFiles: [
      '/Users/simon/Downloads/永绅erp/原文件/模板-材料与加工合同.xlsx（C类辅料合同 / 原辅料采购汇总表 / 材料厂商编号）',
      '/Users/simon/Downloads/Weixin Image_20260421153105_2272_288.jpeg',
    ],
    fieldTruth: [
      '采购订单号、产品订单编号、产品编号、产品名称来自采购业务快照。',
      '供应商名称、联系人、联系电话、供应商地址来自材料厂商编号 sheet，是 partner 快照，不是当前页面手填自由文本。',
      '采购数量、单价、采购金额是合同快照；后续即使主档变更，也不能反写已经打印的合同。',
      '备注保留包装说明和工艺说明，不并入材料主档。',
    ],
    helpNotes: [
      '这张模板适合采购发起辅料 / 包材下单、供应商确认和财务留档。',
      '当前已支持可编辑打印工作台、PDF 预览 / 下载和浏览器打印；还未开始后端 PDF 坐标回填和 Excel 母版回写。',
      '当前纸面已按实拍样本收口为“只有中间采购明细区是表格”，合同头、条款和签字区都保持普通排版。',
      '签字区默认按纸质合同留给手写签名，不带电子印章。',
    ],
    sample: {
      contractNo: 'A26022832',
      orderDateText: '260228',
      returnDateText: '3月1日',
      supplierName: '',
      supplierContact: '',
      supplierPhone: '',
      supplierAddress: '',
      buyerCompany: '永绅',
      buyerContact: '郭伟锋',
      buyerPhone: '15913792351',
      buyerAddress: '东莞-茶山',
      buyerSigner: '郭细云',
      supplierSigner: '',
      signDateText: '2026/2/28',
      supplierSignDateText: '20    年    月    日',
      lines: [
        {
          contractNo: 'A26022832',
          productOrderNo: 'XM260202',
          productNo: '23145-1',
          productName: '双熊猫发箍-\n续然',
          materialName: '黑色发箍头胶套',
          vendorCode: '卢子淳网购',
          spec: '',
          unit: 'PCS',
          unitPrice: '',
          quantity: '4000',
          amount: '',
          remark: '',
        },
        {
          contractNo: 'A26022832',
          productOrderNo: 'XM260202',
          productNo: '23145-1',
          productName: '双熊猫发箍-\n续然',
          materialName: '黑色铁发箍包黑\n色丁布',
          vendorCode: '卢子淳网购',
          spec: '0',
          unit: 'PCS',
          unitPrice: '',
          quantity: '2000',
          amount: '',
          remark: '',
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
