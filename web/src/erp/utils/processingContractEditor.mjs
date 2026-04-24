import {
  createEmptyProcessingLine,
  normalizeProcessingAmountDraft,
  normalizeProcessingAmountText,
  normalizeProcessingLine,
  resolveComputedProcessingLineAmount,
  PROCESSING_CONTRACT_TABLE_COLUMNS,
} from '../data/processingContractTemplate.mjs'
import {
  applyTableCellMerge,
  findRowMergeAtLine,
  shiftMergesAfterDelete,
  shiftMergesAfterInsert,
  splitTableCellMerge,
} from './detailCellMerge.mjs'

export const PROCESSING_CONTRACT_MAX_ROWS = 300
const PROCESSING_DETAIL_COLUMN_KEYS = PROCESSING_CONTRACT_TABLE_COLUMNS.map(
  (column) => column.fieldKey
)

const toRawLineText = (value) => String(value ?? '').replaceAll('\r', '')

export const updateProcessingContractLineCell = (
  lines,
  rowIndex,
  columnKey,
  rawValue,
  { amountInputPhase = 'commit' } = {}
) =>
  (Array.isArray(lines) ? lines : []).map((line, index) => {
    if (index !== rowIndex) {
      return line
    }

    const nextLine = {
      ...line,
      [columnKey]: toRawLineText(rawValue),
    }

    if (columnKey === 'amount') {
      nextLine.amount =
        amountInputPhase === 'input'
          ? normalizeProcessingAmountDraft(rawValue)
          : normalizeProcessingAmountText(rawValue)
      return nextLine
    }

    if (columnKey === 'quantity' || columnKey === 'unitPrice') {
      const previousComputedAmount = resolveComputedProcessingLineAmount(line)
      const currentAmountText = normalizeProcessingAmountText(line?.amount)
      const nextComputedAmount = resolveComputedProcessingLineAmount(nextLine)

      if (!currentAmountText || currentAmountText === previousComputedAmount) {
        nextLine.amount = nextComputedAmount
      }
      return nextLine
    }

    return nextLine
  })

export const insertProcessingContractLine = ({
  lines = [],
  merges = [],
  selectedLineIndex,
  position = 'after',
}) => {
  const safeLines = Array.isArray(lines) ? lines : []
  if (!Number.isInteger(selectedLineIndex) || selectedLineIndex < 0) {
    return {
      ok: false,
      message: '请先点“选择明细行”，再在明细表里点中目标行。',
    }
  }

  if (safeLines.length >= PROCESSING_CONTRACT_MAX_ROWS) {
    return {
      ok: false,
      message: `加工合同明细最多支持 ${PROCESSING_CONTRACT_MAX_ROWS} 行，请先删减后再插入。`,
    }
  }

  const clampedIndex = Math.min(selectedLineIndex, safeLines.length - 1)
  const targetMerge = findRowMergeAtLine(merges, clampedIndex)
  const insertIndex =
    position === 'before'
      ? Math.max(0, targetMerge ? targetMerge.rowStart : clampedIndex)
      : Math.min(
          targetMerge ? targetMerge.rowEnd + 1 : clampedIndex + 1,
          safeLines.length
        )
  const nextLines = [...safeLines]
  nextLines.splice(
    insertIndex,
    0,
    normalizeProcessingLine(createEmptyProcessingLine())
  )

  return {
    ok: true,
    lines: nextLines,
    merges: shiftMergesAfterInsert(merges, insertIndex),
    selectedLineIndex: insertIndex,
    message: `已在第 ${insertIndex + 1} 行${position === 'before' ? '上方' : '下方'}插入空白行。`,
  }
}

export const deleteProcessingContractLine = ({
  lines = [],
  merges = [],
  selectedLineIndex,
}) => {
  const safeLines = Array.isArray(lines) ? lines : []
  if (!Number.isInteger(selectedLineIndex) || selectedLineIndex < 0) {
    return {
      ok: false,
      message: '请先点“选择明细行”，再在明细表里点中目标行。',
    }
  }

  if (safeLines.length <= 1) {
    return {
      ok: true,
      lines: [normalizeProcessingLine(createEmptyProcessingLine())],
      merges: [],
      selectedLineIndex: 0,
      message: '当前只剩 1 行，已重置为空白行。',
    }
  }

  const targetIndex = Math.min(selectedLineIndex, safeLines.length - 1)
  const rowMerge = findRowMergeAtLine(merges, targetIndex)
  const deleteStart = rowMerge ? rowMerge.rowStart : targetIndex
  const deleteEnd = rowMerge ? rowMerge.rowEnd : targetIndex
  const nextLines = safeLines.filter(
    (_, index) => index < deleteStart || index > deleteEnd
  )

  return {
    ok: true,
    lines:
      nextLines.length > 0
        ? nextLines
        : [normalizeProcessingLine(createEmptyProcessingLine())],
    merges: shiftMergesAfterDelete(merges, deleteStart, deleteEnd),
    selectedLineIndex:
      nextLines.length > 0
        ? Math.max(0, Math.min(deleteStart, nextLines.length - 1))
        : 0,
    message:
      deleteStart === deleteEnd
        ? `已删除第 ${deleteStart + 1} 行。`
        : `已删除第 ${deleteStart + 1} - ${deleteEnd + 1} 行合并块。`,
  }
}

export const applyProcessingDetailCellMerge = ({
  lines = [],
  merges = [],
  selection,
}) =>
  applyTableCellMerge({
    lines,
    merges,
    selection,
    columnKeys: PROCESSING_DETAIL_COLUMN_KEYS,
    cloneLine: normalizeProcessingLine,
    normalizeLine: normalizeProcessingLine,
  })

export const splitProcessingDetailCellMerge = ({
  merges,
  rowIndex,
  colIndex,
}) => splitTableCellMerge({ merges, rowIndex, colIndex })
