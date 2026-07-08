import {
  COLOR_CARD_TEMPLATE_KEY,
  MATERIAL_DETAIL_COLUMNS,
  MATERIAL_DETAIL_TEMPLATE_KEY,
  WORK_INSTRUCTION_TEMPLATE_KEY,
  WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
  WORK_INSTRUCTION_ROW_TYPES,
  createEmptyEngineeringImageSlot,
  createEngineeringPrintDraft,
  engineeringImageSlots,
  normalizeWorkInstructionRowType,
} from '../data/engineeringPrintTemplates.mjs'
import {
  applyTableCellMerge,
  findRowMergeAtLine,
  shiftMergesAfterDelete,
  shiftMergesAfterInsert,
  splitTableCellMerge,
} from './detailCellMerge.mjs'

export const ENGINEERING_PRINT_LIMITS = Object.freeze({
  materialRows: 80,
  colorBlocks: 24,
  colorBlockLines: 80,
  instructionRows: 80,
  instructionSectionRows: 20,
  instructionRowImages: 8,
})

const MATERIAL_DETAIL_COLUMN_KEYS = MATERIAL_DETAIL_COLUMNS.map(
  (column) => column.key
)

const toText = (value) =>
  String(value ?? '')
    .replaceAll('\r', '')
    .trim()

function clampInsertIndex(length, selectedIndex, position = 'after') {
  if (position === 'append') {
    return length
  }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
    return length
  }
  const nextIndex = position === 'before' ? selectedIndex : selectedIndex + 1
  return Math.max(0, Math.min(length, nextIndex))
}

function removeAtLeastOne(items, selectedIndex) {
  if (!Array.isArray(items) || items.length <= 1) {
    return { ok: false, message: '至少保留一行。' }
  }
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= items.length
  ) {
    return { ok: false, message: '请先选择要移除的行。' }
  }
  const nextItems = items.filter((_, index) => index !== selectedIndex)
  return {
    ok: true,
    items: nextItems,
    selectedIndex: Math.min(selectedIndex, nextItems.length - 1),
  }
}

export function createBlankMaterialDetailLine() {
  return {
    category: '',
    materialName: '',
    vendorCode: '',
    spec: '',
    color: '',
    unit: '',
    position: '',
    pieces: '',
    unitUsage: '',
    lossRate: '',
    totalUsage: '',
    processBase: '',
    processMethod: '',
    remark: '',
  }
}

function normalizeMaterialDetailLineForEditor(line = {}) {
  return Object.keys(createBlankMaterialDetailLine()).reduce((state, key) => {
    state[key] = toText(line[key])
    return state
  }, {})
}

export function createBlankColorCardLine() {
  return {
    position: '',
    method: '',
  }
}

export function createBlankColorCardBlock(lineCount = 3, side = '') {
  const normalizedLineCount = Math.max(1, lineCount)
  return {
    materialName: '',
    vendor: '厂商：',
    side: side === 'right' || side === 'left' ? side : '',
    minRows: normalizedLineCount,
    lines: Array.from(
      { length: normalizedLineCount },
      createBlankColorCardLine
    ),
  }
}

export function createBlankInstructionRow(no = '') {
  return {
    type: WORK_INSTRUCTION_ROW_TYPES.step,
    no: toText(no),
    text: '',
    heightMm: WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    fontSizePt: null,
    imageAreaHeightMm: null,
    imageNotes: {
      left: '',
      right: '',
    },
    imageCallouts: [],
    imageLabels: [],
    images: [],
  }
}

function hasInstructionRowVisibleText(row = {}) {
  return Boolean(toText(row.text))
}

function hasInstructionRowImagesOrAnnotations(row = {}) {
  const imageAreaHeightMm = Number(row.imageAreaHeightMm)
  return (
    (Number.isFinite(imageAreaHeightMm) && imageAreaHeightMm > 0) ||
    (Array.isArray(row.images) && row.images.some((image) => image?.dataURL)) ||
    (Array.isArray(row.imageCallouts) && row.imageCallouts.length > 0) ||
    (Array.isArray(row.imageLabels) && row.imageLabels.length > 0) ||
    Boolean(toText(row.imageNotes?.left) || toText(row.imageNotes?.right))
  )
}

