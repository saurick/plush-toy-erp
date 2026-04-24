export const PROCESSING_CONTRACT_TEMPLATE_KEY = 'processing-contract'
export const PROCESSING_CONTRACT_DRAFT_VERSION = 2
export const PROCESSING_CONTRACT_TABLE_COLUMNS = [
  { key: 'contractNo', fieldKey: 'contractNo', label: '委外加工订单号' },
  { key: 'productOrderNo', fieldKey: 'productOrderNo', label: '产品订单编号' },
  { key: 'productNo', fieldKey: 'productNo', label: '产品编号' },
  {
    key: 'productName',
    fieldKey: 'productName',
    label: '产品名称',
    multiline: true,
  },
  {
    key: 'processName',
    fieldKey: 'processName',
    label: '工序名称',
    multiline: true,
  },
  { key: 'supplierAlias', fieldKey: 'supplierAlias', label: '加工厂商' },
  { key: 'processCategory', fieldKey: 'processCategory', label: '工序类别' },
  { key: 'unit', fieldKey: 'unit', label: '单位' },
  { key: 'unitPrice', fieldKey: 'unitPrice', label: '单价' },
  { key: 'quantity', fieldKey: 'quantity', label: '委托加工数量' },
  { key: 'amount', fieldKey: null, label: '委托加工金额' },
  { key: 'remark', fieldKey: 'remark', label: '备注', multiline: true },
]

const defaultClauses = {
  delivery: [
    '按订单明细分别打包（1k/包，不足1K单独包装），并标明产品编号、工序名称。',
    '请严格按定单规定，准时足量送（发）货。',
    '必须保证产品的品质，按 BOM 表要求的工艺生产。未达要求的产品，委托方有权要求返工，无法返工的，加工方承担赔偿责任。',
  ],
  contract: [
    '在订单约定日期前交货。如因货期延误影响委托方正常生产计划，实际交货日期比合同货期延误一天以上的，每延误一天按 100 元 / 款处罚。',
    '如因特殊原因不能按期交货，务必提前与委托方采购沟通确认，经同意后方可延期，否则加工方承担违约金并赔偿损失。',
    '违约责任和解决合同纠纷的方式：按《经济合同法》和《购销合同条例》办理。',
  ],
  settlement: [
    '按委托方仓库确认收到货物日期，次月开始对账，每月 15 号之前完成对账。',
    '对完账后，次月支付货款，加工厂开具等额增值税专用发票。',
  ],
}

const LEGACY_DEFAULT_BUYER_CONTACT = '刘志强'
const LEGACY_DEFAULT_BUYER_SIGNATURE = Object.freeze({
  buyerCompany: '永绅',
  buyerPhone: '13694972987',
  buyerAddress: '东莞茶山',
  buyerSignDateText: '2025-06-08',
})

export const processingContractAttachmentSlots = [
  {
    key: 'attachment-1',
    title: '纸样 / 图样附件位 1',
  },
  {
    key: 'attachment-2',
    title: '纸样 / 图样附件位 2',
  },
]

export function createEmptyProcessingAttachment() {
  return {
    name: '',
    dataURL: '',
    mimeType: '',
  }
}

export function createEmptyProcessingAttachments() {
  return processingContractAttachmentSlots.reduce((state, slot) => {
    state[slot.key] = createEmptyProcessingAttachment()
    return state
  }, {})
}

const defaultLines = [
  {
    contractNo: 'B25060808',
    productOrderNo: 'SLO250506',
    productNo: '23233',
    productName: '10cm PN吊饰',
    processName: '面*1',
    supplierAlias: '',
    processCategory: '电绣',
    unit: '片',
    unitPrice: '0.2',
    quantity: '9024',
    remark: '',
  },
  {
    contractNo: 'B25060808',
    productOrderNo: 'SLO250506',
    productNo: '23233',
    productName: '10cm PN吊饰',
    processName: '耳*2',
    supplierAlias: '',
    processCategory: '电绣',
    unit: '对',
    unitPrice: '0.1',
    quantity: '9024',
    remark: '',
  },
  {
    contractNo: 'B25060808',
    productOrderNo: 'SLO250506',
    productNo: '23233',
    productName: '10cm PN吊饰',
    processName: '底*1',
    supplierAlias: '',
    processCategory: '电绣',
    unit: '片',
    unitPrice: '0.15',
    quantity: '9024',
    remark: '',
  },
]

