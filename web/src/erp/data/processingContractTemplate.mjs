export const PROCESSING_CONTRACT_TEMPLATE_KEY = 'processing-contract'
export const PROCESSING_CONTRACT_DRAFT_VERSION = 2
export const PROCESSING_CONTRACT_TABLE_COLUMNS = [
  { key: 'contractNo', fieldKey: 'contractNo', label: '委外加工订单号' },
  { key: 'productOrderNo', fieldKey: 'productOrderNo', label: '来源订单编号' },
  { key: 'productNo', fieldKey: 'productNo', label: '产品 / 材料编号' },
  {
    key: 'productName',
    fieldKey: 'productName',
    label: '产品 / 材料名称',
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

const processingContractColumnIndex = Object.fromEntries(
  PROCESSING_CONTRACT_TABLE_COLUMNS.map((column, index) => [column.key, index])
)

const defaultClauses = {
  delivery: [
    '按订单明细分别打包（1k/包，不足1K单独包装），并标明产品编号、工序名称。',
    '请严格按定单规定，准时足量送（发）货。',
    '必须保证产品的品质，按BOM表要求的生产艺生产。未达要求的产品，委托方有权要求返工，无法返工的，承担赔偿责任；因返工造成委托方延误工期的，加工方承担违约责任。（因委托方原因导致的，免除加工方的责任）。',
  ],
  contract: [
    '在订单约定日期前交货。如因货期延误，影响到我司正常生产计划的，委托方将对加工方收取违约金。实际交货日期比合同货期延误一天以上的，每延误一天，按100元/款来处罚，直接从货款扣除。',
    '在交货中，如因特殊原因不能按期交货务必提前与委托方采购沟通确认，经同意后方可延期， 否则加工厂承担违约金，赔偿损失；',
    '违约责任和解决合同纠纷的方式：按《经济合同法》和《购销合同条例》规定需承担的责任，进行友好协商或按《合同法》办理。',
  ],
  settlement: [
    '按委托方仓库确认收到货物日期，次月开始对账，每月15号之前完成对账。',
    '对完账后，次月支付货款，加工厂开具等额增值税专用发票。',
  ],
}

const PROCESSING_FACT_TYPE_LABELS = {
  MATERIAL_ISSUE: '材料发料',
  RETURN_RECEIPT: '委外回货',
  SETTLEMENT: '委外结算',
  FINISHED_GOODS_RECEIPT: '成品入库',
  REWORK: '返工',
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
    contractNo: 'SIM-OS-001',
    productOrderNo: 'SIM-SO-001',
    productNo: 'SIM-PROD-001',
    productName: '合成玩偶甲',
    processName: '面*1',
    supplierAlias: '示例加工厂',
    processCategory: '电绣',
    unit: '片',
    unitPrice: '0.2',
    quantity: '100',
    remark: '头部工序',
  },
  {
    contractNo: 'SIM-OS-001',
    productOrderNo: 'SIM-SO-001',
    productNo: 'SIM-PROD-001',
    productName: '合成玩偶甲',
    processName: '耳*2',
    supplierAlias: '示例加工厂',
    processCategory: '电绣',
    unit: '对',
    unitPrice: '0.1',
    quantity: '100',
    remark: '耳部工序',
  },
  {
    contractNo: 'SIM-OS-001',
    productOrderNo: 'SIM-SO-001',
    productNo: 'SIM-PROD-001',
    productName: '合成玩偶甲',
    processName: '底*1',
    supplierAlias: '示例加工厂',
    processCategory: '电绣',
    unit: '片',
    unitPrice: '0.15',
    quantity: '100',
    remark: '底部工序',
  },
]

export const processingContractTemplateMeta = {
  key: PROCESSING_CONTRACT_TEMPLATE_KEY,
  title: '加工合同',
  shortTitle: '加工合同',
  category: '委外加工',
  readiness: 'source_grounded',
  runtimeStatus: 'official_template',
  factBoundary: 'read_snapshot_only',
  moduleKeys: ['outsourcing_orders'],
  summary:
    '根据已确认的合同字段和纸面版式提供独立打印窗口；界面不会显示客户原始文件名。',
  scene: '委外加工下单、加工厂回签、财务对账留档',
  layout:
    'A4 单页固定合同版式，包含双栏合同头、加工明细表、条款区、签字区和页底两处纸样 / 图样附件位。',
  output: '在线预览 PDF / 下载 PDF / 打印',
  notes: [
    '加工合同和采购合同都使用独立打印窗口；其他汇总表和报表模板仍提供示例预览。',
    '先打开可编辑打印窗口，再预览、下载或打印 PDF。',
    '在明细上方或下方插入时会新增空白行，不会复制相邻行内容。',
    '纸样 / 图样附件通过工作台独立上传，并同步进入右侧页底附件位，随 PDF / 打印一起输出。',
  ],
  tags: ['固定版式', '合同内容', 'PDF / 打印', '可编辑窗口'],
  previewLines: [
    '合同头 / 加工商信息',
    '加工明细 / 合计',
    '条款 / 签章 / 页底附件位',
  ],
  sourceFiles: [
    '来源样本：材料与加工合同工作簿（B类加工合同 / B类汇总表 / 加工厂商）',
    '来源样本：加工合同纸面 PDF',
  ],
  fieldTruth: [
    '合同编号、下单日期、回货日期、加工方名称和委托单位保留在当前合同中，不会修改加工厂或公司资料。',
    '工序名称、工序类别、单价、委托加工数量和金额保留在当前合同中；金额默认按数量 × 单价计算，也可手工修改。',
    '来货要求、合同约定、结算方式属于正式合同正文，不应只留在帮助文档里口头说明。',
    '纸样 / 图样附件上传后显示在页底，并随当前 PDF 或打印件一起输出。',
  ],
  fieldRequirements: [
    {
      key: 'outsourcing_header_snapshot',
      label: '加工合同头',
      source: '委外订单或加工合同草稿',
      boundary:
        '业务内容必须从对应业务页面生成；模板示例不会补充缺失的业务信息',
    },
    {
      key: 'processor_snapshot',
      label: '加工方资料',
      source: '供应商 / 加工厂资料或合同草稿',
      boundary: '打印时修改内容不会改变供应商或加工厂资料',
    },
    {
      key: 'processing_line_snapshots',
      label: '加工明细',
      source: '委外订单明细或合同明细草稿',
      boundary:
        '工序、数量、单价和金额保留在当前打印草稿中，不会自动生成发料、回货、库存或财务记录',
    },
    {
      key: 'attachment_snapshots',
      label: '纸样 / 图样附件',
      source: '当前打印窗口上传的附件',
      boundary: '图片随当前 PDF / 打印输出保留，不替代正式附件归档',
    },
    {
      key: 'contract_clauses',
      label: '合同条款与签字区',
      source: '正式模板正文',
      boundary:
        '纸面文本可编辑；审批、签收、发料、回货和结算仍需在对应业务流程完成',
    },
  ],
  helpNotes: [
    '当前支持从打印中心打开可编辑窗口，并在独立窗口预览、下载或打印 PDF。',
    '顶部工具栏和左右编辑区用于调整当前合同内容。',
    '合同明细支持在工作台里选行、插行、删行；适合先调明细结构，再确认 PDF 和打印观感。',
    '加工合同明细当前最多支持 300 行，顶部计数会显示“当前行数/300”。',
    '纸样 / 图样附件可通过工作台按钮上传并显示在页底；从业务单据进入时，合同信息、明细和附件会分别带入。',
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

function isCanceledBusinessLineStatus(value) {
  return ['canceled', 'cancelled'].includes(normalizeText(value).toLowerCase())
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

function isProcessingContractCellHiddenByMerge(merges, rowIndex, columnKey) {
  const colIndex = processingContractColumnIndex[columnKey]
  if (!Number.isInteger(colIndex) || !Array.isArray(merges)) {
    return false
  }

  return merges.some((merge = {}) => {
    const rowStart = Number(merge.rowStart)
    const rowEnd = Number(merge.rowEnd)
    const colStart = Number(merge.colStart)
    const colEnd = Number(merge.colEnd)
    if (
      !Number.isInteger(rowStart) ||
      !Number.isInteger(rowEnd) ||
      !Number.isInteger(colStart) ||
      !Number.isInteger(colEnd)
    ) {
      return false
    }
    if (
      rowIndex < rowStart ||
      rowIndex > rowEnd ||
      colIndex < colStart ||
      colIndex > colEnd
    ) {
      return false
    }
    return rowIndex !== rowStart || colIndex !== colStart
  })
}

export function calculateProcessingContractTotals(
  lines = [],
  { merges = [] } = {}
) {
  let totalQuantity = 0
  let totalAmount = 0
  let hasQuantity = false
  let hasAmount = false

  lines.forEach((line, rowIndex) => {
    const normalizedLine = normalizeProcessingLine(line)
    const quantity = isProcessingContractCellHiddenByMerge(
      merges,
      rowIndex,
      'quantity'
    )
      ? null
      : parseNumber(normalizedLine.quantity)
    const amount = isProcessingContractCellHiddenByMerge(
      merges,
      rowIndex,
      'amount'
    )
      ? null
      : parseNumber(resolveProcessingLineAmount(normalizedLine))

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
    contractNo: 'SIM-OS-001',
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

export function createProcessingContractBusinessDraft(draft = {}) {
  const { attachments, lines, clauses, merges, ...rest } = draft || {}
  return {
    ...createBlankProcessingContractDraft({ clauses }),
    ...rest,
    lines: Array.isArray(lines)
      ? lines.map((line) => normalizeProcessingLine(line))
      : [normalizeProcessingLine(createEmptyProcessingLine())],
    attachments: normalizeProcessingContractAttachments(attachments),
    merges: Array.isArray(merges) ? merges : [],
  }
}

function normalizeProcessingFactTrace(record = {}) {
  const traceParts = []
  const factType = normalizeText(record.fact_type)
  const subjectType = normalizeText(record.subject_type)
  const subjectID = normalizeText(record.subject_id)
  const sourceType = normalizeText(record.source_type)
  const sourceID = normalizeText(record.source_id)
  const subjectNo =
    normalizeText(record.subject_no) || normalizeText(record.subject_name)
  const sourceNo =
    normalizeText(record.source_no) || normalizeText(record.source_name)
  const note = normalizeText(record.note)

  if (factType) {
    traceParts.push(
      `业务来源: ${PROCESSING_FACT_TYPE_LABELS[factType] || '业务来源已关联'}`
    )
  }
  if (subjectNo || (subjectType && subjectID)) {
    traceParts.push(`产品 / 材料：${subjectNo || '已关联'}`)
  }
  if (sourceNo || (sourceType && sourceID)) {
    traceParts.push(`来源单据: ${sourceNo || '来源单据已关联'}`)
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

function processingPrintPartyDefaults(printTemplateDefaults = {}) {
  const directDefaults =
    printTemplateDefaults?.[PROCESSING_CONTRACT_TEMPLATE_KEY] ||
    printTemplateDefaults?.processingContract ||
    null
  const templateDefaults = Array.isArray(printTemplateDefaults?.templates)
    ? printTemplateDefaults.templates.find(
        (item) => item?.template_key === PROCESSING_CONTRACT_TEMPLATE_KEY
      )
    : null
  const partyDefaults =
    directDefaults?.partyDefaults ||
    directDefaults?.party_defaults ||
    templateDefaults?.party_defaults ||
    {}
  const allowedKeys = [
    'buyerCompany',
    'buyerContact',
    'buyerPhone',
    'buyerAddress',
    'buyerSigner',
  ]
  return allowedKeys.reduce((output, key) => {
    const value = normalizeText(partyDefaults?.[key])
    if (value) {
      output[key] = value
    }
    return output
  }, {})
}

function processingContractPartySnapshot(order = {}) {
  const source =
    order.contract_party_snapshot &&
    typeof order.contract_party_snapshot === 'object'
      ? order.contract_party_snapshot
      : {}
  const allowedKeys = [
    'buyerCompany',
    'buyerContact',
    'buyerPhone',
    'buyerAddress',
    'buyerSigner',
  ]
  return allowedKeys.reduce((output, key) => {
    const value = normalizeText(source?.[key])
    if (value) {
      output[key] = value
    }
    return output
  }, {})
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
  items = [],
  { printTemplateDefaults = {} } = {}
) {
  const contractNo = normalizeText(order.outsourcing_order_no)
  const supplierSnapshot =
    order.supplier_snapshot && typeof order.supplier_snapshot === 'object'
      ? order.supplier_snapshot
      : {}
  const supplierName =
    normalizeText(supplierSnapshot.name) ||
    normalizeText(supplierSnapshot.short_name)
  const draft = createBlankProcessingContractDraft()
  const sourceOrderNo = normalizeText(order.source_order_no)
  const activeItems = (Array.isArray(items) ? items : []).filter(
    (item) => !isCanceledBusinessLineStatus(item?.line_status)
  )

  return {
    ...draft,
    contractNo,
    supplierName,
    supplierContact: normalizeText(supplierSnapshot.contact_name),
    supplierPhone:
      normalizeText(supplierSnapshot.contact_phone) ||
      normalizeText(supplierSnapshot.contact_mobile),
    supplierAddress: normalizeText(supplierSnapshot.address),
    ...processingPrintPartyDefaults(printTemplateDefaults),
    ...processingContractPartySnapshot(order),
    orderDateText: formatProcessingDraftDate(order.order_date),
    returnDateText: formatProcessingDraftDate(order.expected_return_date),
    buyerSignDateText: formatProcessingDraftDate(order.order_date),
    lines: activeItems.map((item) => {
      const subjectType = normalizeText(item.subject_type).toUpperCase()
      const productSubject = subjectType === 'PRODUCT'
      const materialSubject = subjectType === 'MATERIAL'
      return normalizeProcessingLine({
        contractNo,
        productOrderNo:
          (productSubject
            ? normalizeText(item.product_order_no_snapshot)
            : '') || sourceOrderNo,
        productNo: materialSubject
          ? normalizeText(item.material_code_snapshot)
          : productSubject
            ? [
                normalizeText(item.product_no_snapshot),
                normalizeText(item.sku_code_snapshot),
              ]
                .filter(Boolean)
                .join(' / ')
            : '',
        productName: materialSubject
          ? normalizeText(item.material_name_snapshot)
          : productSubject
            ? normalizeText(item.product_name_snapshot)
            : '',
        processName: normalizeText(item.process_name_snapshot),
        processCategory: normalizeText(item.process_category_snapshot),
        supplierAlias: supplierName,
        unit: normalizeText(item.unit_name_snapshot),
        quantity: normalizeText(item.outsourcing_quantity),
        unitPrice: normalizeText(item.unit_price),
        amount: normalizeText(item.amount),
        remark: normalizeText(item.note),
      })
    }),
  }
}
