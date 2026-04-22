import React from 'react'
import {
  calculateProcessingContractTotals,
  padProcessingContractLines,
  resolveProcessingLineAmount,
} from '../../data/processingContractTemplate.mjs'

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
}) {
  const handleBlur = (event) => {
    if (typeof onCommit === 'function') {
      onCommit(normalizeEditableText(event.currentTarget.innerText, multiline))
    }
  }

  return (
    <Component
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={handleBlur}
    >
      {String(value || '').trim() ? value : '\u00A0'}
    </Component>
  )
}

function ContractMetaRow({ label, value, onCommit }) {
  return (
    <div className="erp-processing-contract-meta__row">
      <span className="erp-processing-contract-meta__label">{label}</span>
      <EditableText
        value={value}
        className="erp-processing-contract-meta__value"
        onCommit={onCommit}
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
}) {
  if (readOnly) {
    return <span className={className}>{value || '\u00A0'}</span>
  }

  return (
    <EditableText
      value={value}
      className={className}
      multiline={multiline}
      onCommit={onCommit}
    />
  )
}

export default function ProcessingContractPaper({
  contract,
  selectedLineIndex = null,
  lineSelectionMode = false,
  onSelectLine,
  onFieldChange,
  onLineFieldChange,
  onClauseChange,
}) {
  const printableLines = padProcessingContractLines(contract?.lines)
  const totals = calculateProcessingContractTotals(contract?.lines || [])

  return (
    <div className="erp-processing-contract-paper">
      <header className="erp-processing-contract-paper__header">
        <div className="erp-processing-contract-paper__title">加工合同</div>
      </header>

      <section className="erp-processing-contract-meta">
        <div className="erp-processing-contract-meta__column">
          <ContractMetaRow
            label="合同编号："
            value={contract.contractNo}
            onCommit={(value) => onFieldChange('contractNo', value)}
          />
          <ContractMetaRow
            label="加工方名称："
            value={contract.supplierName}
            onCommit={(value) => onFieldChange('supplierName', value)}
          />
          <ContractMetaRow
            label="联系人："
            value={contract.supplierContact}
            onCommit={(value) => onFieldChange('supplierContact', value)}
          />
          <ContractMetaRow
            label="联系电话："
            value={contract.supplierPhone}
            onCommit={(value) => onFieldChange('supplierPhone', value)}
          />
          <ContractMetaRow
            label="供应商地址："
            value={contract.supplierAddress}
            onCommit={(value) => onFieldChange('supplierAddress', value)}
          />
        </div>

        <div className="erp-processing-contract-meta__column">
          <div className="erp-processing-contract-meta__top-row">
            <ContractMetaRow
              label="下单日期："
              value={contract.orderDateText}
              onCommit={(value) => onFieldChange('orderDateText', value)}
            />
            <ContractMetaRow
              label="回货日期："
              value={contract.returnDateText}
              onCommit={(value) => onFieldChange('returnDateText', value)}
            />
          </div>
          <ContractMetaRow
            label="委托单位："
            value={contract.buyerCompany}
            onCommit={(value) => onFieldChange('buyerCompany', value)}
          />
          <ContractMetaRow
            label="委托人："
            value={contract.buyerContact}
            onCommit={(value) => onFieldChange('buyerContact', value)}
          />
          <ContractMetaRow
            label="联系电话："
            value={contract.buyerPhone}
            onCommit={(value) => onFieldChange('buyerPhone', value)}
          />
          <ContractMetaRow
            label="公司地址："
            value={contract.buyerAddress}
            onCommit={(value) => onFieldChange('buyerAddress', value)}
          />
        </div>
      </section>

      <table className="erp-processing-contract-table">
        <colgroup>
          <col style={{ width: '9%' }} />
          <col style={{ width: '9.5%' }} />
          <col style={{ width: '8.5%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11.5%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '6.5%' }} />
          <col style={{ width: '7.5%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '7.5%' }} />
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
            return (
              <tr
                key={`line-${index}`}
                className={
                  isSelected
                    ? 'erp-processing-contract-table__row--selected'
                    : ''
                }
                onClick={() => {
                  if (lineSelectionMode) {
                    onSelectLine(index)
                  }
                }}
              >
                <td>
                  <ContractTableCell
                    value={line.contractNo}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'contractNo', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.productOrderNo}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'productOrderNo', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.productNo}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'productNo', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.productName}
                    className="erp-processing-contract-table__cell erp-processing-contract-table__cell--multiline"
                    multiline
                    onCommit={(value) =>
                      onLineFieldChange(index, 'productName', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.processName}
                    className="erp-processing-contract-table__cell erp-processing-contract-table__cell--multiline"
                    multiline
                    onCommit={(value) =>
                      onLineFieldChange(index, 'processName', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.supplierAlias}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'supplierAlias', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.processCategory}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'processCategory', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.unit}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'unit', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.unitPrice}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'unitPrice', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.quantity}
                    className="erp-processing-contract-table__cell"
                    onCommit={(value) =>
                      onLineFieldChange(index, 'quantity', value)
                    }
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={resolveProcessingLineAmount(line)}
                    className="erp-processing-contract-table__cell"
                    readOnly
                  />
                </td>
                <td>
                  <ContractTableCell
                    value={line.remark}
                    className="erp-processing-contract-table__cell erp-processing-contract-table__cell--multiline"
                    multiline
                    onCommit={(value) =>
                      onLineFieldChange(index, 'remark', value)
                    }
                  />
                </td>
              </tr>
            )
          })}
          <tr className="erp-processing-contract-table__total">
            <td colSpan={6} />
            <td className="erp-processing-contract-table__total-label">合计</td>
            <td />
            <td />
            <td>{totals.totalQuantityText || '\u00A0'}</td>
            <td>{totals.totalAmountText || '\u00A0'}</td>
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
          <EditableText
            value={contract.buyerContact}
            className="erp-processing-contract-signature__value"
            onCommit={(value) => onFieldChange('buyerContact', value)}
          />
          <div className="erp-processing-contract-signature__date">
            日期：
            <EditableText
              value={contract.buyerSignDateText}
              className="erp-processing-contract-signature__date-value"
              onCommit={(value) => onFieldChange('buyerSignDateText', value)}
            />
          </div>
        </div>
        <div className="erp-processing-contract-signature__block">
          <div className="erp-processing-contract-signature__label">
            乙方（受托方）：
          </div>
          <EditableText
            value={contract.supplierName}
            className="erp-processing-contract-signature__value"
            onCommit={(value) => onFieldChange('supplierName', value)}
          />
          <div className="erp-processing-contract-signature__date">
            日期：
            <EditableText
              value={contract.supplierSignDateText}
              className="erp-processing-contract-signature__date-value"
              onCommit={(value) => onFieldChange('supplierSignDateText', value)}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