function getInstructionTextRowLayout(row = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return null
  }
  if (
    !hasInstructionRowVisibleText(row) ||
    hasInstructionRowImagesOrAnnotations(row)
  ) {
    return null
  }
  const heightMm = Number(row.heightMm)
  const fontSizePt = Number(row.fontSizePt)
  return {
    heightMm:
      Number.isFinite(heightMm) && heightMm > 0
        ? heightMm
        : WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    fontSizePt:
      Number.isFinite(fontSizePt) && fontSizePt > 0 ? fontSizePt : null,
  }
}

function createBlankInstructionRowFromNeighbor(no, rows = [], insertIndex = 0) {
  const previousLayout = getInstructionTextRowLayout(rows[insertIndex - 1])
  const nextLayout = getInstructionTextRowLayout(rows[insertIndex])
  const layout = previousLayout || nextLayout
  return {
    ...createBlankInstructionRow(no),
    heightMm: layout?.heightMm ?? WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
    fontSizePt: layout?.fontSizePt ?? null,
  }
}

export function createBlankInstructionSectionRow() {
  return {
    text: '',
    heightMm: null,
    images: [],
  }
}

function createBlankInstructionSectionRowFromNeighbor(
  rows = [],
  insertIndex = 0
) {
  const previousLayout = getInstructionTextRowLayout(rows[insertIndex - 1])
  const nextLayout = getInstructionTextRowLayout(rows[insertIndex])
  const layout = previousLayout || nextLayout
  return {
    ...createBlankInstructionSectionRow(),
    heightMm: layout?.heightMm ?? null,
  }
}

function renumberInstructionRows(rows = []) {
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

function normalizeInstructionRowType(type) {
  return normalizeWorkInstructionRowType(type)
}

function applyInstructionRowTypeToRow(row, type) {
  const source = row && typeof row === 'object' ? row : {}
  const normalizedType = normalizeInstructionRowType(type)
  const nextRow = {
    ...source,
    type: normalizedType,
    heightMm:
      Number(source?.heightMm) > 0
        ? source.heightMm
        : WORK_INSTRUCTION_DEFAULT_ROW_HEIGHT_MM,
  }
  if (normalizedType === WORK_INSTRUCTION_ROW_TYPES.step) {
    return nextRow
  }
  return {
    ...nextRow,
    no: '',
    fontSizePt: null,
    imageAreaHeightMm: null,
    imageNotes: { left: '', right: '' },
    imageCallouts: [],
    imageLabels: [],
    images: [],
  }
}

function getColorCardBlockSide(block) {
  return block?.side === 'left' || block?.side === 'right' ? block.side : ''
}

function getPositiveInteger(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.floor(numberValue)
    : 0
}

function getColorCardVisibleLineCount(block, lines = []) {
  return Math.max(1, lines.length, getPositiveInteger(block?.minRows))
}

export function createBlankEngineeringDraft(templateKey) {
  if (templateKey === MATERIAL_DETAIL_TEMPLATE_KEY) {
    return createEngineeringPrintDraft(templateKey, {
      companyName: '',
      productNo: '',
      orderNo: '',
      productName: '',
      quantityText: '',
      spareText: '',
      dateText: '',
      designer: '',
      maker: '',
      auditor: '',
      hairDirection: '',
      topRemark: '',
      lines: [createBlankMaterialDetailLine()],
      columnLabels: MATERIAL_DETAIL_COLUMNS.map((column) => column.label),
      merges: [],
      footerCells: Array.from({ length: 8 }, () => ''),
      images: Object.fromEntries(
        engineeringImageSlots.materialDetail.map((slot) => [
          slot.key,
          createEmptyEngineeringImageSlot(),
        ])
      ),
    })
  }

  if (templateKey === COLOR_CARD_TEMPLATE_KEY) {
    return createEngineeringPrintDraft(templateKey, {
      companyName: '',
      productNo: '',
      productName: '',
      maker: '',
      dateText: '',
      auditor: '',
      reviewer: '',
      blocks: [createBlankColorCardBlock()],
    })
  }

  if (templateKey === WORK_INSTRUCTION_TEMPLATE_KEY) {
    return createEngineeringPrintDraft(templateKey, {
      companyName: '',
      productNo: '',
      versionText: '',
      processName: '',
      department: '',
      maker: '',
      designer: '',
      auditor: '',
      orderNo: '',
      productName: '',
      rows: Array.from({ length: 8 }, (_, index) =>
        createBlankInstructionRow(String(index + 1))
      ),
      continuationPages: [],
      images: Object.fromEntries(
        engineeringImageSlots.workInstruction.map((slot) => [
          slot.key,
          createEmptyEngineeringImageSlot(),
        ])
      ),
    })
  }

  return {}
}

export function setInstructionRowType(draft, selectedIndex, type) {
  const rows = Array.isArray(draft?.rows) ? draft.rows : []
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= rows.length
  ) {
    return { ok: false, message: '请先选择要调整的行。' }
  }
  const normalizedType = normalizeInstructionRowType(type)
  return {
    ok: true,
    draft: {
      ...draft,
      rows: renumberInstructionRows(
        rows.map((row, index) =>
          index === selectedIndex
            ? applyInstructionRowTypeToRow(row, normalizedType)
            : row
        )
      ),
    },
    selectedIndex,
    message:
      normalizedType === WORK_INSTRUCTION_ROW_TYPES.title
        ? '已设为标题行。'
        : normalizedType === WORK_INSTRUCTION_ROW_TYPES.text
          ? '已设为文本行。'
          : '已设为编号行。',
  }
}

