import React from 'react'
import {
  calculateProcessingContractTotals,
  processingContractAttachmentSlots,
  PROCESSING_CONTRACT_TABLE_COLUMNS,
  resolveProcessingLineAmount,
} from '../../data/processingContractTemplate.mjs'
import {
  findMergeAtCell,
  isCellInsideSelection,
  isMergeTopLeftCell,
} from '../../utils/detailCellMerge.mjs'

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
  const handleBlur = (event) => {
    if (disabled) {
      return
    }
    if (typeof onCommit === 'function') {
      onCommit(normalizeEditableText(event.currentTarget.innerText, multiline))
    }
  }

  return (
    <Component
      className={`${className}${disabled ? ' erp-processing-contract-editable--disabled' : ''}`}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={handleBlur}
    >
      {String(value || '').trim() ? value : '\u00A0'}
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
    return <span className={className}>{value || '\u00A0'}</span>
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
  attachments = {},
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
  const totals = calculateProcessingContractTotals(contract?.lines || [])
  const templateModesActive = lineSelectionMode || cellSelectionMode
  const uploadedAttachments = processingContractAttachmentSlots
    .map((slot) => ({
      slot,
      snapshot: attachments?.[slot.key],
    }))
    .filter(({ snapshot }) => Boolean(snapshot?.dataURL))

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
          <col style={{ width: '11%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8.5%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '6.5%' }} />
          <col style={{ width: '7.5%' }} />
          <col style={{ width: '4.5%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '9.5%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>委外加工订单号</th>
            <th>产品订单编号</th>
            <th>产品编号</th>
            <th>产品名称</th>
            <th>工序名称</th>
            <th>加工厂商</th>
            <th>工序类别</th>
            <th>单位</th>
            <th>单价</th>
            <th>委托加工数量</th>
            <th>委托加工金额</th>
            <th>备注</th>
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

      {uploadedAttachments.length > 0 ? (
        <section className="erp-processing-contract-attachments">
          {uploadedAttachments.map(({ slot, snapshot }) => (
            <figure
              key={slot.key}
              className={`erp-processing-contract-attachments__item erp-processing-contract-attachments__item--${slot.key}`}
            >
              <img
                className="erp-processing-contract-attachments__image"
                src={snapshot.dataURL}
                alt={snapshot.name || slot.title}
              />
            </figure>
          ))}
        </section>
      ) : null}
    </div>
  )
}
