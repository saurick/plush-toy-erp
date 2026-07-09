export const MATERIAL_DETAIL_TEMPLATE_KEY = 'engineering-material-detail'
export const COLOR_CARD_TEMPLATE_KEY = 'engineering-color-card'
export const WORK_INSTRUCTION_TEMPLATE_KEY = 'engineering-work-instruction'

export const engineeringPrintTemplateKeys = new Set([
  MATERIAL_DETAIL_TEMPLATE_KEY,
  COLOR_CARD_TEMPLATE_KEY,
  WORK_INSTRUCTION_TEMPLATE_KEY,
])

export const WORK_INSTRUCTION_ROW_TYPES = Object.freeze({
  title: 'title',
  step: 'step',
  text: 'text',
})

const WORK_INSTRUCTION_TEXT_ROW_TYPE_ALIASES = new Set([
  WORK_INSTRUCTION_ROW_TYPES.text,
  'note',
  'remark',
])

export const WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM = 11.6

const WORK_INSTRUCTION_LEGACY_BODY_KEYS = [
  'cuttingTitle',
  'cuttingRows',
  'embroideryTitle',
  'embroideryRows',
  'sewingTitle',
  'sewingIntroRows',
  'sewingNote',
  'remark',
]

export const MATERIAL_DETAIL_COLUMNS = [
  { key: 'category', label: '材料类别' },
  { key: 'materialName', label: '物料名称' },
  { key: 'vendorCode', label: '厂商料号' },
  { key: 'spec', label: '规格' },
  { key: 'color', label: '颜色' },
  { key: 'unit', label: '单位' },
  { key: 'position', label: '组装部位' },
  { key: 'pieces', label: '片数' },
  { key: 'unitUsage', label: '单位用量' },
  { key: 'lossRate', label: '损耗%' },
  { key: 'totalUsage', label: '总用量\n含损耗' },
  { key: 'processBase', label: '加工方式' },
  { key: 'processMethod', label: '加工方式' },
  { key: 'remark', label: '备注:共25251#纸样/色卡' },
]

const DEFAULT_MATERIAL_DETAIL_COLUMN_LABELS = MATERIAL_DETAIL_COLUMNS.map(
  (column) => column.label
)

const toText = (value) =>
  String(value ?? '')
    .replaceAll('\r', '')
    .trim()

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key)

const textWithDefault = (object, key, fallback = '') =>
  hasOwn(object, key) ? toText(object[key]) : toText(fallback)

function compactTextParts(parts = [], separator = ' / ') {
  const seen = new Set()
  return (Array.isArray(parts) ? parts : [])
    .map(toText)
    .filter(Boolean)
    .filter((part) => {
      if (seen.has(part)) return false
      seen.add(part)
      return true
    })
    .join(separator)
}

const todayText = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
}

const dateTextFromUnix = (value) => {
  const numberValue = Number(value || 0)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return ''
  const date = new Date(numberValue * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export const engineeringImageSlots = {
  materialDetail: [
    { key: 'header_left', label: '右上产品图 1' },
    { key: 'header_right', label: '右上产品图 2' },
    { key: 'footer_left', label: '底部补充图 1' },
    { key: 'footer_right', label: '底部补充图 2' },
  ],
  workInstruction: [{ key: 'header', label: '右上产品图' }],
}

export function createEmptyEngineeringImageSlot() {
  return {
    name: '',
    dataURL: '',
    mimeType: '',
    crop: null,
    layout: null,
  }
}

function normalizeImageCrop(crop = null) {
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) {
    return null
  }
  const left = Number(crop.left ?? crop.l ?? 0)
  const top = Number(crop.top ?? crop.t ?? 0)
  const right = Number(crop.right ?? crop.r ?? 0)
  const bottom = Number(crop.bottom ?? crop.b ?? 0)
  const width = 100 - left - right
  const height = 100 - top - bottom
  if (
    ![left, top, right, bottom, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  if (left === 0 && top === 0 && right === 0 && bottom === 0) {
    return null
  }
  return { left, top, right, bottom }
}

function normalizeImageLayout(layout = null) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    return null
  }
  const x = Number(layout.x)
  const y = Number(layout.y)
  const width = Number(layout.width)
  const height = Number(layout.height)
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { x, y, width, height }
}

function normalizeImageMap(raw = {}, slots = []) {
  return Object.fromEntries(
    slots.map((slot) => {
      const source = raw?.[slot.key] || {}
      return [
        slot.key,
        {
          ...createEmptyEngineeringImageSlot(),
          name: toText(source.name),
          dataURL: toText(source.dataURL),
          mimeType: toText(source.mimeType),
          crop: normalizeImageCrop(source.crop),
          layout: normalizeImageLayout(source.layout),
        },
      ]
    })
  )
}

function normalizeRuntimeSampleImage(image = {}) {
  const dataURL = toText(image.dataURL || image.url)
  if (!dataURL) {
    return null
  }
  const fallbackName = dataURL.split('/').filter(Boolean).at(-1) || ''
  return {
    ...createEmptyEngineeringImageSlot(),
    name: toText(image.name) || fallbackName,
    dataURL,
    mimeType: toText(image.mimeType),
    crop: normalizeImageCrop(image.crop),
    layout: normalizeImageLayout(image.layout),
  }
}

function applyWorkInstructionRuntimeDraftPatch(draft = {}, sample = {}) {
  const patch = sample?.draftPatch
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return draft
  }
  return createEngineeringPrintDraft(WORK_INSTRUCTION_TEMPLATE_KEY, {
    ...draft,
    ...patch,
    images: draft.images,
  })
}