export function setContinuationInstructionRowType(
  draft,
  pageIndex,
  selectedIndex,
  type
) {
  const pages = Array.isArray(draft?.continuationPages)
    ? draft.continuationPages
    : []
  const page = pages[pageIndex]
  if (!page) {
    return { ok: false, message: '请先选择作业指导书续页。' }
  }
  const rows = Array.isArray(page.rows) ? page.rows : []
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= rows.length
  ) {
    return { ok: false, message: '请先选择要调整的行。' }
  }
  const normalizedType = normalizeInstructionRowType(type)
  return {
    ok: true,
    draft: {
      ...draft,
      continuationPages: pages.map((item, index) =>
        index === pageIndex
          ? {
              ...item,
              rows: renumberInstructionRows(
                rows.map((row, rowIndex) =>
                  rowIndex === selectedIndex
                    ? applyInstructionRowTypeToRow(row, normalizedType)
                    : row
                )
              ),
            }
          : item
      ),
    },
    selectedIndex,
    message: '已调整当前续页行类型。',
  }
}

export function insertMaterialDetailLine(
  draft,
  selectedIndex,
  position = 'after'
) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : []
  if (lines.length >= ENGINEERING_PRINT_LIMITS.materialRows) {
    return {
      ok: false,
      message: `物料明细最多支持 ${ENGINEERING_PRINT_LIMITS.materialRows} 行。`,
    }
  }
  const selectedMerge = findRowMergeAtLine(draft?.merges, selectedIndex)
  const insertIndex =
    position === 'append'
      ? lines.length
      : selectedMerge
        ? position === 'before'
          ? selectedMerge.rowStart
          : selectedMerge.rowEnd + 1
        : clampInsertIndex(lines.length, selectedIndex, position)
  const nextLines = [...lines]
  nextLines.splice(insertIndex, 0, createBlankMaterialDetailLine())
  return {
    ok: true,
    draft: {
      ...draft,
      lines: nextLines,
      merges: shiftMergesAfterInsert(draft?.merges, insertIndex),
    },
    selectedIndex: insertIndex,
    message: `已在第 ${insertIndex + 1} 行插入空白物料行。`,
  }
}

