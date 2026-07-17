import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  calculateProcessingContractTotals,
  PROCESSING_CONTRACT_TABLE_COLUMNS,
  resolveProcessingLineAmount,
} from '../../data/processingContractTemplate.mjs'
import {
  findMergeAtCell,
  isCellInsideSelection,
  isMergeTopLeftCell,
} from '../../utils/detailCellMerge.mjs'
import { runSilentPrintWorkspaceDraftUpdate } from '../../utils/usePersistentPrintWorkspaceDraft.js'
import { PrintAppendixImages } from './PrintAppendixImages.jsx'
import { renderPrintValue } from './printValue.mjs'

function normalizeEditableText(value, multiline = false) {
  const rawText = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
  if (multiline) {
    return rawText.replace(/\n{3,}/g, '\n\n').trimEnd()
  }
  return rawText.replace(/\s+/g, ' ').trim()
}

function EditableText({
  as: Component = 'span',
  value,
  className,
  multiline = false,
  onCommit,
  disabled = false,
}) {
  const editableRef = useRef(null)
  const displayText = String(renderPrintValue(value))
  const commitElementValue = useCallback(
    (element) => {
      if (disabled) {
        return
      }
      if (typeof onCommit === 'function') {
        onCommit(
          normalizeEditableText(
            multiline ? element.innerText : element.textContent,
            multiline
          )
        )
      }
    },
    [disabled, multiline, onCommit]
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
    <Component
      ref={editableRef}
      className={`${className}${disabled ? ' erp-processing-contract-editable--disabled' : ''}`}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck={false}
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
    </Component>
  )
}

function ContractMetaRow({ label, value, onCommit, disabled = false }) {
  return (
    <div className="erp-processing-contract-meta__row">
      <span className="erp-processing-contract-meta__label">{label}</span>
      <EditableText
        value={value}
        className="erp-processing-contract-meta__value"
        onCommit={onCommit}
        disabled={disabled}
      />
    </div>
  )
}

function ContractTableCell({
  value,
  className,
  multiline = false,
  onCommit,
  readOnly = false,
  disabled = false,
}) {
  if (readOnly || disabled) {
    return <span className={className}>{renderPrintValue(value)}</span>
  }

  return (
    <EditableText
      value={value}
      className={className}
      multiline={multiline}
      onCommit={onCommit}
      disabled={disabled}
    />
  )
}

