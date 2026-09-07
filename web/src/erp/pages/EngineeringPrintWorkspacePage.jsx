import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import {
  PrintToolButton,
  PrintImageSlotTool,
} from '../components/print/PrintWorkspaceTools.jsx'
import usePrintWorkspaceFeedback from '../utils/usePrintWorkspaceFeedback.js'
import { getPrintOutputProblem } from '../utils/printOutputPreflight.mjs'
import { getPrintWorkspaceDraftScope } from '../utils/printWorkspaceScope.mjs'
import {
  normalizeInstructionRowTarget,
  isSameInstructionRowTarget,
  getWorkInstructionRowType,
  isWorkInstructionStepRow,
  richTextHasVisibleText,
  normalizeCalloutCoordinate,
  WorkInstructionPaper,
} from '../components/print/WorkInstructionPaper.jsx'
import { ColorCardPaper } from '../components/print/ColorCardPaper.jsx'
import { MaterialDetailPaper } from '../components/print/MaterialDetailPaper.jsx'
import {
  ATTACHMENT_ACCEPT,
  EDITABLE_CLASS,
} from '../components/print/EngineeringPrintPrimitives.jsx'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import PrintAppendixImageManager from '../components/print/PrintAppendixImages.jsx'
import PrintWorkspaceShell, {
  PrintWorkspaceToolSection,
} from '../components/print/PrintWorkspaceShell.jsx'
import WorkInstructionImageAnnotationEditor from '../components/print/WorkInstructionImageAnnotationEditor.jsx'
import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import {
  COLOR_CARD_TEMPLATE_KEY,
  MATERIAL_DETAIL_COLUMNS,
  MATERIAL_DETAIL_TEMPLATE_KEY,
  WORK_INSTRUCTION_TEMPLATE_KEY,
  WORK_INSTRUCTION_ROW_TYPES,
  createEmptyEngineeringImageSlot,
  createEngineeringPrintDraft,
  engineeringImageSlots,
  engineeringPrintTemplateKeys,
} from '../data/engineeringPrintTemplates.mjs'
import {
  PDF_ACTION_UI_STALE_TIMEOUT_MS,
  downloadPdfFromElement,
  openPdfPreviewFromElement,
  preloadPdfPreviewFromElement,
  schedulePdfPreviewWarmup,
} from '../utils/printPdf.mjs'
import {
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  buildPrintWorkspaceDraftStorageKey,
  buildRestorablePrintWorkspaceURL,
  readInitialPrintWorkspaceDraftFromWindowName,
  readPrintWorkspaceDraftSnapshot,
  resolvePrintWorkspaceDraftMode,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceStateID,
} from '../utils/printWorkspace.js'
import {
  syncPrintPageMarginForPaper,
  watchPrintPageMarginForPaper,
} from '../utils/printPageMargin.mjs'
import usePrintWorkspaceWindowState from '../utils/usePrintWorkspaceWindowState.js'
import { preparePrintWorkspaceSnapshot } from '../utils/printWorkspaceOutput.mjs'
import {
  useFlushPrintWorkspaceDraftOnPageExit,
  usePersistentPrintWorkspaceDraft,
} from '../utils/usePersistentPrintWorkspaceDraft.js'
import {
  ENGINEERING_PRINT_LIMITS,
  applyMaterialDetailCellMerge,
  createBlankEngineeringDraft,
  insertColorCardBlock,
  insertColorCardLine,
  insertContinuationInstructionRow,
  insertInstructionRow,
  insertMaterialDetailLine,
  removeColorCardBlock,
  removeColorCardLine,
  removeContinuationInstructionRow,
  removeInstructionRow,
  removeMaterialDetailLine,
  setContinuationInstructionRowType,
  setInstructionRowType,
  splitMaterialDetailCellMerge,
} from '../utils/engineeringPrintEditor.mjs'
import {
  findMergeAtCell,
  normalizeCellSelection,
} from '../utils/detailCellMerge.mjs'
import { normalizePrintAppendixImages } from '../utils/printAppendixImages.mjs'

function instructionRowTargetKey(target) {
  const normalizedTarget = normalizeInstructionRowTarget(target)
  if (!normalizedTarget) return ''
  return normalizedTarget.pageIndex === null
    ? `main-${normalizedTarget.rowIndex}`
    : `continuation-${normalizedTarget.pageIndex}-${normalizedTarget.rowIndex}`
}

function getInstructionRowsForTarget(draft, target) {
  const normalizedTarget = normalizeInstructionRowTarget(target)
  if (!normalizedTarget) return []
  if (normalizedTarget.pageIndex === null) {
    return Array.isArray(draft?.rows) ? draft.rows : []
  }
  const page = Array.isArray(draft?.continuationPages)
    ? draft.continuationPages[normalizedTarget.pageIndex]
    : null
  return Array.isArray(page?.rows) ? page.rows : []
}

function formatInstructionRowTargetLabel(target) {
  const normalizedTarget = normalizeInstructionRowTarget(target)
  if (!normalizedTarget) return ''
  if (normalizedTarget.pageIndex === null) {
    return `第 ${normalizedTarget.rowIndex + 1} 行`
  }
  return `续页 ${normalizedTarget.pageIndex + 1} 第 ${
    normalizedTarget.rowIndex + 1
  } 行`
}

function toText(value) {
  return String(value ?? '')
    .replaceAll('\r', '')
    .trim()
}

function isNodeOrAncestorRed(node) {
  let current =
    node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  while (current) {
    const color = String(
      current.style?.color || current.getAttribute?.('color') || ''
    )
      .trim()
      .toLowerCase()
    if (
      color === 'red' ||
      color === 'rgb(255, 0, 0)' ||
      color === '#ff0000' ||
      color === 'ff0000'
    ) {
      return true
    }
    if (current.classList?.contains(EDITABLE_CLASS)) return false
    current = current.parentElement
  }
  return false
}

function clearRedFromSelection(selection) {
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  const anchorElement =
    selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode?.parentElement
  const focusElement =
    selection.focusNode?.nodeType === Node.ELEMENT_NODE
      ? selection.focusNode
      : selection.focusNode?.parentElement
  const editable =
    anchorElement?.closest?.(`.${EDITABLE_CLASS}`) ||
    focusElement?.closest?.(`.${EDITABLE_CLASS}`)
  if (!editable) return

  const candidates = [
    editable,
    ...editable.querySelectorAll('span, font'),
  ].filter((node) => {
    try {
      return range.intersectsNode(node)
    } catch {
      return false
    }
  })

  candidates.forEach((node) => {
    if (!isNodeOrAncestorRed(node)) return
    node.style.color = ''
    node.removeAttribute('color')
    if (
      node.tagName?.toLowerCase() === 'span' &&
      !node.getAttribute('style') &&
      node.parentNode
    ) {
      node.replaceWith(...node.childNodes)
    }
  })
}

function selectionIntersectsRed(selection) {
  if (!selection?.rangeCount) return false
  const range = selection.getRangeAt(0)
  const anchorElement =
    selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode?.parentElement
  const focusElement =
    selection.focusNode?.nodeType === Node.ELEMENT_NODE
      ? selection.focusNode
      : selection.focusNode?.parentElement
  const editable =
    anchorElement?.closest?.(`.${EDITABLE_CLASS}`) ||
    focusElement?.closest?.(`.${EDITABLE_CLASS}`)
  if (!editable) return false
  return [...editable.querySelectorAll('span, font')].some((node) => {
    try {
      return range.intersectsNode(node) && isNodeOrAncestorRed(node)
    } catch {
      return false
    }
  })
}

function normalizeAnnotationWidth(value) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 18
  return Math.max(8, Math.min(42, numberValue))
}

function resolveInstructionMeasurementRowLayout(row = {}) {
  const hasNotes =
    richTextHasVisibleText(row.imageNotes?.left) ||
    richTextHasVisibleText(row.imageNotes?.right)
  const hasMeasurementLabels =
    Array.isArray(row.imageLabels) && row.imageLabels.length > 0
  if (hasNotes || !hasMeasurementLabels) return {}
  return {
    heightMm: row.heightMm || 216,
    imageAreaHeightMm: row.imageAreaHeightMm || 190,
  }
}

