import React from 'react'

import {
  buildPrintTemplateLineCells,
  getPrintTemplateLineColumns,
  normalizePrintTemplatePreviewData,
  resolvePrintTemplateTotals,
} from './printTemplateRendererModel.mjs'
import { coalescePrintValues, renderPrintValue } from './printValue.mjs'

function PrintMetaGrid({ leftItems, rightItems }) {
  return (
    <div className="erp-print-meta-grid">
      <div className="erp-print-meta-grid__column">
        {leftItems.map((item) => (
          <div key={item.label} className="erp-print-meta-grid__row">
            <span className="erp-print-meta-grid__label">{item.label}</span>
            <span className="erp-print-meta-grid__value">
              {renderPrintValue(item.value, '')}
            </span>
          </div>
        ))}
      </div>
      <div className="erp-print-meta-grid__column">
        {rightItems.map((item) => (
          <div key={item.label} className="erp-print-meta-grid__row">
            <span className="erp-print-meta-grid__label">{item.label}</span>
            <span className="erp-print-meta-grid__value">
              {renderPrintValue(item.value, '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MaterialContractMetaPair({ left, right }) {
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

function renderClauseItems(sectionKey, items) {
  return (Array.isArray(items) ? items : []).map((item, index) => (
    <li
      key={`${sectionKey}-${index}-${item}`}
      className="erp-print-clauses__item"
    >
      <span className="erp-print-clauses__item-index">{index + 1}、</span>
      <span>{item}</span>
    </li>
  ))
}

function ContractTemplate({ data: rawData, kind }) {
  const data = normalizePrintTemplatePreviewData(rawData)
  const isMaterial = kind === 'material'
  const columns = getPrintTemplateLineColumns(kind)
  const { lines, merges } = data
  const totals = resolvePrintTemplateTotals(data, kind)

  if (isMaterial) {
    return (
      <div className="erp-material-contract-paper erp-material-contract-paper--preview">
        <div className="erp-material-contract-paper__title">合同订单</div>

        <section className="erp-material-contract-meta">
          <MaterialContractMetaPair
            left={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  采购订单号：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.contractNo, '')}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__top-row">
                <div className="erp-material-contract-meta__row erp-material-contract-meta__row--top-item">
                  <span className="erp-material-contract-meta__label">
                    下单日期：
                  </span>
                  <span className="erp-material-contract-meta__value">
                    {renderPrintValue(data.orderDateText, '')}
                  </span>
                </div>
                <div className="erp-material-contract-meta__row erp-material-contract-meta__row--top-item">
                  <span className="erp-material-contract-meta__label">
                    回货日期：
                  </span>
                  <span className="erp-material-contract-meta__value">
                    {renderPrintValue(data.returnDateText, '')}
                  </span>
                </div>
              </div>
            }
          />
          <MaterialContractMetaPair
            left={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  供应商名称：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.supplierName, '')}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  订货单位：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.buyerCompany, '')}
                </span>
              </div>
            }
          />
          <MaterialContractMetaPair
            left={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  联系人：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.supplierContact, '')}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  订货人：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.buyerContact, '')}
                </span>
              </div>
            }
          />
          <MaterialContractMetaPair
            left={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  联系电话：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.supplierPhone, '')}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  联系电话：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.buyerPhone, '')}
                </span>
              </div>
            }
          />
          <MaterialContractMetaPair
            left={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  供应商地址：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.supplierAddress, '')}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  公司地址：
                </span>
                <span className="erp-material-contract-meta__value">
                  {renderPrintValue(data.buyerAddress, '')}
                </span>
              </div>
            }
          />
        </section>

        <table className="erp-material-contract-table">
          <colgroup>
            <col style={{ width: '9.5%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '11.5%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6.5%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '11.5%' }} />
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.contractNo}-${index}`}>
                {buildPrintTemplateLineCells(line, index, kind, merges).map(
                  (cell) => (
                    <td
                      key={`${cell.key}-${index}`}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                    >
                      {cell.value}
                    </td>
                  )
                )}
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
          <section className="erp-material-contract-clause-block">
            <div className="erp-material-contract-clause-block__title">
              一、来货要求：
            </div>
            <ol className="erp-material-contract-clause-block__list">
              {data.clauses.delivery.map((item, index) => (
                <li
                  key={item}
                  className="erp-material-contract-clause-block__item"
                >
                  <span className="erp-material-contract-clause-block__index">
                    {index + 1}、
                  </span>
                  <span className="erp-material-contract-clause-block__value">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="erp-material-contract-clause-block">
            <div className="erp-material-contract-clause-block__title">
              二、合同约定：
            </div>
            <ol className="erp-material-contract-clause-block__list">
              {data.clauses.contract.map((item, index) => (
                <li
                  key={item}
                  className="erp-material-contract-clause-block__item"
                >
                  <span className="erp-material-contract-clause-block__index">
                    {index + 1}、
                  </span>
                  <span className="erp-material-contract-clause-block__value">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="erp-material-contract-clause-block">
            <div className="erp-material-contract-clause-block__title">
              三、结算方式：
            </div>
            <ol className="erp-material-contract-clause-block__list">
              {data.clauses.settlement.map((item, index) => (
                <li
                  key={item}
                  className="erp-material-contract-clause-block__item"
                >
                  <span className="erp-material-contract-clause-block__index">
                    {index + 1}、
                  </span>
                  <span className="erp-material-contract-clause-block__value">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="erp-material-contract-signature">
          <div className="erp-material-contract-signature__block">
            <div className="erp-material-contract-signature__row">
              <div className="erp-material-contract-signature__label">
                甲方（订货方）：
              </div>
              <div className="erp-material-contract-signature__name">
                {renderPrintValue(
                  coalescePrintValues(data.buyerSigner, data.buyerContact),
                  ''
                )}
              </div>
            </div>
            <div className="erp-material-contract-signature__row erp-material-contract-signature__row--date">
              <div className="erp-material-contract-signature__label">
                日期：
              </div>
              <div className="erp-material-contract-signature__date-value">
                {renderPrintValue(data.signDateText, '')}
              </div>
            </div>
          </div>
          <div className="erp-material-contract-signature__block">
            <div className="erp-material-contract-signature__row">
              <div className="erp-material-contract-signature__label">
                乙方（供货方）：
              </div>
              <div className="erp-material-contract-signature__name">
                {renderPrintValue(data.supplierSigner, '')}
              </div>
            </div>
            <div className="erp-material-contract-signature__row erp-material-contract-signature__row--date">
              <div className="erp-material-contract-signature__label">
                日期：
              </div>
              <div className="erp-material-contract-signature__date-value">
                {renderPrintValue(data.supplierSignDateText, '')}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const leftItems = isMaterial
    ? [
        { label: '采购订单号', value: data.contractNo },
        { label: '供应商名称', value: data.supplierName },
        { label: '联系人', value: data.supplierContact },
        { label: '联系电话', value: data.supplierPhone },
        { label: '供应商地址', value: data.supplierAddress },
      ]
    : [
        { label: '合同编号', value: data.contractNo },
        { label: '加工方名称', value: data.supplierName },
        { label: '联系人', value: data.supplierContact },
        { label: '联系电话', value: data.supplierPhone },
        { label: '供应商地址', value: data.supplierAddress },
      ]
  const rightItems = [
    { label: '下单日期', value: data.orderDateText },
    { label: isMaterial ? '订货单位' : '委托单位', value: data.buyerCompany },
    { label: isMaterial ? '订货人' : '委托人', value: data.buyerContact },
    { label: '联系电话', value: data.buyerPhone },
    { label: '公司地址', value: data.buyerAddress },
    { label: '回货日期', value: data.returnDateText },
  ]

  return (
    <div className="erp-print-paper">
      <div className="erp-print-paper__header">
        <div className="erp-print-paper__title">合同订单</div>
      </div>

      <PrintMetaGrid leftItems={leftItems} rightItems={rightItems} />

      <table className="erp-print-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.contractNo}-${index}`}>
              {buildPrintTemplateLineCells(line, index, kind, merges).map(
                (cell) => (
                  <td
                    key={`${cell.key}-${index}`}
                    rowSpan={cell.rowSpan}
                    colSpan={cell.colSpan}
                  >
                    {cell.value}
                  </td>
                )
              )}
            </tr>
          ))}
          <tr className="erp-print-table__total">
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

      <div className="erp-print-clauses">
        <div className="erp-print-clauses__section">
          <div className="erp-print-clauses__title">一、来货要求</div>
          <ol>{renderClauseItems('delivery', data.clauses.delivery)}</ol>
        </div>
        <div className="erp-print-clauses__section">
          <div className="erp-print-clauses__title">二、合同约定</div>
          <ol>{renderClauseItems('contract', data.clauses.contract)}</ol>
        </div>
        <div className="erp-print-clauses__section">
          <div className="erp-print-clauses__title">三、结算方式</div>
          <ol>{renderClauseItems('settlement', data.clauses.settlement)}</ol>
        </div>
      </div>

      <div className="erp-print-signature">
        <div className="erp-print-signature__block">
          <div className="erp-print-signature__label">
            甲方（{isMaterial ? '订货方' : '委托方'}）：
          </div>
          <div className="erp-print-signature__value">
            {renderPrintValue(
              coalescePrintValues(data.buyerSigner, data.buyerContact),
              ''
            )}
          </div>
          <div className="erp-print-signature__date">
            日期：
            {renderPrintValue(
              isMaterial ? data.signDateText : data.buyerSignDateText,
              ''
            )}
          </div>
        </div>
        <div className="erp-print-signature__block">
          <div className="erp-print-signature__label">
            乙方（{isMaterial ? '供货方' : '受托方'}）：
          </div>
          <div className="erp-print-signature__value">
            {renderPrintValue(data.supplierSigner)}
          </div>
          <div className="erp-print-signature__date">
            日期：{renderPrintValue(data.supplierSignDateText, '')}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PrintTemplateRenderer({ template }) {
  if (!template) {
    return null
  }

  if (template.key === 'material-purchase-contract') {
    return <ContractTemplate data={template.sample} kind="material" />
  }

  if (template.key === 'processing-contract') {
    return <ContractTemplate data={template.sample} kind="processing" />
  }

  return null
}