export function removeMaterialDetailLine(draft, selectedIndex) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : []
  if (lines.length <= 1) {
    return { ok: false, message: '至少保留一行。' }
  }
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= lines.length
  ) {
    return { ok: false, message: '请先选择要移除的行。' }
  }
  const selectedMerge = findRowMergeAtLine(draft?.merges, selectedIndex)
  const deleteStart = selectedMerge ? selectedMerge.rowStart : selectedIndex
  const deleteEnd = selectedMerge ? selectedMerge.rowEnd : selectedIndex
  const nextLines = lines.filter(
    (_, index) => index < deleteStart || index > deleteEnd
  )
  return {
    ok: true,
    draft: {
      ...draft,
      lines: nextLines.length ? nextLines : [createBlankMaterialDetailLine()],
      merges: shiftMergesAfterDelete(draft?.merges, deleteStart, deleteEnd),
    },
    selectedIndex: Math.max(0, Math.min(deleteStart, nextLines.length - 1)),
    message:
      deleteStart === deleteEnd
        ? '已移除当前物料行。'
        : `已移除第 ${deleteStart + 1} - ${deleteEnd + 1} 行合并块。`,
  }
}

export const applyMaterialDetailCellMerge = ({
  lines = [],
  merges = [],
  selection,
}) =>
  applyTableCellMerge({
    lines,
    merges,
    selection,
    columnKeys: MATERIAL_DETAIL_COLUMN_KEYS,
    cloneLine: normalizeMaterialDetailLineForEditor,
    normalizeLine: normalizeMaterialDetailLineForEditor,
  })

export const splitMaterialDetailCellMerge = ({ merges, rowIndex, colIndex }) =>
  splitTableCellMerge({ merges, rowIndex, colIndex })

export function insertColorCardBlock(draft, selectedIndex, position = 'after') {
  const blocks = Array.isArray(draft?.blocks) ? draft.blocks : []
  if (blocks.length >= ENGINEERING_PRINT_LIMITS.colorBlocks) {
    return {
      ok: false,
      message: `色卡最多支持 ${ENGINEERING_PRINT_LIMITS.colorBlocks} 个物料块。`,
    }
  }
  const insertIndex = clampInsertIndex(blocks.length, selectedIndex, position)
  const nextBlocks = [...blocks]
  const selectedBlock = blocks[selectedIndex]
  nextBlocks.splice(
    insertIndex,
    0,
    createBlankColorCardBlock(3, selectedBlock?.side)
  )
  return {
    ok: true,
    draft: { ...draft, blocks: nextBlocks },
    selectedIndex: insertIndex,
    message: `已在第 ${insertIndex + 1} 个位置插入色卡块。`,
  }
}

export function removeColorCardBlock(draft, selectedIndex) {
  const blocks = Array.isArray(draft?.blocks) ? draft.blocks : []
  const selectedSide = getColorCardBlockSide(blocks[selectedIndex])
  if (
    selectedSide &&
    blocks.filter((block) => getColorCardBlockSide(block) === selectedSide)
      .length <= 1
  ) {
    return {
      ok: false,
      message: '色卡左右栏各至少保留一个物料块。',
    }
  }
  const result = removeAtLeastOne(draft?.blocks, selectedIndex)
  if (!result.ok) return result
  return {
    ok: true,
    draft: { ...draft, blocks: result.items },
    selectedIndex: result.selectedIndex,
    message: '已移除当前色卡块。',
  }
}

export function insertColorCardLine(
  draft,
  blockIndex,
  lineIndex,
  position = 'after'
) {
  const blocks = Array.isArray(draft?.blocks) ? draft.blocks : []
  const block = blocks[blockIndex]
  if (!block) {
    return { ok: false, message: '请先选择色卡块。' }
  }
  const lines = Array.isArray(block.lines) ? block.lines : []
  const visibleLineCount = getColorCardVisibleLineCount(block, lines)
  if (
    lines.length >= ENGINEERING_PRINT_LIMITS.colorBlockLines ||
    visibleLineCount >= ENGINEERING_PRINT_LIMITS.colorBlockLines
  ) {
    return {
      ok: false,
      message: `每个色卡块最多支持 ${ENGINEERING_PRINT_LIMITS.colorBlockLines} 行。`,
    }
  }
  const selectedVisibleIndex =
    Number.isInteger(lineIndex) && lineIndex >= 0
      ? Math.min(lineIndex, visibleLineCount - 1)
      : null
  const isPlaceholderLine =
    selectedVisibleIndex !== null && selectedVisibleIndex >= lines.length
  const insertIndex = isPlaceholderLine
    ? position === 'before'
      ? selectedVisibleIndex
      : selectedVisibleIndex + 1
    : clampInsertIndex(lines.length, lineIndex, position)
  const nextLines = [...lines]
  while (nextLines.length < insertIndex) {
    nextLines.push(createBlankColorCardLine())
  }
  nextLines.splice(insertIndex, 0, createBlankColorCardLine())
  return {
    ok: true,
    draft: {
      ...draft,
      blocks: blocks.map((item, index) =>
        index === blockIndex
          ? {
              ...item,
              minRows: Math.max(visibleLineCount + 1, nextLines.length),
              lines: nextLines,
            }
          : item
      ),
    },
    selectedBlockIndex: blockIndex,
    selectedLineIndex: insertIndex,
    message: `已在色卡块第 ${insertIndex + 1} 行插入空白行。`,
  }
}