function applyWorkInstructionRuntimeSample(draft = {}, sample = {}) {
  if (!sample || typeof sample !== 'object') {
    return draft
  }

  let nextDraft = applyWorkInstructionRuntimeDraftPatch(draft, sample)
  const headerImage = normalizeRuntimeSampleImage(sample.headerImage)
  if (headerImage) {
    nextDraft = {
      ...nextDraft,
      images: {
        ...(nextDraft.images || {}),
        header: headerImage,
      },
    }
  }

  const rowImages = Array.isArray(sample.rowImages) ? sample.rowImages : []
  if (!rowImages.length) {
    return nextDraft
  }

  const mainRows = Array.isArray(nextDraft.rows) ? [...nextDraft.rows] : []
  const continuationPages = Array.isArray(nextDraft.continuationPages)
    ? nextDraft.continuationPages.map((page) => ({
        ...page,
        rows: Array.isArray(page.rows) ? [...page.rows] : [],
      }))
    : []

  rowImages.forEach((assignment = {}) => {
    const rowIndex = Number(assignment.rowIndex)
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      return
    }
    const images = (Array.isArray(assignment.images) ? assignment.images : [])
      .map(normalizeRuntimeSampleImage)
      .filter(Boolean)
    if (!images.length) {
      return
    }

    const hasContinuationPageIndex =
      assignment.pageIndex !== null &&
      assignment.pageIndex !== undefined &&
      assignment.pageIndex !== ''
    const pageIndex = hasContinuationPageIndex
      ? Number(assignment.pageIndex)
      : Number.NaN
    if (
      hasContinuationPageIndex &&
      Number.isInteger(pageIndex) &&
      pageIndex >= 0
    ) {
      const page = continuationPages[pageIndex]
      if (!page || !page.rows[rowIndex]) {
        return
      }
      page.rows[rowIndex] = {
        ...page.rows[rowIndex],
        images,
      }
      return
    }

    if (!mainRows[rowIndex]) {
      return
    }
    mainRows[rowIndex] = {
      ...mainRows[rowIndex],
      images,
    }
  })

  return {
    ...nextDraft,
    rows: mainRows,
    continuationPages,
  }
}

export function applyEngineeringPrintRuntimeSample(
  templateKey,
  draft = {},
  sample = {}
) {
  if (templateKey === WORK_INSTRUCTION_TEMPLATE_KEY) {
    return applyWorkInstructionRuntimeSample(draft, sample)
  }
  return draft
}

function normalizeMaterialDetailLine(line = {}) {
  return {
    category: toText(line.category),
    materialName: toText(line.materialName),
    vendorCode: toText(line.vendorCode),
    spec: toText(line.spec),
    color: toText(line.color),
    unit: toText(line.unit),
    position: toText(line.position),
    pieces: toText(line.pieces),
    unitUsage: toText(line.unitUsage),
    lossRate: toText(line.lossRate),
    totalUsage: toText(line.totalUsage),
    processBase: toText(line.processBase),
    processMethod: toText(line.processMethod),
    remark: toText(line.remark),
  }
}

function normalizeMaterialDetailColumnLabels(labels = []) {
  const source = Array.isArray(labels) ? labels : []
  return MATERIAL_DETAIL_COLUMNS.map((column, index) =>
    toText(source[index] ?? column.label)
  )
}

function normalizeMaterialDetailMerges(merges = []) {
  return (Array.isArray(merges) ? merges : [])
    .map((merge = {}) => {
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
        return null
      }
      return {
        id:
          toText(merge.id) ||
          `material_merge_${rowStart}_${rowEnd}_${colStart}_${colEnd}`,
        rowStart,
        rowEnd,
        colStart,
        colEnd,
      }
    })
    .filter(Boolean)
}

function normalizeColorCardBlock(block = {}) {
  const minRows = Number(block.minRows)
  const side = block.side === 'right' || block.side === 'left' ? block.side : ''
  return {
    materialName: toText(block.materialName),
    vendor: toText(block.vendor),
    side,
    minRows:
      Number.isFinite(minRows) && minRows > 0 ? Math.floor(minRows) : null,
    lines: (Array.isArray(block.lines) ? block.lines : [])
      .map((line) => ({
        position: toText(line.position),
        method: toText(line.method),
      }))
      .filter((line) => line.position || line.method),
  }
}

function normalizeHeightMm(value, { min = 4, max = 240 } = {}) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null
  return Math.min(max, Math.max(min, numberValue))
}

function normalizeFontSizePt(value, { min = 6, max = 36 } = {}) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null
  return Math.min(max, Math.max(min, numberValue))
}

function normalizeInstructionTextRow(row = {}) {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    return {
      text: toText(row.text),
      heightMm: normalizeHeightMm(row.heightMm, { min: 4, max: 80 }),
    }
  }
  return {
    text: toText(row),
    heightMm: null,
  }
}

