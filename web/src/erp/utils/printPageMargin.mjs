const A4_PAGE_HEIGHT_MM = 297
const CSS_PIXEL_PER_INCH = 96
const MILLIMETERS_PER_INCH = 25.4

export const PRINT_PAGE_STYLE_ELEMENT_ID = 'erp-dynamic-print-page-style'
export const DEFAULT_PRINT_PAGE_MARGIN = '0'
export const CONTINUED_PRINT_PAGE_MARGIN = '5mm 0 5mm'
export const DEFAULT_CONTINUED_STAGE_WRAP_CLASS =
  'erp-print-shell__stage-wrap--continued'
export const A4_PAGE_HEIGHT_PX =
  (A4_PAGE_HEIGHT_MM / MILLIMETERS_PER_INCH) * CSS_PIXEL_PER_INCH
export const PRINT_CONTINUATION_TOLERANCE_PX = 2

export function resolvePrintPageMargin(hasContinuation = false) {
  return hasContinuation
    ? CONTINUED_PRINT_PAGE_MARGIN
    : DEFAULT_PRINT_PAGE_MARGIN
}

export function buildPrintPageStyleText(margin = DEFAULT_PRINT_PAGE_MARGIN) {
  const resolvedMargin =
    String(margin || '').trim() || DEFAULT_PRINT_PAGE_MARGIN

  return [
    '@media print {',
    '  @page {',
    '    size: A4;',
    `    margin: ${resolvedMargin};`,
    '  }',
    '}',
  ].join('\n')
}

export function detectPrintContinuationFromHeight(
  paperHeightPx,
  tolerancePx = PRINT_CONTINUATION_TOLERANCE_PX
) {
  const resolvedHeight = Number(paperHeightPx)
  const resolvedTolerance = Number.isFinite(Number(tolerancePx))
    ? Number(tolerancePx)
    : PRINT_CONTINUATION_TOLERANCE_PX

  return (
    Number.isFinite(resolvedHeight) &&
    resolvedHeight > A4_PAGE_HEIGHT_PX + Math.max(resolvedTolerance, 0)
  )
}

export function resolvePaperRenderedHeight(paperElement) {
  if (!paperElement) {
    return 0
  }

  const rectHeight = Number(paperElement.getBoundingClientRect?.().height || 0)
  const scrollHeight = Number(paperElement.scrollHeight || 0)
  const offsetHeight = Number(paperElement.offsetHeight || 0)

  return Math.max(rectHeight, scrollHeight, offsetHeight, 0)
}

export function ensurePrintPageStyleNode(doc) {
  if (
    !doc ||
    typeof doc.getElementById !== 'function' ||
    typeof doc.createElement !== 'function' ||
    !doc.head ||
    typeof doc.head.appendChild !== 'function'
  ) {
    return null
  }

  let styleNode = doc.getElementById(PRINT_PAGE_STYLE_ELEMENT_ID)
  if (styleNode) {
    return styleNode
  }

  styleNode = doc.createElement('style')
  styleNode.id = PRINT_PAGE_STYLE_ELEMENT_ID
  styleNode.setAttribute('data-dynamic-print-page-style', 'true')
  doc.head.appendChild(styleNode)
  return styleNode
}

export function applyPrintPageMargin(doc, hasContinuation = false) {
  const styleNode = ensurePrintPageStyleNode(doc)
  const margin = resolvePrintPageMargin(hasContinuation)
  const styleText = buildPrintPageStyleText(margin)

  if (styleNode && styleNode.textContent !== styleText) {
    styleNode.textContent = styleText
  }

  return margin
}

export function syncPrintPageMarginForPaper(paperElement, options = {}) {
  return syncPrintPageMarginForPaperWithOptions(paperElement, options)
}

function toggleContinuationClass(element, className, active) {
  if (!element || !className || !element.classList?.toggle) {
    return
  }
  element.classList.toggle(className, Boolean(active))
}

export function syncPrintPageMarginForPaperWithOptions(
  paperElement,
  options = {}
) {
  const doc = paperElement?.ownerDocument
  if (!doc) {
    return {
      hasContinuation: false,
      margin: DEFAULT_PRINT_PAGE_MARGIN,
      paperHeight: 0,
    }
  }

  const stageWrapElement = options?.stageWrapElement || null
  const paperContinuedClass = String(options?.paperContinuedClass || '').trim()
  const stageWrapContinuedClass = String(
    options?.stageWrapContinuedClass || DEFAULT_CONTINUED_STAGE_WRAP_CLASS
  ).trim()
  const paperHeight = resolvePaperRenderedHeight(paperElement)
  const hasContinuation = detectPrintContinuationFromHeight(paperHeight)
  const margin = applyPrintPageMargin(doc, hasContinuation)
  toggleContinuationClass(paperElement, paperContinuedClass, hasContinuation)
  toggleContinuationClass(
    stageWrapElement,
    stageWrapContinuedClass,
    hasContinuation
  )

  return {
    hasContinuation,
    margin,
    paperHeight,
  }
}

export function watchPrintPageMarginForPaper(paperElement, options = {}) {
  const doc = paperElement?.ownerDocument
  const win = doc?.defaultView

  if (!paperElement || !doc || !win) {
    return () => {}
  }

  let frameID = 0

  const sync = () => {
    frameID = 0
    syncPrintPageMarginForPaperWithOptions(paperElement, options)
  }

  const requestSync = () => {
    if (frameID && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(frameID)
      frameID = 0
    }

    if (typeof win.requestAnimationFrame === 'function') {
      frameID = win.requestAnimationFrame(sync)
      return
    }

    sync()
  }

  requestSync()

  let resizeObserver = null
  if (typeof win.ResizeObserver === 'function') {
    resizeObserver = new win.ResizeObserver(requestSync)
    resizeObserver.observe(paperElement)
  }

  win.addEventListener('resize', requestSync)

  return () => {
    if (frameID && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(frameID)
    }
    resizeObserver?.disconnect()
    win.removeEventListener('resize', requestSync)
    applyPrintPageMargin(doc, false)
    toggleContinuationClass(paperElement, options?.paperContinuedClass, false)
    toggleContinuationClass(
      options?.stageWrapElement,
      options?.stageWrapContinuedClass || DEFAULT_CONTINUED_STAGE_WRAP_CLASS,
      false
    )
  }
}
