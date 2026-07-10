import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import PrintWorkspaceShell from '../components/print/PrintWorkspaceShell.jsx'
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
  normalizeWorkInstructionRowType,
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
  persistPrintWorkspaceDraftSnapshot,
  readInitialPrintWorkspaceDraftFromWindowName,
  resolvePrintWorkspaceDraftMode,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceStateID,
} from '../utils/printWorkspace.js'
import {
  syncPrintPageMarginForPaper,
  watchPrintPageMarginForPaper,
} from '../utils/printPageMargin.mjs'
import usePrintWorkspaceWindowSnapshot from '../utils/usePrintWorkspaceWindowSnapshot.js'
import {
  runSilentPrintWorkspaceDraftUpdate,
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
  isCellInsideSelection,
  isMergeTopLeftCell,
  normalizeCellSelection,
} from '../utils/detailCellMerge.mjs'

const ATTACHMENT_ACCEPT = 'image/*,.svg'

const EDITABLE_CLASS = 'erp-engineering-print-editable'
const EDITABLE_FOCUS_RESTORE_DELAYS_MS = [0, 80, 360, 520, 900]
let requestedEditableFocusID = ''
let requestedEditableFocusIndex = -1
const editableFocusBoundaryDocuments = new WeakSet()
const WORK_INSTRUCTION_COLUMN_CLASSES = [
  'erp-work-instruction-paper__col-a',
  'erp-work-instruction-paper__col-b',
  'erp-work-instruction-paper__col-c',
  'erp-work-instruction-paper__col-d',
  'erp-work-instruction-paper__col-e',
  'erp-work-instruction-paper__col-f',
  'erp-work-instruction-paper__col-g',
  'erp-work-instruction-paper__col-h',
  'erp-work-instruction-paper__col-i',
]

function normalizeInstructionRowTarget(target) {
  if (target?.sectionKey) return null
  if (!target || !Number.isInteger(target.rowIndex)) return null
  return {
    pageIndex: Number.isInteger(target.pageIndex) ? target.pageIndex : null,
    rowIndex: target.rowIndex,
  }
}

function createMainInstructionRowTarget(rowIndex) {
  return normalizeInstructionRowTarget({ pageIndex: null, rowIndex })
}

function createContinuationInstructionRowTarget(pageIndex, rowIndex) {
  return normalizeInstructionRowTarget({ pageIndex, rowIndex })
}

function isSameInstructionRowTarget(left, right) {
  const normalizedLeft = normalizeInstructionRowTarget(left)
  const normalizedRight = normalizeInstructionRowTarget(right)
  if (!normalizedLeft || !normalizedRight) return false
  return (
    normalizedLeft.pageIndex === normalizedRight.pageIndex &&
    normalizedLeft.rowIndex === normalizedRight.rowIndex
  )
}

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

function getWorkInstructionRowType(row = {}) {
  return normalizeWorkInstructionRowType(row?.type)
}

function isWorkInstructionStepRow(row = {}) {
  return getWorkInstructionRowType(row) === WORK_INSTRUCTION_ROW_TYPES.step
}

function getWorkInstructionFullRowClassName(row = {}) {
  const type = getWorkInstructionRowType(row)
  if (type === WORK_INSTRUCTION_ROW_TYPES.title) {
    return 'erp-work-instruction-paper__section-title-row'
  }
  return 'erp-work-instruction-paper__text-row'
}

function toText(value) {
  return String(value ?? '')
    .replaceAll('\r', '')
    .trim()
}

function normalizeEditableText(value, multiline = false) {
  const rawText = normalizeRichEditableSource(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
  if (multiline) {
    return rawText.replace(/\n{3,}/g, '\n\n').trim()
  }
  return rawText.replace(/\s+/g, ' ').trim()
}

function normalizeRichEditableSource(value) {
  return String(value ?? '')
    .replaceAll('\r', '')
    .replace(/\u00a0/g, ' ')
    .replace(/(?:&amp;|amp;)+nbsp;?/giu, ' ')
    .replace(/&nbsp;?/giu, ' ')
}

function sanitizeRichEditableHTML(value) {
  if (typeof document === 'undefined') {
    return normalizeRichEditableSource(value).trim()
  }

  const source = normalizeRichEditableSource(value).trim()
  if (!source) return ''

  const container = document.createElement('div')
  container.innerHTML = source.includes('<')
    ? source
    : source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || '')
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createTextNode('')
    }

    const tag = node.tagName.toLowerCase()
    if (tag === 'br') return document.createElement('br')

    const nextTag =
      tag === 'span' || tag === 'font' || tag === 'div' || tag === 'p'
        ? 'span'
        : ''
    const next = document.createElement(nextTag || 'span')
    if (tag === 'span' || tag === 'font') {
      const color = String(
        node.style?.color || node.getAttribute?.('color') || ''
      )
        .trim()
        .toLowerCase()
      if (
        color === 'red' ||
        color === 'rgb(255, 0, 0)' ||
        color === '#ff0000' ||
        color === 'ff0000'
      ) {
        next.style.color = 'red'
      }
    }
    node.childNodes.forEach((child) => next.appendChild(sanitizeNode(child)))
    return next
  }

  const output = document.createElement('div')
  container.childNodes.forEach((child) =>
    output.appendChild(sanitizeNode(child))
  )
  const visibleText = (output.textContent || '').replace(/\u00a0/g, ' ').trim()
  if (!visibleText) return ''
  return output.innerHTML
    .replace(/<span><\/span>/g, '')
    .replace(/<strong><\/strong>/g, '')
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

function plainTextFromRichHTML(value) {
  if (typeof document === 'undefined') {
    return String(value ?? '')
      .replace(/<[^>]*>/g, '')
      .trim()
  }
  const container = document.createElement('div')
  container.innerHTML = sanitizeRichEditableHTML(value)
  return (container.innerText || container.textContent || '').trim()
}

function richTextHasVisibleText(value) {
  return plainTextFromRichHTML(value).length > 0
}

function normalizeRichEditableElement(element) {
  if (!element) return
  const currentHTML = element.innerHTML
  if (!/(?:&amp;|amp;)+nbsp/i.test(currentHTML)) return
  const nextValue = sanitizeRichEditableHTML(currentHTML)
  const normalizedHTML = nextValue || '&nbsp;'
  if (currentHTML !== normalizedHTML) {
    element.innerHTML = normalizedHTML
  }
}

function escapeEditablePlainText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function listEngineeringEditableElements(documentLike) {
  return [
    ...(documentLike?.querySelectorAll?.(
      `.${EDITABLE_CLASS}[contenteditable="true"]`
    ) || []),
  ]
}

function markRequestedEditableFocus(element, editableID = '') {
  const documentLike = element?.ownerDocument
  requestedEditableFocusID =
    editableID || element?.getAttribute?.('data-engineering-editable-id') || ''
  requestedEditableFocusIndex =
    listEngineeringEditableElements(documentLike).indexOf(element)
}

function clearRequestedEditableFocus() {
  requestedEditableFocusID = ''
  requestedEditableFocusIndex = -1
}

function blurActiveEngineeringEditable(documentLike) {
  const activeElement = documentLike?.activeElement
  if (!activeElement?.classList?.contains(EDITABLE_CLASS)) return
  activeElement.blur()
}

function scheduleBlurActiveEngineeringEditable(documentLike) {
  blurActiveEngineeringEditable(documentLike)
  const win = documentLike?.defaultView
  win?.setTimeout?.(() => blurActiveEngineeringEditable(documentLike), 0)
}

function shouldRestoreEditableFocus(element) {
  if (!element) return false
  const activeElement = element.ownerDocument?.activeElement
  return (
    activeElement === element.ownerDocument?.body ||
    activeElement === element.ownerDocument?.documentElement
  )
}

