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
    supplierAlias: '示例加工厂',
    processCategory: '电绣',
    unit: '片',
    unitPrice: '0.2',
    quantity: '9024',
    remark: '头部工序',
  },
  {
    contractNo: 'B25060808',
    productOrderNo: 'SLO250506',
    productNo: '23233',
    productName: '10cm PN吊饰',
    processName: '耳*2',
    supplierAlias: '示例加工厂',
    processCategory: '电绣',
    unit: '对',
    unitPrice: '0.1',
    quantity: '9024',
    remark: '耳部工序',
  },
  {
    contractNo: 'B25060808',
    productOrderNo: 'SLO250506',
    productNo: '23233',
    productName: '10cm PN吊饰',
    processName: '底*1',
    supplierAlias: '示例加工厂',
    processCategory: '电绣',
    unit: '片',
    unitPrice: '0.15',
    quantity: '9024',
    remark: '底部工序',
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
    '客户来源样本：模板-材料与加工合同.xlsx（B类加工合同 / B类汇总表 / 加工厂商）',
    '客户来源样本：加工合同纸面 PDF',
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

export function normalizeProcessingContractClauses(clauses = {}) {
  const source = clauses && typeof clauses === 'object' ? clauses : {}

  return Object.keys(defaultClauses).reduce((state, groupKey) => {
    state[groupKey] = Array.isArray(source[groupKey])
      ? source[groupKey].map((item) => normalizeText(item)).filter(Boolean)
      : [...defaultClauses[groupKey]]
    return state
  }, {})
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
    supplierName: '示例加工厂',
    supplierContact: '加工厂联系人',
    supplierPhone: '加工厂联系电话',
    supplierAddress: '加工厂地址',
    buyerCompany: '本公司',
    buyerContact: '委外负责人',
    buyerPhone: '公司联系电话',
    buyerAddress: '公司地址',
    buyerSigner: '签字人',
    supplierSigner: '受托方签字人',
    buyerSignDateText: '2025-06-08',
    supplierSignDateText: '2025-06-08',
    attachments: createEmptyProcessingAttachments(),
    lines: defaultLines.map((line) => normalizeProcessingLine(line)),
    clauses: normalizeProcessingContractClauses(),
    merges: [],
  }
}

export function createBlankProcessingContractDraft(draft = {}) {
  return {
    ...createProcessingContractDraft(),
    draftVersion: PROCESSING_CONTRACT_DRAFT_VERSION,
    contractNo: '',
    orderDateText: '',
    returnDateText: '',
    supplierName: '',
    supplierContact: '',
    supplierPhone: '',
    supplierAddress: '',
    buyerCompany: '',
    buyerContact: '',
    buyerPhone: '',
    buyerAddress: '',
    buyerSigner: '',
    supplierSigner: '',
    buyerSignDateText: '',
    supplierSignDateText: '',
    attachments: createEmptyProcessingAttachments(),
    lines: [normalizeProcessingLine(createEmptyProcessingLine())],
    clauses: normalizeProcessingContractClauses(draft?.clauses),
    merges: [],
  }
}

function normalizeProcessingFactTrace(record = {}) {
  const traceParts = []
  const factType = normalizeText(record.fact_type)
  const subjectType = normalizeText(record.subject_type)
  const subjectID = normalizeText(record.subject_id)
  const sourceType = normalizeText(record.source_type)
  const sourceID = normalizeText(record.source_id)
  const note = normalizeText(record.note)

  if (factType) {
    traceParts.push(`事实类型: ${factType}`)
  }
  if (subjectType && subjectID) {
    traceParts.push(`对象: ${subjectType} #${subjectID}`)
  }
  if (sourceType && sourceID) {
    traceParts.push(`来源: ${sourceType} #${sourceID}`)
  }
  if (note) {
    traceParts.push(note)
  }
  return traceParts.join('；')
}

function formatProcessingDraftDate(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return normalizeText(value)
  }
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

export function buildProcessingContractDraftFromOutsourcingFact(record = {}) {
  const contractNo = normalizeText(record.fact_no)
  const supplierName = normalizeText(record.supplier_name)
  const draft = createBlankProcessingContractDraft()

  return {
    ...draft,
    contractNo,
    supplierName,
    lines: [
      normalizeProcessingLine({
        contractNo,
        supplierAlias: supplierName,
        remark: normalizeProcessingFactTrace(record),
      }),
    ],
  }
}

export function buildProcessingContractDraftFromOutsourcingOrder(
  order = {},
  items = []
) {
  const contractNo = normalizeText(order.outsourcing_order_no)
  const supplierSnapshot =
    order.supplier_snapshot && typeof order.supplier_snapshot === 'object'
      ? order.supplier_snapshot
      : {}
  const supplierName =
    normalizeText(supplierSnapshot.short_name) ||
    normalizeText(supplierSnapshot.name)
  const draft = createBlankProcessingContractDraft()
  const sourceOrderNo = normalizeText(order.source_order_no)

  return {
    ...draft,
    contractNo,
    supplierName,
    orderDateText: formatProcessingDraftDate(order.order_date),
    returnDateText: formatProcessingDraftDate(order.expected_return_date),
    lines: (Array.isArray(items) && items.length > 0 ? items : [{}]).map(
      (item) =>
        normalizeProcessingLine({
          contractNo,
          productOrderNo: sourceOrderNo,
          productNo: normalizeText(item.product_no_snapshot),
          productName: normalizeText(item.product_name_snapshot),
          processName: normalizeText(item.process_name_snapshot),
          processCategory: normalizeText(item.process_category_snapshot),
          supplierAlias: supplierName,
          unit: normalizeText(item.unit_name_snapshot),
          quantity: normalizeText(item.outsourcing_quantity),
          unitPrice: normalizeText(item.unit_price),
          amount: normalizeText(item.amount),
          remark: normalizeText(item.note),
        })
    ),
  }
}