export function normalizeWorkInstructionRowType(type) {
  if (type === WORK_INSTRUCTION_ROW_TYPES.title) {
    return WORK_INSTRUCTION_ROW_TYPES.title
  }
  if (type === WORK_INSTRUCTION_ROW_TYPES.step) {
    return WORK_INSTRUCTION_ROW_TYPES.step
  }
  if (WORK_INSTRUCTION_TEXT_ROW_TYPE_ALIASES.has(type)) {
    return WORK_INSTRUCTION_ROW_TYPES.text
  }
  return WORK_INSTRUCTION_ROW_TYPES.step
}

function normalizeWorkInstructionBodyRow(row = {}, index = 0) {
  const source =
    row && typeof row === 'object' && !Array.isArray(row) ? row : { text: row }
  const type = normalizeWorkInstructionRowType(source.type)
  const normalizedRow = normalizeInstructionRow(source, index)
  const fallbackHeight =
    normalizedRow.heightMm ?? WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM
  return {
    ...normalizedRow,
    type,
    no: type === WORK_INSTRUCTION_ROW_TYPES.step ? normalizedRow.no : '',
    heightMm: fallbackHeight,
  }
}

function renumberWorkInstructionBodyRows(rows = []) {
  let stepNo = 1
  return rows.map((row) => {
    const type = normalizeWorkInstructionRowType(row?.type)
    if (type === WORK_INSTRUCTION_ROW_TYPES.step) {
      return { ...row, type, no: String(stepNo++) }
    }
    stepNo = 1
    return { ...row, type, no: '' }
  })
}

function compactWorkInstructionLegacyRows(input = {}, fallback = {}) {
  const rows = []
  const pushTitle = (title) => {
    const text = toText(title)
    if (!text) return
    rows.push({
      type: WORK_INSTRUCTION_ROW_TYPES.title,
      text,
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    })
  }
  const pushTextRows = (sourceRows = []) => {
    const textRows = Array.isArray(sourceRows) ? sourceRows : []
    textRows.forEach((row) => {
      const normalized = normalizeInstructionTextRow(row)
      if (!normalized.text) return
      rows.push({
        type: WORK_INSTRUCTION_ROW_TYPES.step,
        no: '',
        text: normalized.text,
        heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
      })
    })
  }
  const pushNote = (text) => {
    const value = toText(text)
    if (!value) return
    rows.push({
      type: WORK_INSTRUCTION_ROW_TYPES.text,
      text: value,
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    })
  }
  const pushSteps = (sourceRows = []) => {
    const stepRows = Array.isArray(sourceRows) ? sourceRows : []
    stepRows.forEach((row, index) => {
      const normalized = normalizeInstructionRow(row, index)
      if (
        !normalized.text &&
        !normalized.images.some((image) => image.dataURL)
      ) {
        return
      }
      const hasImage = normalized.images.some((image) => image.dataURL)
      rows.push({
        ...normalized,
        type: WORK_INSTRUCTION_ROW_TYPES.step,
        heightMm: hasImage
          ? (normalized.heightMm ?? WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM)
          : WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
      })
    })
  }
  const pushRemark = (text) => {
    const value = toText(text)
    if (!value) return
    rows.push({
      type: WORK_INSTRUCTION_ROW_TYPES.text,
      text: value,
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    })
  }

  pushTitle(
    hasOwn(input, 'cuttingTitle') ? input.cuttingTitle : fallback.cuttingTitle,
    hasOwn(input, 'cuttingTitleHeightMm')
      ? normalizeHeightMm(input.cuttingTitleHeightMm, { min: 4, max: 40 })
      : fallback.cuttingTitleHeightMm
  )
  pushTextRows(
    hasOwn(input, 'cuttingRows') ? input.cuttingRows : fallback.cuttingRows
  )
  pushTitle(
    hasOwn(input, 'embroideryTitle')
      ? input.embroideryTitle
      : fallback.embroideryTitle,
    hasOwn(input, 'embroideryTitleHeightMm')
      ? normalizeHeightMm(input.embroideryTitleHeightMm, { min: 4, max: 40 })
      : fallback.embroideryTitleHeightMm
  )
  pushTextRows(
    hasOwn(input, 'embroideryRows')
      ? input.embroideryRows
      : fallback.embroideryRows
  )
  pushTitle(
    hasOwn(input, 'sewingTitle') ? input.sewingTitle : fallback.sewingTitle,
    hasOwn(input, 'sewingTitleHeightMm')
      ? normalizeHeightMm(input.sewingTitleHeightMm, { min: 4, max: 40 })
      : fallback.sewingTitleHeightMm
  )
  pushTextRows(
    hasOwn(input, 'sewingIntroRows')
      ? input.sewingIntroRows
      : fallback.sewingIntroRows
  )
  pushNote(
    hasOwn(input, 'sewingNote') ? input.sewingNote : fallback.sewingNote,
    hasOwn(input, 'sewingNoteHeightMm')
      ? normalizeHeightMm(input.sewingNoteHeightMm, { min: 4, max: 80 })
      : fallback.sewingNoteHeightMm
  )
  pushSteps(hasOwn(input, 'rows') ? input.rows : fallback.rows)
  pushRemark(hasOwn(input, 'remark') ? input.remark : fallback.remark)

  return renumberWorkInstructionBodyRows(
    rows.length
      ? rows.map(normalizeWorkInstructionBodyRow)
      : [
          {
            type: WORK_INSTRUCTION_ROW_TYPES.step,
            no: '1',
            text: '',
            heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
          },
        ].map(normalizeWorkInstructionBodyRow)
  )
}

