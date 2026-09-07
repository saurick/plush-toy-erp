import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  MATERIAL_PURCHASE_DETAIL_COLUMNS,
  findMergeAtCell,
  isCellInsideSelection,
  isMergeTopLeftCell,
} from '../../utils/materialPurchaseContractEditor.mjs'
import { runSilentPrintWorkspaceDraftUpdate } from '../../utils/usePersistentPrintWorkspaceDraft.js'
import { PrintAppendixImages } from './PrintAppendixImages.jsx'

const CLAUSE_SECTIONS = [
  { key: 'delivery', title: '一、来货要求' },
  { key: 'contract', title: '二、合同约定' },
  { key: 'settlement', title: '三、结算方式' },
]

function EditableText({
  value,
  onCommit,
  className = '',
  multiline = false,
  disabled = false,
}) {
  const Tag = multiline ? 'div' : 'span'
  const editableRef = useRef(null)
  const displayText = String(value ?? '').trim()
    ? String(value ?? '')
    : '\u00A0'
  const commitElementValue = useCallback(
    (element) => {
      const elementText = multiline ? element.innerText : element.textContent
      const nextValue = multiline
        ? elementText
            .replaceAll('\r', '')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        : String(elementText ?? '')
            .replaceAll('\r', '')
            .trim()
      if (nextValue !== String(value ?? '')) {
        onCommit(nextValue)
      }
    },
    [multiline, onCommit, value]
  )

  useLayoutEffect(() => {
    const element = editableRef.current
    if (!element) {
      return
    }
    if (element.ownerDocument?.activeElement === element) {
      return
    }
    if (element.textContent !== displayText) {
      element.textContent = displayText
    }
  }, [displayText])

  useEffect(() => {
    const element = editableRef.current
    if (!element || disabled) {
      return undefined
    }

    const ownerWindow = element.ownerDocument?.defaultView || window
    const commitSilentDraft = () => {
      runSilentPrintWorkspaceDraftUpdate(() => {
        commitElementValue(element)
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
  }, [commitElementValue, disabled])

  return (
    <Tag
      ref={editableRef}
      className={`erp-material-contract-editable ${className} ${
        disabled ? 'erp-material-contract-editable-disabled' : ''
      }`}
      data-print-empty={
        !String(value ?? '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, '')
          .trim()
      }
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck={false}
      onKeyDown={(event) => {
        if (!multiline && event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onInput={(event) => {
        runSilentPrintWorkspaceDraftUpdate(() => {
          commitElementValue(event.currentTarget)
        })
      }}
      onBlur={(event) => {
        commitElementValue(event.currentTarget)
      }}
    >
      {displayText}
    </Tag>
  )
}

function MetaField({
  label,
  value,
  onCommit,
  disabled = false,
  className = '',
}) {
  return (
    <div className={`erp-material-contract-meta__row ${className}`}>
      <span className="erp-material-contract-meta__label">{label}</span>
      <EditableText
        value={value}
        onCommit={onCommit}
        disabled={disabled}
        className="erp-material-contract-meta__value"
      />
    </div>
  )
}

function MetaPair({ left, right }) {
  return (
    <div className="erp-material-contract-meta__pair">
      <div className="erp-material-contract-meta__cell erp-material-contract-meta__cell--left">
        {left}
      </div>
      <div className="erp-material-contract-meta__cell erp-material-contract-meta__cell--right">
        {right}
      </div>
    </div>
  )
}

function ClauseBlock({ title, items, onCommit, disabled = false }) {
  return (
    <section className="erp-material-contract-clause-block">
      <div className="erp-material-contract-clause-block__title">{title}：</div>
      <ol className="erp-material-contract-clause-block__list">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="erp-material-contract-clause-block__item"
            data-print-focus-group=""
          >
            <span className="erp-material-contract-clause-block__index">
              {index + 1}、
            </span>
            <EditableText
              value={item}
              onCommit={(nextValue) => onCommit(index, nextValue)}
              multiline
              disabled={disabled}
              className="erp-material-contract-clause-block__value"
            />
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function MaterialPurchaseContractPaper({
  draft,
  paperRef,
  templateModesActive,
  handleFieldCommit,
  handleLineCommit,
  handleClauseCommit,
  selectedRowIndex,
  rowSelectionMode,
  setSelectedRowIndex,
  setToolbarStatus,
  activeCell,
  mergeSelection,
  cellSelectionMode,
  handleSelectCell,
  totals,
}) {
  return (
    <div className="erp-material-contract-paper" ref={paperRef}>
      <div className="erp-material-contract-paper__title">合同订单</div>

      <section className="erp-material-contract-meta">
        <MetaPair
          left={
            <MetaField
              label="采购订单号："
              value={draft.contractNo}
              onCommit={(nextValue) =>
                handleFieldCommit('contractNo', nextValue)
              }
              disabled={templateModesActive}
            />
          }
          right={
            <div className="erp-material-contract-meta__top-row">
              <MetaField
                className="erp-material-contract-meta__row--top-item"
                label="下单日期："
                value={draft.orderDateText}
                onCommit={(nextValue) =>
                  handleFieldCommit('orderDateText', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                className="erp-material-contract-meta__row--top-item"
                label="回货日期："
                value={draft.returnDateText}
                onCommit={(nextValue) =>
                  handleFieldCommit('returnDateText', nextValue)
                }
                disabled={templateModesActive}
              />
            </div>
          }
        />
        <MetaPair
          left={
            <MetaField
              label="供应商名称："
              value={draft.supplierName}
              onCommit={(nextValue) =>
                handleFieldCommit('supplierName', nextValue)
              }
              disabled={templateModesActive}
            />
          }
          right={
            <MetaField
              label="订货单位："
              value={draft.buyerCompany}
              onCommit={(nextValue) =>
                handleFieldCommit('buyerCompany', nextValue)
              }
              disabled={templateModesActive}
            />
          }
        />
        <MetaPair
          left={
            <MetaField
              label="联系人："
              value={draft.supplierContact}
              onCommit={(nextValue) =>
                handleFieldCommit('supplierContact', nextValue)
              }
              disabled={templateModesActive}
            />
          }
          right={
            <MetaField
              label="订货人："
              value={draft.buyerContact}
              onCommit={(nextValue) =>
                handleFieldCommit('buyerContact', nextValue)
              }
              disabled={templateModesActive}
            />
          }
        />
        <MetaPair
          left={
            <MetaField
              label="联系电话："
              value={draft.supplierPhone}
              onCommit={(nextValue) =>
                handleFieldCommit('supplierPhone', nextValue)
              }
              disabled={templateModesActive}
            />
          }
          right={
            <MetaField
              label="联系电话："
              value={draft.buyerPhone}
              onCommit={(nextValue) =>
                handleFieldCommit('buyerPhone', nextValue)
              }
              disabled={templateModesActive}
            />
          }
        />
        <MetaPair
          left={
            <MetaField
              label="供应商地址："
              value={draft.supplierAddress}
              onCommit={(nextValue) =>
                handleFieldCommit('supplierAddress', nextValue)
              }
              disabled={templateModesActive}
            />
          }
          right={
            <MetaField
              label="公司地址："
              value={draft.buyerAddress}
              onCommit={(nextValue) =>
                handleFieldCommit('buyerAddress', nextValue)
              }
              disabled={templateModesActive}
            />
          }
        />
      </section>

      <table className="erp-material-contract-table">
        <colgroup>
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '7.5%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '9.5%' }} />
          <col style={{ width: '9.5%' }} />
          <col style={{ width: '8.5%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '5.5%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead>
          <tr>
            {MATERIAL_PURCHASE_DETAIL_COLUMNS.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, rowIndex) => (
            <tr
              key={`line-${rowIndex}`}
              className={
                selectedRowIndex === rowIndex
                  ? 'erp-material-contract-table__row-selected'
                  : ''
              }
              onMouseDown={(event) => {
                if (!rowSelectionMode) {
                  return
                }
                event.preventDefault()
                setSelectedRowIndex(rowIndex)
                setToolbarStatus(
                  `已选中第 ${rowIndex + 1} 行，可继续上插 / 下插 / 移除。`
                )
              }}
            >
              {MATERIAL_PURCHASE_DETAIL_COLUMNS.map((column, colIndex) => {
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
                    key={`${column.key}-${rowIndex}`}
                    rowSpan={
                      merge ? merge.rowEnd - merge.rowStart + 1 : undefined
                    }
                    colSpan={
                      merge ? merge.colEnd - merge.colStart + 1 : undefined
                    }
                    className={[
                      merge ? 'erp-material-contract-table__cell-merged' : '',
                      isSelectedCell
                        ? 'erp-material-contract-table__cell-selected'
                        : '',
                      isSelectionAnchor
                        ? 'erp-material-contract-table__cell-selected-anchor'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseDown={(event) => {
                      if (!cellSelectionMode) {
                        return
                      }
                      event.preventDefault()
                      event.stopPropagation()
                      handleSelectCell(rowIndex, colIndex)
                    }}
                  >
                    <EditableText
                      value={line[column.key]}
                      onCommit={(nextValue) =>
                        handleLineCommit(rowIndex, column.key, nextValue)
                      }
                      multiline={column.multiline}
                      disabled={!column.editable || templateModesActive}
                      className={
                        column.multiline
                          ? 'erp-material-contract-table__editable erp-material-contract-table__editable-multiline'
                          : 'erp-material-contract-table__editable'
                      }
                    />
                  </td>
                )
              })}
            </tr>
          ))}
          <tr className="erp-material-contract-table__total">
            <td colSpan={8} />
            <td>合计</td>
            <td className="erp-contract-table__total-value">
              {totals.quantityText}
            </td>
            <td className="erp-contract-table__total-value">
              {totals.amountText}
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      <div className="erp-material-contract-clauses">
        {CLAUSE_SECTIONS.map((section) => (
          <ClauseBlock
            key={section.key}
            title={section.title}
            items={draft.clauses[section.key] || []}
            onCommit={(clauseIndex, nextValue) =>
              handleClauseCommit(section.key, clauseIndex, nextValue)
            }
            disabled={templateModesActive}
          />
        ))}
      </div>

      <div className="erp-material-contract-signature">
        <div className="erp-material-contract-signature__block">
          <div className="erp-material-contract-signature__row">
            <div className="erp-material-contract-signature__label">
              甲方（订货方）：
            </div>
            <EditableText
              value={draft.buyerSigner}
              onCommit={(nextValue) =>
                handleFieldCommit('buyerSigner', nextValue)
              }
              disabled={templateModesActive}
              className="erp-material-contract-signature__name"
            />
          </div>
          <div className="erp-material-contract-signature__row erp-material-contract-signature__row--date">
            <div className="erp-material-contract-signature__label">日期：</div>
            <EditableText
              value={draft.signDateText}
              onCommit={(nextValue) =>
                handleFieldCommit('signDateText', nextValue)
              }
              disabled={templateModesActive}
              className="erp-material-contract-signature__date-value"
            />
          </div>
        </div>
        <div className="erp-material-contract-signature__block">
          <div className="erp-material-contract-signature__row">
            <div className="erp-material-contract-signature__label">
              乙方（供货方）：
            </div>
            <EditableText
              value={draft.supplierSigner}
              onCommit={(nextValue) =>
                handleFieldCommit('supplierSigner', nextValue)
              }
              disabled={templateModesActive}
              className="erp-material-contract-signature__name"
            />
          </div>
          <div className="erp-material-contract-signature__row erp-material-contract-signature__row--date">
            <div className="erp-material-contract-signature__label">日期：</div>
            <EditableText
              value={draft.supplierSignDateText}
              onCommit={(nextValue) =>
                handleFieldCommit('supplierSignDateText', nextValue)
              }
              disabled={templateModesActive}
              className="erp-material-contract-signature__date-value"
            />
          </div>
        </div>
      </div>
      <PrintAppendixImages images={draft.appendixImages} />
    </div>
  )
}