export function removeColorCardLine(draft, blockIndex, lineIndex) {
  const blocks = Array.isArray(draft?.blocks) ? draft.blocks : []
  const block = blocks[blockIndex]
  if (!block) {
    return { ok: false, message: '请先选择色卡块。' }
  }
  const result = removeAtLeastOne(block.lines, lineIndex)
  if (!result.ok) return result
  const currentVisibleLineCount = getColorCardVisibleLineCount(
    block,
    block.lines
  )
  const currentMinRows = getPositiveInteger(block.minRows)
  const nextMinRows =
    currentMinRows > 0
      ? Math.max(1, result.items.length, currentVisibleLineCount - 1)
      : block.minRows
  return {
    ok: true,
    draft: {
      ...draft,
      blocks: blocks.map((item, index) =>
        index === blockIndex
          ? { ...item, minRows: nextMinRows, lines: result.items }
          : item
      ),
    },
    selectedBlockIndex: blockIndex,
    selectedLineIndex: result.selectedIndex,
    message: '已移除当前色卡行。',
  }
}

export function insertInstructionRow(draft, selectedIndex, position = 'after') {
  const rows = Array.isArray(draft?.rows) ? draft.rows : []
  if (rows.length >= ENGINEERING_PRINT_LIMITS.instructionRows) {
    return {
      ok: false,
      message: `作业指导书最多支持 ${ENGINEERING_PRINT_LIMITS.instructionRows} 个作业行。`,
    }
  }
  const insertIndex = clampInsertIndex(rows.length, selectedIndex, position)
  const nextRows = [...rows]
  nextRows.splice(
    insertIndex,
    0,
    createBlankInstructionRowFromNeighbor(
      String(insertIndex + 1),
      rows,
      insertIndex
    )
  )
  return {
    ok: true,
    draft: { ...draft, rows: renumberInstructionRows(nextRows) },
    selectedIndex: insertIndex,
    message: `已在第 ${insertIndex + 1} 行插入空白作业行。`,
  }
}

export function insertContinuationInstructionRow(
  draft,
  pageIndex,
  selectedIndex,
  position = 'after'
) {
  const pages = Array.isArray(draft?.continuationPages)
    ? draft.continuationPages
    : []
  const page = pages[pageIndex]
  const rows = Array.isArray(page?.rows) ? page.rows : []
  if (!page) {
    return { ok: false, message: '请先选择作业指导书续页。' }
  }
  if (rows.length >= ENGINEERING_PRINT_LIMITS.instructionRows) {
    return {
      ok: false,
      message: `作业指导书每页最多支持 ${ENGINEERING_PRINT_LIMITS.instructionRows} 个作业行。`,
    }
  }
  const insertIndex = clampInsertIndex(rows.length, selectedIndex, position)
  const nextRows = [...rows]
  nextRows.splice(
    insertIndex,
    0,
    createBlankInstructionRowFromNeighbor(
      String(insertIndex + 1),
      rows,
      insertIndex
    )
  )
  return {
    ok: true,
    draft: {
      ...draft,
      continuationPages: pages.map((item, index) =>
        index === pageIndex
          ? { ...item, rows: renumberInstructionRows(nextRows) }
          : item
      ),
    },
    selectedIndex: insertIndex,
    message: `已在续页 ${pageIndex + 1} 第 ${insertIndex + 1} 行插入空白作业行。`,
  }
}