export const processingContractTemplateMeta = {
  key: PROCESSING_CONTRACT_TEMPLATE_KEY,
  title: '加工合同',
  shortTitle: '加工合同',
  category: '委外加工',
  readiness: 'source_grounded',
  summary:
    '基于“模板-材料与加工合同.xlsx”的 `B类加工合同` 工作表，并对照 `9.3加工合同-子淳.pdf` 的单页纸质合同，收口加工合同的独立打印工作台。',
  scene: '委外加工下单、加工厂回签、财务对账留档',
  layout:
    'A4 单页固定合同版式，包含双栏合同头、加工明细表、条款区、签字区和页底两处纸样 / 图样附件位。',
  output: '在线预览 PDF / 下载 PDF / 打印',
  notes: [
    '加工合同当前和采购合同一样，统一走独立打印工作台链路；其余汇总表和报表模板继续保留静态预览。',
    '顶部按钮和弹窗工作流统一为：先打开可编辑打印窗口，再做独立 PDF 预览窗口 / 下载 PDF / 打印。',
    '工作台上插 / 下插明细行时会新增真正空白行，不再预填合同号、产品号或其他相邻行字段。',
    '纸样 / 图样附件通过工作台独立上传，并同步进入右侧页底附件位，随 PDF / 打印一起输出。',
  ],
  tags: ['固定版式', '合同快照', 'PDF / 打印', '可编辑窗口'],
  previewLines: [
    '合同头 / 加工商信息',
    '加工明细 / 合计',
    '条款 / 签章 / 页底附件位',
  ],
  sourceFiles: [
    '/Users/simon/Downloads/永绅erp/原文件/模板-材料与加工合同.xlsx（B类加工合同 / B类汇总表 / 加工厂商）',
    '/Users/simon/Downloads/永绅erp/原文件/9.3加工合同-子淳.pdf',
  ],
  fieldTruth: [
    '合同编号、下单日期、回货日期、加工方名称、委托单位都属于合同头快照，不回写主数据。',
    '工序名称、工序类别、单价、委托加工数量、委托加工金额属于合同明细快照；金额默认按数量 × 单价带值，但允许按合同快照手工改写。',
    '来货要求、合同约定、结算方式属于正式合同正文，不应只留在帮助文档里口头说明。',
    '纸样 / 图样附件属于附件快照层，当前通过工作台上传后进入页底附件位，并随 PDF / 打印一起冻结。',
  ],
  helpNotes: [
    '当前主链路是“打印中心 -> 可编辑打印窗口 -> 独立 PDF 预览窗口 / 下载 PDF / 打印”，不再走静态预览页。',
    '工作台壳层、顶部按钮和左右双栏布局已收口为当前固定打印模板的主工作流。',
    '合同明细支持在工作台里选行、插行、删行；适合先调明细结构，再确认 PDF 和打印观感。',
    '加工合同明细当前最多支持 300 行，顶部计数会显示“当前行数/300”。',
    '纸样 / 图样附件当前通过工作台按钮上传并映射到页底附件位；如果后续接真实业务带值，应继续从合同头快照、合同行快照和附件快照三层分别带入，不要混成一层。',
  ],
}

export function createEmptyProcessingLine() {
  return {
    contractNo: '',
    productOrderNo: '',
    productNo: '',
    productName: '',
    processName: '',
    supplierAlias: '',
    processCategory: '',
    unit: '',
    unitPrice: '',
    quantity: '',
    amount: '',
    remark: '',
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .trim()
}

function parseNumber(value) {
  const text = normalizeText(value).replaceAll(',', '')
  if (!text) {
    return null
  }
  const numericValue = Number(text)
  return Number.isFinite(numericValue) ? numericValue : null
}

export function formatTrimmedNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return ''
  }
  return new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)
}

function sanitizePositiveDecimalText(
  value,
  { maximumFractionDigits = 2, preserveTrailingDot = false } = {}
) {
  const source = String(value ?? '')
  let normalized = ''
  let hasDot = false

  for (const character of source) {
    if (/\d/.test(character)) {
      normalized += character
      continue
    }

    if (character === '.' && !hasDot) {
      if (!normalized) {
        normalized = '0'
      }
      normalized += '.'
      hasDot = true
    }
  }

  if (!normalized) {
    return ''
  }

  const endsWithDot = normalized.endsWith('.')
  const [rawInteger = '', rawFraction = ''] = normalized.split('.')
  const integer = rawInteger.replace(/^0+(?=\d)/, '') || '0'
  const fraction = rawFraction.slice(0, Math.max(0, maximumFractionDigits))

  if (!hasDot) {
    return integer
  }

  if (fraction || (preserveTrailingDot && endsWithDot)) {
    return `${integer}.${fraction}`
  }

  return integer
}

export function normalizeProcessingAmountDraft(value) {
  return sanitizePositiveDecimalText(value, {
    maximumFractionDigits: 2,
    preserveTrailingDot: true,
  })
}