export default function ProcessingContractPaper({
  paperRef = null,
  contract,
  selectedLineIndex = null,
  lineSelectionMode = false,
  cellSelectionMode = false,
  mergeSelection = null,
  activeCell = null,
  onSelectLine,
  onSelectCell,
  onFieldChange,
  onLineFieldChange,
  onClauseChange,
}) {
  const printableLines = Array.isArray(contract?.lines) ? contract.lines : []
  const totals = calculateProcessingContractTotals(contract?.lines || [], {
    merges: contract?.merges,
  })
  const templateModesActive = lineSelectionMode || cellSelectionMode

  return (
    <div className="erp-processing-contract-paper" ref={paperRef}>
      <header className="erp-processing-contract-paper__header">
        <div className="erp-processing-contract-paper__title">加工合同</div>
      </header>

      <section className="erp-processing-contract-meta">
        <div className="erp-processing-contract-meta__column">
          <ContractMetaRow
            label="合同编号："
            value={contract.contractNo}
            onCommit={(value) => onFieldChange('contractNo', value)}
            disabled={templateModesActive}
          />
          <ContractMetaRow
            label="加工方名称："
            value={contract.supplierName}
            onCommit={(value) => onFieldChange('supplierName', value)}
            disabled={templateModesActive}
          />
          <ContractMetaRow
            label="联系人："
            value={contract.supplierContact}
            onCommit={(value) => onFieldChange('supplierContact', value)}
            disabled={templateModesActive}
          />
          <ContractMetaRow
            label="联系电话："
            value={contract.supplierPhone}
            onCommit={(value) => onFieldChange('supplierPhone', value)}
            disabled={templateModesActive}
          />
          <ContractMetaRow
            label="供应商地址："
            value={contract.supplierAddress}
            onCommit={(value) => onFieldChange('supplierAddress', value)}
            disabled={templateModesActive}
          />
        </div>

        <div className="erp-processing-contract-meta__column">
          <div className="erp-processing-contract-meta__top-row">
            <ContractMetaRow
              label="下单日期："
              value={contract.orderDateText}
              onCommit={(value) => onFieldChange('orderDateText', value)}
              disabled={templateModesActive}
            />
            <ContractMetaRow
              label="回货日期："
              value={contract.returnDateText}
              onCommit={(value) => onFieldChange('returnDateText', value)}
              disabled={templateModesActive}
            />
          </div>
          <ContractMetaRow
            label="委托单位："
            value={contract.buyerCompany}
            onCommit={(value) => onFieldChange('buyerCompany', value)}
            disabled={templateModesActive}
          />
          <ContractMetaRow
            label="委托人："
            value={contract.buyerContact}
            onCommit={(value) => onFieldChange('buyerContact', value)}
            disabled={templateModesActive}
          />
          <ContractMetaRow
            label="联系电话："
            value={contract.buyerPhone}
            onCommit={(value) => onFieldChange('buyerPhone', value)}
            disabled={templateModesActive}
          />
          <ContractMetaRow
            label="公司地址："
            value={contract.buyerAddress}
            onCommit={(value) => onFieldChange('buyerAddress', value)}
            disabled={templateModesActive}
          />
        </div>
      </section>

      <table className="erp-processing-contract-table">
        <colgroup>
          <col style={{ width: '11.5%' }} />
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '6.5%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '4%' }} />
          <col style={{ width: '4.5%' }} />
          <col style={{ width: '9.5%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '8.5%' }} />
        </colgroup>
        <thead>
          <tr>
            {PROCESSING_CONTRACT_TABLE_COLUMNS.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {printableLines.map((line, index) => {
            const isSelected = selectedLineIndex === index
            const isPlaceholderLine = index >= (contract?.lines?.length || 0)
            return (
              <tr
                key={`line-${index}`}
                className={
                  isSelected
                    ? 'erp-processing-contract-table__row--selected'
                    : ''
                }
                onMouseDown={() => {
                  if (lineSelectionMode && !isPlaceholderLine) {
                    onSelectLine(index)
                  }
                }}
              >
                {PROCESSING_CONTRACT_TABLE_COLUMNS.map((column, colIndex) => {
                  const merge = findMergeAtCell(
                    contract.merges,
                    index,
                    colIndex
                  )
                  if (merge && !isMergeTopLeftCell(merge, index, colIndex)) {
                    return null
                  }

                  const isSelectionAnchor =
                    activeCell?.rowIndex === index &&
                    activeCell?.colIndex === colIndex
                  const isSelectedCell = isCellInsideSelection(
                    mergeSelection,
                    index,
                    colIndex
                  )
                  const value =
                    column.key === 'amount'
                      ? resolveProcessingLineAmount(line)
                      : line[column.fieldKey]

                  return (
                    <td
                      key={`${column.key}-${index}`}
                      rowSpan={
                        merge ? merge.rowEnd - merge.rowStart + 1 : undefined
                      }
                      colSpan={
                        merge ? merge.colEnd - merge.colStart + 1 : undefined
                      }
                      className={[
                        merge
                          ? 'erp-processing-contract-table__cell-merged'
                          : '',
                        isSelectedCell
                          ? 'erp-processing-contract-table__cell-selected'
                          : '',
                        isSelectionAnchor
                          ? 'erp-processing-contract-table__cell-selected-anchor'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={(event) => {
                        if (!cellSelectionMode || isPlaceholderLine) {
                          return
                        }
                        event.preventDefault()
                        event.stopPropagation()
                        onSelectCell(index, colIndex)
                      }}
                    >
                      <ContractTableCell
                        value={value}
                        className={`erp-processing-contract-table__cell${
                          column.multiline
                            ? ' erp-processing-contract-table__cell--multiline'
                            : ''
                        }`}
                        multiline={column.multiline}
                        onCommit={(value) =>
                          column.fieldKey
                            ? onLineFieldChange(index, column.fieldKey, value)
                            : column.key === 'amount'
                              ? onLineFieldChange(index, 'amount', value)
                              : undefined
                        }
                        readOnly={column.readOnly}
                        disabled={templateModesActive || isPlaceholderLine}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr className="erp-processing-contract-table__total">
            <td colSpan={6} />
            <td className="erp-processing-contract-table__total-label">合计</td>
            <td />
            <td />
            <td className="erp-contract-table__total-value">
              {totals.totalQuantityText || '\u00A0'}
            </td>
            <td className="erp-contract-table__total-value">
              {totals.totalAmountText || '\u00A0'}
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      <section className="erp-processing-contract-clauses">
        <div className="erp-processing-contract-clauses__group">
          <div className="erp-processing-contract-clauses__title">
            一、来货要求：
          </div>
          <ol>
            {contract.clauses.delivery.map((item, index) => (
              <li
                key={`delivery-${index}`}
                className="erp-processing-contract-clauses__item"
              >
                <span className="erp-processing-contract-clauses__item-index">
                  {index + 1}、
                </span>
                <EditableText
                  as="span"
                  value={item}
                  className="erp-processing-contract-clauses__editable"
                  multiline
                  disabled={templateModesActive}
                  onCommit={(value) => onClauseChange('delivery', index, value)}
                />
              </li>
            ))}
          </ol>
        </div>
        <div className="erp-processing-contract-clauses__group">
          <div className="erp-processing-contract-clauses__title">
            二、合同约定：
          </div>
          <ol>
            {contract.clauses.contract.map((item, index) => (
              <li
                key={`contract-${index}`}
                className="erp-processing-contract-clauses__item"
              >
                <span className="erp-processing-contract-clauses__item-index">
                  {index + 1}、
                </span>
                <EditableText
                  as="span"
                  value={item}
                  className="erp-processing-contract-clauses__editable"
                  multiline
                  disabled={templateModesActive}
                  onCommit={(value) => onClauseChange('contract', index, value)}
                />
              </li>
            ))}
          </ol>
        </div>
        <div className="erp-processing-contract-clauses__group">
          <div className="erp-processing-contract-clauses__title">
            三、结算方式：
          </div>
          <ol>
            {contract.clauses.settlement.map((item, index) => (
              <li
                key={`settlement-${index}`}
                className="erp-processing-contract-clauses__item"
              >
                <span className="erp-processing-contract-clauses__item-index">
                  {index + 1}、
                </span>
                <EditableText
                  as="span"
                  value={item}
                  className="erp-processing-contract-clauses__editable"
                  multiline
                  disabled={templateModesActive}
                  onCommit={(value) =>
                    onClauseChange('settlement', index, value)
                  }
                />
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="erp-processing-contract-signature">
        <div className="erp-processing-contract-signature__block">
          <div className="erp-processing-contract-signature__label">
            甲方（委托方）：
            <EditableText
              value={contract.buyerSigner}
              className="erp-processing-contract-signature__name-value"
              disabled={templateModesActive}
              onCommit={(value) => onFieldChange('buyerSigner', value)}
            />
          </div>
          <div className="erp-processing-contract-signature__date">
            日期：
            <EditableText
              value={contract.buyerSignDateText}
              className="erp-processing-contract-signature__date-value"
              disabled={templateModesActive}
              onCommit={(value) => onFieldChange('buyerSignDateText', value)}
            />
          </div>
        </div>
        <div className="erp-processing-contract-signature__block">
          <div className="erp-processing-contract-signature__label">
            乙方（受托方）：
            <EditableText
              value={contract.supplierSigner}
              className="erp-processing-contract-signature__name-value"
              disabled={templateModesActive}
              onCommit={(value) => onFieldChange('supplierSigner', value)}
            />
          </div>
          <div className="erp-processing-contract-signature__date">
            日期：
            <EditableText
              value={contract.supplierSignDateText}
              className="erp-processing-contract-signature__date-value"
              disabled={templateModesActive}
              onCommit={(value) => onFieldChange('supplierSignDateText', value)}
            />
          </div>
        </div>
      </section>

      <PrintAppendixImages images={contract.appendixImages} />
    </div>
  )
}