function hasWorkInstructionLegacyBodyFields(input = {}) {
  return WORK_INSTRUCTION_LEGACY_BODY_KEYS.some((key) => hasOwn(input, key))
}

function normalizeWorkInstructionPage(page = {}) {
  const sourceHeaderRowHeights = Array.isArray(page.headerRowHeightsMm)
    ? page.headerRowHeightsMm
    : DEFAULT_WORK_INSTRUCTION_SAMPLE.headerRowHeightsMm
  const sourceRows = hasOwn(page, 'bodyRows')
    ? page.bodyRows
    : hasOwn(page, 'rows') &&
        Array.isArray(page.rows) &&
        page.rows.some((row) => row?.type)
      ? page.rows
      : compactWorkInstructionLegacyRows(page, {})
  return {
    companyName: textWithDefault(
      page,
      'companyName',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.companyName
    ),
    productNo: textWithDefault(
      page,
      'productNo',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.productNo
    ),
    versionText: toText(page.versionText),
    processName: textWithDefault(
      page,
      'processName',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.processName
    ),
    department: textWithDefault(
      page,
      'department',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.department
    ),
    maker: textWithDefault(
      page,
      'maker',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.maker
    ),
    designer: textWithDefault(
      page,
      'designer',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.designer
    ),
    auditor: textWithDefault(
      page,
      'auditor',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.auditor
    ),
    orderNo: toText(page.orderNo),
    productName: textWithDefault(
      page,
      'productName',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.productName
    ),
    headerRowHeightsMm: sourceHeaderRowHeights.map((height) =>
      normalizeHeightMm(height, { min: 4, max: 40 })
    ),
    noticeText: toText(page.noticeText),
    noticeHeightMm: normalizeHeightMm(page.noticeHeightMm, { min: 4, max: 80 }),
    rows: renumberWorkInstructionBodyRows(
      sourceRows.map(normalizeWorkInstructionBodyRow)
    ),
    showHeader: page.showHeader !== false,
  }
}

function normalizeInstructionRow(row = {}, index = 0) {
  const images = Array.isArray(row.images) ? row.images : []
  const imageCallouts = Array.isArray(row.imageCallouts)
    ? row.imageCallouts
    : []
  const imageLabels = Array.isArray(row.imageLabels) ? row.imageLabels : []
  const heightMm = normalizeHeightMm(row.heightMm, { min: 6, max: 240 })
  const imageAreaHeightMm = normalizeHeightMm(row.imageAreaHeightMm, {
    min: 24,
    max: 240,
  })
  const hasImageNotes =
    Boolean(toText(row.imageNotes?.left)) ||
    Boolean(toText(row.imageNotes?.right))
  const hasMeasurementAnnotations = !hasImageNotes && imageLabels.length > 0
  return {
    no: toText(row.no || index + 1),
    text: toText(row.text),
    heightMm: heightMm ?? (hasMeasurementAnnotations ? 216 : null),
    fontSizePt: normalizeFontSizePt(row.fontSizePt),
    imageAreaHeightMm:
      imageAreaHeightMm ?? (hasMeasurementAnnotations ? 190 : null),
    imageNotes: {
      left: toText(row.imageNotes?.left),
      right: toText(row.imageNotes?.right),
    },
    imageCallouts: imageCallouts
      .map((callout = {}) => ({
        x1: Number(callout.x1),
        y1: Number(callout.y1),
        x2: Number(callout.x2),
        y2: Number(callout.y2),
        color: toText(callout.color) || '#2563eb',
        arrow: callout.arrow === true,
      }))
      .filter(
        (callout) =>
          Number.isFinite(callout.x1) &&
          Number.isFinite(callout.y1) &&
          Number.isFinite(callout.x2) &&
          Number.isFinite(callout.y2)
      ),
    imageLabels: imageLabels
      .map((label = {}) => {
        const x = Number(label.x)
        const y = Number(label.y)
        const width = Number(label.width)
        return {
          x,
          y,
          width: Number.isFinite(width) && width > 0 ? width : 18,
          text: toText(label.text),
          tone: label.tone === 'blue-fill' ? 'blue-fill' : 'white',
          color: toText(label.color) || '#ef4444',
        }
      })
      .filter(
        (label) =>
          Number.isFinite(label.x) && Number.isFinite(label.y) && label.text
      ),
    images: images.map((image) => ({
      ...createEmptyEngineeringImageSlot(),
      name: toText(image?.name),
      dataURL: toText(image?.dataURL),
      mimeType: toText(image?.mimeType),
      crop: normalizeImageCrop(image?.crop),
      layout: normalizeImageLayout(image?.layout),
    })),
  }
}