export function normalizeProcessingAmountText(value) {
  const sanitized = sanitizePositiveDecimalText(value, {
    maximumFractionDigits: 2,
  })
  const numericValue = parseNumber(sanitized)
  return numericValue === null ? '' : formatTrimmedNumber(numericValue, 2)
}

export function resolveComputedProcessingLineAmount(line = {}) {
  const quantity = parseNumber(line.quantity)
  const unitPrice = parseNumber(line.unitPrice)
  if (quantity === null || unitPrice === null) {
    return ''
  }
  return formatTrimmedNumber(quantity * unitPrice, 2)
}

export function resolveProcessingLineAmount(line = {}) {
  return (
    normalizeProcessingAmountText(line.amount) ||
    resolveComputedProcessingLineAmount(line)
  )
}

export function normalizeProcessingLine(line = {}) {
  return {
    contractNo: normalizeText(line.contractNo),
    productOrderNo: normalizeText(line.productOrderNo),
    productNo: normalizeText(line.productNo),
    productName: normalizeText(line.productName),
    processName: normalizeText(line.processName),
    supplierAlias: normalizeText(line.supplierAlias),
    processCategory: normalizeText(line.processCategory),
    unit: normalizeText(line.unit),
    unitPrice: normalizeText(line.unitPrice),
    quantity: normalizeText(line.quantity),
    amount: resolveProcessingLineAmount(line),
    remark: normalizeText(line.remark),
  }
}

export function normalizeProcessingAttachmentSnapshot(attachment = {}) {
  const normalizedDataURL = normalizeText(attachment.dataURL)
  return {
    name: normalizeText(attachment.name),
    dataURL: normalizedDataURL.startsWith('data:') ? normalizedDataURL : '',
    mimeType: normalizeText(attachment.mimeType),
  }
}

export function normalizeProcessingContractAttachments(attachments = {}) {
  const source =
    attachments && typeof attachments === 'object' ? attachments : {}

  return processingContractAttachmentSlots.reduce((state, slot) => {
    state[slot.key] = normalizeProcessingAttachmentSnapshot(source[slot.key])
    return state
  }, {})
}

export function migrateLegacyProcessingContractDraft(draft = {}) {
  const source = draft && typeof draft === 'object' ? draft : {}
  const draftVersion = Number(source.draftVersion || 0)
  if (draftVersion >= PROCESSING_CONTRACT_DRAFT_VERSION) {
    return source
  }

  if (normalizeText(source.buyerContact) !== LEGACY_DEFAULT_BUYER_CONTACT) {
    return source
  }

  const matchesLegacySignature = Object.entries(
    LEGACY_DEFAULT_BUYER_SIGNATURE
  ).every(
    ([field, expectedValue]) => normalizeText(source[field]) === expectedValue
  )

  if (!matchesLegacySignature) {
    return source
  }

  // 兼容旧本地草稿：只清理历史默认样例里的甲方联系人，避免真实手填内容被误改。
  return {
    ...source,
    buyerContact: '',
    draftVersion: PROCESSING_CONTRACT_DRAFT_VERSION,
  }
}

export function calculateProcessingContractTotals(lines = []) {
  let totalQuantity = 0
  let totalAmount = 0
  let hasQuantity = false
  let hasAmount = false

  lines.forEach((line) => {
    const normalizedLine = normalizeProcessingLine(line)
    const quantity = parseNumber(normalizedLine.quantity)
    const amount = parseNumber(resolveProcessingLineAmount(normalizedLine))

    if (quantity !== null) {
      totalQuantity += quantity
      hasQuantity = true
    }

    if (amount !== null) {
      totalAmount += amount
      hasAmount = true
    }
  })

  return {
    totalQuantityText: hasQuantity ? formatTrimmedNumber(totalQuantity, 3) : '',
    totalAmountText: hasAmount ? formatTrimmedNumber(totalAmount, 2) : '',
  }
}

export function createProcessingContractDraft() {
  return {
    draftVersion: PROCESSING_CONTRACT_DRAFT_VERSION,
    contractNo: 'B25060808',
    orderDateText: '250608',
    returnDateText: '2025-06-11',
    supplierName: '',
    supplierContact: '',
    supplierPhone: '',
    supplierAddress: '',
    buyerCompany: '永绅',
    buyerContact: '',
    buyerPhone: '13694972987',
    buyerAddress: '东莞茶山',
    buyerSignDateText: '2025-06-08',
    supplierSignDateText: '',
    attachments: createEmptyProcessingAttachments(),
    lines: defaultLines.map((line) => normalizeProcessingLine(line)),
    clauses: structuredClone(defaultClauses),
    merges: [],
  }
}
