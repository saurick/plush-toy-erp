import React from 'react'

const contractColumns = {
  material: [
    '采购订单号',
    '产品订单编号',
    '产品编号',
    '产品名称',
    '材料品名',
    '厂商料号',
    '规格',
    '单位',
    '单价',
    '采购数量',
    '采购金额',
    '备注',
  ],
  processing: [
    '委外加工订单号',
    '产品订单编号',
    '产品编号',
    '产品名称',
    '工序名称',
    '加工厂商',
    '工序类别',
    '单位',
    '单价',
    '委托加工数量',
    '委托加工金额',
    '备注',
  ],
}

function PrintMetaGrid({ leftItems, rightItems }) {
  return (
    <div className="erp-print-meta-grid">
      <div className="erp-print-meta-grid__column">
        {leftItems.map((item) => (
          <div key={item.label} className="erp-print-meta-grid__row">
            <span className="erp-print-meta-grid__label">{item.label}</span>
            <span className="erp-print-meta-grid__value">{item.value}</span>
          </div>
        ))}
      </div>
      <div className="erp-print-meta-grid__column">
        {rightItems.map((item) => (
          <div key={item.label} className="erp-print-meta-grid__row">
            <span className="erp-print-meta-grid__label">{item.label}</span>
            <span className="erp-print-meta-grid__value">{item.value}</span>
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

function ContractTemplate({ data, kind }) {
  const isMaterial = kind === 'material'
  const columns = isMaterial
    ? contractColumns.material
    : contractColumns.processing
  const lines = Array.isArray(data?.lines) ? data.lines : []

  if (isMaterial) {
    const quantityTotal = lines.reduce((total, line) => {
      const parsed = Number(String(line?.quantity || '').replaceAll(',', ''))
      return Number.isFinite(parsed) ? total + parsed : total
    }, 0)
    const amountTotal = lines.reduce((total, line) => {
      const parsed = Number(String(line?.amount || '').replaceAll(',', ''))
      return Number.isFinite(parsed) ? total + parsed : total
    }, 0)
    const quantityText = quantityTotal > 0 ? String(quantityTotal) : ''
    const amountText = amountTotal > 0 ? amountTotal.toFixed(2) : ''

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
                  {data.contractNo || ''}
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
                    {data.orderDateText || ''}
                  </span>
                </div>
                <div className="erp-material-contract-meta__row erp-material-contract-meta__row--top-item">
                  <span className="erp-material-contract-meta__label">
                    回货日期：
                  </span>
                  <span className="erp-material-contract-meta__value">
                    {data.returnDateText || ''}
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
                  {data.supplierName || ''}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  订货单位：
                </span>
                <span className="erp-material-contract-meta__value">
                  {data.buyerCompany || ''}
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
                  {data.supplierContact || ''}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  订货人：
                </span>
                <span className="erp-material-contract-meta__value">
                  {data.buyerContact || ''}
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
                  {data.supplierPhone || ''}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  联系电话：
                </span>
                <span className="erp-material-contract-meta__value">
                  {data.buyerPhone || ''}
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
                  {data.supplierAddress || ''}
                </span>
              </div>
            }
            right={
              <div className="erp-material-contract-meta__row">
                <span className="erp-material-contract-meta__label">
                  公司地址：
                </span>
                <span className="erp-material-contract-meta__value">
                  {data.buyerAddress || ''}
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
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.contractNo}-${index}`}>
                <td>{line.contractNo || ''}</td>
                <td>{line.productOrderNo || ''}</td>
                <td>{line.productNo || ''}</td>
                <td>{line.productName || ''}</td>
                <td>{line.materialName || ''}</td>
                <td>{line.vendorCode || ''}</td>
                <td>{line.spec || ''}</td>
                <td>{line.unit || ''}</td>
                <td>{line.unitPrice || ''}</td>
                <td>{line.quantity || ''}</td>
                <td>{line.amount || ''}</td>
                <td>{line.remark || ''}</td>
              </tr>
            ))}
            <tr className="erp-material-contract-table__total">
              <td colSpan={8} />
              <td>合计</td>
              <td className="erp-contract-table__total-value">
                {quantityText}
              </td>
              <td className="erp-contract-table__total-value">{amountText}</td>
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
                {data.buyerSigner || data.buyerContact || ''}
              </div>
            </div>
            <div className="erp-material-contract-signature__row erp-material-contract-signature__row--date">
              <div className="erp-material-contract-signature__label">
                日期：
              </div>
              <div className="erp-material-contract-signature__date-value">
                {data.signDateText || ''}
              </div>
            </div>
          </div>
          <div className="erp-material-contract-signature__block">
            <div className="erp-material-contract-signature__row">
              <div className="erp-material-contract-signature__label">
                乙方（供货方）：
              </div>
              <div className="erp-material-contract-signature__name">
                {data.supplierSigner || ''}
              </div>
            </div>
            <div className="erp-material-contract-signature__row erp-material-contract-signature__row--date">
              <div className="erp-material-contract-signature__label">
                日期：
              </div>
              <div className="erp-material-contract-signature__date-value">
                {data.supplierSignDateText || ''}
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
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const values = isMaterial
              ? [
                  line.contractNo,
                  line.productOrderNo,
                  line.productNo,
                  line.productName,
                  line.materialName,
                  line.vendorCode,
                  line.spec,
                  line.unit,
                  line.unitPrice,
                  line.quantity,
                  line.amount,
                  line.remark,
                ]
              : [
                  line.contractNo,
                  line.productOrderNo,
                  line.productNo,
                  line.productName,
                  line.processName,
                  line.supplierAlias,
                  line.processCategory,
                  line.unit,
                  line.unitPrice,
                  line.quantity,
                  line.amount,
                  line.remark,
                ]

            return (
              <tr key={`${line.contractNo}-${index}`}>
                {values.map((value, valueIndex) => (
                  <td key={`${columns[valueIndex]}-${index}`}>{value || ''}</td>
                ))}
              </tr>
            )
          })}
          <tr className="erp-print-table__total">
            <td colSpan={8} />
            <td>合计</td>
            <td className="erp-contract-table__total-value">
              {data.totalQuantity}
            </td>
            <td className="erp-contract-table__total-value">
              {data.totalAmount}
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
          <div className="erp-print-signature__value">{data.buyerContact}</div>
          <div className="erp-print-signature__date">
            日期：{data.signDateText}
          </div>
        </div>
        <div className="erp-print-signature__block">
          <div className="erp-print-signature__label">
            乙方（{isMaterial ? '供货方' : '受托方'}）：
          </div>
          <div className="erp-print-signature__value">&nbsp;</div>
          <div className="erp-print-signature__date">
            日期：{data.supplierSignDateText}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryTemplate({ data, kind }) {
  const rows = Array.isArray(data?.rows) ? data.rows : []
  const isMaterial = kind === 'material'

  return (
    <div className="erp-print-paper erp-print-paper--landscape">
      <div className="erp-summary-sheet">
        <div className="erp-summary-sheet__title">{data.title}</div>
        <div className="erp-summary-sheet__meta">
          <div>订单编号：{data.orderNo}</div>
          <div>产品编号：{data.styleNo}</div>
          <div>产品名称：{data.productName}</div>
          <div>定单日期：{data.orderDateText}</div>
        </div>
        <table className="erp-print-table erp-print-table--summary">
          <thead>
            <tr>
              <th rowSpan={2}>序号</th>
              <th rowSpan={2}>订单编号</th>
              <th rowSpan={2}>产品编号</th>
              <th rowSpan={2}>产品名称</th>
              <th rowSpan={2}>{isMaterial ? '材料品名' : '工序名称'}</th>
              <th rowSpan={2}>{isMaterial ? '厂商料号' : '加工厂商'}</th>
              <th rowSpan={2}>{isMaterial ? '规格' : '工序类别'}</th>
              <th rowSpan={2}>单位</th>
              <th rowSpan={2}>{isMaterial ? '采购数量' : '加工数量'}</th>
              <th colSpan={3}>{isMaterial ? '材料耗量' : '加工数量带宽'}</th>
            </tr>
            <tr>
              {data.quantityBands.map((item) => (
                <th key={item}>{item}</th>
              ))}
            </tr>
            <tr className="erp-print-table__subhead">
              <th colSpan={9}>产品总数量</th>
              {data.totalQuantities.map((item, index) => (
                <th key={`${item}-${index}`}>{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${row[0]}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ThumbnailBadge({ label }) {
  return <div className="erp-report-thumb">{label}</div>
}

function ProductionReportTemplate({ data }) {
  const rows = Array.isArray(data?.rows) ? data.rows : []
  const columns = [
    '下单日期',
    '客户',
    '订单编号',
    '客户订单号',
    '产品编号',
    '产品名称',
    '颜色',
    '订单数量',
    '损头版',
    '生产数量',
    '出货日期',
    '未出货数',
    '业务人员',
    '图片',
    '类别',
    '单价',
    '备注',
  ]

  return (
    <div className="erp-print-paper erp-print-paper--landscape">
      <div className="erp-production-report">
        <div className="erp-production-report__company">{data.companyName}</div>
        <div className="erp-production-report__title">{data.title}</div>
        <table className="erp-print-table erp-print-table--report">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className={
                    [
                      '客户',
                      '订单编号',
                      '产品编号',
                      '颜色',
                      '订单数量',
                      '生产数量',
                      '出货日期',
                      '类别',
                      '单价',
                    ].includes(column)
                      ? 'erp-print-table__highlight'
                      : ''
                  }
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[2]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${row[2]}-${cellIndex}`}>
                    {cellIndex === 13 ? (
                      <ThumbnailBadge label={row[4]} />
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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

  if (template.key === 'material-summary') {
    return <SummaryTemplate data={template.sample} kind="material" />
  }

  if (template.key === 'processing-summary') {
    return <SummaryTemplate data={template.sample} kind="processing" />
  }

  if (template.key === 'production-order-report') {
    return <ProductionReportTemplate data={template.sample} />
  }

  return null
}