export const DEFAULT_MATERIAL_DETAIL_SAMPLE = {
  companyName: '本公司',
  productNo: '26204#',
  orderNo: 'XH260401',
  productName: '示例毛绒产品-黑色',
  quantityText: '5122',
  spareText: '含备品 30',
  dateText: '2026-04-20',
  designer: '设计师',
  maker: '制表人',
  auditor: '审核人',
  hairDirection: '单方向',
  topRemark: '备注：共用纸样 / 色卡',
  lines: [
    {
      category: '面料',
      materialName: '黑色毛绒',
      vendorCode: '客供',
      spec: '51"',
      unit: 'Y',
      position: '脸*1',
      unitUsage: '0.008',
      lossRate: '10',
      totalUsage: '47.64',
      processBase: '布底贴12g纸朴',
      processMethod: '热裁',
      remark: '',
    },
    {
      category: '面料',
      materialName: '灰色 T/C 布',
      vendorCode: '示例厂商',
      spec: '58"',
      unit: 'Y',
      position: '背带*2',
      unitUsage: '0.006',
      lossRate: '10',
      totalUsage: '33.32',
      processBase: '',
      processMethod: '激光',
      remark: '',
    },
    {
      category: '胶件',
      materialName: '水晶眼',
      vendorCode: '客供',
      spec: '10.5mm',
      unit: 'PCS',
      position: '眼*2',
      unitUsage: '2',
      totalUsage: '10244',
      processBase: '',
      processMethod: '',
      remark: '眼 / 介子 / 贴纸配套',
    },
  ],
  columnLabels: DEFAULT_MATERIAL_DETAIL_COLUMN_LABELS,
  merges: [],
}

export const DEFAULT_COLOR_CARD_SAMPLE = {
  companyName: '本公司',
  productNo: '26204#',
  productName: '抱抱猴子-黑色',
  maker: '张勇',
  dateText: '2025-11-11',
  auditor: '审核人',
  reviewer: '复核人',
  blocks: [
    {
      materialName: '51" 灰色毛绒',
      vendor: '厂商：客供',
      side: 'left',
      minRows: 5,
      lines: [
        { position: '脸*1', method: '热裁 -1' },
        { position: '后头*2', method: '热裁 -1' },
        { position: '前身*1', method: '热裁 -1' },
      ],
    },
    {
      materialName: '51" 黄色毛绒',
      vendor: '厂商：客供',
      side: 'left',
      minRows: 5,
      lines: [
        { position: '脸*1', method: '热裁 -2' },
        { position: '后头*2', method: '热裁 -2' },
        { position: '前身*1', method: '热裁 -2' },
      ],
    },
    {
      materialName: '58" 黄色T/C 布',
      vendor: '厂商：旭辉X10#',
      side: 'right',
      minRows: 5,
      lines: [
        { position: '背带*2', method: '激光 -2' },
        { position: '前内里*1', method: '激光 -2' },
      ],
    },
    {
      materialName: 'ø10.5mm水晶眼（见样板）',
      vendor: '厂商：客供',
      side: 'right',
      minRows: 5,
      lines: [
        { position: '眼*2', method: '眼/介子/贴纸配套' },
        { position: '', method: '.-1-2-3用' },
      ],
    },
  ],
}

