import React from 'react'
import {
  scheduleBlurActiveEngineeringEditable,
  clearRequestedEditableFocus,
  EditableText,
  ImageSlot,
} from './EngineeringPrintPrimitives.jsx'
import { PrintAppendixImages } from './PrintAppendixImages.jsx'
import {
  MATERIAL_DETAIL_COLUMNS,
  MATERIAL_DETAIL_COLUMN_WIDTHS,
  engineeringImageSlots,
} from '../../data/engineeringPrintTemplates.mjs'
import {
  findMergeAtCell,
  isCellInsideSelection,
  isMergeTopLeftCell,
} from '../../utils/detailCellMerge.mjs'

const SHORT_META_FIELDS = new Set(['quantityText', 'spareText', 'dateText'])

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
  return (
    <div
      className="erp-engineering-print-paper erp-material-detail-paper"
      ref={paperRef}
    >
      <header className="erp-material-detail-paper__header">
        <div
          className="erp-material-detail-paper__title-block"
          data-print-focus-group=""
        >
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
          ['数量：', 'quantityText'],
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
                className={
                  SHORT_META_FIELDS.has(key)
                    ? 'erp-engineering-print-meta-grid__short-value'
                    : ''
                }
              />
            </div>
          )
        })}
      </section>

      <table className="erp-engineering-print-table erp-material-detail-table">
        <colgroup>
          {MATERIAL_DETAIL_COLUMNS.map((column, index) => (
            <col
              key={column.key}
              style={{ width: MATERIAL_DETAIL_COLUMN_WIDTHS[index] }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {MATERIAL_DETAIL_COLUMNS.map((column, columnIndex) => (
              <th key={column.key}>
                <EditableText
                  value={
                    !draft.columnLabels?.[columnIndex] ||
                    draft.columnLabels[columnIndex] === column.label
                      ? column.headerLabel || column.label
                      : draft.columnLabels[columnIndex]
                  }
                  multiline
                  rich
                  className="erp-material-detail-table__editable erp-material-detail-table__header"
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
      <PrintAppendixImages images={draft.appendixImages} />
    </div>
  )
}

export { MaterialDetailPaper }