export function removeInstructionRow(draft, selectedIndex) {
  const result = removeAtLeastOne(draft?.rows, selectedIndex)
  if (!result.ok) return result
  return {
    ok: true,
    draft: { ...draft, rows: renumberInstructionRows(result.items) },
    selectedIndex: result.selectedIndex,
    message: '已移除当前作业行。',
  }
}

export function removeContinuationInstructionRow(
  draft,
  pageIndex,
  selectedIndex
) {
  const pages = Array.isArray(draft?.continuationPages)
    ? draft.continuationPages
    : []
  const page = pages[pageIndex]
  if (!page) {
    return { ok: false, message: '请先选择作业指导书续页。' }
  }
  const result = removeAtLeastOne(page.rows, selectedIndex)
  if (!result.ok) return result
  return {
    ok: true,
    draft: {
      ...draft,
      continuationPages: pages.map((item, index) =>
        index === pageIndex
          ? { ...item, rows: renumberInstructionRows(result.items) }
          : item
      ),
    },
    selectedIndex: result.selectedIndex,
    message: '已移除当前续页作业行。',
  }
}

export function insertInstructionSectionRow(
  draft,
  sectionKey,
  selectedIndex,
  position = 'after'
) {
  const rows = Array.isArray(draft?.[sectionKey]) ? draft[sectionKey] : []
  if (rows.length >= ENGINEERING_PRINT_LIMITS.instructionSectionRows) {
    return {
      ok: false,
      message: `当前段落最多支持 ${ENGINEERING_PRINT_LIMITS.instructionSectionRows} 行。`,
    }
  }
  const insertIndex = clampInsertIndex(rows.length, selectedIndex, position)
  const nextRows = [...rows]
  nextRows.splice(
    insertIndex,
    0,
    createBlankInstructionSectionRowFromNeighbor(rows, insertIndex)
  )
  return {
    ok: true,
    draft: { ...draft, [sectionKey]: nextRows },
    selectedIndex: insertIndex,
    message: `已在段落第 ${insertIndex + 1} 行插入空白行。`,
  }
}

export function removeInstructionSectionRow(draft, sectionKey, selectedIndex) {
  const result = removeAtLeastOne(draft?.[sectionKey], selectedIndex)
  if (!result.ok) return result
  return {
    ok: true,
    draft: { ...draft, [sectionKey]: result.items },
    selectedIndex: result.selectedIndex,
    message: '已移除当前段落行。',
  }
}

export function addInstructionRowImage(draft, rowIndex) {
  const rows = Array.isArray(draft?.rows) ? draft.rows : []
  const row = rows[rowIndex]
  if (!row) {
    return { ok: false, message: '请先选择行。' }
  }
  if (row.type && row.type !== WORK_INSTRUCTION_ROW_TYPES.step) {
    return { ok: false, message: '图片只能添加到编号行。' }
  }
  const images = Array.isArray(row.images) ? row.images : []
  if (images.length >= ENGINEERING_PRINT_LIMITS.instructionRowImages) {
    return {
      ok: false,
      message: `每个作业行最多支持 ${ENGINEERING_PRINT_LIMITS.instructionRowImages} 张图片。`,
    }
  }
  return {
    ok: true,
    draft: {
      ...draft,
      rows: rows.map((item, index) =>
        index === rowIndex
          ? { ...item, images: [...images, createEmptyEngineeringImageSlot()] }
          : item
      ),
    },
    message: '已添加作业行图片槽。',
  }
}

export function removeInstructionRowImageSlot(draft, rowIndex, imageIndex) {
  const rows = Array.isArray(draft?.rows) ? draft.rows : []
  const row = rows[rowIndex]
  if (!row) {
    return { ok: false, message: '请先选择行。' }
  }
  const images = Array.isArray(row.images) ? row.images : []
  if (
    !Number.isInteger(imageIndex) ||
    imageIndex < 0 ||
    imageIndex >= images.length
  ) {
    return { ok: false, message: '请先选择要移除的图片槽。' }
  }
  return {
    ok: true,
    draft: {
      ...draft,
      rows: rows.map((item, index) =>
        index === rowIndex
          ? {
              ...item,
              images: images.filter(
                (_, currentIndex) => currentIndex !== imageIndex
              ),
            }
          : item
      ),
    },
    message: '已移除当前行图片槽。',
  }
}