export const DEFAULT_WORK_INSTRUCTION_SAMPLE = {
  companyName: '本公司',
  productNo: '25251#',
  versionText: '',
  processName: '车缝',
  department: '生产部 / 品质部',
  maker: '制表人',
  designer: '设计师',
  auditor: '审核人',
  orderNo: '',
  productName: '示例毛绒产品-头部',
  headerRowHeightsMm: [8.5, 8.5, 8.5, 8.5, 8.5, 8.5],
  rows: [
    {
      type: WORK_INSTRUCTION_ROW_TYPES.title,
      text: '裁床',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.step,
      no: '1',
      text: '核对资料 / 物料 / 色卡 / 样版 / 刀模，确保正确。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.step,
      no: '2',
      text: '拉布前先松布 8-12 小时，作详细拉布记录并及时反馈异常。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.title,
      text: '刺绣 / 印花',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.step,
      no: '1',
      text: '按签样签收，核对颜色、位置、大小、走向和印花方向。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.title,
      text: '车缝',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.text,
      text: '注：车缝止口均匀，头车 5mm 止口。用 604# 配色线。打折拖圆顺，进出针倒针牢固。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.step,
      no: '1',
      text: '面打折：折位对齐打折，打折拖圆顺，不可起角。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.step,
      no: '5',
      text: '头下面折边：向内折边并压明线。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
    {
      type: WORK_INSTRUCTION_ROW_TYPES.text,
      text: '备注：如有不明或不详处，请参照样板或详询板房。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    },
  ],
  continuationPages: [],
}

export function createMaterialDetailDraft(input = {}) {
  const sourceLines = hasOwn(input, 'lines')
    ? Array.isArray(input.lines)
      ? input.lines
      : []
    : DEFAULT_MATERIAL_DETAIL_SAMPLE.lines
  return {
    ...DEFAULT_MATERIAL_DETAIL_SAMPLE,
    ...input,
    companyName: textWithDefault(
      input,
      'companyName',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.companyName
    ),
    productNo: textWithDefault(
      input,
      'productNo',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.productNo
    ),
    orderNo: textWithDefault(
      input,
      'orderNo',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.orderNo
    ),
    productName: textWithDefault(
      input,
      'productName',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.productName
    ),
    quantityText: textWithDefault(
      input,
      'quantityText',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.quantityText
    ),
    spareText: textWithDefault(
      input,
      'spareText',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.spareText
    ),
    dateText: textWithDefault(
      input,
      'dateText',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.dateText
    ),
    designer: textWithDefault(
      input,
      'designer',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.designer
    ),
    maker: textWithDefault(
      input,
      'maker',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.maker
    ),
    auditor: textWithDefault(
      input,
      'auditor',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.auditor
    ),
    hairDirection: textWithDefault(
      input,
      'hairDirection',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.hairDirection
    ),
    topRemark: textWithDefault(
      input,
      'topRemark',
      DEFAULT_MATERIAL_DETAIL_SAMPLE.topRemark
    ),
    lines: sourceLines.map(normalizeMaterialDetailLine),
    columnLabels: normalizeMaterialDetailColumnLabels(input.columnLabels),
    merges: normalizeMaterialDetailMerges(input.merges),
    images: normalizeImageMap(
      input.images,
      engineeringImageSlots.materialDetail
    ),
  }
}

export function createColorCardDraft(input = {}) {
  const sourceBlocks = hasOwn(input, 'blocks')
    ? Array.isArray(input.blocks)
      ? input.blocks
      : []
    : DEFAULT_COLOR_CARD_SAMPLE.blocks

  return {
    ...DEFAULT_COLOR_CARD_SAMPLE,
    ...input,
    companyName: textWithDefault(
      input,
      'companyName',
      DEFAULT_COLOR_CARD_SAMPLE.companyName
    ),
    productNo: textWithDefault(
      input,
      'productNo',
      DEFAULT_COLOR_CARD_SAMPLE.productNo
    ),
    productName: textWithDefault(
      input,
      'productName',
      DEFAULT_COLOR_CARD_SAMPLE.productName
    ),
    maker: textWithDefault(input, 'maker', DEFAULT_COLOR_CARD_SAMPLE.maker),
    dateText: textWithDefault(
      input,
      'dateText',
      DEFAULT_COLOR_CARD_SAMPLE.dateText
    ),
    auditor: textWithDefault(
      input,
      'auditor',
      DEFAULT_COLOR_CARD_SAMPLE.auditor
    ),
    reviewer: textWithDefault(
      input,
      'reviewer',
      DEFAULT_COLOR_CARD_SAMPLE.reviewer
    ),
    blocks: sourceBlocks.map(normalizeColorCardBlock),
  }
}

export function createWorkInstructionDraft(input = {}) {
  const sourceRows =
    hasOwn(input, 'bodyRows') && Array.isArray(input.bodyRows)
      ? input.bodyRows
      : hasOwn(input, 'rows') &&
          Array.isArray(input.rows) &&
          input.rows.some((row) => row?.type)
        ? input.rows
        : hasOwn(input, 'rows') && !hasOwn(input, 'bodyRows')
          ? compactWorkInstructionLegacyRows(input, {})
          : hasWorkInstructionLegacyBodyFields(input)
            ? compactWorkInstructionLegacyRows(input, {})
            : DEFAULT_WORK_INSTRUCTION_SAMPLE.rows
  const sourceHeaderRowHeights = hasOwn(input, 'headerRowHeightsMm')
    ? Array.isArray(input.headerRowHeightsMm)
      ? input.headerRowHeightsMm
      : []
    : DEFAULT_WORK_INSTRUCTION_SAMPLE.headerRowHeightsMm
  const sourceContinuationPages = hasOwn(input, 'continuationPages')
    ? Array.isArray(input.continuationPages)
      ? input.continuationPages
      : []
    : DEFAULT_WORK_INSTRUCTION_SAMPLE.continuationPages

  return {
    ...DEFAULT_WORK_INSTRUCTION_SAMPLE,
    ...input,
    companyName: textWithDefault(
      input,
      'companyName',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.companyName
    ),
    productNo: textWithDefault(
      input,
      'productNo',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.productNo
    ),
    versionText: textWithDefault(
      input,
      'versionText',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.versionText
    ),
    processName: textWithDefault(
      input,
      'processName',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.processName
    ),
    department: textWithDefault(
      input,
      'department',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.department
    ),
    maker: textWithDefault(
      input,
      'maker',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.maker
    ),
    designer: textWithDefault(
      input,
      'designer',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.designer
    ),
    auditor: textWithDefault(
      input,
      'auditor',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.auditor
    ),
    orderNo: textWithDefault(
      input,
      'orderNo',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.orderNo
    ),
    productName: textWithDefault(
      input,
      'productName',
      DEFAULT_WORK_INSTRUCTION_SAMPLE.productName
    ),
    headerRowHeightsMm: sourceHeaderRowHeights.map((height) =>
      normalizeHeightMm(height, { min: 4, max: 40 })
    ),
    rows: renumberWorkInstructionBodyRows(
      sourceRows.map(normalizeWorkInstructionBodyRow)
    ),
    continuationPages: sourceContinuationPages.map(
      normalizeWorkInstructionPage
    ),
    images: normalizeImageMap(
      input.images,
      engineeringImageSlots.workInstruction
    ),
  }
}

export function createEngineeringPrintDraft(templateKey, input = {}) {
  if (templateKey === MATERIAL_DETAIL_TEMPLATE_KEY) {
    return createMaterialDetailDraft(input)
  }
  if (templateKey === COLOR_CARD_TEMPLATE_KEY) {
    return createColorCardDraft(input)
  }
  if (templateKey === WORK_INSTRUCTION_TEMPLATE_KEY) {
    return createWorkInstructionDraft(input)
  }
  return {}
}

function optionLabelByID(options, id, fallback = '') {
  const targetID = Number(id || 0)
  const matched = (Array.isArray(options) ? options : []).find(
    (item) => Number(item?.value || item?.id || 0) === targetID
  )
  return toText(matched?.label || matched?.name || matched?.code || fallback)
}

function recordByID(records, id) {
  const targetID = Number(id || 0)
  if (!targetID) return null
  return (
    (Array.isArray(records) ? records : []).find(
      (item) => Number(item?.id || item?.value || 0) === targetID
    ) || null
  )
}

function sourceProductSnapshot(
  record = {},
  { productOptions = [], products = [] } = {}
) {
  const productRecord = recordByID(products, record.product_id)
  const productLabel = optionLabelByID(productOptions, record.product_id)
  const [code = '', ...nameParts] = productLabel.split(' / ')
  const productName = productRecord
    ? compactTextParts([
        productRecord.name,
        productRecord.style_no,
        productRecord.customer_style_no,
      ])
    : compactTextParts([record.product_name, nameParts.join(' / ')])
  return {
    productNo: toText(
      record.product_code || productRecord?.code || code || record.product_no
    ),
    productName: productName || toText(productLabel),
  }
}

export function buildMaterialDetailDraftFromBOMVersion(
  version = {},
  {
    productOptions = [],
    products = [],
    materials = [],
    units = [],
    companyName = '',
  } = {}
) {
  const product = sourceProductSnapshot(version, { productOptions, products })
  const materialByID = new Map(
    (Array.isArray(materials) ? materials : []).map((material) => [
      Number(material?.id || 0),
      material,
    ])
  )
  const unitByID = new Map(
    (Array.isArray(units) ? units : []).map((unit) => [
      Number(unit?.id || 0),
      unit,
    ])
  )
  const lines = (Array.isArray(version.items) ? version.items : []).map(
    (item) => {
      const material = materialByID.get(Number(item?.material_id || 0)) || {}
      const unit = unitByID.get(Number(item?.unit_id || 0)) || {}
      return normalizeMaterialDetailLine({
        category: material.category || 'BOM',
        materialName: material.name || material.code || '材料已关联',
        vendorCode:
          material.vendor_code || material.supplier_code || material.code || '',
        spec: material.spec || material.specification || '',
        color: material.color || item.color || '',
        unit: unit.name || unit.code || '',
        position: item.position || '',
        pieces: item.piece_count || item.pieceCount || '',
        unitUsage: item.quantity ?? '',
        lossRate: item.loss_rate ?? '',
        totalUsage: item.total_usage_snapshot || item.totalUsageSnapshot || '',
        processBase: item.process_base || item.processBase || '',
        processMethod: item.process_method || item.processMethod || '',
        remark: item.note || '',
      })
    }
  )

  return createMaterialDetailDraft({
    companyName,
    productNo: product.productNo,
    productName: product.productName,
    orderNo:
      version.source_order_no ||
      (version.version ? `BOM ${version.version}` : ''),
    quantityText: version.quantity_text || '',
    spareText: version.spare_text || '',
    dateText: dateTextFromUnix(version.print_date) || todayText(),
    designer: version.designer || '',
    maker: version.maker || '',
    auditor: version.auditor || '',
    hairDirection: version.hair_direction || '',
    topRemark: version.note || '',
    lines,
  })
}

export function buildColorCardDraftFromBOMVersion(
  version = {},
  { productOptions = [], products = [], materials = [], companyName = '' } = {}
) {
  const product = sourceProductSnapshot(version, { productOptions, products })
  const materialByID = new Map(
    (Array.isArray(materials) ? materials : []).map((material) => [
      Number(material?.id || 0),
      material,
    ])
  )
  const blocks = (Array.isArray(version.items) ? version.items : []).map(
    (item) => {
      const material = materialByID.get(Number(item?.material_id || 0)) || {}
      const materialIdentifier =
        material.vendor_code || material.supplier_code
          ? `厂商：${material.vendor_code || material.supplier_code}`
          : material.code
            ? `料号：${material.code}`
            : '厂商：'
      return normalizeColorCardBlock({
        materialName: compactTextParts(
          [
            material.spec || material.specification,
            material.color,
            material.name || material.code,
          ],
          ' '
        ),
        vendor: materialIdentifier,
        lines: [
          {
            position: item.position || '',
            method: compactTextParts(
              [
                item.process_base || item.processBase,
                item.process_method || item.processMethod,
                item.note,
              ],
              '；'
            ),
          },
        ],
      })
    }
  )

  return createColorCardDraft({
    companyName,
    productNo: product.productNo,
    productName: product.productName,
    maker: version.maker || '',
    dateText: dateTextFromUnix(version.print_date) || todayText(),
    auditor: version.auditor || '',
    reviewer: '',
    blocks,
  })
}

export function buildWorkInstructionDraftFromBOMVersion(
  version = {},
  {
    productOptions = [],
    products = [],
    materials = [],
    units = [],
    companyName = '',
  } = {}
) {
  const product = sourceProductSnapshot(version, { productOptions, products })
  const materialByID = new Map(
    (Array.isArray(materials) ? materials : []).map((material) => [
      Number(material?.id || 0),
      material,
    ])
  )
  const unitByID = new Map(
    (Array.isArray(units) ? units : []).map((unit) => [
      Number(unit?.id || 0),
      unit,
    ])
  )
  const activeItems = Array.isArray(version.items) ? version.items : []
  const rows = activeItems.map((item, index) => {
    const material = materialByID.get(Number(item?.material_id || 0)) || {}
    const unit = unitByID.get(Number(item?.unit_id || 0)) || {}
    const quantityText = compactTextParts(
      [item.quantity, unit.name || unit.code],
      ''
    )
    const processText = compactTextParts(
      [
        item.process_base || item.processBase,
        item.process_method || item.processMethod,
      ],
      '；'
    )
    const parts = [
      compactTextParts([material.name || material.code, item.position], ' / '),
      quantityText ? `用量：${quantityText}` : '',
      item.piece_count || item.pieceCount
        ? `片数：${item.piece_count || item.pieceCount}`
        : '',
      processText ? `加工：${processText}` : '',
      item.note ? `备注：${item.note}` : '',
    ].filter(Boolean)
    return {
      type: WORK_INSTRUCTION_ROW_TYPES.step,
      no: String(index + 1),
      text: parts.join('；') || '按 BOM 明细、签样和工程资料执行。',
      heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    }
  })
  const processName = compactTextParts(
    activeItems.flatMap((item) => [
      item.process_method || item.processMethod,
      item.process_base || item.processBase,
    ])
  )
  return createWorkInstructionDraft({
    companyName,
    productNo: product.productNo,
    productName: product.productName,
    orderNo:
      version.source_order_no ||
      (version.version ? `BOM ${version.version}` : ''),
    versionText: version.version ? `BOM ${version.version}` : '',
    processName,
    department: '生产部 / 品质部',
    maker: version.maker || '',
    designer: version.designer || '',
    auditor: version.auditor || '',
    remark: version.note || '',
    rows: rows.length ? rows : [],
  })
}

function formatWorkInstructionDate(value) {
  const raw = toText(value)
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10)
  }
  return raw
}