function getInstructionTextRowValue(row) {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    return String(row.text ?? '')
  }
  return String(row ?? '')
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败，请重新上传'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = () => reject(new Error('图片无法识别，请换一张重试'))
    image.onload = () => resolve(image)
    image.src = dataURL
  })
}

async function createImageSnapshot(file) {
  const fileName = toText(file?.name)
  const fileType = String(file?.type || '').toLowerCase()
  const isSVG =
    fileType === 'image/svg+xml' || fileName.toLowerCase().endsWith('.svg')
  if (!isSVG && !fileType.startsWith('image/')) {
    throw new Error('当前图片槽只支持图片格式')
  }

  const originalDataURL = await readFileAsDataURL(file)
  if (isSVG) {
    return {
      name: fileName,
      dataURL: originalDataURL,
      mimeType: fileType || 'image/svg+xml',
    }
  }

  const image = await loadImageFromDataURL(originalDataURL)
  const maxDimension = 1400
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1)
  )
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('浏览器暂不支持当前图片处理能力')
  }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return {
    name: fileName,
    dataURL: canvas.toDataURL('image/jpeg', 0.86),
    mimeType: 'image/jpeg',
  }
}

function createFallbackDraft({ templateKey, businessInput }) {
  return businessInput
    ? createEngineeringPrintDraft(templateKey, {})
    : createEngineeringPrintDraft(templateKey)
}

function loadDraft({
  templateKey,
  storageKey,
  forceFresh,
  workspaceStateID,
  businessInput,
}) {
  const fallbackDraft = createFallbackDraft({ templateKey, businessInput })
  if (typeof window === 'undefined' || forceFresh) {
    return fallbackDraft
  }

  const initialDraft = readInitialPrintWorkspaceDraftFromWindowName(
    templateKey,
    workspaceStateID
  )
  if (initialDraft) {
    return createEngineeringPrintDraft(templateKey, initialDraft)
  }

  const storedDraft = readPrintWorkspaceDraftSnapshot(storageKey)
  return storedDraft
    ? createEngineeringPrintDraft(templateKey, storedDraft)
    : fallbackDraft
}

