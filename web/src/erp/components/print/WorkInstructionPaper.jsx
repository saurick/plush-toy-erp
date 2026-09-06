import React from 'react'
import {
  scheduleBlurActiveEngineeringEditable,
  ATTACHMENT_ACCEPT,
  sanitizeRichEditableHTML,
  clearRequestedEditableFocus,
  EditableText,
  ReadOnlyText,
  ImageSlot,
  WorkInstructionHeaderImages,
} from './EngineeringPrintPrimitives.jsx'
import { PrintAppendixImages } from './PrintAppendixImages.jsx'
import {
  WORK_INSTRUCTION_ROW_TYPES,
  normalizeWorkInstructionRowType,
} from '../../data/engineeringPrintTemplates.mjs'

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

function normalizeCalloutCoordinate(value) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 0
  return Math.max(0, Math.min(100, numberValue))
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
                          annotations={image.annotations}
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
                    annotations={image.annotations}
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
              <WorkInstructionHeaderImages images={draft.images} />
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
            <td
              className="erp-work-instruction-paper__meta-label"
              data-work-instruction-process-name
            >
              <EditableText
                value={draft.processName}
                onCommit={(value) => onFieldChange('processName', value)}
              />
            </td>
            <td
              className="erp-work-instruction-paper__meta-value"
              data-work-instruction-process-date
            >
              <EditableText
                value={draft.processDateText}
                onCommit={(value) => onFieldChange('processDateText', value)}
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
          headerImages={draft.images}
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
      <PrintAppendixImages images={draft.appendixImages} />
    </div>
  )
}

function WorkInstructionContinuationPage({
  page,
  pageIndex,
  headerImages,
  selectedInstructionRowTarget,
  instructionRowSelectionMode,
  onSelectInstructionRow,
  onInstructionRowChange,
  onInstructionImageUpload,
  onInstructionImageClear,
  onInstructionRowImageInputRef,
  onInstructionRowImageFileChange,
}) {
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
                          annotations={image.annotations}
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
                    annotations={image.annotations}
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
                <WorkInstructionHeaderImages images={headerImages} />
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
              <td
                className="erp-work-instruction-paper__meta-label"
                data-work-instruction-process-name
              >
                {renderHeaderValue(page.processName)}
              </td>
              <td
                className="erp-work-instruction-paper__meta-value"
                data-work-instruction-process-date
              >
                {renderHeaderValue(page.processDateText)}
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

export {
  normalizeInstructionRowTarget,
  createMainInstructionRowTarget,
  createContinuationInstructionRowTarget,
  isSameInstructionRowTarget,
  getWorkInstructionRowType,
  isWorkInstructionStepRow,
  plainTextFromRichHTML,
  richTextHasVisibleText,
  normalizeCalloutCoordinate,
  WorkInstructionPaper,
  WorkInstructionContinuationPage,
}
