import React from 'react'
import MaterialPurchaseContractPaper from './MaterialPurchaseContractPaper.jsx'
import ProcessingContractPaper from './ProcessingContractPaper.jsx'

import {
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

function ContractTemplate({ data: rawData, kind }) {
  const data = normalizePrintTemplatePreviewData(rawData)
  return kind === 'material' ? (
    <MaterialPurchaseContractPaper
      draft={data}
      totals={resolvePrintTemplateTotals(data, kind)}
      templateModesActive
      preview
    />
  ) : (
    <ProcessingContractPaper contract={data} readOnly preview />
  )
}

function EngineeringTemplatePreview({ template }) {
  const sample = template?.sample || {}
  const detailLines = Array.isArray(sample.lines)
    ? sample.lines.slice(0, 6)
    : []
  const blocks = Array.isArray(sample.blocks) ? sample.blocks.slice(0, 6) : []
  const rows = Array.isArray(sample.rows) ? sample.rows.slice(0, 8) : []

  return (
    <div className="erp-engineering-print-paper erp-print-template-preview-paper">
      <div className="erp-print-paper__header">
        <div className="erp-print-paper__title">{template.title}</div>
      </div>
      <PrintMetaGrid
        leftItems={[
          { label: '产品编号', value: sample.productNo },
          { label: '产品名称', value: sample.productName },
          { label: '订单号', value: sample.orderNo },
        ]}
        rightItems={[
          { label: '日期', value: sample.dateText },
          { label: '制表', value: sample.maker },
          { label: '审核', value: sample.auditor },
        ]}
      />
      {detailLines.length > 0 ? (
        <table className="erp-print-table" data-table-lines="fixed">
          <thead>
            <tr>
              <th>物料 / 步骤</th>
              <th>部位</th>
              <th>用量 / 方法</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {detailLines.map((line, index) => (
              <tr key={`${line.materialName || line.position}-${index}`}>
                <td>{renderPrintValue(line.materialName, '')}</td>
                <td>{renderPrintValue(line.position, '')}</td>
                <td>
                  {renderPrintValue(
                    coalescePrintValues(
                      line.totalUsage,
                      line.unitUsage,
                      line.processMethod
                    ),
                    ''
                  )}
                </td>
                <td>{renderPrintValue(line.remark, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {blocks.length > 0 ? (
        <div className="erp-print-clauses">
          {blocks.map((block, index) => (
            <div
              className="erp-print-clauses__section"
              key={`${block.materialName}-${index}`}
            >
              <div className="erp-print-clauses__title">
                {renderPrintValue(block.materialName, '')}
              </div>
              <ol>
                {(block.lines || []).map((line, lineIndex) => (
                  <li
                    className="erp-print-clauses__item"
                    key={`${line.position}-${lineIndex}`}
                  >
                    <span className="erp-print-clauses__item-index">
                      {lineIndex + 1}、
                    </span>
                    <span>
                      {renderPrintValue(line.position, '')}
                      {line.method ? ` / ${line.method}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="erp-print-clauses">
          <div className="erp-print-clauses__section">
            <div className="erp-print-clauses__title">
              {renderPrintValue(sample.processName, '作业步骤')}
            </div>
            <ol>
              {rows.map((row, index) => (
                <li
                  className="erp-print-clauses__item"
                  key={`${row.no}-${index}`}
                >
                  <span className="erp-print-clauses__item-index">
                    {renderPrintValue(row.no, index + 1)}、
                  </span>
                  <span>{renderPrintValue(row.text, '')}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
      <div className="erp-print-center-paper-stamp">模板预览</div>
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

  if (template.key === 'engineering-material-detail') {
    return <EngineeringTemplatePreview template={template} />
  }

  if (template.key === 'engineering-color-card') {
    return <EngineeringTemplatePreview template={template} />
  }

  if (template.key === 'engineering-work-instruction') {
    return <EngineeringTemplatePreview template={template} />
  }

  return null
}