function isCanceledLineStatus(value) {
  const normalized = toText(value).toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

function summarizeOutsourcingInstructionItem(item = {}, index = 0) {
  const productText = compactTextParts(
    [item.product_no_snapshot, item.product_name_snapshot],
    ' / '
  )
  const quantityText = compactTextParts(
    [item.outsourcing_quantity, item.unit_name_snapshot],
    ''
  )
  const parts = [
    toText(item.process_name_snapshot)
      ? `加工项目：${toText(item.process_name_snapshot)}`
      : '',
    productText ? `产品：${productText}` : '',
    quantityText ? `数量：${quantityText}` : '',
    toText(item.note) ? `要求：${toText(item.note)}` : '',
  ].filter(Boolean)

  return {
    type: WORK_INSTRUCTION_ROW_TYPES.step,
    no: String(index + 1),
    text: parts.join('；') || '按工程资料、签样和现场确认要求执行。',
    heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
  }
}

export function buildWorkInstructionDraftFromOutsourcingOrder(
  order = {},
  items = [],
  { companyName = '' } = {}
) {
  const activeItems = (Array.isArray(items) ? items : []).filter(
    (item) => !isCanceledLineStatus(item?.line_status)
  )
  const supplierSnapshot =
    order.supplier_snapshot && typeof order.supplier_snapshot === 'object'
      ? order.supplier_snapshot
      : {}
  const supplierName =
    toText(supplierSnapshot.short_name) || toText(supplierSnapshot.name)
  const productNos = activeItems.map((item) => item.product_no_snapshot)
  const productNames = activeItems.map((item) => item.product_name_snapshot)
  const processNames = activeItems.map((item) => item.process_name_snapshot)
  const orderNo = toText(order.outsourcing_order_no)
  const sourceOrderNo = toText(order.source_order_no)
  const expectedReturnDate = formatWorkInstructionDate(
    order.expected_return_date
  )
  const contextRows = activeItems.length
    ? [
        {
          type: WORK_INSTRUCTION_ROW_TYPES.title,
          text: '外发加工信息',
          heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
        },
        ...activeItems.map(summarizeOutsourcingInstructionItem),
      ]
    : []

  return createWorkInstructionDraft({
    companyName,
    productNo: compactTextParts(productNos, ' / '),
    productName: compactTextParts(productNames, ' / '),
    versionText: expectedReturnDate ? `回货日期：${expectedReturnDate}` : '',
    processName: compactTextParts(processNames, ' / '),
    department: DEFAULT_WORK_INSTRUCTION_SAMPLE.department,
    maker: '',
    designer: '',
    auditor: '',
    orderNo: orderNo || sourceOrderNo,
    remark: compactTextParts(
      [
        supplierName ? `加工厂：${supplierName}` : '',
        sourceOrderNo ? `来源订单：${sourceOrderNo}` : '',
      ],
      '；'
    ),
    rows: contextRows,
  })
}
