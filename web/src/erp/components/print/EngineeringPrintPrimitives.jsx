import React, { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { WorkInstructionImageAnnotationLayer } from './WorkInstructionImageAnnotationEditor.jsx'
import {
  createEmptyEngineeringImageSlot,
  engineeringImageSlots,
} from '../../data/engineeringPrintTemplates.mjs'
import { runSilentPrintWorkspaceDraftUpdate } from '../../utils/usePersistentPrintWorkspaceDraft.js'
import { resolveWorkInstructionAnnotationLayout } from '../../utils/workInstructionImageAnnotations.mjs'

const ATTACHMENT_ACCEPT = 'image/*,.svg'

const EDITABLE_CLASS = 'erp-engineering-print-editable'

const EDITABLE_FOCUS_RESTORE_DELAYS_MS = [0, 80, 360, 520, 900]

let requestedEditableFocusID = ''

let requestedEditableFocusIndex = -1

const editableFocusBoundaryDocuments = new WeakSet()

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
        data-print-empty={
          !String(value ?? '')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, '')
            .trim()
        }
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
      data-print-empty={
        !String(value ?? '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, '')
          .trim()
      }
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
  annotations = [],
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
  const hasAnnotations =
    hasImage && Array.isArray(annotations) && annotations.length > 0
  const hasAnnotationSidebar =
    hasAnnotations &&
    resolveWorkInstructionAnnotationLayout({ ...snapshot, annotations }) ===
      'sidebar'
  return (
    <div
      className={`erp-engineering-print-image-slot${
        compact ? ' erp-engineering-print-image-slot--compact' : ''
      }${hasImage ? '' : ' erp-engineering-print-image-slot--empty'}${
        showActions ? '' : ' erp-engineering-print-image-slot--readonly'
      }${hasCrop ? ' erp-engineering-print-image-slot--cropped' : ''}${
        layoutStyle ? ' erp-engineering-print-image-slot--positioned' : ''
      }${hasAnnotations ? ' erp-engineering-print-image-slot--annotated' : ''}${
        hasAnnotationSidebar
          ? ' erp-engineering-print-image-slot--with-callout'
          : ''
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
      <div className="erp-engineering-print-image-slot__viewport">
        {hasImage ? (
          <img src={snapshot.dataURL} alt={label} style={cropStyle} />
        ) : (
          <span>{label}</span>
        )}
      </div>
      {hasAnnotations ? (
        <WorkInstructionImageAnnotationLayer annotations={annotations} />
      ) : null}
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

function WorkInstructionHeaderImages({ images = {} }) {
  const populatedSlots = engineeringImageSlots.workInstruction
    .map((slot) => ({ slot, snapshot: images?.[slot.key] }))
    .filter(({ snapshot }) => Boolean(snapshot?.dataURL))
  const visibleSlots = populatedSlots.length
    ? populatedSlots
    : [
        {
          slot: engineeringImageSlots.workInstruction[0],
          snapshot: createEmptyEngineeringImageSlot(),
        },
      ]

  return (
    <div
      className={`erp-work-instruction-paper__header-images erp-work-instruction-paper__header-images--count-${visibleSlots.length}`}
      data-work-instruction-header-image-count={populatedSlots.length}
    >
      {visibleSlots.map(({ slot, snapshot }) => (
        <ImageSlot
          key={slot.key}
          label={slot.label}
          snapshot={snapshot}
          showActions={false}
        />
      ))}
    </div>
  )
}

export {
  ATTACHMENT_ACCEPT,
  EDITABLE_CLASS,
  sanitizeRichEditableHTML,
  clearRequestedEditableFocus,
  EditableText,
  ReadOnlyText,
  ImageSlot,
  WorkInstructionHeaderImages,
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
export { scheduleBlurActiveEngineeringEditable }