function escapeAttributeSelectorValue(value) {
  const rawValue = String(value ?? '')
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(rawValue)
  }
  return rawValue.replace(/["\\]/g, '\\$&')
}

function resolveCurrentEditableElement(documentLike, editableID) {
  const currentElement = requestedEditableFocusID
    ? documentLike?.querySelector?.(
        `.${EDITABLE_CLASS}[data-engineering-editable-id="${escapeAttributeSelectorValue(
          requestedEditableFocusID
        )}"]`
      )
    : null
  if (currentElement) return currentElement
  const editableElements = listEngineeringEditableElements(documentLike)
  if (
    requestedEditableFocusIndex >= 0 &&
    requestedEditableFocusIndex < editableElements.length
  ) {
    return editableElements[requestedEditableFocusIndex]
  }
  if (editableID) {
    return (
      documentLike?.querySelector?.(
        `.${EDITABLE_CLASS}[data-engineering-editable-id="${escapeAttributeSelectorValue(
          editableID
        )}"]`
      ) || null
    )
  }
  return null
}

function restoreEditableFocus(
  documentLike,
  editableID,
  fallbackElement = null
) {
  if (!requestedEditableFocusID && requestedEditableFocusIndex < 0) return
  const target =
    resolveCurrentEditableElement(documentLike, editableID) || fallbackElement
  if (!shouldRestoreEditableFocus(target)) return
  target.focus()
}

function ensureEditableFocusBoundary(documentLike) {
  if (
    !documentLike ||
    editableFocusBoundaryDocuments.has(documentLike) ||
    typeof documentLike.addEventListener !== 'function'
  ) {
    return
  }
  editableFocusBoundaryDocuments.add(documentLike)
  documentLike.addEventListener(
    'mousedown',
    (event) => {
      const editable = event.target?.closest?.(
        `.${EDITABLE_CLASS}[data-engineering-editable-id]`
      )
      if (editable) {
        markRequestedEditableFocus(editable)
        return
      }
      clearRequestedEditableFocus()
    },
    true
  )
}

function normalizeCalloutCoordinate(value) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 0
  return Math.max(0, Math.min(100, numberValue))
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

function createWorkInstructionRowStyle(heightMm, fontSizePt) {
  const numberValue = Number(heightMm)
  const fontSizeValue = Number(fontSizePt)
  const style = {}
  if (Number.isFinite(numberValue) && numberValue > 0) {
    style['--work-instruction-row-height'] = `${numberValue}mm`
  }
  if (Number.isFinite(fontSizeValue) && fontSizeValue > 0) {
    style['--instruction-row-font-size'] = `${fontSizeValue * (4 / 3)}px`
  }
  return Object.keys(style).length ? style : undefined
}

function InstructionImageAnnotationLayer({
  rowIndex,
  callouts = [],
  labels = [],
}) {
  if (!callouts.length && !labels.length) return null
  return (
    <div className="erp-work-instruction-paper__image-annotation-layer">
      {callouts.length ? (
        <svg
          aria-hidden="true"
          className="erp-work-instruction-paper__annotation-callouts"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <marker
              id={`instruction-callout-arrow-${rowIndex}`}
              markerHeight="5"
              markerWidth="5"
              orient="auto"
              refX="4"
              refY="2.5"
            >
              <path d="M0,0 L5,2.5 L0,5 Z" />
            </marker>
          </defs>
          {callouts.map((callout, calloutIndex) => (
            <line
              key={`step-${rowIndex}-callout-${calloutIndex}`}
              x1={normalizeCalloutCoordinate(callout.x1)}
              y1={normalizeCalloutCoordinate(callout.y1)}
              x2={normalizeCalloutCoordinate(callout.x2)}
              y2={normalizeCalloutCoordinate(callout.y2)}
              stroke={callout.color || '#2563eb'}
              markerEnd={
                callout.arrow
                  ? `url(#instruction-callout-arrow-${rowIndex})`
                  : undefined
              }
            />
          ))}
        </svg>
      ) : null}
      {labels.map((label, labelIndex) => {
        const style = {
          left: `${normalizeCalloutCoordinate(label.x)}%`,
          top: `${normalizeCalloutCoordinate(label.y)}%`,
          width: `${Math.max(8, Math.min(42, Number(label.width) || 18))}%`,
          '--annotation-label-color': label.color || '#ef4444',
        }
        return (
          <span
            key={`step-${rowIndex}-image-label-${labelIndex}`}
            className={`erp-work-instruction-paper__annotation-label${
              label.tone === 'blue-fill'
                ? ' erp-work-instruction-paper__annotation-label--blue-fill'
                : ''
            }`}
            style={style}
          >
            {label.text}
          </span>
        )
      })}
    </div>
  )
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

function EditableText({
  value,
  onCommit,
  multiline = false,
  rich = false,
  className = '',
  as: Component = 'span',
}) {
  const editableID = useId()
  const editableRef = useRef(null)
  const restoreTimersRef = useRef([])
  const htmlValue = rich ? sanitizeRichEditableHTML(value) : ''
  const restoreFocusIfNeeded = () => {
    restoreEditableFocus(
      editableRef.current?.ownerDocument,
      editableID,
      editableRef.current
    )
  }
  const scheduleFocusRestore = () => {
    const win = editableRef.current?.ownerDocument?.defaultView || window
    restoreTimersRef.current.forEach((timerID) => win.clearTimeout(timerID))
    restoreTimersRef.current = EDITABLE_FOCUS_RESTORE_DELAYS_MS.map((delayMs) =>
      win.setTimeout(restoreFocusIfNeeded, delayMs)
    )
  }
  const handleMouseDown = () => {
    markRequestedEditableFocus(editableRef.current, editableID)
  }
  const handleFocus = () => {
    markRequestedEditableFocus(editableRef.current, editableID)
    scheduleFocusRestore()
  }
  const commitRichValue = (element, { normalizeElement = false } = {}) => {
    const currentHTML = element.innerHTML
    const nextValue = sanitizeRichEditableHTML(currentHTML)
    if (normalizeElement) {
      const normalizedHTML = nextValue || '&nbsp;'
      if (currentHTML !== normalizedHTML) {
        element.innerHTML = normalizedHTML
      }
    }
    if (nextValue !== sanitizeRichEditableHTML(value)) {
      onCommit(nextValue)
    }
  }
  const commitPlainValue = (element, { normalizeElement = false } = {}) => {
    const nextValue = normalizeEditableText(
      multiline ? element.innerText : element.textContent,
      multiline
    )
    if (normalizeElement) {
      const normalizedText = nextValue || '\u00A0'
      if (element.textContent !== normalizedText) {
        element.textContent = normalizedText
      }
    }
    if (nextValue !== String(value ?? '')) {
      onCommit(nextValue)
    }
  }

  useLayoutEffect(() => {
    const element = editableRef.current
    if (!element) {
      return
    }
    if (element.ownerDocument?.activeElement === element) {
      return
    }
    if (rich) {
      const nextHTML = htmlValue || '&nbsp;'
      if (element.innerHTML !== nextHTML) {
        element.innerHTML = nextHTML
      }
      return
    }
    const nextText = String(value ?? '').trim() ? String(value ?? '') : '\u00A0'
    if (element.textContent !== nextText) {
      element.textContent = nextText
    }
  }, [htmlValue, rich, value])

  useLayoutEffect(() => {
    restoreFocusIfNeeded()
  })

  useEffect(() => {
    const ownerDocument = editableRef.current?.ownerDocument
    const ownerWindow = ownerDocument?.defaultView || window
    ensureEditableFocusBoundary(ownerDocument)
    return () => {
      restoreTimersRef.current.forEach((timerID) =>
        ownerWindow.clearTimeout(timerID)
      )
      restoreTimersRef.current = []
    }
  }, [])

  useEffect(() => {
    const element = editableRef.current
    if (!element) {
      return undefined
    }

    const ownerWindow = element.ownerDocument?.defaultView || window
    const commitSilentDraft = () => {
      runSilentPrintWorkspaceDraftUpdate(() => {
        if (rich) {
          commitRichValue(element)
          return
        }
        commitPlainValue(element)
      })
    }
    const observer = new ownerWindow.MutationObserver(commitSilentDraft)
    observer.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    })
    element.dataset.printWorkspaceDraftReady = 'true'
    element.addEventListener('input', commitSilentDraft)

    return () => {
      element.removeEventListener('input', commitSilentDraft)
      observer.disconnect()
      delete element.dataset.printWorkspaceDraftReady
    }
  })

  if (rich) {
    return (
      <Component
        ref={editableRef}
        className={`${EDITABLE_CLASS} ${className}`}
        contentEditable
        data-engineering-editable-id={editableID}
        suppressContentEditableWarning
        spellCheck={false}
        onMouseDown={handleMouseDown}
        onFocus={handleFocus}
        onInput={(event) => {
          normalizeRichEditableElement(event.currentTarget)
          runSilentPrintWorkspaceDraftUpdate(() => {
            commitRichValue(event.currentTarget)
          })
        }}
        onBlur={(event) => {
          commitRichValue(event.currentTarget, { normalizeElement: true })
        }}
        dangerouslySetInnerHTML={{
          __html: htmlValue || '&nbsp;',
        }}
      />
    )
  }

  return (
    <Component
      ref={editableRef}
      className={`${EDITABLE_CLASS} ${className}`}
      contentEditable
      data-engineering-editable-id={editableID}
      suppressContentEditableWarning
      spellCheck={false}
      onMouseDown={handleMouseDown}
      onFocus={handleFocus}
      onKeyDown={(event) => {
        if (!multiline && event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onInput={(event) => {
        runSilentPrintWorkspaceDraftUpdate(() => {
          commitPlainValue(event.currentTarget)
        })
      }}
      onBlur={(event) => {
        commitPlainValue(event.currentTarget, { normalizeElement: true })
      }}
      dangerouslySetInnerHTML={{
        __html: String(value ?? '').trim()
          ? escapeEditablePlainText(value)
          : '&nbsp;',
      }}
    />
  )
}

function ReadOnlyText({
  value,
  rich = false,
  className = '',
  as: Component = 'span',
}) {
  const normalizedValue = String(value ?? '').trim()
  if (rich) {
    return (
      <Component
        className={`${EDITABLE_CLASS} ${className}`}
        dangerouslySetInnerHTML={{
          __html: sanitizeRichEditableHTML(normalizedValue) || '&nbsp;',
        }}
      />
    )
  }
  return (
    <Component className={`${EDITABLE_CLASS} ${className}`}>
      {normalizedValue || '\u00A0'}
    </Component>
  )
}

function ImageSlot({
  snapshot,
  label,
  onUpload,
  onClear,
  compact = false,
  showActions = true,
  layoutStyle,
}) {
  const inputRef = useRef(null)
  const hasImage = Boolean(snapshot?.dataURL)
  const crop = snapshot?.crop || null
  const cropLeft = Number(crop?.left)
  const cropTop = Number(crop?.top)
  const cropRight = Number(crop?.right)
  const cropBottom = Number(crop?.bottom)
  const cropWidth = 100 - cropLeft - cropRight
  const cropHeight = 100 - cropTop - cropBottom
  const hasCrop =
    hasImage &&
    [cropLeft, cropTop, cropRight, cropBottom, cropWidth, cropHeight].every(
      Number.isFinite
    ) &&
    cropWidth > 0 &&
    cropHeight > 0
  const cropStyle = hasCrop
    ? {
        left: `${(-cropLeft / cropWidth) * 100}%`,
        top: `${(-cropTop / cropHeight) * 100}%`,
        width: `${(100 / cropWidth) * 100}%`,
        height: `${(100 / cropHeight) * 100}%`,
      }
    : undefined
  return (
    <div
      className={`erp-engineering-print-image-slot${
        compact ? ' erp-engineering-print-image-slot--compact' : ''
      }${hasImage ? '' : ' erp-engineering-print-image-slot--empty'}${
        showActions ? '' : ' erp-engineering-print-image-slot--readonly'
      }${hasCrop ? ' erp-engineering-print-image-slot--cropped' : ''}${
        layoutStyle ? ' erp-engineering-print-image-slot--positioned' : ''
      }`}
      data-image-crop={hasCrop ? 'excel-src-rect' : undefined}
      style={
        hasCrop || layoutStyle
          ? {
              ...(layoutStyle || {}),
              ...(hasCrop
                ? {
                    '--image-crop-left': String(cropLeft),
                    '--image-crop-top': String(cropTop),
                    '--image-crop-right': String(cropRight),
                    '--image-crop-bottom': String(cropBottom),
                  }
                : {}),
            }
          : undefined
      }
    >
      {hasImage ? (
        <img src={snapshot.dataURL} alt={label} style={cropStyle} />
      ) : (
        <span>{label}</span>
      )}
      {showActions ? (
        <>
          <div className="erp-engineering-print-image-slot__actions">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-label={`上传${label}`}
            >
              上传
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={!snapshot?.dataURL}
              aria-label={`清空${label}`}
            >
              清空
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                onUpload(file)
              }
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function createImageLayoutStyle(layout = null) {
  const x = Number(layout?.x)
  const y = Number(layout?.y)
  const width = Number(layout?.width)
  const height = Number(layout?.height)
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined
  }
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}%`,
    height: `${height}%`,
    minHeight: '0',
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

  try {
    const rawDraft = window.localStorage.getItem(storageKey) || ''
    if (!rawDraft) {
      return fallbackDraft
    }
    return createEngineeringPrintDraft(templateKey, JSON.parse(rawDraft))
  } catch {
    return fallbackDraft
  }
}

function MaterialDetailPaper({
  draft,
  selectedLineIndex,
  lineSelectionMode,
  cellSelectionMode,
  mergeSelection,
  activeCell,
  onSelectLine,
  onSelectCell,
  onFieldChange,
  onColumnLabelChange,
  onLineChange,
  paperRef,
}) {
  const headerSlots = engineeringImageSlots.materialDetail.slice(0, 2)
  const footerSlots = engineeringImageSlots.materialDetail.slice(2)
  const visibleFooterSlots = footerSlots.filter(
    (slot) => draft.images?.[slot.key]?.dataURL
  )
  return (
    <div
      className="erp-engineering-print-paper erp-material-detail-paper"
      ref={paperRef}
    >
      <header className="erp-material-detail-paper__header">
        <div className="erp-material-detail-paper__title-block">
          <EditableText
            value={draft.companyName}
            onCommit={(value) => onFieldChange('companyName', value)}
            className="erp-material-detail-paper__company"
          />
          <div className="erp-material-detail-paper__title">物料分析明细表</div>
        </div>
        <div className="erp-material-detail-paper__images">
          {headerSlots.map((slot) => (
            <ImageSlot
              key={slot.key}
              label={slot.label}
              snapshot={draft.images?.[slot.key]}
              compact
              showActions={false}
            />
          ))}
        </div>
      </header>

      <section className="erp-engineering-print-meta-grid">
        {[
          ['产品编号：', 'productNo'],
          ['订单编号：', 'orderNo'],
          ['数量：(PCS)', 'quantityText'],
          ['备品：', 'spareText'],
          ['产品名称：', 'productName'],
          ['日期：', 'dateText'],
          {
            key: 'designer',
            label: '设计师：',
            fieldKey: 'designer',
          },
          ['备注：', 'topRemark'],
          {
            key: 'hairDirection',
            label: '毛向：',
            fieldKey: 'hairDirection',
            className: 'erp-engineering-print-meta-grid__hair-cell',
          },
        ].map((cell) => {
          if (!Array.isArray(cell)) {
            return (
              <div key={cell.key} className={cell.className}>
                <span className="erp-engineering-print-meta-grid__label">
                  {cell.label}
                </span>
                <EditableText
                  value={draft[cell.fieldKey]}
                  onCommit={(value) => onFieldChange(cell.fieldKey, value)}
                />
              </div>
            )
          }
          const [label, key] = cell
          return (
            <div key={key}>
              <span className="erp-engineering-print-meta-grid__label">
                {label}
              </span>
              <EditableText
                value={draft[key]}
                onCommit={(value) => onFieldChange(key, value)}
              />
            </div>
          )
        })}
      </section>

      <table className="erp-engineering-print-table erp-material-detail-table">
        <colgroup>
          <col style={{ width: '5.4%' }} />
          <col style={{ width: '12.8%' }} />
          <col style={{ width: '7.2%' }} />
          <col style={{ width: '6.2%' }} />
          <col style={{ width: '2.6%' }} />
          <col style={{ width: '3.6%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '2.8%' }} />
          <col style={{ width: '5.2%' }} />
          <col style={{ width: '3.6%' }} />
          <col style={{ width: '7.9%' }} />
          <col style={{ width: '10.4%' }} />
          <col style={{ width: '7.3%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            {MATERIAL_DETAIL_COLUMNS.map((column, columnIndex) => (
              <th key={column.key}>
                <EditableText
                  value={draft.columnLabels?.[columnIndex] || column.label}
                  multiline
                  rich
                  className="erp-material-detail-table__editable"
                  onCommit={(value) => onColumnLabelChange(columnIndex, value)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, rowIndex) => (
            <tr
              className={
                selectedLineIndex === rowIndex
                  ? 'erp-engineering-print-row--selected'
                  : ''
              }
              key={`line-${rowIndex}`}
              onMouseDown={(event) => {
                if (!lineSelectionMode) return
                clearRequestedEditableFocus()
                scheduleBlurActiveEngineeringEditable(
                  event.currentTarget.ownerDocument
                )
                event.preventDefault()
                onSelectLine(rowIndex)
              }}
            >
              {MATERIAL_DETAIL_COLUMNS.map((column, colIndex) => {
                const merge = findMergeAtCell(draft.merges, rowIndex, colIndex)
                if (merge && !isMergeTopLeftCell(merge, rowIndex, colIndex)) {
                  return null
                }
                const isSelectionAnchor =
                  activeCell?.rowIndex === rowIndex &&
                  activeCell?.colIndex === colIndex
                const isSelectedCell = isCellInsideSelection(
                  mergeSelection,
                  rowIndex,
                  colIndex
                )
                return (
                  <td
                    key={column.key}
                    rowSpan={
                      merge ? merge.rowEnd - merge.rowStart + 1 : undefined
                    }
                    colSpan={
                      merge ? merge.colEnd - merge.colStart + 1 : undefined
                    }
                    className={[
                      merge ? 'erp-engineering-print-cell--merged' : '',
                      isSelectedCell
                        ? 'erp-engineering-print-cell--selected'
                        : '',
                      isSelectionAnchor
                        ? 'erp-engineering-print-cell--selected-anchor'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseDown={(event) => {
                      if (!cellSelectionMode) return
                      clearRequestedEditableFocus()
                      scheduleBlurActiveEngineeringEditable(
                        event.currentTarget.ownerDocument
                      )
                      event.preventDefault()
                      event.stopPropagation()
                      onSelectCell(rowIndex, colIndex)
                    }}
                  >
                    <EditableText
                      value={line[column.key]}
                      multiline={column.key === 'remark'}
                      rich
                      className="erp-material-detail-table__editable"
                      onCommit={(value) =>
                        onLineChange(rowIndex, column.key, value)
                      }
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="erp-material-detail-paper__footer">
        <div className="erp-material-detail-paper__footer-field">
          <span className="erp-material-detail-paper__footer-label">
            审核：
          </span>
          <EditableText
            value={draft.auditor}
            rich
            className="erp-material-detail-paper__footer-value"
            onCommit={(value) => onFieldChange('auditor', value)}
          />
        </div>
        <div className="erp-material-detail-paper__footer-field">
          <span className="erp-material-detail-paper__footer-label">
            制表：
          </span>
          <EditableText
            value={draft.maker}
            rich
            className="erp-material-detail-paper__footer-value"
            onCommit={(value) => onFieldChange('maker', value)}
          />
        </div>
      </footer>
      {visibleFooterSlots.length ? (
        <div className="erp-material-detail-paper__bottom-images">
          {visibleFooterSlots.map((slot) => (
            <ImageSlot
              key={slot.key}
              label={slot.label}
              snapshot={draft.images?.[slot.key]}
              showActions={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

const COLOR_CARD_DEFAULT_BODY_ROWS = 3

function getColorCardBodyRowCount(block) {
  const lineCount = Array.isArray(block?.lines) ? block.lines.length : 0
  const minRows = Number(block?.minRows)
  return Math.max(
    1,
    lineCount,
    Number.isFinite(minRows) && minRows > 0
      ? Math.floor(minRows)
      : COLOR_CARD_DEFAULT_BODY_ROWS
  )
}

function splitColorCardBlocks(blocks = []) {
  const sides = {
    left: [],
    right: [],
  }
  const heights = {
    left: 0,
    right: 0,
  }

  blocks.forEach((block, blockIndex) => {
    const side =
      block.side === 'left' || block.side === 'right'
        ? block.side
        : heights.left <= heights.right
          ? 'left'
          : 'right'
    sides[side].push({ block, blockIndex })
    heights[side] += getColorCardBodyRowCount(block) + 1
  })

  return [sides.left, sides.right]
}

function ColorCardPaper({
  draft,
  selectedBlockIndex,
  selectedLine,
  blockSelectionMode,
  lineSelectionMode,
  onSelectBlock,
  onSelectLine,
  onFieldChange,
  onColorBlockChange,
  paperRef,
}) {
  const colorCardSides = splitColorCardBlocks(draft.blocks)

  return (
    <div
      className="erp-engineering-print-paper erp-color-card-paper"
      ref={paperRef}
    >
      <EditableText
        value={draft.companyName}
        rich
        onCommit={(value) => onFieldChange('companyName', value)}
        className="erp-color-card-paper__company"
      />
      <section className="erp-color-card-paper__meta">
        <span>产品编号：</span>
        <EditableText
          value={draft.productNo}
          rich
          onCommit={(value) => onFieldChange('productNo', value)}
        />
        <span>产品名称：</span>
        <EditableText
          value={draft.productName}
          rich
          onCommit={(value) => onFieldChange('productName', value)}
        />
      </section>
      <div className="erp-color-card-paper__sheet">
        {colorCardSides.map((sideBlocks, sideIndex) => (
          <React.Fragment key={`color-card-side-${sideIndex}`}>
            <table
              className="erp-color-card-paper__side"
              aria-label={sideIndex === 0 ? '左侧色卡表' : '右侧色卡表'}
            >
              <colgroup>
                <col className="erp-color-card-paper__material-col" />
                <col className="erp-color-card-paper__position-col" />
                <col className="erp-color-card-paper__method-col" />
              </colgroup>
              <tbody>
                {sideBlocks.map(({ block, blockIndex }) => {
                  const bodyRowCount = getColorCardBodyRowCount(block)
                  const selectedBlock =
                    selectedBlockIndex === blockIndex && !selectedLine
                  const bodyRows = Array.from(
                    { length: bodyRowCount },
                    (_, lineIndex) => block.lines?.[lineIndex] ?? null
                  )
                  const selectBlock = (event) => {
                    if (!blockSelectionMode) return
                    clearRequestedEditableFocus()
                    scheduleBlurActiveEngineeringEditable(
                      event.currentTarget.ownerDocument
                    )
                    event.preventDefault()
                    event.stopPropagation()
                    onSelectBlock(blockIndex)
                  }

                  return (
                    <React.Fragment key={`block-${blockIndex}`}>
                      <tr
                        className={`erp-color-card-paper__block-row erp-color-card-paper__block-head-row${
                          selectedBlock
                            ? ' erp-color-card-paper__block-row--selected'
                            : ''
                        }`}
                        data-color-card-block="true"
                        data-color-card-block-index={blockIndex}
                        onMouseDown={selectBlock}
                      >
                        <td className="erp-color-card-paper__material-name">
                          <EditableText
                            value={block.materialName}
                            rich
                            onCommit={(value) =>
                              onColorBlockChange(
                                blockIndex,
                                'materialName',
                                value
                              )
                            }
                          />
                        </td>
                        <td
                          className="erp-color-card-paper__vendor"
                          colSpan={2}
                        >
                          <EditableText
                            value={block.vendor}
                            rich
                            onCommit={(value) =>
                              onColorBlockChange(blockIndex, 'vendor', value)
                            }
                          />
                        </td>
                      </tr>
                      {bodyRows.map((line, lineIndex) => {
                        const isPersistedLine = Boolean(line)
                        const selected =
                          selectedLine?.blockIndex === blockIndex &&
                          selectedLine?.lineIndex === lineIndex
                        const selectLine = (event) => {
                          if (blockSelectionMode) {
                            selectBlock(event)
                            return
                          }
                          if (!lineSelectionMode) return
                          clearRequestedEditableFocus()
                          scheduleBlurActiveEngineeringEditable(
                            event.currentTarget.ownerDocument
                          )
                          event.preventDefault()
                          event.stopPropagation()
                          onSelectLine(blockIndex, lineIndex, isPersistedLine)
                        }

                        return (
                          <tr
                            className={`erp-color-card-paper__block-row erp-color-card-paper__line-row${
                              selected
                                ? ' erp-engineering-print-row--selected'
                                : ''
                            }${
                              selectedBlock
                                ? ' erp-color-card-paper__block-row--selected'
                                : ''
                            }`}
                            data-color-line={
                              isPersistedLine ? 'true' : undefined
                            }
                            data-color-card-block-index={blockIndex}
                            data-color-line-index={lineIndex}
                            data-color-line-target="true"
                            data-color-line-placeholder={
                              isPersistedLine ? undefined : 'true'
                            }
                            key={`block-${blockIndex}-line-${lineIndex}`}
                            onMouseDown={selectLine}
                          >
                            {lineIndex === 0 ? (
                              <td
                                className="erp-color-card-paper__swatch-cell"
                                rowSpan={bodyRowCount}
                                onMouseDown={selectBlock}
                              />
                            ) : null}
                            <td className="erp-color-card-paper__position-cell">
                              <EditableText
                                value={line?.position ?? ''}
                                rich
                                onCommit={(value) =>
                                  onColorBlockChange(
                                    blockIndex,
                                    `lines.${lineIndex}.position`,
                                    value
                                  )
                                }
                              />
                            </td>
                            <td className="erp-color-card-paper__method-cell">
                              <EditableText
                                value={line?.method ?? ''}
                                rich
                                onCommit={(value) =>
                                  onColorBlockChange(
                                    blockIndex,
                                    `lines.${lineIndex}.method`,
                                    value
                                  )
                                }
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {sideIndex === 0 ? (
              <div
                className="erp-color-card-paper__gutter"
                aria-hidden="true"
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>
      <footer className="erp-color-card-paper__footer">
        {[
          ['制卡：', 'maker'],
          ['日期：', 'dateText'],
          ['审核：', 'auditor'],
          ['复核：', 'reviewer'],
        ].map(([label, key]) => (
          <span key={key}>
            {label}
            <EditableText
              value={draft[key]}
              rich
              onCommit={(value) => onFieldChange(key, value)}
            />
          </span>
        ))}
      </footer>
    </div>
  )
}

function WorkInstructionPaper({
  draft,
  selectedInstructionRowTarget,
  instructionRowSelectionMode,
  onSelectInstructionRow,
  onFieldChange,
  onInstructionRowChange,
  onInstructionImageUpload,
  onInstructionImageClear,
  onInstructionRowImageInputRef,
  onInstructionRowImageFileChange,
  paperRef,
}) {
  const headerSlot = engineeringImageSlots.workInstruction[0]
  const continuationPages = Array.isArray(draft.continuationPages)
    ? draft.continuationPages
    : []
  const renderInstructionRows = (rows = [], pageIndex = null) =>
    rows.map((row, rowIndex) => {
      const rowTarget =
        pageIndex === null
          ? createMainInstructionRowTarget(rowIndex)
          : createContinuationInstructionRowTarget(pageIndex, rowIndex)
      const rowType = getWorkInstructionRowType(row)
      const isStepRow = rowType === WORK_INSTRUCTION_ROW_TYPES.step
      const isSelectedRow = isSameInstructionRowTarget(
        selectedInstructionRowTarget,
        rowTarget
      )
      if (!isStepRow) {
        return (
          <tr
            className={`${getWorkInstructionFullRowClassName(row)} ${
              isSelectedRow ? 'erp-engineering-print-row--selected' : ''
            }`}
            key={`body-${pageIndex ?? 'main'}-${rowIndex}`}
            style={createWorkInstructionRowStyle(row.heightMm)}
            onMouseDown={(event) => {
              if (!instructionRowSelectionMode) return
              clearRequestedEditableFocus()
              scheduleBlurActiveEngineeringEditable(
                event.currentTarget.ownerDocument
              )
              event.preventDefault()
              onSelectInstructionRow(rowTarget)
            }}
          >
            <td colSpan={9}>
              <EditableText
                value={row.text}
                multiline
                rich
                as="div"
                onCommit={(value) =>
                  onInstructionRowChange(rowTarget, 'text', value)
                }
              />
            </td>
          </tr>
        )
      }
      const rowImages = Array.isArray(row.images) ? row.images : []
      const visibleImages = rowImages
        .map((image, imageIndex) => ({ image, imageIndex }))
        .filter(({ image }) => image?.dataURL)
      const hasText = richTextHasVisibleText(row.text)
      const isImageRow = visibleImages.length > 0
      const hasImageNotes =
        richTextHasVisibleText(row.imageNotes?.left) ||
        richTextHasVisibleText(row.imageNotes?.right)
      const useAnnotationLayout = hasImageNotes
      const imageCallouts = Array.isArray(row.imageCallouts)
        ? row.imageCallouts
        : []
      const imageLabels = Array.isArray(row.imageLabels) ? row.imageLabels : []
      const hasImageAnnotations =
        imageCallouts.length > 0 || imageLabels.length > 0
      const hasPositionedImageLayout =
        isImageRow &&
        visibleImages.some(({ image }) => createImageLayoutStyle(image?.layout))
      const rowStyle = {}
      const heightMm = Number(row.heightMm)
      const fontSizePt = Number(row.fontSizePt)
      const imageAreaHeightMm = Number(row.imageAreaHeightMm)
      if (Number.isFinite(heightMm) && heightMm > 0) {
        rowStyle['--instruction-row-min-height'] = `${heightMm}mm`
      }
      if (Number.isFinite(fontSizePt) && fontSizePt > 0) {
        rowStyle['--instruction-row-font-size'] = `${fontSizePt * (4 / 3)}px`
      }
      if (Number.isFinite(imageAreaHeightMm) && imageAreaHeightMm > 0) {
        rowStyle['--instruction-row-image-area-min-height'] =
          `${imageAreaHeightMm}mm`
      }
      const rowClassName = [
        isSelectedRow ? 'erp-engineering-print-row--selected' : '',
        isImageRow || useAnnotationLayout
          ? 'erp-work-instruction-paper__step-row--image'
          : 'erp-work-instruction-paper__step-row--text',
        useAnnotationLayout
          ? 'erp-work-instruction-paper__step-row--annotated'
          : '',
      ]
        .filter(Boolean)
        .join(' ')
      return (
        <tr
          className={rowClassName}
          key={`body-${pageIndex ?? 'main'}-${rowIndex}`}
          style={rowStyle}
          onMouseDown={(event) => {
            if (!instructionRowSelectionMode) return
            if (event.target.closest('input')) return
            clearRequestedEditableFocus()
            scheduleBlurActiveEngineeringEditable(
              event.currentTarget.ownerDocument
            )
            event.preventDefault()
            onSelectInstructionRow(rowTarget)
          }}
        >
          <td className="erp-work-instruction-paper__step-no">
            <EditableText
              value={row.no}
              onCommit={(value) =>
                onInstructionRowChange(rowTarget, 'no', value)
              }
            />
          </td>
          <td
            className="erp-work-instruction-paper__step-content-cell"
            colSpan={8}
          >
            {hasText || (!isImageRow && !useAnnotationLayout) ? (
              <EditableText
                value={row.text}
                multiline
                rich
                as="div"
                onCommit={(value) =>
                  onInstructionRowChange(rowTarget, 'text', value)
                }
              />
            ) : null}
            {useAnnotationLayout ? (
              <div
                className={`erp-work-instruction-paper__annotation-layout${
                  hasImageAnnotations
                    ? ' erp-work-instruction-paper__annotation-layout--with-callouts'
                    : ''
                }`}
              >
                <InstructionImageAnnotationLayer
                  rowIndex={
                    pageIndex === null ? rowIndex : `${pageIndex}-${rowIndex}`
                  }
                  callouts={imageCallouts}
                  labels={imageLabels}
                />
                <div className="erp-work-instruction-paper__annotation-note erp-work-instruction-paper__annotation-note--left">
                  <EditableText
                    value={row.imageNotes?.left}
                    multiline
                    rich
                    as="div"
                    onCommit={(value) =>
                      onInstructionRowChange(
                        rowTarget,
                        'imageNotes.left',
                        value
                      )
                    }
                  />
                </div>
                <div className="erp-work-instruction-paper__annotation-images">
                  <input
                    ref={(node) =>
                      onInstructionRowImageInputRef(rowTarget, node)
                    }
                    className="erp-work-instruction-paper__row-image-input"
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    multiple
                    onChange={(event) =>
                      onInstructionRowImageFileChange(rowTarget, event)
                    }
                  />
                  <div
                    className={`erp-work-instruction-paper__row-images${
                      isImageRow
                        ? ''
                        : ' erp-work-instruction-paper__row-images--empty'
                    }${
                      hasPositionedImageLayout
                        ? ' erp-work-instruction-paper__row-images--positioned'
                        : ''
                    }`}
                  >
                    {visibleImages.map(
                      ({ image, imageIndex }, visibleIndex) => (
                        <ImageSlot
                          key={`step-${pageIndex ?? 'main'}-${rowIndex}-image-${imageIndex}`}
                          label={`工序 ${row.no || rowIndex + 1} 图片 ${visibleIndex + 1}`}
                          snapshot={image}
                          compact
                          showActions={false}
                          layoutStyle={
                            hasPositionedImageLayout
                              ? createImageLayoutStyle(image.layout)
                              : undefined
                          }
                          onUpload={(file) =>
                            onInstructionImageUpload(
                              rowTarget,
                              file,
                              imageIndex
                            )
                          }
                          onClear={() =>
                            onInstructionImageClear(rowTarget, imageIndex)
                          }
                        />
                      )
                    )}
                  </div>
                </div>
                <div className="erp-work-instruction-paper__annotation-note erp-work-instruction-paper__annotation-note--right">
                  <EditableText
                    value={row.imageNotes?.right}
                    multiline
                    rich
                    as="div"
                    onCommit={(value) =>
                      onInstructionRowChange(
                        rowTarget,
                        'imageNotes.right',
                        value
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              <div
                className={`erp-work-instruction-paper__row-images${
                  isImageRow
                    ? ''
                    : ' erp-work-instruction-paper__row-images--empty'
                }${
                  isImageRow && hasImageAnnotations
                    ? ' erp-work-instruction-paper__row-images--with-annotations'
                    : ''
                }${
                  hasPositionedImageLayout
                    ? ' erp-work-instruction-paper__row-images--positioned'
                    : ''
                }`}
              >
                {isImageRow && hasImageAnnotations ? (
                  <InstructionImageAnnotationLayer
                    rowIndex={
                      pageIndex === null ? rowIndex : `${pageIndex}-${rowIndex}`
                    }
                    callouts={imageCallouts}
                    labels={imageLabels}
                  />
                ) : null}
                <input
                  ref={(node) => onInstructionRowImageInputRef(rowTarget, node)}
                  className="erp-work-instruction-paper__row-image-input"
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  multiple
                  onChange={(event) =>
                    onInstructionRowImageFileChange(rowTarget, event)
                  }
                />
                {visibleImages.map(({ image, imageIndex }, visibleIndex) => (
                  <ImageSlot
                    key={`step-${pageIndex ?? 'main'}-${rowIndex}-image-${imageIndex}`}
                    label={`工序 ${row.no || rowIndex + 1} 图片 ${visibleIndex + 1}`}
                    snapshot={image}
                    compact
                    showActions={false}
                    layoutStyle={
                      hasPositionedImageLayout
                        ? createImageLayoutStyle(image.layout)
                        : undefined
                    }
                    onUpload={(file) =>
                      onInstructionImageUpload(rowTarget, file, imageIndex)
                    }
                    onClear={() =>
                      onInstructionImageClear(rowTarget, imageIndex)
                    }
                  />
                ))}
              </div>
            )}
          </td>
        </tr>
      )
    })

  return (
    <div
      className="erp-engineering-print-paper erp-work-instruction-paper"
      ref={paperRef}
    >
      <table className="erp-work-instruction-paper__sheet">
        <colgroup>
          {WORK_INSTRUCTION_COLUMN_CLASSES.map((className) => (
            <col className={className} key={className} />
          ))}
        </colgroup>
        <tbody>
          <tr
            className="erp-work-instruction-paper__header"
            style={createWorkInstructionRowStyle(draft.headerRowHeightsMm?.[0])}
          >
            <td
              className="erp-work-instruction-paper__company-cell"
              colSpan={6}
              rowSpan={2}
            >
              <EditableText
                value={draft.companyName}
                onCommit={(value) => onFieldChange('companyName', value)}
                className="erp-work-instruction-paper__company"
              />
            </td>
            <td className="erp-work-instruction-paper__meta-label">产品编号</td>
            <td className="erp-work-instruction-paper__meta-value">
              <EditableText
                value={draft.productNo}
                onCommit={(value) => onFieldChange('productNo', value)}
              />
            </td>
            <td
              className="erp-work-instruction-paper__header-image-cell"
              rowSpan={6}
            >
              <ImageSlot
                label={headerSlot.label}
                snapshot={draft.images?.[headerSlot.key]}
                showActions={false}
              />
            </td>
          </tr>
          <tr
            className="erp-work-instruction-paper__header"
            style={createWorkInstructionRowStyle(draft.headerRowHeightsMm?.[1])}
          >
            <td className="erp-work-instruction-paper__meta-label">
              版本/版次
            </td>
            <td className="erp-work-instruction-paper__meta-value">
              <EditableText
                value={draft.versionText}
                onCommit={(value) => onFieldChange('versionText', value)}
              />
            </td>
          </tr>
          <tr
            className="erp-work-instruction-paper__header"
            style={createWorkInstructionRowStyle(draft.headerRowHeightsMm?.[2])}
          >
            <td className="erp-work-instruction-paper__title-cell" colSpan={6}>
              作业指导书
            </td>
            <td className="erp-work-instruction-paper__meta-label">工序</td>
            <td className="erp-work-instruction-paper__meta-value">
              <EditableText
                value={draft.processName}
                onCommit={(value) => onFieldChange('processName', value)}
              />
            </td>
          </tr>
          <tr
            className="erp-work-instruction-paper__header"
            style={createWorkInstructionRowStyle(draft.headerRowHeightsMm?.[3])}
          >
            <td
              className="erp-work-instruction-paper__summary-label"
              colSpan={2}
            >
              发放部门：
            </td>
            <td
              className="erp-work-instruction-paper__summary-value"
              colSpan={4}
            >
              <EditableText
                value={draft.department}
                onCommit={(value) => onFieldChange('department', value)}
              />
            </td>
            <td className="erp-work-instruction-paper__meta-label">制表</td>
            <td className="erp-work-instruction-paper__meta-value">
              <EditableText
                value={draft.maker}
                onCommit={(value) => onFieldChange('maker', value)}
              />
            </td>
          </tr>
          <tr
            className="erp-work-instruction-paper__header"
            style={createWorkInstructionRowStyle(draft.headerRowHeightsMm?.[4])}
          >
            <td
              className="erp-work-instruction-paper__summary-label"
              colSpan={2}
            >
              订单号：
            </td>
            <td
              className="erp-work-instruction-paper__summary-value"
              colSpan={4}
            >
              <EditableText
                value={draft.orderNo}
                onCommit={(value) => onFieldChange('orderNo', value)}
              />
            </td>
            <td className="erp-work-instruction-paper__meta-label">设计师</td>
            <td className="erp-work-instruction-paper__meta-value">
              <EditableText
                value={draft.designer}
                onCommit={(value) => onFieldChange('designer', value)}
              />
            </td>
          </tr>
          <tr
            className="erp-work-instruction-paper__header"
            style={createWorkInstructionRowStyle(draft.headerRowHeightsMm?.[5])}
          >
            <td
              className="erp-work-instruction-paper__summary-label"
              colSpan={2}
            >
              产品名称：
            </td>
            <td
              className="erp-work-instruction-paper__summary-value"
              colSpan={4}
            >
              <EditableText
                value={draft.productName}
                onCommit={(value) => onFieldChange('productName', value)}
              />
            </td>
            <td className="erp-work-instruction-paper__meta-label">审核</td>
            <td className="erp-work-instruction-paper__meta-value">
              <EditableText
                value={draft.auditor}
                onCommit={(value) => onFieldChange('auditor', value)}
              />
            </td>
          </tr>
          {renderInstructionRows(draft.rows)}
        </tbody>
      </table>
      {continuationPages.map((page, pageIndex) => (
        <WorkInstructionContinuationPage
          key={`work-instruction-continuation-${pageIndex}`}
          page={page}
          pageIndex={pageIndex}
          headerImageSnapshot={draft.images?.[headerSlot.key]}
          selectedInstructionRowTarget={selectedInstructionRowTarget}
          instructionRowSelectionMode={instructionRowSelectionMode}
          onSelectInstructionRow={onSelectInstructionRow}
          onInstructionRowChange={onInstructionRowChange}
          onInstructionImageUpload={onInstructionImageUpload}
          onInstructionImageClear={onInstructionImageClear}
          onInstructionRowImageInputRef={onInstructionRowImageInputRef}
          onInstructionRowImageFileChange={onInstructionRowImageFileChange}
        />
      ))}
    </div>
  )
}

function WorkInstructionContinuationPage({
  page,
  pageIndex,
  headerImageSnapshot,
  selectedInstructionRowTarget,
  instructionRowSelectionMode,
  onSelectInstructionRow,
  onInstructionRowChange,
  onInstructionImageUpload,
  onInstructionImageClear,
  onInstructionRowImageInputRef,
  onInstructionRowImageFileChange,
}) {
  const headerSlot = engineeringImageSlots.workInstruction[0]
  const renderHeaderValue = (value) => <ReadOnlyText value={value} />
  const renderInstructionRows = (rows = []) =>
    rows.map((row, rowIndex) => {
      const rowTarget = createContinuationInstructionRowTarget(
        pageIndex,
        rowIndex
      )
      if (!isWorkInstructionStepRow(row)) {
        const isSelectedRow = isSameInstructionRowTarget(
          selectedInstructionRowTarget,
          rowTarget
        )
        return (
          <tr
            className={`${getWorkInstructionFullRowClassName(row)} ${
              isSelectedRow ? 'erp-engineering-print-row--selected' : ''
            }`}
            key={`continuation-${pageIndex}-body-${rowIndex}`}
            style={createWorkInstructionRowStyle(row.heightMm)}
            onMouseDown={(event) => {
              if (!instructionRowSelectionMode) return
              clearRequestedEditableFocus()
              scheduleBlurActiveEngineeringEditable(
                event.currentTarget.ownerDocument
              )
              event.preventDefault()
              onSelectInstructionRow(rowTarget)
            }}
          >
            <td colSpan={9}>
              <EditableText
                value={row.text}
                multiline
                rich
                as="div"
                onCommit={(value) =>
                  onInstructionRowChange(rowTarget, 'text', value)
                }
              />
            </td>
          </tr>
        )
      }
      const visibleImages = (Array.isArray(row.images) ? row.images : [])
        .map((image, imageIndex) => ({ image, imageIndex }))
        .filter(({ image }) => image?.dataURL)
      const hasText = richTextHasVisibleText(row.text)
      const hasImageNotes =
        richTextHasVisibleText(row.imageNotes?.left) ||
        richTextHasVisibleText(row.imageNotes?.right)
      const isImageRow = visibleImages.length > 0
      const imageCallouts = Array.isArray(row.imageCallouts)
        ? row.imageCallouts
        : []
      const imageLabels = Array.isArray(row.imageLabels) ? row.imageLabels : []
      const hasImageAnnotations =
        imageCallouts.length > 0 || imageLabels.length > 0
      const hasPositionedImageLayout =
        isImageRow &&
        visibleImages.some(({ image }) => createImageLayoutStyle(image?.layout))
      const isSelectedRow = isSameInstructionRowTarget(
        selectedInstructionRowTarget,
        rowTarget
      )
      const rowStyle = {}
      const heightMm = Number(row.heightMm)
      const fontSizePt = Number(row.fontSizePt)
      const imageAreaHeightMm = Number(row.imageAreaHeightMm)
      if (Number.isFinite(heightMm) && heightMm > 0) {
        rowStyle['--instruction-row-min-height'] = `${heightMm}mm`
      }
      if (Number.isFinite(fontSizePt) && fontSizePt > 0) {
        rowStyle['--instruction-row-font-size'] = `${fontSizePt * (4 / 3)}px`
      }
      if (Number.isFinite(imageAreaHeightMm) && imageAreaHeightMm > 0) {
        rowStyle['--instruction-row-image-area-min-height'] =
          `${imageAreaHeightMm}mm`
      }
      return (
        <tr
          className={[
            isSelectedRow ? 'erp-engineering-print-row--selected' : '',
            isImageRow || hasImageNotes
              ? 'erp-work-instruction-paper__step-row--image'
              : 'erp-work-instruction-paper__step-row--text',
            hasImageNotes
              ? 'erp-work-instruction-paper__step-row--annotated'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          key={`continuation-${pageIndex}-row-${rowIndex}`}
          style={rowStyle}
          onMouseDown={(event) => {
            if (!instructionRowSelectionMode) return
            if (event.target.closest('input')) return
            clearRequestedEditableFocus()
            scheduleBlurActiveEngineeringEditable(
              event.currentTarget.ownerDocument
            )
            event.preventDefault()
            onSelectInstructionRow(rowTarget)
          }}
        >
          <td className="erp-work-instruction-paper__step-no">
            <EditableText
              value={row.no}
              onCommit={(value) =>
                onInstructionRowChange(rowTarget, 'no', value)
              }
            />
          </td>
          <td
            className="erp-work-instruction-paper__step-content-cell"
            colSpan={8}
          >
            {hasText || (!isImageRow && !hasImageNotes) ? (
              <EditableText
                value={row.text}
                multiline
                rich
                as="div"
                onCommit={(value) =>
                  onInstructionRowChange(rowTarget, 'text', value)
                }
              />
            ) : null}
            {hasImageNotes ? (
              <div
                className={`erp-work-instruction-paper__annotation-layout${
                  hasImageAnnotations
                    ? ' erp-work-instruction-paper__annotation-layout--with-callouts'
                    : ''
                }`}
              >
                <InstructionImageAnnotationLayer
                  rowIndex={`continuation-${pageIndex}-${rowIndex}`}
                  callouts={imageCallouts}
                  labels={imageLabels}
                />
                <div className="erp-work-instruction-paper__annotation-note erp-work-instruction-paper__annotation-note--left">
                  <EditableText
                    value={row.imageNotes?.left}
                    multiline
                    rich
                    as="div"
                    onCommit={(value) =>
                      onInstructionRowChange(
                        rowTarget,
                        'imageNotes.left',
                        value
                      )
                    }
                  />
                </div>
                <div className="erp-work-instruction-paper__annotation-images">
                  <input
                    ref={(node) =>
                      onInstructionRowImageInputRef(rowTarget, node)
                    }
                    className="erp-work-instruction-paper__row-image-input"
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    multiple
                    onChange={(event) =>
                      onInstructionRowImageFileChange(rowTarget, event)
                    }
                  />
                  <div
                    className={`erp-work-instruction-paper__row-images${
                      isImageRow
                        ? ''
                        : ' erp-work-instruction-paper__row-images--empty'
                    }${
                      hasPositionedImageLayout
                        ? ' erp-work-instruction-paper__row-images--positioned'
                        : ''
                    }`}
                  >
                    {visibleImages.map(
                      ({ image, imageIndex }, visibleIndex) => (
                        <ImageSlot
                          key={`continuation-${pageIndex}-${rowIndex}-${imageIndex}`}
                          label={`续页 ${pageIndex + 1} 工序 ${row.no || rowIndex + 1} 图片 ${
                            visibleIndex + 1
                          }`}
                          snapshot={image}
                          compact
                          showActions={false}
                          layoutStyle={
                            hasPositionedImageLayout
                              ? createImageLayoutStyle(image.layout)
                              : undefined
                          }
                          onUpload={(file) =>
                            onInstructionImageUpload(
                              rowTarget,
                              file,
                              imageIndex
                            )
                          }
                          onClear={() =>
                            onInstructionImageClear(rowTarget, imageIndex)
                          }
                        />
                      )
                    )}
                  </div>
                </div>
                <div className="erp-work-instruction-paper__annotation-note erp-work-instruction-paper__annotation-note--right">
                  <EditableText
                    value={row.imageNotes?.right}
                    multiline
                    rich
                    as="div"
                    onCommit={(value) =>
                      onInstructionRowChange(
                        rowTarget,
                        'imageNotes.right',
                        value
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              <div
                className={`erp-work-instruction-paper__row-images${
                  isImageRow
                    ? ''
                    : ' erp-work-instruction-paper__row-images--empty'
                }${
                  isImageRow && hasImageAnnotations
                    ? ' erp-work-instruction-paper__row-images--with-annotations'
                    : ''
                }${
                  hasPositionedImageLayout
                    ? ' erp-work-instruction-paper__row-images--positioned'
                    : ''
                }`}
              >
                {isImageRow && hasImageAnnotations ? (
                  <InstructionImageAnnotationLayer
                    rowIndex={`continuation-${pageIndex}-${rowIndex}`}
                    callouts={imageCallouts}
                    labels={imageLabels}
                  />
                ) : null}
                <input
                  ref={(node) => onInstructionRowImageInputRef(rowTarget, node)}
                  className="erp-work-instruction-paper__row-image-input"
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  multiple
                  onChange={(event) =>
                    onInstructionRowImageFileChange(rowTarget, event)
                  }
                />
                {visibleImages.map(({ image, imageIndex }, visibleIndex) => (
                  <ImageSlot
                    key={`continuation-${pageIndex}-${rowIndex}-${imageIndex}`}
                    label={`续页 ${pageIndex + 1} 工序 ${row.no || rowIndex + 1} 图片 ${
                      visibleIndex + 1
                    }`}
                    snapshot={image}
                    compact
                    showActions={false}
                    layoutStyle={
                      hasPositionedImageLayout
                        ? createImageLayoutStyle(image.layout)
                        : undefined
                    }
                    onUpload={(file) =>
                      onInstructionImageUpload(rowTarget, file, imageIndex)
                    }
                    onClear={() =>
                      onInstructionImageClear(rowTarget, imageIndex)
                    }
                  />
                ))}
              </div>
            )}
          </td>
        </tr>
      )
    })

  const showHeader = page.showHeader !== false

  return (
    <table
      className={[
        'erp-work-instruction-paper__sheet',
        'erp-work-instruction-paper__sheet--continuation',
        showHeader ? '' : 'erp-work-instruction-paper__sheet--body-only',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <colgroup>
        {WORK_INSTRUCTION_COLUMN_CLASSES.map((className) => (
          <col className={className} key={`${pageIndex}-${className}`} />
        ))}
      </colgroup>
      <tbody>
        {showHeader ? (
          <>
            <tr
              className="erp-work-instruction-paper__header"
              style={createWorkInstructionRowStyle(
                page.headerRowHeightsMm?.[0]
              )}
            >
              <td
                className="erp-work-instruction-paper__company-cell"
                colSpan={6}
                rowSpan={2}
              >
                <ReadOnlyText
                  value={page.companyName}
                  className="erp-work-instruction-paper__company"
                />
              </td>
              <td className="erp-work-instruction-paper__meta-label">
                产品编号
              </td>
              <td className="erp-work-instruction-paper__meta-value">
                {renderHeaderValue(page.productNo)}
              </td>
              <td
                className="erp-work-instruction-paper__header-image-cell"
                rowSpan={6}
              >
                <ImageSlot
                  label={headerSlot.label}
                  snapshot={
                    headerImageSnapshot || createEmptyEngineeringImageSlot()
                  }
                  showActions={false}
                />
              </td>
            </tr>
            <tr
              className="erp-work-instruction-paper__header"
              style={createWorkInstructionRowStyle(
                page.headerRowHeightsMm?.[1]
              )}
            >
              <td className="erp-work-instruction-paper__meta-label">
                版本/版次
              </td>
              <td className="erp-work-instruction-paper__meta-value">
                {renderHeaderValue(page.versionText)}
              </td>
            </tr>
            <tr
              className="erp-work-instruction-paper__header"
              style={createWorkInstructionRowStyle(
                page.headerRowHeightsMm?.[2]
              )}
            >
              <td
                className="erp-work-instruction-paper__title-cell"
                colSpan={6}
              >
                作业指导书
              </td>
              <td className="erp-work-instruction-paper__meta-label">工序</td>
              <td className="erp-work-instruction-paper__meta-value">
                {renderHeaderValue(page.processName)}
              </td>
            </tr>
            <tr
              className="erp-work-instruction-paper__header"
              style={createWorkInstructionRowStyle(
                page.headerRowHeightsMm?.[3]
              )}
            >
              <td
                className="erp-work-instruction-paper__summary-label"
                colSpan={2}
              >
                发放部门：
              </td>
              <td
                className="erp-work-instruction-paper__summary-value"
                colSpan={4}
              >
                {renderHeaderValue(page.department)}
              </td>
              <td className="erp-work-instruction-paper__meta-label">制表</td>
              <td className="erp-work-instruction-paper__meta-value">
                {renderHeaderValue(page.maker)}
              </td>
            </tr>
            <tr
              className="erp-work-instruction-paper__header"
              style={createWorkInstructionRowStyle(
                page.headerRowHeightsMm?.[4]
              )}
            >
              <td
                className="erp-work-instruction-paper__summary-label"
                colSpan={2}
              >
                订单号：
              </td>
              <td
                className="erp-work-instruction-paper__summary-value"
                colSpan={4}
              >
                {renderHeaderValue(page.orderNo)}
              </td>
              <td className="erp-work-instruction-paper__meta-label">设计师</td>
              <td className="erp-work-instruction-paper__meta-value">
                {renderHeaderValue(page.designer)}
              </td>
            </tr>
            <tr
              className="erp-work-instruction-paper__header"
              style={createWorkInstructionRowStyle(
                page.headerRowHeightsMm?.[5]
              )}
            >
              <td
                className="erp-work-instruction-paper__summary-label"
                colSpan={2}
              >
                产品名称：
              </td>
              <td
                className="erp-work-instruction-paper__summary-value"
                colSpan={4}
              >
                {renderHeaderValue(page.productName)}
              </td>
              <td className="erp-work-instruction-paper__meta-label">审核</td>
              <td className="erp-work-instruction-paper__meta-value">
                {renderHeaderValue(page.auditor)}
              </td>
            </tr>
          </>
        ) : null}
        {renderInstructionRows(page.rows)}
      </tbody>
    </table>
  )
}

export default function EngineeringPrintWorkspacePage() {
  const { templateKey = '' } = useParams()
  const [searchParams] = useSearchParams()
  const template = getPrintTemplateByKey(templateKey)
  const workspaceStateID = resolvePrintWorkspaceStateID(searchParams)
  const entrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const resetDraftOnOpen =
    resolvePrintWorkspaceDraftMode(searchParams) ===
    PRINT_WORKSPACE_DRAFT_MODE.FRESH
  const customerKey = useMemo(
    () => String(searchParams.get('customer_key') || '').trim(),
    [searchParams]
  )
  const businessInput = entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
  const draftStorageKey = workspaceStateID
    ? buildPrintWorkspaceDraftStorageKey(templateKey, workspaceStateID)
    : buildPrintWorkspaceDraftStorageKey(templateKey)
  const workspaceURL = useMemo(() => {
    if (!workspaceStateID || typeof window === 'undefined') {
      return ''
    }
    return buildRestorablePrintWorkspaceURL(templateKey, {
      entrySource,
      customerKey,
      stateID: workspaceStateID,
    })
  }, [customerKey, entrySource, templateKey, workspaceStateID])
  const paperRef = useRef(null)
  const stageWrapRef = useRef(null)
  const pdfPreviewPreloadRef = useRef(null)
  const materialImageInputRefs = useRef({})
  const workInstructionHeaderImageInputRef = useRef(null)
  const instructionRowImageInputRefs = useRef({})
  const [pdfAction, setPdfAction] = useState('')
  const [pdfActionStartedAt, setPdfActionStartedAt] = useState(0)
  const [toolbarStatus, setToolbarStatus] = useState(
    businessInput ? '已从业务页带入打印草稿。' : '已加载默认样例。'
  )
  const [draft, setDraft, flushDraft] = usePersistentPrintWorkspaceDraft(() =>
    loadDraft({
      templateKey,
      storageKey: draftStorageKey,
      forceFresh: resetDraftOnOpen,
      workspaceStateID,
      businessInput,
    })
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
    setToolbarStatus(
      businessInput ? '已从业务页带入打印草稿。' : '已加载默认样例。'
    )
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
  }, [
    businessInput,
    draftStorageKey,
    resetDraftOnOpen,
    setDraft,
    templateKey,
    workspaceStateID,
  ])

  useFlushPrintWorkspaceDraftOnPageExit(flushDraft)

  useEffect(() => {
    if (draftStorageKey) {
      persistPrintWorkspaceDraftSnapshot(draftStorageKey, draft)
    }
  }, [draft, draftStorageKey])

  useEffect(() => {
    if (!paperRef.current) return undefined
    return watchPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-engineering-print-paper--continued',
    })
  }, [])

  usePrintWorkspaceWindowSnapshot({
    stateID: workspaceStateID,
    templateKey,
    workspaceURL,
    observeNodeRef: paperRef,
    suspended: pdfAction !== '',
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
        setToolbarStatus('PDF 操作等待超时，请重新点击。')
      },
      Math.max(0, PDF_ACTION_UI_STALE_TIMEOUT_MS - elapsed)
    )
    return () => window.clearTimeout(timeoutID)
  }, [pdfAction, pdfActionStartedAt])

  if (!engineeringPrintTemplateKeys.has(templateKey) || !template) {
    return <Navigate to="/erp/print-center" replace />
  }

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

  const showEditorMessage = (result, fallback = '操作失败') => {
    if (!result?.ok) {
      message.warning(result?.message || fallback)
      return false
    }
    setToolbarStatus(result.message || '打印模板已更新。')
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
  }

  const handleResetDraft = () => {
    setDraft(createEngineeringPrintDraft(templateKey))
    resetSelectionForTemplate()
    setToolbarStatus('已恢复默认样例。')
    message.success('已恢复默认样例')
  }

  const handleBlankDraft = () => {
    setDraft(createBlankEngineeringDraft(templateKey))
    resetSelectionForTemplate()
    setToolbarStatus('已生成空白模板，版式和可编辑区域已保留。')
    message.success('已生成空白模板')
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
      if (!showEditorMessage(result, '物料行操作失败')) return current
      setSelectedMaterialLineIndex(result.selectedIndex)
      setMaterialMergeSelectionAnchor(null)
      setMaterialMergeSelectionFocus(null)
      setMaterialActiveCell(null)
      return result.draft
    })
  }

  const toggleMaterialLineSelectionMode = () => {
    setMaterialLineSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setMaterialCellSelectionMode(false)
        setMaterialMergeSelectionAnchor(null)
        setMaterialMergeSelectionFocus(null)
        setMaterialActiveCell(null)
        setToolbarStatus('已进入物料明细行选择模式，请点击表格中的目标行。')
      } else {
        setSelectedMaterialLineIndex(null)
        setToolbarStatus('已退出物料明细行选择模式。')
      }
      return nextValue
    })
  }

  const selectMaterialLine = (rowIndex) => {
    setSelectedMaterialLineIndex(rowIndex)
    setToolbarStatus(
      `已选中物料明细第 ${rowIndex + 1} 行，可继续上插 / 下插 / 移除。`
    )
  }

  const toggleMaterialCellSelectionMode = () => {
    setMaterialCellSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setMaterialLineSelectionMode(false)
        setSelectedMaterialLineIndex(null)
      }
      setMaterialMergeSelectionAnchor(null)
      setMaterialMergeSelectionFocus(null)
      setMaterialActiveCell(null)
      setToolbarStatus(
        nextValue
          ? '已进入物料明细单元格选区模式，请依次点击起点和终点。'
          : '已退出物料明细单元格选区模式。'
      )
      return nextValue
    })
  }

  const selectMaterialCell = (rowIndex, colIndex) => {
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
      setToolbarStatus(
        `已选中第 ${rowIndex + 1} 行第 ${colIndex + 1} 列，请继续点终点或直接拆分当前合并块。`
      )
      return
    }

    setMaterialMergeSelectionFocus(nextCell)
    const nextSelection = normalizeCellSelection(
      materialMergeSelectionAnchor,
      nextCell
    )
    setToolbarStatus(
      `已选中 ${nextSelection.rowEnd - nextSelection.rowStart + 1} × ${
        nextSelection.colEnd - nextSelection.colStart + 1
      } 的物料明细区域，可继续合并。`
    )
  }

  const applyMaterialMerge = () => {
    setDraft((current) => {
      const result = applyMaterialDetailCellMerge({
        lines: current.lines,
        merges: current.merges,
        selection: materialMergeSelection,
      })
      if (!showEditorMessage(result, '合并物料明细单元格失败')) return current
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
      if (!showEditorMessage(result, '拆分物料明细单元格失败')) return current
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
      if (!showEditorMessage(result, '色卡块操作失败')) return current
      setSelectedColorBlockIndex(result.selectedIndex)
      setSelectedColorLine(null)
      return result.draft
    })
  }

  const toggleColorBlockSelectionMode = () => {
    setColorBlockSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setColorLineSelectionMode(false)
        setSelectedColorLine(null)
        setToolbarStatus('已进入色卡块选择模式，请点击右侧色卡物料块。')
      } else {
        setSelectedColorBlockIndex(null)
        setSelectedColorLine(null)
        setToolbarStatus('已退出色卡块选择模式。')
      }
      return nextValue
    })
  }

  const toggleColorLineSelectionMode = () => {
    setColorLineSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setColorBlockSelectionMode(false)
        setSelectedColorBlockIndex(null)
        setSelectedColorLine(null)
        setToolbarStatus('已进入色卡行选择模式，请点击右侧色卡块内目标行。')
      } else {
        setSelectedColorLine(null)
        setToolbarStatus('已退出色卡行选择模式。')
      }
      return nextValue
    })
  }

  const selectColorBlock = (blockIndex) => {
    setSelectedColorBlockIndex(blockIndex)
    setSelectedColorLine(null)
    setToolbarStatus(
      `已选中色卡块 ${blockIndex + 1}，可继续上插 / 下插 / 移除。`
    )
  }

  const selectColorLine = (blockIndex, lineIndex, persisted = true) => {
    setSelectedColorBlockIndex(null)
    setSelectedColorLine({ blockIndex, lineIndex, persisted })
    setToolbarStatus(
      persisted
        ? `已选中色卡块 ${blockIndex + 1} 第 ${lineIndex + 1} 行，可继续上插 / 下插 / 移除。`
        : `已选中色卡块 ${blockIndex + 1} 第 ${lineIndex + 1} 个空白位，可继续上插 / 下插。`
    )
  }

  const applyColorLineAction = (action, position = 'after') => {
    const blockIndex = selectedColorLine?.blockIndex ?? selectedColorBlockIndex
    const lineIndex = selectedColorLine?.lineIndex ?? null
    if (action === 'remove' && selectedColorLine?.persisted === false) {
      setToolbarStatus('当前空白位还不是色卡行，请先上插或下插生成空白行。')
      return
    }
    setDraft((current) => {
      const result =
        action === 'remove'
          ? removeColorCardLine(current, blockIndex, lineIndex)
          : insertColorCardLine(current, blockIndex, lineIndex, position)
      if (!showEditorMessage(result, '色卡行操作失败')) return current
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
    setInstructionRowSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setToolbarStatus('已进入行选择模式，请点击作业指导书中的目标行。')
      } else {
        setSelectedInstructionRowTarget(null)
        setToolbarStatus('已退出行选择模式。')
      }
      return nextValue
    })
  }

  const selectInstructionRow = (target) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    setSelectedInstructionRowTarget(normalizedTarget)
    setToolbarStatus(
      `已选中作业指导书${formatInstructionRowTargetLabel(
        normalizedTarget
      )}，可继续上插 / 下插 / 移除 / 调整行类型。`
    )
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
      if (!showEditorMessage(result, '作业行操作失败')) return current
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
      if (!showEditorMessage(result, '行类型调整失败')) return current
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
    try {
      const snapshot = await createImageSnapshot(file)
      setDraft((current) => ({
        ...current,
        images: { ...current.images, [slotKey]: snapshot },
      }))
      setToolbarStatus('图片已更新，打印和 PDF 会使用当前图片快照。')
    } catch (error) {
      message.error(getActionErrorMessage(error, '上传图片失败'))
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
  }

  const handleMaterialImageUploadClick = (slotKey) => {
    materialImageInputRefs.current[slotKey]?.click()
  }

  const handleMaterialImageFileChange = (slotKey, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) uploadImage(slotKey, file)
  }

  const handleInstructionRowImageUploadClick = (target) => {
    const normalizedTarget = normalizeInstructionRowTarget(target)
    if (!normalizedTarget) return
    const row = getInstructionRowsForTarget(draft, normalizedTarget)[
      normalizedTarget.rowIndex
    ]
    if (!isWorkInstructionStepRow(row)) {
      message.warning('图片只能添加到编号行。')
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
      message.warning('图片只能添加到编号行。')
      return
    }
    try {
      const snapshots = []
      for (const file of files) {
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
      setToolbarStatus(
        `图片已更新，${formatInstructionRowTargetLabel(
          normalizedTarget
        )}本次新增 ${snapshots.length} 张。`
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '上传工序图片失败'))
    }
  }

  const uploadInstructionImage = async (
    targetOrSlotKey,
    file,
    imageIndex = 0
  ) => {
    if (targetOrSlotKey === 'header') {
      await uploadImage('header', file)
      return
    }
    const normalizedTarget = normalizeInstructionRowTarget(targetOrSlotKey)
    if (!normalizedTarget) return
    const row = getInstructionRowsForTarget(draft, normalizedTarget)[
      normalizedTarget.rowIndex
    ]
    if (!isWorkInstructionStepRow(row)) {
      message.warning('图片只能添加到编号行。')
      return
    }
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
      setToolbarStatus('图片已更新。')
    } catch (error) {
      message.error(getActionErrorMessage(error, '上传工序图片失败'))
    }
  }

  const clearInstructionImage = (targetOrSlotKey, imageIndex = 0) => {
    if (targetOrSlotKey === 'header') {
      clearImage('header')
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
    setToolbarStatus(
      `已清空作业指导书${formatInstructionRowTargetLabel(
        normalizedTarget
      )}图片。`
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

  const createDraftFieldRow = ({
    key,
    label,
    multiline = false,
    rows = undefined,
  }) => ({
    key,
    label,
    value: plainTextFromRichHTML(draft[key]),
    multiline,
    rows,
    onChange: (value) => updateField(key, value),
  })

  const materialFieldRows = () => [
    createDraftFieldRow({ key: 'companyName', label: '公司名称' }),
    createDraftFieldRow({ key: 'productNo', label: '产品编号' }),
    createDraftFieldRow({ key: 'orderNo', label: '订单号' }),
    createDraftFieldRow({ key: 'productName', label: '产品名称' }),
    createDraftFieldRow({ key: 'quantityText', label: '数量' }),
    createDraftFieldRow({ key: 'spareText', label: '备品' }),
    createDraftFieldRow({ key: 'dateText', label: '日期' }),
    createDraftFieldRow({ key: 'designer', label: '设计师' }),
    createDraftFieldRow({ key: 'maker', label: '制表' }),
    createDraftFieldRow({ key: 'auditor', label: '审核' }),
    createDraftFieldRow({ key: 'hairDirection', label: '毛向' }),
    createDraftFieldRow({
      key: 'topRemark',
      label: '顶部备注',
      multiline: true,
      rows: 2,
    }),
    ...MATERIAL_DETAIL_COLUMNS.map((column, columnIndex) => ({
      key: `columnLabels.${columnIndex}`,
      label: `表头 ${columnIndex + 1} ${column.label.replace(/\n/g, '')}`,
      value: plainTextFromRichHTML(
        draft.columnLabels?.[columnIndex] || column.label
      ),
      multiline: column.label.includes('\n'),
      rows: 2,
      onChange: (value) => updateMaterialColumnLabel(columnIndex, value),
    })),
    ...(draft.lines || []).flatMap((line, rowIndex) =>
      MATERIAL_DETAIL_COLUMNS.map((column) => ({
        key: `lines.${rowIndex}.${column.key}`,
        label: `物料行 ${rowIndex + 1} ${column.label.replace(/\n/g, '')}`,
        value: plainTextFromRichHTML(line[column.key]),
        multiline: [
          'materialName',
          'processBase',
          'processMethod',
          'remark',
        ].includes(column.key),
        rows: 2,
        onChange: (value) => updateMaterialLine(rowIndex, column.key, value),
      }))
    ),
  ]

  const colorCardFieldRows = () => [
    createDraftFieldRow({ key: 'companyName', label: '公司名称' }),
    createDraftFieldRow({ key: 'productNo', label: '产品编号' }),
    createDraftFieldRow({ key: 'productName', label: '产品名称' }),
    createDraftFieldRow({ key: 'maker', label: '制卡' }),
    createDraftFieldRow({ key: 'dateText', label: '日期' }),
    createDraftFieldRow({ key: 'auditor', label: '审核' }),
    createDraftFieldRow({ key: 'reviewer', label: '复核' }),
    ...(draft.blocks || []).flatMap((block, blockIndex) => [
      {
        key: `blocks.${blockIndex}.materialName`,
        label: `色卡块 ${blockIndex + 1} 物料名称`,
        value: plainTextFromRichHTML(block.materialName),
        onChange: (value) =>
          updateColorBlockField(blockIndex, 'materialName', value),
      },
      {
        key: `blocks.${blockIndex}.vendor`,
        label: `色卡块 ${blockIndex + 1} 厂商`,
        value: plainTextFromRichHTML(block.vendor),
        onChange: (value) => updateColorBlockField(blockIndex, 'vendor', value),
      },
      ...(block.lines || []).flatMap((line, lineIndex) => [
        {
          key: `blocks.${blockIndex}.lines.${lineIndex}.position`,
          label: `色卡块 ${blockIndex + 1} 行 ${lineIndex + 1} 部位`,
          value: plainTextFromRichHTML(line.position),
          onChange: (value) =>
            updateColorBlockField(
              blockIndex,
              `lines.${lineIndex}.position`,
              value
            ),
        },
        {
          key: `blocks.${blockIndex}.lines.${lineIndex}.method`,
          label: `色卡块 ${blockIndex + 1} 行 ${lineIndex + 1} 做法`,
          value: plainTextFromRichHTML(line.method),
          multiline: true,
          rows: 2,
          onChange: (value) =>
            updateColorBlockField(
              blockIndex,
              `lines.${lineIndex}.method`,
              value
            ),
        },
      ]),
    ]),
  ]

  const createWorkInstructionRowFieldRows = ({
    rows = [],
    pageIndex = null,
    labelPrefix = '正文行',
  }) =>
    rows.flatMap((row, rowIndex) => {
      const target =
        pageIndex === null
          ? createMainInstructionRowTarget(rowIndex)
          : createContinuationInstructionRowTarget(pageIndex, rowIndex)
      const rowType = getWorkInstructionRowType(row)
      const typeLabel =
        rowType === WORK_INSTRUCTION_ROW_TYPES.title
          ? '标题行'
          : rowType === WORK_INSTRUCTION_ROW_TYPES.text
            ? '文本行'
            : '编号行'
      const baseRows = [
        {
          key:
            pageIndex === null
              ? `rows.${rowIndex}.type`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.type`,
          label: `${labelPrefix} ${rowIndex + 1} 类型`,
          value: typeLabel,
          readOnly: true,
        },
        ...(rowType === WORK_INSTRUCTION_ROW_TYPES.step
          ? [
              {
                key:
                  pageIndex === null
                    ? `rows.${rowIndex}.no`
                    : `continuationPages.${pageIndex}.rows.${rowIndex}.no`,
                label: `${labelPrefix} ${rowIndex + 1} 行号`,
                value: row.no ?? '',
                onChange: (value) =>
                  updateInstructionRowValue(target, 'no', value),
              },
            ]
          : []),
        {
          key:
            pageIndex === null
              ? `rows.${rowIndex}.text`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.text`,
          label: `${labelPrefix} ${rowIndex + 1} 内容`,
          value: plainTextFromRichHTML(row.text),
          multiline: true,
          rows: 3,
          onChange: (value) => updateInstructionRowValue(target, 'text', value),
        },
      ]
      if (rowType !== WORK_INSTRUCTION_ROW_TYPES.step) {
        return baseRows
      }
      const noteRows = ['left', 'right']
        .filter((noteKey) => richTextHasVisibleText(row.imageNotes?.[noteKey]))
        .map((noteKey) => ({
          key:
            pageIndex === null
              ? `rows.${rowIndex}.imageNotes.${noteKey}`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.imageNotes.${noteKey}`,
          label: `${labelPrefix} ${rowIndex + 1} ${
            noteKey === 'left' ? '左侧图片批注' : '右侧图片批注'
          }`,
          value: plainTextFromRichHTML(row.imageNotes?.[noteKey]),
          multiline: true,
          rows: 3,
          onChange: (value) =>
            updateInstructionRowValue(target, `imageNotes.${noteKey}`, value),
        }))
      const labelRows = (
        Array.isArray(row.imageLabels) ? row.imageLabels : []
      ).flatMap((label, labelIndex) => [
        {
          key:
            pageIndex === null
              ? `rows.${rowIndex}.imageLabels.${labelIndex}.text`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.imageLabels.${labelIndex}.text`,
          label: `${labelPrefix} ${rowIndex + 1} 图片说明 ${labelIndex + 1} 文案`,
          value: label.text ?? '',
          multiline: true,
          rows: 2,
          onChange: (value) =>
            updateInstructionRowValue(
              target,
              `imageLabels.${labelIndex}.text`,
              value
            ),
        },
        {
          key:
            pageIndex === null
              ? `rows.${rowIndex}.imageLabels.${labelIndex}.x`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.imageLabels.${labelIndex}.x`,
          label: `${labelPrefix} ${rowIndex + 1} 图片说明 ${labelIndex + 1} X`,
          value: String(label.x ?? ''),
          onChange: (value) =>
            updateInstructionRowValue(
              target,
              `imageLabels.${labelIndex}.x`,
              value
            ),
        },
        {
          key:
            pageIndex === null
              ? `rows.${rowIndex}.imageLabels.${labelIndex}.y`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.imageLabels.${labelIndex}.y`,
          label: `${labelPrefix} ${rowIndex + 1} 图片说明 ${labelIndex + 1} Y`,
          value: String(label.y ?? ''),
          onChange: (value) =>
            updateInstructionRowValue(
              target,
              `imageLabels.${labelIndex}.y`,
              value
            ),
        },
        {
          key:
            pageIndex === null
              ? `rows.${rowIndex}.imageLabels.${labelIndex}.width`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.imageLabels.${labelIndex}.width`,
          label: `${labelPrefix} ${rowIndex + 1} 图片说明 ${labelIndex + 1} 宽度`,
          value: String(label.width ?? ''),
          onChange: (value) =>
            updateInstructionRowValue(
              target,
              `imageLabels.${labelIndex}.width`,
              value
            ),
        },
      ])
      const calloutRows = (
        Array.isArray(row.imageCallouts) ? row.imageCallouts : []
      ).flatMap((callout, calloutIndex) =>
        ['x1', 'y1', 'x2', 'y2'].map((calloutKey) => ({
          key:
            pageIndex === null
              ? `rows.${rowIndex}.imageCallouts.${calloutIndex}.${calloutKey}`
              : `continuationPages.${pageIndex}.rows.${rowIndex}.imageCallouts.${calloutIndex}.${calloutKey}`,
          label: `${labelPrefix} ${rowIndex + 1} 标注连线 ${
            calloutIndex + 1
          } ${calloutKey.toUpperCase()}`,
          value: String(callout[calloutKey] ?? ''),
          onChange: (value) =>
            updateInstructionRowValue(
              target,
              `imageCallouts.${calloutIndex}.${calloutKey}`,
              value
            ),
        }))
      )
      return [...baseRows, ...noteRows, ...labelRows, ...calloutRows]
    })

  const workInstructionFieldRows = () => [
    createDraftFieldRow({ key: 'companyName', label: '公司名称' }),
    createDraftFieldRow({ key: 'productNo', label: '产品编号' }),
    createDraftFieldRow({ key: 'versionText', label: '版本/版次' }),
    createDraftFieldRow({ key: 'processName', label: '工序' }),
    createDraftFieldRow({ key: 'department', label: '发放部门' }),
    createDraftFieldRow({ key: 'orderNo', label: '订单号' }),
    createDraftFieldRow({ key: 'productName', label: '产品名称' }),
    createDraftFieldRow({ key: 'maker', label: '制表' }),
    createDraftFieldRow({ key: 'designer', label: '设计师' }),
    createDraftFieldRow({ key: 'auditor', label: '审核' }),
    ...createWorkInstructionRowFieldRows({
      rows: draft.rows || [],
      labelPrefix: '首页正文行',
    }),
    ...(Array.isArray(draft.continuationPages)
      ? draft.continuationPages.flatMap((page, pageIndex) =>
          createWorkInstructionRowFieldRows({
            rows: Array.isArray(page.rows) ? page.rows : [],
            pageIndex,
            labelPrefix: `续页 ${pageIndex + 1} 正文行`,
          })
        )
      : []),
  ]

  const fieldRows =
    templateKey === MATERIAL_DETAIL_TEMPLATE_KEY
      ? materialFieldRows()
      : templateKey === COLOR_CARD_TEMPLATE_KEY
        ? colorCardFieldRows()
        : workInstructionFieldRows()

  const materialImageUploadBar =
    templateKey === MATERIAL_DETAIL_TEMPLATE_KEY ? (
      <section className="erp-processing-contract-upload-bar">
        <div className="erp-processing-contract-upload-bar__copy">
          物料明细右上产品图和底部补充图通过这里上传，会同步到右侧打印纸面；底部补充图未上传时不占用纸面空间。
        </div>
        <div className="erp-processing-contract-upload-bar__actions">
          {engineeringImageSlots.materialDetail.map((slot) => {
            const snapshot = draft.images?.[slot.key]
            const hasImage = Boolean(snapshot?.dataURL)
            return (
              <div
                className="erp-processing-contract-upload-bar__item"
                key={slot.key}
              >
                <input
                  ref={(node) => {
                    materialImageInputRefs.current[slot.key] = node
                  }}
                  className="erp-processing-contract-upload-bar__input"
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  onChange={(event) =>
                    handleMaterialImageFileChange(slot.key, event)
                  }
                />
                <button
                  type="button"
                  className={getToolbarButtonClassName({ active: hasImage })}
                  onClick={() => handleMaterialImageUploadClick(slot.key)}
                  title={
                    hasImage
                      ? `${slot.label}：${snapshot.name}`
                      : `上传${slot.label}`
                  }
                >
                  上传{slot.label}
                </button>
                {hasImage ? (
                  <button
                    type="button"
                    className={getToolbarButtonClassName()}
                    onClick={() => clearImage(slot.key)}
                  >
                    清空
                  </button>
                ) : null}
                <span
                  className="erp-processing-contract-upload-bar__status"
                  title={snapshot?.name || slot.label}
                >
                  {hasImage ? `已同步：${snapshot.name}` : '未上传'}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    ) : null

  const workInstructionHeaderImageUploadBar =
    templateKey === WORK_INSTRUCTION_TEMPLATE_KEY ? (
      <section className="erp-processing-contract-upload-bar">
        <div className="erp-processing-contract-upload-bar__copy">
          作业指导书右上产品图通过这里上传，会同步到右侧打印纸面。
        </div>
        <div className="erp-processing-contract-upload-bar__actions">
          {engineeringImageSlots.workInstruction.map((slot) => {
            const snapshot = draft.images?.[slot.key]
            const hasImage = Boolean(snapshot?.dataURL)
            return (
              <div
                className="erp-processing-contract-upload-bar__item"
                key={slot.key}
              >
                <input
                  ref={workInstructionHeaderImageInputRef}
                  className="erp-processing-contract-upload-bar__input"
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) uploadInstructionImage('header', file)
                  }}
                />
                <button
                  type="button"
                  className={getToolbarButtonClassName({ active: hasImage })}
                  onClick={() =>
                    workInstructionHeaderImageInputRef.current?.click()
                  }
                  title={
                    hasImage
                      ? `${slot.label}：${snapshot.name}`
                      : `上传${slot.label}`
                  }
                >
                  上传{slot.label}
                </button>
                {hasImage ? (
                  <button
                    type="button"
                    className={getToolbarButtonClassName()}
                    onClick={() => clearInstructionImage('header')}
                  >
                    清空
                  </button>
                ) : null}
                <span
                  className="erp-processing-contract-upload-bar__status"
                  title={snapshot?.name || slot.label}
                >
                  {hasImage ? `已同步：${snapshot.name}` : '未上传'}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    ) : null

  const panelActions =
    materialImageUploadBar || workInstructionHeaderImageUploadBar

  const warmupPreviewPDF = () => {
    if (!paperRef.current || pdfPreviewPreloadRef.current) return
    pdfPreviewPreloadRef.current = schedulePdfPreviewWarmup(
      () =>
        preloadPdfPreviewFromElement(paperRef.current, {
          title: template.title,
          fileName: `${template.key}.pdf`,
          templateKey: template.key,
          customerKey,
        }),
      { delayMs: 180 }
    )
  }

  const handlePreviewPDF = async () => {
    if (!paperRef.current) return
    try {
      setPdfAction('preview')
      setPdfActionStartedAt(Date.now())
      syncPrintPageMarginForPaper(paperRef.current, {
        stageWrapElement: stageWrapRef.current,
        paperContinuedClass: 'erp-engineering-print-paper--continued',
      })
      const opened = await openPdfPreviewFromElement(paperRef.current, {
        title: template.title,
        fileName: `${template.key}.pdf`,
        templateKey: template.key,
        customerKey,
        preloaded: pdfPreviewPreloadRef.current,
      })
      pdfPreviewPreloadRef.current = null
      if (opened) setToolbarStatus('PDF 预览已打开。')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开 PDF 预览失败'))
    } finally {
      setPdfAction('')
      setPdfActionStartedAt(0)
    }
  }

  const handleDownloadPDF = async () => {
    if (!paperRef.current) return
    try {
      setPdfAction('download')
      setPdfActionStartedAt(Date.now())
      await downloadPdfFromElement(paperRef.current, {
        title: template.title,
        fileName: `${template.key}.pdf`,
        templateKey: template.key,
        customerKey,
      })
      setToolbarStatus('PDF 已开始下载。')
    } catch (error) {
      message.error(getActionErrorMessage(error, '下载 PDF 失败'))
    } finally {
      setPdfAction('')
      setPdfActionStartedAt(0)
    }
  }

  const handlePrint = () => {
    if (paperRef.current) {
      syncPrintPageMarginForPaper(paperRef.current, {
        stageWrapElement: stageWrapRef.current,
        paperContinuedClass: 'erp-engineering-print-paper--continued',
      })
    }
    window.print()
  }

  const applyRichTextCommand = (command) => {
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

  const templateEditorActions = (() => {
    if (templateKey === MATERIAL_DETAIL_TEMPLATE_KEY) {
      return (
        <div className="erp-print-shell__toolbar-group">
          <button
            type="button"
            className={getToolbarButtonClassName()}
            disabled={selectedMaterialLineIndex === null}
            onClick={() => applyMaterialLineAction('insert', 'before')}
          >
            上插一行
          </button>
          <button
            type="button"
            className={getToolbarButtonClassName()}
            disabled={selectedMaterialLineIndex === null}
            onClick={() => applyMaterialLineAction('insert', 'after')}
          >
            下插一行
          </button>
          <button
            type="button"
            className={getToolbarButtonClassName()}
            disabled={
              selectedMaterialLineIndex === null || draft.lines.length <= 1
            }
            onClick={() => applyMaterialLineAction('remove')}
          >
            移除当前行
          </button>
          <button
            type="button"
            className={getToolbarButtonClassName({
              active: materialLineSelectionMode,
            })}
            onClick={toggleMaterialLineSelectionMode}
          >
            {materialLineSelectionMode ? '取消选择' : '选择明细行'}
          </button>
          <button
            type="button"
            className={getToolbarButtonClassName({
              active: materialCellSelectionMode,
            })}
            onClick={toggleMaterialCellSelectionMode}
          >
            {materialCellSelectionMode ? '取消选区' : '选择单元格'}
          </button>
          <button
            type="button"
            className={getToolbarButtonClassName()}
            disabled={!canApplyMaterialMerge}
            onClick={applyMaterialMerge}
          >
            合并选区
          </button>
          <button
            type="button"
            className={getToolbarButtonClassName()}
            disabled={!canSplitMaterialMerge}
            onClick={splitMaterialMerge}
          >
            拆分当前
          </button>
          <span className="erp-print-shell__counter">
            物料行: {draft.lines.length}/{ENGINEERING_PRINT_LIMITS.materialRows}
          </span>
        </div>
      )
    }

    if (templateKey === COLOR_CARD_TEMPLATE_KEY) {
      return (
        <>
          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              disabled={selectedColorBlockIndex === null}
              onClick={() => applyColorBlockAction('insert', 'before')}
            >
              上插色卡块
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              disabled={selectedColorBlockIndex === null}
              onClick={() => applyColorBlockAction('insert', 'after')}
            >
              下插色卡块
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              disabled={
                selectedColorBlockIndex === null || draft.blocks.length <= 1
              }
              onClick={() => applyColorBlockAction('remove')}
            >
              移除当前块
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName({
                active: colorBlockSelectionMode,
              })}
              onClick={toggleColorBlockSelectionMode}
            >
              {colorBlockSelectionMode ? '取消选择' : '选择色卡块'}
            </button>
            <span className="erp-print-shell__counter">
              色卡块: {draft.blocks.length}/
              {ENGINEERING_PRINT_LIMITS.colorBlocks}
            </span>
          </div>
          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              disabled={!selectedColorLine}
              onClick={() => applyColorLineAction('insert', 'before')}
            >
              上插一行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              disabled={!selectedColorLine}
              onClick={() => applyColorLineAction('insert', 'after')}
            >
              下插一行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              disabled={
                !selectedColorLine || selectedColorLine.persisted === false
              }
              onClick={() => applyColorLineAction('remove')}
            >
              移除当前行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName({
                active: colorLineSelectionMode,
              })}
              onClick={toggleColorLineSelectionMode}
            >
              {colorLineSelectionMode ? '取消选择' : '选择色卡行'}
            </button>
          </div>
        </>
      )
    }

    return (
      <div className="erp-print-shell__toolbar-group">
        <button
          type="button"
          className={getToolbarButtonClassName()}
          disabled={selectedWorkInstructionRowTarget === null}
          onClick={() =>
            applySelectedWorkInstructionRowAction('insert', 'before')
          }
        >
          上插一行
        </button>
        <button
          type="button"
          className={getToolbarButtonClassName()}
          disabled={selectedWorkInstructionRowTarget === null}
          onClick={() =>
            applySelectedWorkInstructionRowAction('insert', 'after')
          }
        >
          下插一行
        </button>
        <button
          type="button"
          className={getToolbarButtonClassName()}
          disabled={
            selectedWorkInstructionRowTarget === null ||
            selectedInstructionRows.length <= 1
          }
          onClick={() => applySelectedWorkInstructionRowAction('remove')}
        >
          移除当前行
        </button>
        {[
          [WORK_INSTRUCTION_ROW_TYPES.title, '设为标题行'],
          [WORK_INSTRUCTION_ROW_TYPES.step, '设为编号行'],
          [WORK_INSTRUCTION_ROW_TYPES.text, '设为文本行'],
        ].map(([type, label]) => (
          <button
            type="button"
            className={getToolbarButtonClassName({
              active:
                getWorkInstructionRowType(selectedInstructionRow) === type,
            })}
            disabled={selectedWorkInstructionRowTarget === null}
            key={type}
            onClick={() => applyInstructionRowType(type)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={getToolbarButtonClassName()}
          disabled={
            selectedWorkInstructionRowTarget === null ||
            !selectedInstructionRowIsStep
          }
          onClick={() =>
            handleInstructionRowImageUploadClick(
              selectedWorkInstructionRowTarget
            )
          }
        >
          给当前行加图
        </button>
        <button
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
        </button>
        <button
          type="button"
          className={getToolbarButtonClassName({
            active: instructionRowSelectionMode,
          })}
          onClick={toggleInstructionRowSelectionMode}
        >
          {instructionRowSelectionMode ? '取消选择' : '选择行'}
        </button>
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
    )
  })()

  const richTextToolbarActions = (
    <div className="erp-print-shell__toolbar-group">
      <button
        type="button"
        className={getToolbarButtonClassName()}
        onMouseDown={(event) => {
          event.preventDefault()
          applyRichTextCommand('red')
        }}
      >
        文字标红/取消
      </button>
    </div>
  )

  const toolbarActions = (
    <>
      {templateEditorActions}
      {richTextToolbarActions}
      <div className="erp-print-shell__toolbar-group">
        <button
          type="button"
          className={getToolbarButtonClassName()}
          onClick={handleResetDraft}
        >
          恢复样例
        </button>
        <button
          type="button"
          className={getToolbarButtonClassName()}
          onClick={handleBlankDraft}
        >
          空白模板
        </button>
      </div>
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
    </>
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
    <PrintWorkspaceShell
      title={template.title}
      sourceTag={businessInput ? '业务记录带值' : '使用默认模板'}
      statusText={toolbarStatus}
      workspaceClassName="erp-engineering-print-workspace-shell"
      panelTip="左侧维护关键字段；右侧纸面可直接编辑，打印和 PDF 只输出右侧纸面。"
      panelActions={panelActions}
      toolbarActions={toolbarActions}
      fieldRows={fieldRows.map((row) => ({
        ...row,
        readOnly: false,
        value: row.value ?? '',
        onChange: row.onChange,
      }))}
      prepareSignature={`${templateKey}:${workspaceStateID}:${businessInput}`}
    >
      <div className="erp-print-shell__stage-wrap" ref={stageWrapRef}>
        {paper}
      </div>
    </PrintWorkspaceShell>
  )
}