export default function EngineeringPrintWorkspacePage() {
  const { templateKey = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { accountKey, customerKey, configRevision } =
    getPrintWorkspaceDraftScope(searchParams)
  const template = getPrintTemplateByKey(templateKey)
  const workspaceStateID = resolvePrintWorkspaceStateID(searchParams)
  const entrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const resetDraftOnOpen =
    resolvePrintWorkspaceDraftMode(searchParams) ===
    PRINT_WORKSPACE_DRAFT_MODE.FRESH
  const businessInput = entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
  const draftStorageKey = workspaceStateID
    ? buildPrintWorkspaceDraftStorageKey(templateKey, workspaceStateID, {
        customerKey,
        accountKey,
        configRevision,
      })
    : buildPrintWorkspaceDraftStorageKey(templateKey, '', {
        customerKey,
        accountKey,
        configRevision,
      })
  const workspaceURL = useMemo(() => {
    if (!workspaceStateID || typeof window === 'undefined') {
      return ''
    }
    return buildRestorablePrintWorkspaceURL(templateKey, {
      entrySource,
      customerKey,
      configRevision,
      stateID: workspaceStateID,
    })
  }, [configRevision, customerKey, entrySource, templateKey, workspaceStateID])
  const paperRef = useRef(null)
  const stageWrapRef = useRef(null)
  const pdfPreviewPreloadRef = useRef(null)
  const instructionRowImageInputRefs = useRef({})
  const [pdfAction, setPdfAction] = useState('')
  const [pdfActionStartedAt, setPdfActionStartedAt] = useState(0)
  const { feedback, reportFeedback, clearFeedback } =
    usePrintWorkspaceFeedback()
  const [draft, setDraft, flushDraft, draftRef, persistenceStatus] =
    usePersistentPrintWorkspaceDraft(
      () =>
        loadDraft({
          templateKey,
          storageKey: draftStorageKey,
          forceFresh: resetDraftOnOpen,
          workspaceStateID,
          businessInput,
        }),
      draftStorageKey
    )
  const [selectedMaterialLineIndex, setSelectedMaterialLineIndex] =
    useState(null)
  const [materialLineSelectionMode, setMaterialLineSelectionMode] =
    useState(false)
  const [materialCellSelectionMode, setMaterialCellSelectionMode] =
    useState(false)
  const [materialMergeSelectionAnchor, setMaterialMergeSelectionAnchor] =
    useState(null)
  const [materialMergeSelectionFocus, setMaterialMergeSelectionFocus] =
    useState(null)
  const [materialActiveCell, setMaterialActiveCell] = useState(null)
  const [selectedColorBlockIndex, setSelectedColorBlockIndex] = useState(null)
  const [selectedColorLine, setSelectedColorLine] = useState(null)
  const [colorBlockSelectionMode, setColorBlockSelectionMode] = useState(false)
  const [colorLineSelectionMode, setColorLineSelectionMode] = useState(false)
  const [selectedInstructionRowTarget, setSelectedInstructionRowTarget] =
    useState(null)
  const [instructionRowSelectionMode, setInstructionRowSelectionMode] =
    useState(false)
  const [
    instructionAnnotationEditorTarget,
    setInstructionAnnotationEditorTarget,
  ] = useState(null)

  useEffect(() => {
    document.title = template?.title ? `${template.title}打印窗口` : '打印窗口'
  }, [template?.title])

  useEffect(() => {
    setDraft(
      loadDraft({
        templateKey,
        storageKey: draftStorageKey,
        forceFresh: resetDraftOnOpen,
        workspaceStateID,
        businessInput,
      })
    )
    clearFeedback()
    setSelectedMaterialLineIndex(null)
    setMaterialLineSelectionMode(false)
    setMaterialCellSelectionMode(false)
    setMaterialMergeSelectionAnchor(null)
    setMaterialMergeSelectionFocus(null)
    setMaterialActiveCell(null)
    setSelectedColorBlockIndex(null)
    setSelectedColorLine(null)
    setColorBlockSelectionMode(false)
    setColorLineSelectionMode(false)
    setSelectedInstructionRowTarget(null)
    setInstructionRowSelectionMode(false)
    setInstructionAnnotationEditorTarget(null)
  }, [
    clearFeedback,
    businessInput,
    draftStorageKey,
    resetDraftOnOpen,
    setDraft,
    templateKey,
    workspaceStateID,
  ])

  useFlushPrintWorkspaceDraftOnPageExit(flushDraft)

  useEffect(() => {
    if (!paperRef.current) return undefined
    return watchPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-engineering-print-paper--continued',
    })
  }, [])

  usePrintWorkspaceWindowState({
    stateID: workspaceStateID,
    templateKey,
    workspaceURL,
  })

  useEffect(() => {
    if (!pdfAction || typeof window === 'undefined') return undefined
    const elapsed =
      Number.isFinite(pdfActionStartedAt) && pdfActionStartedAt > 0
        ? Date.now() - pdfActionStartedAt
        : PDF_ACTION_UI_STALE_TIMEOUT_MS
    const timeoutID = window.setTimeout(
      () => {
        setPdfAction('')
        setPdfActionStartedAt(0)
        reportFeedback('output', 'PDF 操作等待超时，请重新点击。', 'error')
      },
      Math.max(0, PDF_ACTION_UI_STALE_TIMEOUT_MS - elapsed)
    )
    return () => window.clearTimeout(timeoutID)
  }, [reportFeedback, pdfAction, pdfActionStartedAt])

  if (!engineeringPrintTemplateKeys.has(templateKey) || !template) {
    return <Navigate to="/erp/print-center" replace />
  }

  const pdfFileName = `${template.title}.pdf`

  const getToolbarButtonClassName = ({
    active = false,
    primary = false,
  } = {}) =>
    [
      'erp-print-shell__button',
      primary
        ? 'erp-print-shell__button--primary'
        : 'erp-print-shell__button--ghost',
      active ? 'erp-print-shell__button--active' : '',
    ]
      .filter(Boolean)
      .join(' ')

  const materialMergeSelection = normalizeCellSelection(
    materialMergeSelectionAnchor,
    materialMergeSelectionFocus
  )
  const materialActiveMerge =
    materialActiveCell != null
      ? findMergeAtCell(
          draft.merges,
          materialActiveCell.rowIndex,
          materialActiveCell.colIndex
        )
      : null
  const canApplyMaterialMerge =
    templateKey === MATERIAL_DETAIL_TEMPLATE_KEY &&
    materialCellSelectionMode &&
    materialMergeSelection &&
    (materialMergeSelection.rowStart !== materialMergeSelection.rowEnd ||
      materialMergeSelection.colStart !== materialMergeSelection.colEnd)
  const canSplitMaterialMerge =
    templateKey === MATERIAL_DETAIL_TEMPLATE_KEY &&
    materialCellSelectionMode &&
    Boolean(materialActiveMerge)

  const showEditorMessage = (area, result, fallback = '操作失败') => {
    if (!result?.ok) {
      reportFeedback(area, result?.message || fallback, 'error')
      return false
    }
    reportFeedback(area, result.message || '打印模板已更新。')
    return true
  }

  const updateInstructionRowByTarget = (current, target, updater) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return current

    if (normalizedTarget.pageIndex === null) {
      return {
        ...current,
        rows: current.rows.map((row, rowIndex) =>
          rowIndex === normalizedTarget.rowIndex ? updater(row, rowIndex) : row
        ),
      }
    }

    const pages = Array.isArray(current.continuationPages)
      ? current.continuationPages
      : []
    return {
      ...current,
      continuationPages: pages.map((page, pageIndex) => {
        if (pageIndex !== normalizedTarget.pageIndex) return page
        return {
          ...page,
          rows: (Array.isArray(page.rows) ? page.rows : []).map(
            (row, rowIndex) =>
              rowIndex === normalizedTarget.rowIndex
                ? updater(row, rowIndex)
                : row
          ),
        }
      }),
    }
  }

  const resetSelectionForTemplate = () => {
    clearFeedback()
    setSelectedMaterialLineIndex(null)
    setMaterialLineSelectionMode(false)
    setMaterialCellSelectionMode(false)
    setMaterialMergeSelectionAnchor(null)
    setMaterialMergeSelectionFocus(null)
    setMaterialActiveCell(null)
    setSelectedColorBlockIndex(null)
    setSelectedColorLine(null)
    setColorBlockSelectionMode(false)
    setColorLineSelectionMode(false)
    setSelectedInstructionRowTarget(null)
    setInstructionRowSelectionMode(false)
    setInstructionAnnotationEditorTarget(null)
  }

  const handleResetDraft = () => {
    setDraft(createEngineeringPrintDraft(templateKey))
    resetSelectionForTemplate()
    reportFeedback('draft', '已恢复样例。')
  }

  const handleBlankDraft = () => {
    setDraft(createBlankEngineeringDraft(templateKey))
    resetSelectionForTemplate()
    reportFeedback('draft', '已生成空白模板，版式和可编辑区域已保留。')
  }

  const applyMaterialLineAction = (action, position = 'after') => {
    setDraft((current) => {
      const result =
        action === 'remove'
          ? removeMaterialDetailLine(current, selectedMaterialLineIndex)
          : insertMaterialDetailLine(
              current,
              selectedMaterialLineIndex,
              position
            )
      if (!showEditorMessage('rows', result, '物料行操作失败')) return current
      setSelectedMaterialLineIndex(result.selectedIndex)
      setMaterialMergeSelectionAnchor(null)
      setMaterialMergeSelectionFocus(null)
      setMaterialActiveCell(null)
      return result.draft
    })
  }

  const toggleMaterialLineSelectionMode = () => {
    clearFeedback()
    setMaterialLineSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setMaterialCellSelectionMode(false)
        setMaterialMergeSelectionAnchor(null)
        setMaterialMergeSelectionFocus(null)
        setMaterialActiveCell(null)
      } else {
        setSelectedMaterialLineIndex(null)
      }
      return nextValue
    })
  }

  const selectMaterialLine = (rowIndex) => {
    setSelectedMaterialLineIndex(rowIndex)
    clearFeedback()
  }

  const toggleMaterialCellSelectionMode = () => {
    clearFeedback()
    setMaterialCellSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setMaterialLineSelectionMode(false)
        setSelectedMaterialLineIndex(null)
      }
      setMaterialMergeSelectionAnchor(null)
      setMaterialMergeSelectionFocus(null)
      setMaterialActiveCell(null)
      return nextValue
    })
  }

  const selectMaterialCell = (rowIndex, colIndex) => {
    clearFeedback()
    const nextCell = { rowIndex, colIndex }
    setMaterialActiveCell(nextCell)
    const currentSelection = normalizeCellSelection(
      materialMergeSelectionAnchor,
      materialMergeSelectionFocus
    )
    const hasExpandedSelection =
      currentSelection &&
      (currentSelection.rowStart !== currentSelection.rowEnd ||
        currentSelection.colStart !== currentSelection.colEnd)

    if (!materialMergeSelectionAnchor || hasExpandedSelection) {
      setMaterialMergeSelectionAnchor(nextCell)
      setMaterialMergeSelectionFocus(nextCell)
      return
    }

    setMaterialMergeSelectionFocus(nextCell)
  }

  const applyMaterialMerge = () => {
    setDraft((current) => {
      const result = applyMaterialDetailCellMerge({
        lines: current.lines,
        merges: current.merges,
        selection: materialMergeSelection,
      })
      if (!showEditorMessage('cells', result, '合并物料明细单元格失败')) {
        return current
      }
      const mergedAnchor = materialMergeSelection
        ? {
            rowIndex: materialMergeSelection.rowStart,
            colIndex: materialMergeSelection.colStart,
          }
        : null
      setMaterialActiveCell(mergedAnchor)
      setMaterialMergeSelectionAnchor(mergedAnchor)
      setMaterialMergeSelectionFocus(mergedAnchor)
      return {
        ...current,
        lines: result.lines,
        merges: result.merges,
      }
    })
  }

  const splitMaterialMerge = () => {
    setDraft((current) => {
      const result = splitMaterialDetailCellMerge({
        merges: current.merges,
        rowIndex: materialActiveCell?.rowIndex,
        colIndex: materialActiveCell?.colIndex,
      })
      if (!showEditorMessage('cells', result, '拆分物料明细单元格失败')) {
        return current
      }
      return {
        ...current,
        merges: result.merges,
      }
    })
  }

  const applyColorBlockAction = (action, position = 'after') => {
    setDraft((current) => {
      const result =
        action === 'remove'
          ? removeColorCardBlock(current, selectedColorBlockIndex)
          : insertColorCardBlock(current, selectedColorBlockIndex, position)
      if (!showEditorMessage('blocks', result, '色卡块操作失败')) return current
      setSelectedColorBlockIndex(result.selectedIndex)
      setSelectedColorLine(null)
      return result.draft
    })
  }

  const toggleColorBlockSelectionMode = () => {
    clearFeedback()
    setColorBlockSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setColorLineSelectionMode(false)
        setSelectedColorLine(null)
      } else {
        setSelectedColorBlockIndex(null)
        setSelectedColorLine(null)
      }
      return nextValue
    })
  }

  const toggleColorLineSelectionMode = () => {
    clearFeedback()
    setColorLineSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setColorBlockSelectionMode(false)
        setSelectedColorBlockIndex(null)
        setSelectedColorLine(null)
      } else {
        setSelectedColorLine(null)
      }
      return nextValue
    })
  }

  const selectColorBlock = (blockIndex) => {
    setSelectedColorBlockIndex(blockIndex)
    setSelectedColorLine(null)
    clearFeedback()
  }

  const selectColorLine = (blockIndex, lineIndex, persisted = true) => {
    setSelectedColorBlockIndex(null)
    setSelectedColorLine({ blockIndex, lineIndex, persisted })
    clearFeedback()
  }

  const applyColorLineAction = (action, position = 'after') => {
    const blockIndex = selectedColorLine?.blockIndex ?? selectedColorBlockIndex
    const lineIndex = selectedColorLine?.lineIndex ?? null
    if (action === 'remove' && selectedColorLine?.persisted === false) {
      reportFeedback(
        'rows',
        '当前空白位还不是色卡行，请先上插或下插生成空白行。',
        'error'
      )
      return
    }
    setDraft((current) => {
      const result =
        action === 'remove'
          ? removeColorCardLine(current, blockIndex, lineIndex)
          : insertColorCardLine(current, blockIndex, lineIndex, position)
      if (!showEditorMessage('rows', result, '色卡行操作失败')) return current
      setSelectedColorBlockIndex(null)
      setSelectedColorLine({
        blockIndex: result.selectedBlockIndex,
        lineIndex: result.selectedLineIndex,
        persisted: true,
      })
      return result.draft
    })
  }

  const toggleInstructionRowSelectionMode = () => {
    clearFeedback()
    setInstructionRowSelectionMode((current) => {
      const nextValue = !current
      if (!nextValue) {
        setSelectedInstructionRowTarget(null)
      }
      return nextValue
    })
  }

  const selectInstructionRow = (target) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    setSelectedInstructionRowTarget(normalizedTarget)
    clearFeedback()
  }

  const applyInstructionRowAction = (action, position = 'after') => {
    const target = normalizeInstructionRowTarget(selectedInstructionRowTarget)
    setDraft((current) => {
      if (!target) return current
      const result =
        target.pageIndex === null
          ? action === 'remove'
            ? removeInstructionRow(current, target.rowIndex)
            : insertInstructionRow(current, target.rowIndex, position)
          : action === 'remove'
            ? removeContinuationInstructionRow(
                current,
                target.pageIndex,
                target.rowIndex
              )
            : insertContinuationInstructionRow(
                current,
                target.pageIndex,
                target.rowIndex,
                position
              )
      if (!showEditorMessage('rows', result, '作业行操作失败')) return current
      setSelectedInstructionRowTarget({
        pageIndex: target.pageIndex,
        rowIndex: result.selectedIndex,
      })
      return result.draft
    })
  }

  const applySelectedWorkInstructionRowAction = (
    action,
    position = 'after'
  ) => {
    applyInstructionRowAction(action, position)
  }

  const applyInstructionRowType = (type) => {
    const target = normalizeInstructionRowTarget(selectedInstructionRowTarget)
    if (!target) return
    setDraft((current) => {
      const result =
        target.pageIndex === null
          ? setInstructionRowType(current, target.rowIndex, type)
          : setContinuationInstructionRowType(
              current,
              target.pageIndex,
              target.rowIndex,
              type
            )
      if (!showEditorMessage('rows', result, '行类型调整失败')) return current
      setSelectedInstructionRowTarget({
        pageIndex: target.pageIndex,
        rowIndex: result.selectedIndex,
      })
      return result.draft
    })
  }

  const updateField = (fieldKey, value) => {
    setDraft((current) => {
      if (fieldKey.includes('.')) {
        const [arrayKey, rawIndex] = fieldKey.split('.')
        const index = Number(rawIndex)
        if (Array.isArray(current[arrayKey]) && Number.isInteger(index)) {
          return {
            ...current,
            [arrayKey]: current[arrayKey].map((item, itemIndex) =>
              itemIndex === index
                ? item && typeof item === 'object' && !Array.isArray(item)
                  ? { ...item, text: toText(value) }
                  : toText(value)
                : item
            ),
          }
        }
      }
      return { ...current, [fieldKey]: toText(value) }
    })
  }

  const handleAppendixImagesChange = async (images) => {
    const persisted = await setDraft((current) => {
      const nextDraft = {
        ...current,
        appendixImages: normalizePrintAppendixImages(images),
      }
      return nextDraft
    })
    return !draftStorageKey || persisted
  }

  const updateMaterialColumnLabel = (columnIndex, value) => {
    setDraft((current) => {
      const labels = MATERIAL_DETAIL_COLUMNS.map(
        (column, index) => current.columnLabels?.[index] || column.label
      )
      labels[columnIndex] = toText(value)
      return { ...current, columnLabels: labels }
    })
  }

  const uploadImage = async (slotKey, file) => {
    clearFeedback()
    try {
      const snapshot = await createImageSnapshot(file)
      setDraft((current) => ({
        ...current,
        images: { ...current.images, [slotKey]: snapshot },
      }))
      reportFeedback('images', '图片已更新，打印和 PDF 会使用当前图片。')
    } catch (error) {
      reportFeedback(
        'images',
        getActionErrorMessage(error, '上传图片失败'),
        'error'
      )
    }
  }

  const clearImage = (slotKey) => {
    setDraft((current) => ({
      ...current,
      images: {
        ...current.images,
        [slotKey]: createEmptyEngineeringImageSlot(),
      },
    }))
    reportFeedback('images', '已移除图片。')
  }

  const handleInstructionRowImageUploadClick = (target) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    const row = getInstructionRowsForTarget(draft, normalizedTarget)[
      normalizedTarget.rowIndex
    ]
    if (!isWorkInstructionStepRow(row)) {
      reportFeedback('rows', '图片只能添加到编号行。', 'error')
      return
    }
    const imageCount = Array.isArray(row.images)
      ? row.images.filter((image) => image?.dataURL).length
      : 0
    if (imageCount >= ENGINEERING_PRINT_LIMITS.instructionRowImages) {
      reportFeedback(
        'rows',
        `每个作业行最多支持 ${ENGINEERING_PRINT_LIMITS.instructionRowImages} 张图片。`,
        'error'
      )
      return
    }
    setSelectedInstructionRowTarget(normalizedTarget)
    instructionRowImageInputRefs.current[
      instructionRowTargetKey(normalizedTarget)
    ]?.click()
  }

  const handleInstructionRowImageFileChange = (target, event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    uploadInstructionImages(target, files)
  }

  const uploadInstructionImages = async (target, files = []) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    const row = getInstructionRowsForTarget(draft, normalizedTarget)[
      normalizedTarget.rowIndex
    ]
    if (!isWorkInstructionStepRow(row)) {
      reportFeedback('rows', '图片只能添加到编号行。', 'error')
      return
    }
    const existingImageCount = Array.isArray(row.images)
      ? row.images.filter((image) => image?.dataURL).length
      : 0
    const remainingImageCount = Math.max(
      0,
      ENGINEERING_PRINT_LIMITS.instructionRowImages - existingImageCount
    )
    const acceptedFiles = files.slice(0, remainingImageCount)
    const omittedFileCount = files.length - acceptedFiles.length
    if (!acceptedFiles.length) {
      reportFeedback(
        'rows',
        `每个作业行最多支持 ${ENGINEERING_PRINT_LIMITS.instructionRowImages} 张图片。`,
        'error'
      )
      return
    }
    clearFeedback()
    try {
      const snapshots = []
      for (const file of acceptedFiles) {
        snapshots.push(await createImageSnapshot(file))
      }
      setDraft((current) =>
        updateInstructionRowByTarget(current, normalizedTarget, (row) => {
          const baseRow =
            row && typeof row === 'object' && !Array.isArray(row)
              ? row
              : { text: getInstructionTextRowValue(row), heightMm: null }
          const images = Array.isArray(baseRow.images)
            ? baseRow.images.filter((image) => image?.dataURL)
            : []
          return {
            ...baseRow,
            ...resolveInstructionMeasurementRowLayout(baseRow),
            images: [...images, ...snapshots],
          }
        })
      )
      reportFeedback(
        'rows',
        `图片已更新，${formatInstructionRowTargetLabel(
          normalizedTarget
        )}本次新增 ${snapshots.length} 张${
          omittedFileCount
            ? `；另 ${omittedFileCount} 张未加入（每行最多 ${ENGINEERING_PRINT_LIMITS.instructionRowImages} 张）`
            : ''
        }。`
      )
    } catch (error) {
      reportFeedback(
        'rows',
        getActionErrorMessage(error, '上传工序图片失败'),
        'error'
      )
    }
  }

  const uploadInstructionImage = async (
    targetOrSlotKey,
    file,
    imageIndex = 0
  ) => {
    if (
      typeof targetOrSlotKey === 'string' &&
      engineeringImageSlots.workInstruction.some(
        (slot) => slot.key === targetOrSlotKey
      )
    ) {
      await uploadImage(targetOrSlotKey, file)
      return
    }
    const normalizedTarget = normalizeInstructionRowTarget(targetOrSlotKey)
    if (!normalizedTarget) return
    const row = getInstructionRowsForTarget(draft, normalizedTarget)[
      normalizedTarget.rowIndex
    ]
    if (!isWorkInstructionStepRow(row)) {
      reportFeedback('rows', '图片只能添加到编号行。', 'error')
      return
    }
    clearFeedback()
    try {
      const snapshot = await createImageSnapshot(file)
      setDraft((current) =>
        updateInstructionRowByTarget(current, normalizedTarget, (row) => {
          const baseRow =
            row && typeof row === 'object' && !Array.isArray(row)
              ? row
              : { text: getInstructionTextRowValue(row), heightMm: null }
          const images = Array.isArray(baseRow.images)
            ? baseRow.images.filter((image) => image?.dataURL)
            : []
          images[imageIndex] = snapshot
          return {
            ...baseRow,
            ...resolveInstructionMeasurementRowLayout(baseRow),
            images,
          }
        })
      )
      reportFeedback('rows', '图片已更新。')
    } catch (error) {
      reportFeedback(
        'rows',
        getActionErrorMessage(error, '上传工序图片失败'),
        'error'
      )
    }
  }

  const clearInstructionImage = (targetOrSlotKey, imageIndex = 0) => {
    if (
      typeof targetOrSlotKey === 'string' &&
      engineeringImageSlots.workInstruction.some(
        (slot) => slot.key === targetOrSlotKey
      )
    ) {
      clearImage(targetOrSlotKey)
      return
    }
    const normalizedTarget = normalizeInstructionRowTarget(targetOrSlotKey)
    if (!normalizedTarget) return
    setDraft((current) =>
      updateInstructionRowByTarget(current, normalizedTarget, (row) => {
        const baseRow =
          row && typeof row === 'object' && !Array.isArray(row)
            ? row
            : { text: getInstructionTextRowValue(row), heightMm: null }
        const images = Array.isArray(baseRow.images) ? [...baseRow.images] : []
        images.splice(imageIndex, 1)
        return { ...baseRow, images }
      })
    )
    reportFeedback('rows', '已移除图片。')
  }

  const clearInstructionRowImages = (target) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    setDraft((current) =>
      updateInstructionRowByTarget(current, normalizedTarget, (row) => {
        const baseRow =
          row && typeof row === 'object' && !Array.isArray(row)
            ? row
            : { text: getInstructionTextRowValue(row), heightMm: null }
        return {
          ...baseRow,
          images: [],
        }
      })
    )
    reportFeedback(
      'rows',
      `已清空作业指导书${formatInstructionRowTargetLabel(
        normalizedTarget
      )}图片。`
    )
    if (
      isSameInstructionRowTarget(
        instructionAnnotationEditorTarget,
        normalizedTarget
      )
    ) {
      setInstructionAnnotationEditorTarget(null)
    }
  }

  const openInstructionAnnotationEditor = (target) => {
    clearFeedback()
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    const row = getInstructionRowsForTarget(draft, normalizedTarget)[
      normalizedTarget.rowIndex
    ]
    const firstImageIndex = Array.isArray(row?.images)
      ? row.images.findIndex((image) => image?.dataURL)
      : -1
    if (!isWorkInstructionStepRow(row) || firstImageIndex < 0) {
      reportFeedback('rows', '请先给当前编号行上传图片。', 'error')
      return
    }
    setInstructionAnnotationEditorTarget({
      ...normalizedTarget,
      imageIndex: firstImageIndex,
    })
  }

  const saveInstructionImageAnnotations = (nextImages = []) => {
    const target = normalizeInstructionRowTarget(
      instructionAnnotationEditorTarget
    )
    if (!target) return
    setDraft((current) =>
      updateInstructionRowByTarget(current, target, (row) => ({
        ...row,
        images: (Array.isArray(row?.images) ? row.images : []).map(
          (image, imageIndex) => ({
            ...image,
            annotations: Array.isArray(nextImages[imageIndex]?.annotations)
              ? nextImages[imageIndex].annotations
              : [],
            annotationLayout: nextImages[imageIndex]?.annotationLayout,
          })
        ),
      }))
    )
    setInstructionAnnotationEditorTarget(null)
    reportFeedback(
      'rows',
      `已保存作业指导书${formatInstructionRowTargetLabel(target)}图片标注。`
    )
  }

  const updateMaterialLine = (rowIndex, key, value) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, index) =>
        index === rowIndex ? { ...line, [key]: toText(value) } : line
      ),
    }))
  }

  const updateColorBlockField = (blockIndex, path, value) => {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) => {
        if (index !== blockIndex) return block
        if (path.startsWith('lines.')) {
          const [, rawLineIndex, key] = path.split('.')
          const lineIndex = Number(rawLineIndex)
          const nextLines = Array.isArray(block.lines) ? [...block.lines] : []
          while (nextLines.length <= lineIndex) {
            nextLines.push({ position: '', method: '' })
          }
          return {
            ...block,
            minRows: Math.max(Number(block.minRows) || 0, nextLines.length),
            lines: nextLines.map((line, currentLineIndex) =>
              currentLineIndex === lineIndex
                ? { ...line, [key]: toText(value) }
                : line
            ),
          }
        }
        return { ...block, [path]: toText(value) }
      }),
    }))
  }

  const updateInstructionRowValue = (target, key, value) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    const normalizedValue = toText(value)
    setDraft((current) =>
      updateInstructionRowByTarget(current, normalizedTarget, (row) => {
        if (key === 'images.add') {
          return {
            ...row,
            images: [...(row.images || []), value],
          }
        }
        if (key.startsWith('imageNotes.')) {
          const [, noteKey] = key.split('.')
          return {
            ...row,
            imageNotes: {
              ...(row.imageNotes || {}),
              [noteKey]: normalizedValue,
            },
          }
        }
        if (key.startsWith('imageLabels.')) {
          const [, rawLabelIndex, labelKey] = key.split('.')
          const labelIndex = Number(rawLabelIndex)
          if (!Number.isInteger(labelIndex) || !labelKey) return row
          const labels = Array.isArray(row.imageLabels)
            ? [...row.imageLabels]
            : []
          const currentLabel = labels[labelIndex]
          if (!currentLabel) return row
          const nextLabel = { ...currentLabel }
          if (['x', 'y'].includes(labelKey)) {
            nextLabel[labelKey] = normalizeCalloutCoordinate(value)
          } else if (labelKey === 'width') {
            nextLabel.width = normalizeAnnotationWidth(value)
          } else if (labelKey === 'tone') {
            nextLabel.tone =
              normalizedValue === 'blue-fill' ? 'blue-fill' : 'white'
          } else {
            nextLabel[labelKey] = normalizedValue
          }
          labels[labelIndex] = nextLabel
          return { ...row, imageLabels: labels }
        }
        if (key.startsWith('imageCallouts.')) {
          const [, rawCalloutIndex, calloutKey] = key.split('.')
          const calloutIndex = Number(rawCalloutIndex)
          if (!Number.isInteger(calloutIndex) || !calloutKey) return row
          const callouts = Array.isArray(row.imageCallouts)
            ? [...row.imageCallouts]
            : []
          const currentCallout = callouts[calloutIndex]
          if (!currentCallout) return row
          const nextCallout = { ...currentCallout }
          if (['x1', 'y1', 'x2', 'y2'].includes(calloutKey)) {
            nextCallout[calloutKey] = normalizeCalloutCoordinate(value)
          } else if (calloutKey === 'arrow') {
            nextCallout.arrow = ['true', '1', 'yes', '是'].includes(
              normalizedValue.toLowerCase()
            )
          } else {
            nextCallout[calloutKey] = normalizedValue
          }
          callouts[calloutIndex] = nextCallout
          return { ...row, imageCallouts: callouts }
        }
        return { ...row, [key]: normalizedValue }
      })
    )
  }

  const productImageSlots =
    templateKey === MATERIAL_DETAIL_TEMPLATE_KEY
      ? engineeringImageSlots.materialDetail
      : templateKey === WORK_INSTRUCTION_TEMPLATE_KEY
        ? engineeringImageSlots.workInstruction
        : []
  const panelActions = productImageSlots.length ? (
    <div className="erp-print-image-tools">
      {productImageSlots.map((slot) => (
        <PrintImageSlotTool
          key={slot.key}
          label={slot.label}
          image={draft.images?.[slot.key]}
          accept={ATTACHMENT_ACCEPT}
          onUpload={(file) => uploadImage(slot.key, file)}
          onClear={() => clearImage(slot.key)}
        />
      ))}
    </div>
  ) : null
  const appendixActions = (
    <PrintAppendixImageManager
      images={draft.appendixImages}
      onImagesChange={handleAppendixImagesChange}
      onStatusChange={(text, tone) => reportFeedback('appendix', text, tone)}
    />
  )

  const warmupPreviewPDF = () => {
    if (!paperRef.current || pdfPreviewPreloadRef.current) return
    if (getPrintOutputProblem(template, draftRef.current, paperRef.current)) {
      return
    }
    pdfPreviewPreloadRef.current = schedulePdfPreviewWarmup(
      () =>
        preloadPdfPreviewFromElement(paperRef.current, {
          title: template.title,
          fileName: pdfFileName,
          templateKey: template.key,
          customerKey,
        }),
      { delayMs: 180 }
    )
  }

  const checkOutput = () => {
    const problem = getPrintOutputProblem(
      template,
      draftRef.current,
      paperRef.current
    )
    if (!problem) return true
    reportFeedback('output', problem, 'error')
    return false
  }

  const handlePreviewPDF = async () => {
    clearFeedback()
    if (!paperRef.current) return
    try {
      setPdfAction('preview')
      setPdfActionStartedAt(Date.now())
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      pdfPreviewPreloadRef.current = null
      syncPrintPageMarginForPaper(paperRef.current, {
        stageWrapElement: stageWrapRef.current,
        paperContinuedClass: 'erp-engineering-print-paper--continued',
      })
      const opened = await openPdfPreviewFromElement(paperRef.current, {
        title: template.title,
        fileName: pdfFileName,
        templateKey: template.key,
        customerKey,
        preloaded: pdfPreviewPreloadRef.current,
      })
      pdfPreviewPreloadRef.current = null
      if (opened) reportFeedback('output', 'PDF 预览已打开。')
    } catch (error) {
      reportFeedback(
        'output',
        getActionErrorMessage(error, '打开 PDF 预览失败'),
        'error'
      )
    } finally {
      setPdfAction('')
      setPdfActionStartedAt(0)
    }
  }

  const handleDownloadPDF = async () => {
    clearFeedback()
    if (!paperRef.current) return
    try {
      setPdfAction('download')
      setPdfActionStartedAt(Date.now())
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      await downloadPdfFromElement(paperRef.current, {
        title: template.title,
        fileName: pdfFileName,
        templateKey: template.key,
        customerKey,
      })
      reportFeedback('output', 'PDF 已开始下载。')
    } catch (error) {
      reportFeedback(
        'output',
        getActionErrorMessage(error, '下载 PDF 失败'),
        'error'
      )
    } finally {
      setPdfAction('')
      setPdfActionStartedAt(0)
    }
  }

  const handlePrint = async () => {
    clearFeedback()
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      if (paperRef.current) {
        syncPrintPageMarginForPaper(paperRef.current, {
          stageWrapElement: stageWrapRef.current,
          paperContinuedClass: 'erp-engineering-print-paper--continued',
        })
      }
      window.print()
    } catch (error) {
      reportFeedback('output', getActionErrorMessage(error, '打印'), 'error')
    }
  }

  const applyRichTextCommand = (command) => {
    clearFeedback()
    if (typeof document === 'undefined') return
    if (command === 'red') {
      const selection = window.getSelection?.()
      const anchorNode = selection?.anchorNode
      const focusNode = selection?.focusNode
      const shouldClearRed =
        isNodeOrAncestorRed(anchorNode) ||
        isNodeOrAncestorRed(focusNode) ||
        selectionIntersectsRed(selection)
      if (shouldClearRed) {
        clearRedFromSelection(selection)
        return
      }
      document.execCommand('foreColor', false, 'red')
    }
  }

  const normalizedSelectedInstructionRowTarget = normalizeInstructionRowTarget(
    selectedInstructionRowTarget
  )
  const selectedWorkInstructionRowTarget =
    normalizedSelectedInstructionRowTarget
  const selectedInstructionRows = getInstructionRowsForTarget(
    draft,
    normalizedSelectedInstructionRowTarget
  )
  const selectedInstructionRow =
    normalizedSelectedInstructionRowTarget === null
      ? null
      : selectedInstructionRows[normalizedSelectedInstructionRowTarget.rowIndex]
  const selectedInstructionRowImages = Array.isArray(
    selectedInstructionRow?.images
  )
    ? selectedInstructionRow.images.filter((image) => image?.dataURL)
    : []
  const selectedInstructionRowIsStep =
    selectedInstructionRow && isWorkInstructionStepRow(selectedInstructionRow)
  const normalizedInstructionAnnotationEditorTarget =
    normalizeInstructionRowTarget(instructionAnnotationEditorTarget)
  const instructionAnnotationEditorRow =
    normalizedInstructionAnnotationEditorTarget === null
      ? null
      : getInstructionRowsForTarget(
          draft,
          normalizedInstructionAnnotationEditorTarget
        )[normalizedInstructionAnnotationEditorTarget.rowIndex]
  const instructionAnnotationEditorImages = Array.isArray(
    instructionAnnotationEditorRow?.images
  )
    ? instructionAnnotationEditorRow.images
    : []

  const templateEditorActions = (() => {
    if (templateKey === MATERIAL_DETAIL_TEMPLATE_KEY) {
      return (
        <>
          <PrintWorkspaceToolSection
            title="明细行"
            tool="rows"
            feedback={feedback?.area === 'rows' ? feedback : null}
          >
            <div className="erp-print-shell__toolbar-group">
              <PrintToolButton
                icon="select"
                wide
                type="button"
                className={getToolbarButtonClassName({
                  active: materialLineSelectionMode,
                })}
                onClick={toggleMaterialLineSelectionMode}
              >
                {materialLineSelectionMode ? '返回编辑' : '选择明细行'}
              </PrintToolButton>
              <PrintToolButton
                icon="up"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={selectedMaterialLineIndex === null}
                onClick={() => applyMaterialLineAction('insert', 'before')}
              >
                上插一行
              </PrintToolButton>
              <PrintToolButton
                icon="down"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={selectedMaterialLineIndex === null}
                onClick={() => applyMaterialLineAction('insert', 'after')}
              >
                下插一行
              </PrintToolButton>
              <PrintToolButton
                icon="remove"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                disabled={
                  selectedMaterialLineIndex === null || draft.lines.length <= 1
                }
                onClick={() => applyMaterialLineAction('remove')}
              >
                移除当前行
              </PrintToolButton>
              <span className="erp-print-shell__counter">
                物料行: {draft.lines.length}/
                {ENGINEERING_PRINT_LIMITS.materialRows}
              </span>
            </div>
          </PrintWorkspaceToolSection>
          <PrintWorkspaceToolSection
            title="单元格"
            tool="cells"
            feedback={feedback?.area === 'cells' ? feedback : null}
          >
            <div className="erp-print-shell__toolbar-group">
              <PrintToolButton
                icon="cells"
                wide
                type="button"
                className={getToolbarButtonClassName({
                  active: materialCellSelectionMode,
                })}
                onClick={toggleMaterialCellSelectionMode}
              >
                {materialCellSelectionMode ? '返回编辑' : '选择单元格'}
              </PrintToolButton>
              <PrintToolButton
                icon="merge"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={!canApplyMaterialMerge}
                onClick={applyMaterialMerge}
              >
                合并选区
              </PrintToolButton>
              <PrintToolButton
                icon="split"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={!canSplitMaterialMerge}
                onClick={splitMaterialMerge}
              >
                拆分当前
              </PrintToolButton>
            </div>
          </PrintWorkspaceToolSection>
        </>
      )
    }

    if (templateKey === COLOR_CARD_TEMPLATE_KEY) {
      return (
        <>
          <PrintWorkspaceToolSection
            title="色卡块"
            tool="blocks"
            feedback={feedback?.area === 'blocks' ? feedback : null}
          >
            <div className="erp-print-shell__toolbar-group">
              <PrintToolButton
                icon="select"
                wide
                type="button"
                className={getToolbarButtonClassName({
                  active: colorBlockSelectionMode,
                })}
                onClick={toggleColorBlockSelectionMode}
              >
                {colorBlockSelectionMode ? '返回编辑' : '选择色卡块'}
              </PrintToolButton>
              <PrintToolButton
                icon="up"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={selectedColorBlockIndex === null}
                onClick={() => applyColorBlockAction('insert', 'before')}
              >
                上插色卡块
              </PrintToolButton>
              <PrintToolButton
                icon="down"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={selectedColorBlockIndex === null}
                onClick={() => applyColorBlockAction('insert', 'after')}
              >
                下插色卡块
              </PrintToolButton>
              <PrintToolButton
                icon="remove"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                disabled={
                  selectedColorBlockIndex === null || draft.blocks.length <= 1
                }
                onClick={() => applyColorBlockAction('remove')}
              >
                移除当前块
              </PrintToolButton>
              <span className="erp-print-shell__counter">
                色卡块: {draft.blocks.length}/
                {ENGINEERING_PRINT_LIMITS.colorBlocks}
              </span>
            </div>
          </PrintWorkspaceToolSection>
          <PrintWorkspaceToolSection
            title="明细行"
            tool="rows"
            feedback={feedback?.area === 'rows' ? feedback : null}
          >
            <div className="erp-print-shell__toolbar-group">
              <PrintToolButton
                icon="select"
                wide
                type="button"
                className={getToolbarButtonClassName({
                  active: colorLineSelectionMode,
                })}
                onClick={toggleColorLineSelectionMode}
              >
                {colorLineSelectionMode ? '返回编辑' : '选择色卡行'}
              </PrintToolButton>
              <PrintToolButton
                icon="up"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={!selectedColorLine}
                onClick={() => applyColorLineAction('insert', 'before')}
              >
                上插一行
              </PrintToolButton>
              <PrintToolButton
                icon="down"
                type="button"
                className={getToolbarButtonClassName()}
                disabled={!selectedColorLine}
                onClick={() => applyColorLineAction('insert', 'after')}
              >
                下插一行
              </PrintToolButton>
              <PrintToolButton
                icon="remove"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                disabled={
                  !selectedColorLine || selectedColorLine.persisted === false
                }
                onClick={() => applyColorLineAction('remove')}
              >
                移除当前行
              </PrintToolButton>
            </div>
          </PrintWorkspaceToolSection>
        </>
      )
    }

    return (
      <PrintWorkspaceToolSection
        title="明细行"
        tool="rows"
        feedback={feedback?.area === 'rows' ? feedback : null}
      >
        <div className="erp-print-shell__toolbar-group">
          <PrintToolButton
            icon="select"
            wide
            type="button"
            className={getToolbarButtonClassName({
              active: instructionRowSelectionMode,
            })}
            onClick={toggleInstructionRowSelectionMode}
          >
            {instructionRowSelectionMode ? '返回编辑' : '选择行'}
          </PrintToolButton>
          <PrintToolButton
            icon="up"
            type="button"
            className={getToolbarButtonClassName()}
            disabled={selectedWorkInstructionRowTarget === null}
            onClick={() =>
              applySelectedWorkInstructionRowAction('insert', 'before')
            }
          >
            上插一行
          </PrintToolButton>
          <PrintToolButton
            icon="down"
            type="button"
            className={getToolbarButtonClassName()}
            disabled={selectedWorkInstructionRowTarget === null}
            onClick={() =>
              applySelectedWorkInstructionRowAction('insert', 'after')
            }
          >
            下插一行
          </PrintToolButton>
          <PrintToolButton
            icon="remove"
            wide
            type="button"
            className={getToolbarButtonClassName()}
            disabled={
              selectedWorkInstructionRowTarget === null ||
              selectedInstructionRows.length <= 1
            }
            onClick={() => applySelectedWorkInstructionRowAction('remove')}
          >
            移除当前行
          </PrintToolButton>
          {selectedInstructionRow ? (
            <>
              {[
                [WORK_INSTRUCTION_ROW_TYPES.title, '设为标题行'],
                [WORK_INSTRUCTION_ROW_TYPES.step, '设为编号行'],
                [WORK_INSTRUCTION_ROW_TYPES.text, '设为文本行'],
              ].map(([type, label]) => (
                <PrintToolButton
                  icon="text"
                  wide
                  type="button"
                  className={getToolbarButtonClassName({
                    active:
                      getWorkInstructionRowType(selectedInstructionRow) ===
                      type,
                  })}
                  disabled={selectedWorkInstructionRowTarget === null}
                  key={type}
                  onClick={() => applyInstructionRowType(type)}
                >
                  {label}
                </PrintToolButton>
              ))}
              <PrintToolButton
                icon="image"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                disabled={
                  selectedWorkInstructionRowTarget === null ||
                  !selectedInstructionRowIsStep ||
                  selectedInstructionRowImages.length >=
                    ENGINEERING_PRINT_LIMITS.instructionRowImages
                }
                title={
                  selectedInstructionRowImages.length >=
                  ENGINEERING_PRINT_LIMITS.instructionRowImages
                    ? `每个作业行最多支持 ${ENGINEERING_PRINT_LIMITS.instructionRowImages} 张图片`
                    : undefined
                }
                onClick={() =>
                  handleInstructionRowImageUploadClick(
                    selectedWorkInstructionRowTarget
                  )
                }
              >
                给当前行加图
              </PrintToolButton>
              <PrintToolButton
                icon="remove"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                disabled={
                  selectedWorkInstructionRowTarget === null ||
                  !selectedInstructionRowIsStep ||
                  selectedInstructionRowImages.length === 0
                }
                onClick={() =>
                  clearInstructionRowImages(selectedWorkInstructionRowTarget)
                }
              >
                清空当前行图片
              </PrintToolButton>
              <PrintToolButton
                icon="note"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                data-open-work-instruction-annotation-editor
                disabled={
                  selectedWorkInstructionRowTarget === null ||
                  !selectedInstructionRowIsStep ||
                  selectedInstructionRowImages.length === 0
                }
                onClick={() =>
                  openInstructionAnnotationEditor(
                    selectedWorkInstructionRowTarget
                  )
                }
              >
                标注当前行图片
              </PrintToolButton>
            </>
          ) : null}
          <span className="erp-print-shell__counter">
            正文行: {draft.rows.length}
            {Array.isArray(draft.continuationPages) &&
            draft.continuationPages.length
              ? ` + 续页 ${draft.continuationPages.reduce(
                  (total, page) =>
                    total + (Array.isArray(page.rows) ? page.rows.length : 0),
                  0
                )}`
              : ''}
            /{ENGINEERING_PRINT_LIMITS.instructionRows}/页
          </span>
        </div>
        {selectedInstructionRowIsStep && selectedInstructionRowImages.length ? (
          <div className="erp-print-image-tools" aria-label="当前行图片">
            {selectedInstructionRowImages.map((image, index) => (
              <PrintImageSlotTool
                key={image.id || index}
                label={`当前行图片 ${index + 1}`}
                image={image}
                accept={ATTACHMENT_ACCEPT}
                onUpload={(file) =>
                  uploadInstructionImage(
                    selectedWorkInstructionRowTarget,
                    file,
                    index
                  )
                }
                onClear={() =>
                  clearInstructionImage(selectedWorkInstructionRowTarget, index)
                }
              />
            ))}
          </div>
        ) : null}
      </PrintWorkspaceToolSection>
    )
  })()

  const richTextToolbarActions = (
    <div className="erp-print-shell__toolbar-group">
      <PrintToolButton
        icon="text"
        wide
        type="button"
        className={getToolbarButtonClassName()}
        onMouseDown={(event) => {
          event.preventDefault()
          applyRichTextCommand('red')
        }}
      >
        文字标红/取消
      </PrintToolButton>
    </div>
  )

  const draftActions = (
    <div className="erp-print-shell__toolbar-group">
      <PrintToolButton
        icon="reset"
        wide
        type="button"
        className={getToolbarButtonClassName()}
        onClick={handleResetDraft}
      >
        恢复样例
      </PrintToolButton>
      <PrintToolButton
        icon="blank"
        wide
        type="button"
        className={getToolbarButtonClassName()}
        onClick={handleBlankDraft}
      >
        空白模板
      </PrintToolButton>
    </div>
  )
  const toolbarActions = (
    <div className="erp-print-shell__toolbar-group">
      <button
        type="button"
        className={getToolbarButtonClassName()}
        onClick={handlePreviewPDF}
        onFocus={warmupPreviewPDF}
        onMouseEnter={warmupPreviewPDF}
        disabled={pdfAction !== ''}
      >
        {pdfAction === 'preview' ? '生成中…' : '在线预览 PDF'}
      </button>
      <button
        type="button"
        className={getToolbarButtonClassName()}
        onClick={handleDownloadPDF}
        disabled={pdfAction !== ''}
      >
        {pdfAction === 'download' ? '生成中…' : '下载 PDF'}
      </button>
      <button
        type="button"
        className={getToolbarButtonClassName({ primary: true })}
        onClick={handlePrint}
      >
        打印
      </button>
    </div>
  )

  let paper = null
  if (templateKey === MATERIAL_DETAIL_TEMPLATE_KEY) {
    paper = (
      <MaterialDetailPaper
        draft={draft}
        paperRef={paperRef}
        selectedLineIndex={selectedMaterialLineIndex}
        lineSelectionMode={materialLineSelectionMode}
        cellSelectionMode={materialCellSelectionMode}
        mergeSelection={materialMergeSelection}
        activeCell={materialActiveCell}
        onSelectLine={selectMaterialLine}
        onSelectCell={selectMaterialCell}
        onFieldChange={updateField}
        onColumnLabelChange={updateMaterialColumnLabel}
        onLineChange={updateMaterialLine}
      />
    )
  } else if (templateKey === COLOR_CARD_TEMPLATE_KEY) {
    paper = (
      <ColorCardPaper
        draft={draft}
        paperRef={paperRef}
        selectedBlockIndex={selectedColorBlockIndex}
        selectedLine={selectedColorLine}
        blockSelectionMode={colorBlockSelectionMode}
        lineSelectionMode={colorLineSelectionMode}
        onSelectBlock={selectColorBlock}
        onSelectLine={selectColorLine}
        onFieldChange={updateField}
        onColorBlockChange={updateColorBlockField}
      />
    )
  } else {
    paper = (
      <WorkInstructionPaper
        draft={draft}
        paperRef={paperRef}
        selectedInstructionRowTarget={selectedInstructionRowTarget}
        instructionRowSelectionMode={instructionRowSelectionMode}
        onSelectInstructionRow={selectInstructionRow}
        onFieldChange={updateField}
        onInstructionImageUpload={uploadInstructionImage}
        onInstructionImageClear={clearInstructionImage}
        onInstructionRowImageInputRef={(target, node) => {
          const key = instructionRowTargetKey(target)
          if (!key) return
          if (node) {
            instructionRowImageInputRefs.current[key] = node
          } else {
            delete instructionRowImageInputRefs.current[key]
          }
        }}
        onInstructionRowImageFileChange={handleInstructionRowImageFileChange}
        onInstructionRowChange={updateInstructionRowValue}
      />
    )
  }

  return (
    <>
      <PrintWorkspaceShell
        title={template.title}
        sourceTag={businessInput ? '业务记录带值' : '使用默认模板'}
        feedback={feedback}
        onClearFeedback={clearFeedback}
        tools={template.runtime.tools}
        persistenceStatus={persistenceStatus}
        onRetrySave={flushDraft}
        workspaceClassName="erp-engineering-print-workspace-shell"
        panelActions={panelActions}
        appendixActions={appendixActions}
        appendixCount={draft.appendixImages?.length || 0}
        toolbarActions={toolbarActions}
        editorActions={templateEditorActions}
        formatActions={richTextToolbarActions}
        draftActions={draftActions}
        selectionMode={
          materialCellSelectionMode
            ? '选择单元格'
            : materialLineSelectionMode
              ? '选择明细行'
              : colorBlockSelectionMode
                ? '选择色卡块'
                : colorLineSelectionMode
                  ? '选择色卡行'
                  : instructionRowSelectionMode
                    ? '选择行'
                    : ''
        }
        selectionCount={
          materialCellSelectionMode && materialMergeSelection
            ? (materialMergeSelection.rowEnd -
                materialMergeSelection.rowStart +
                1) *
              (materialMergeSelection.colEnd -
                materialMergeSelection.colStart +
                1)
            : selectedMaterialLineIndex !== null ||
                selectedColorBlockIndex !== null ||
                selectedColorLine !== null ||
                selectedInstructionRowTarget !== null
              ? 1
              : 0
        }
        onReturnToEdit={resetSelectionForTemplate}
        selectionBounds={
          materialCellSelectionMode ? materialMergeSelection : null
        }
        selectionSummary={
          materialLineSelectionMode && selectedMaterialLineIndex !== null
            ? `第 ${selectedMaterialLineIndex + 1} 行`
            : colorBlockSelectionMode && selectedColorBlockIndex !== null
              ? `第 ${selectedColorBlockIndex + 1} 个物料块`
              : colorLineSelectionMode && selectedColorLine !== null
                ? `第 ${selectedColorLine.blockIndex + 1} 块第 ${selectedColorLine.lineIndex + 1} ${selectedColorLine.persisted === false ? '个空白位' : '行'}`
                : instructionRowSelectionMode && selectedInstructionRowTarget
                  ? formatInstructionRowTargetLabel(
                      selectedInstructionRowTarget
                    )
                  : ''
        }
        prepareSignature={`${templateKey}:${workspaceStateID}:${businessInput}`}
      >
        <div className="erp-print-shell__stage-wrap" ref={stageWrapRef}>
          {paper}
        </div>
      </PrintWorkspaceShell>
      <WorkInstructionImageAnnotationEditor
        open={normalizedInstructionAnnotationEditorTarget !== null}
        images={instructionAnnotationEditorImages}
        initialImageIndex={
          Number(instructionAnnotationEditorTarget?.imageIndex) || 0
        }
        onCancel={() => setInstructionAnnotationEditorTarget(null)}
        onSave={saveInstructionImageAnnotations}
      />
    </>
  )
}
