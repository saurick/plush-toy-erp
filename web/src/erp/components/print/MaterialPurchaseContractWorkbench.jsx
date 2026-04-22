import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from 'antd'
import { message } from '@/common/utils/antdApp'
import {
  MATERIAL_PURCHASE_DETAIL_COLUMNS,
  MATERIAL_PURCHASE_MAX_ROWS,
  buildMaterialPurchaseContractDraft,
  computeMaterialPurchaseTotals,
  deleteMaterialPurchaseLine,
  insertMaterialPurchaseLine,
  updateMaterialPurchaseClause,
  updateMaterialPurchaseField,
  updateMaterialPurchaseLineCell,
} from '../../utils/materialPurchaseContractEditor.mjs'
import PrintWorkspaceShell from './PrintWorkspaceShell.jsx'
import {
  downloadPdfFromElement,
  openPdfPreviewFromElement,
} from '../../utils/printPdf.mjs'

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

  return (
    <Tag
      className={`erp-material-contract-editable ${className} ${
        disabled ? 'erp-material-contract-editable-disabled' : ''
      }`}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck={false}
      onKeyDown={(event) => {
        if (!multiline && event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => {
        const nextValue = multiline
          ? event.currentTarget.innerText
              .replaceAll('\r', '')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
          : event.currentTarget.innerText.replaceAll('\r', '').trim()
        if (nextValue !== String(value ?? '')) {
          onCommit(nextValue)
        }
      }}
    >
      {String(value ?? '').trim() ? String(value ?? '') : '\u00A0'}
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

function ClauseBlock({ title, items, onCommit, disabled = false }) {
  return (
    <section className="erp-material-contract-clause-block">
      <div className="erp-material-contract-clause-block__title">{title}：</div>
      <ol className="erp-material-contract-clause-block__list">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="erp-material-contract-clause-block__item"
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

function loadDraft(template, storageKey) {
  const fallbackDraft = buildMaterialPurchaseContractDraft(template?.sample)
  if (!storageKey || typeof window === 'undefined') {
    return fallbackDraft
  }
  try {
    const rawDraft = window.localStorage.getItem(storageKey)
    if (!rawDraft) {
      return fallbackDraft
    }
    const parsedDraft = JSON.parse(rawDraft)
    return buildMaterialPurchaseContractDraft({
      ...template?.sample,
      ...parsedDraft,
      lines: parsedDraft?.lines || template?.sample?.lines,
      clauses: parsedDraft?.clauses || template?.sample?.clauses,
      merges: parsedDraft?.merges || template?.sample?.merges,
    })
  } catch (error) {
    return fallbackDraft
  }
}

export default function MaterialPurchaseContractWorkbench({
  template,
  draftStorageKey = '',
}) {
  const [draft, setDraft] = useState(() => loadDraft(template, draftStorageKey))
  const [formulaVisible, setFormulaVisible] = useState(false)
  const [rowSelectionMode, setRowSelectionMode] = useState(false)
  const [selectedRowIndex, setSelectedRowIndex] = useState(null)
  const [toolbarStatus, setToolbarStatus] = useState(
    '右侧模板已按实拍收口为纸质合同版式；仅中间采购明细区保留表格。'
  )
  const [pdfPreviewURL, setPdfPreviewURL] = useState('')
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfAction, setPdfAction] = useState('')
  const paperRef = useRef(null)

  useEffect(() => {
    setDraft(loadDraft(template, draftStorageKey))
    setFormulaVisible(false)
    setRowSelectionMode(false)
    setSelectedRowIndex(null)
    setToolbarStatus('已恢复模板样例数据。')
  }, [draftStorageKey, template])

  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
  }, [draft, draftStorageKey])

  useEffect(
    () => () => {
      if (pdfPreviewURL) {
        URL.revokeObjectURL(pdfPreviewURL)
      }
    },
    [pdfPreviewURL]
  )

  const totals = useMemo(
    () => computeMaterialPurchaseTotals(draft.lines),
    [draft.lines]
  )
  const templateModesActive = rowSelectionMode

  const resetRowSelection = () => {
    setSelectedRowIndex(null)
  }

  const handleFieldCommit = (fieldKey, nextValue) => {
    setDraft((currentDraft) =>
      updateMaterialPurchaseField(currentDraft, fieldKey, nextValue)
    )
  }

  const handleClauseCommit = (sectionKey, clauseIndex, nextValue) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      clauses: updateMaterialPurchaseClause(
        currentDraft.clauses,
        sectionKey,
        clauseIndex,
        nextValue
      ),
    }))
  }

  const handleLineCommit = (rowIndex, columnKey, nextValue) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      lines: updateMaterialPurchaseLineCell(
        currentDraft.lines,
        rowIndex,
        columnKey,
        nextValue
      ),
    }))
  }

  const handleToggleRowSelectionMode = () => {
    setRowSelectionMode((currentValue) => {
      const nextValue = !currentValue
      if (nextValue) {
        setToolbarStatus('已进入明细行选择模式，请点击中间明细表中的目标行。')
      } else {
        setToolbarStatus('已退出明细行选择模式。')
      }
      return nextValue
    })
  }

  const handleInsertRow = (position) => {
    const result = insertMaterialPurchaseLine({
      lines: draft.lines,
      merges: draft.merges,
      selectedRowIndex,
      position,
    })
    if (!result.ok) {
      setToolbarStatus(result.message)
      message.warning(result.message)
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedRowIndex(result.selectedRowIndex)
    setToolbarStatus(result.message)
  }

  const handleDeleteRow = () => {
    const result = deleteMaterialPurchaseLine({
      lines: draft.lines,
      merges: draft.merges,
      selectedRowIndex,
    })
    if (!result.ok) {
      setToolbarStatus(result.message)
      message.warning(result.message)
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedRowIndex(result.selectedRowIndex)
    setToolbarStatus(result.message)
  }

  const buildPdfFileName = () =>
    `${draft.contractNo || '采购合同'}-${draft.supplierName || '打印稿'}.pdf`

  const handlePreviewPDF = async () => {
    if (!paperRef.current) {
      return
    }
    setPdfAction('preview')
    try {
      if (pdfPreviewURL) {
        URL.revokeObjectURL(pdfPreviewURL)
      }
      const { previewURL } = await openPdfPreviewFromElement(paperRef.current)
      setPdfPreviewURL(previewURL)
      setPdfPreviewOpen(true)
      setToolbarStatus('已生成在线 PDF 预览。')
    } catch (error) {
      const errorMessage = error?.message || '生成 PDF 预览失败，请稍后重试。'
      setToolbarStatus(errorMessage)
      message.error(errorMessage)
    } finally {
      setPdfAction('')
    }
  }

  const handleDownloadPDF = async () => {
    if (!paperRef.current) {
      return
    }
    setPdfAction('download')
    try {
      await downloadPdfFromElement(paperRef.current, buildPdfFileName())
      setToolbarStatus('已开始下载 PDF。')
    } catch (error) {
      const errorMessage = error?.message || '下载 PDF 失败，请稍后重试。'
      setToolbarStatus(errorMessage)
      message.error(errorMessage)
    } finally {
      setPdfAction('')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleResetDraft = () => {
    if (draftStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(draftStorageKey)
    }
    setDraft(buildMaterialPurchaseContractDraft(template?.sample))
    setFormulaVisible(false)
    setRowSelectionMode(false)
    resetRowSelection()
    setToolbarStatus('已恢复为实拍对照样例。')
  }

  const getToolbarButtonClassName = ({
    active = false,
    primary = false,
  } = {}) =>
    [
      'erp-print-shell__button',
      primary
        ? 'erp-print-shell__button--primary'
        : 'erp-print-shell__button--ghost',
      active ? 'erp-print-shell__button--active' : '',
    ]
      .filter(Boolean)
      .join(' ')

  const fieldRows = [
    {
      key: 'contractNo',
      label: '采购订单号',
      value: draft.contractNo,
      onChange: (value) => handleFieldCommit('contractNo', value),
    },
    {
      key: 'orderDateText',
      label: '下单日期',
      value: draft.orderDateText,
      onChange: (value) => handleFieldCommit('orderDateText', value),
    },
    {
      key: 'returnDateText',
      label: '回货日期',
      value: draft.returnDateText,
      onChange: (value) => handleFieldCommit('returnDateText', value),
    },
    {
      key: 'supplierName',
      label: '供应商名称',
      value: draft.supplierName,
      onChange: (value) => handleFieldCommit('supplierName', value),
    },
    {
      key: 'supplierContact',
      label: '联系人',
      value: draft.supplierContact,
      onChange: (value) => handleFieldCommit('supplierContact', value),
    },
    {
      key: 'supplierPhone',
      label: '联系电话',
      value: draft.supplierPhone,
      onChange: (value) => handleFieldCommit('supplierPhone', value),
    },
    {
      key: 'supplierAddress',
      label: '供应商地址',
      value: draft.supplierAddress,
      multiline: true,
      rows: 3,
      onChange: (value) => handleFieldCommit('supplierAddress', value),
    },
    {
      key: 'buyerCompany',
      label: '订货单位',
      value: draft.buyerCompany,
      onChange: (value) => handleFieldCommit('buyerCompany', value),
    },
    {
      key: 'buyerContact',
      label: '订货人',
      value: draft.buyerContact,
      onChange: (value) => handleFieldCommit('buyerContact', value),
    },
    {
      key: 'buyerPhone',
      label: '订货方电话',
      value: draft.buyerPhone,
      onChange: (value) => handleFieldCommit('buyerPhone', value),
    },
    {
      key: 'buyerAddress',
      label: '公司地址',
      value: draft.buyerAddress,
      multiline: true,
      rows: 3,
      onChange: (value) => handleFieldCommit('buyerAddress', value),
    },
    {
      key: 'buyerSigner',
      label: '甲方签名',
      value: draft.buyerSigner,
      onChange: (value) => handleFieldCommit('buyerSigner', value),
    },
    {
      key: 'supplierSigner',
      label: '乙方签名',
      value: draft.supplierSigner,
      onChange: (value) => handleFieldCommit('supplierSigner', value),
    },
    {
      key: 'signDateText',
      label: '甲方日期',
      value: draft.signDateText,
      onChange: (value) => handleFieldCommit('signDateText', value),
    },
    {
      key: 'supplierSignDateText',
      label: '乙方日期',
      value: draft.supplierSignDateText,
      onChange: (value) => handleFieldCommit('supplierSignDateText', value),
    },
    ...CLAUSE_SECTIONS.flatMap((section) =>
      (draft.clauses[section.key] || []).map((item, index) => ({
        key: `${section.key}-${index}`,
        label: `${section.title} ${index + 1}`,
        value: item,
        multiline: true,
        rows: 3,
        onChange: (value) => handleClauseCommit(section.key, index, value),
      }))
    ),
  ]

  const detailEditor = (
    <section className="erp-print-shell__detail-panel">
      <h4>采购明细分行编辑</h4>
      <table className="erp-print-shell__detail-table erp-print-shell__detail-table--purchase">
        <thead>
          <tr>
            <th>序号</th>
            <th>材料品名</th>
            <th>数量</th>
            <th>单价</th>
            <th>金额</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, index) => (
            <tr key={`purchase-panel-line-${index}`}>
              <td className="erp-print-shell__detail-index-cell">
                {index + 1}
              </td>
              <td>
                <textarea
                  className="erp-print-shell__detail-editor erp-print-shell__detail-editor--multiline"
                  rows={2}
                  value={line.materialName}
                  onChange={(event) =>
                    handleLineCommit(index, 'materialName', event.target.value)
                  }
                />
              </td>
              <td>
                <input
                  className="erp-print-shell__detail-editor"
                  type="text"
                  value={line.quantity}
                  onChange={(event) =>
                    handleLineCommit(index, 'quantity', event.target.value)
                  }
                />
              </td>
              <td>
                <input
                  className="erp-print-shell__detail-editor"
                  type="text"
                  value={line.unitPrice}
                  onChange={(event) =>
                    handleLineCommit(index, 'unitPrice', event.target.value)
                  }
                />
              </td>
              <td>
                <div className="erp-print-shell__detail-static">
                  {line.amount || '-'}
                </div>
              </td>
              <td>
                <textarea
                  className="erp-print-shell__detail-editor erp-print-shell__detail-editor--multiline"
                  rows={2}
                  value={line.remark}
                  onChange={(event) =>
                    handleLineCommit(index, 'remark', event.target.value)
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )

  return (
    <PrintWorkspaceShell
      title="采购合同"
      statusText={toolbarStatus}
      panelTip="提示：左侧字段与右侧采购合同双向同步；右侧仅中间采购明细区保留表格，合同头、条款和签字区都按纸质合同排版。"
      detailEditor={detailEditor}
      fieldRows={fieldRows}
      formulaPanel={
        formulaVisible ? (
          <>
            <strong>采购合同计算规则</strong>
            <span>金额 = 数量 × 单价</span>
            <span>总计 = Σ 采购金额</span>
            <span>单价保留 3 位小数，采购金额保留 2 位小数。</span>
          </>
        ) : null
      }
      toolbarActions={
        <>
          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleInsertRow.bind(null, 'before')}
              disabled={selectedRowIndex == null}
            >
              上插一行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleInsertRow.bind(null, 'after')}
              disabled={selectedRowIndex == null}
            >
              下插一行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleDeleteRow}
              disabled={selectedRowIndex == null}
            >
              删除当前行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName({
                active: rowSelectionMode,
              })}
              onClick={handleToggleRowSelectionMode}
            >
              {rowSelectionMode ? '取消选择' : '选择明细行'}
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName({ active: formulaVisible })}
              onClick={() => setFormulaVisible((currentValue) => !currentValue)}
            >
              计算规则
            </button>
            <span className="erp-print-shell__counter">
              采购明细行: {draft.lines.length}/{MATERIAL_PURCHASE_MAX_ROWS}
            </span>
          </div>

          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleResetDraft}
            >
              恢复样例
            </button>
          </div>

          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handlePreviewPDF}
              disabled={pdfAction !== ''}
            >
              {pdfAction === 'preview' ? '生成中…' : '在线预览 PDF'}
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleDownloadPDF}
              disabled={pdfAction !== ''}
            >
              {pdfAction === 'download' ? '生成中…' : '下载 PDF'}
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName({ primary: true })}
              onClick={handlePrint}
            >
              打印
            </button>
          </div>
        </>
      }
    >
      <div className="erp-print-shell__stage-wrap">
        <div className="erp-material-contract-paper" ref={paperRef}>
          <div className="erp-material-contract-paper__title">合同订单</div>

          <section className="erp-material-contract-meta">
            <div className="erp-material-contract-meta__column">
              <MetaField
                label="采购订单号："
                value={draft.contractNo}
                onCommit={(nextValue) =>
                  handleFieldCommit('contractNo', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                label="供应商名称："
                value={draft.supplierName}
                onCommit={(nextValue) =>
                  handleFieldCommit('supplierName', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                label="联系人："
                value={draft.supplierContact}
                onCommit={(nextValue) =>
                  handleFieldCommit('supplierContact', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                label="联系电话："
                value={draft.supplierPhone}
                onCommit={(nextValue) =>
                  handleFieldCommit('supplierPhone', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                label="供应商地址："
                value={draft.supplierAddress}
                onCommit={(nextValue) =>
                  handleFieldCommit('supplierAddress', nextValue)
                }
                disabled={templateModesActive}
              />
            </div>

            <div className="erp-material-contract-meta__column erp-material-contract-meta__column--right">
              <div className="erp-material-contract-meta__top-row">
                <MetaField
                  label="下单日期："
                  value={draft.orderDateText}
                  onCommit={(nextValue) =>
                    handleFieldCommit('orderDateText', nextValue)
                  }
                  disabled={templateModesActive}
                />
                <MetaField
                  label="回货日期："
                  value={draft.returnDateText}
                  onCommit={(nextValue) =>
                    handleFieldCommit('returnDateText', nextValue)
                  }
                  disabled={templateModesActive}
                />
              </div>
              <MetaField
                label="订货单位："
                value={draft.buyerCompany}
                onCommit={(nextValue) =>
                  handleFieldCommit('buyerCompany', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                label="订货人："
                value={draft.buyerContact}
                onCommit={(nextValue) =>
                  handleFieldCommit('buyerContact', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                label="联系电话："
                value={draft.buyerPhone}
                onCommit={(nextValue) =>
                  handleFieldCommit('buyerPhone', nextValue)
                }
                disabled={templateModesActive}
              />
              <MetaField
                label="公司地址："
                value={draft.buyerAddress}
                onCommit={(nextValue) =>
                  handleFieldCommit('buyerAddress', nextValue)
                }
                disabled={templateModesActive}
              />
            </div>
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
                      `已选中第 ${rowIndex + 1} 行，可继续上插 / 下插 / 删除。`
                    )
                  }}
                >
                  {MATERIAL_PURCHASE_DETAIL_COLUMNS.map((column) => (
                    <td key={`${column.key}-${rowIndex}`}>
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
                  ))}
                </tr>
              ))}
              <tr className="erp-material-contract-table__total">
                <td colSpan={8} />
                <td>合计</td>
                <td>{totals.quantityText}</td>
                <td>{totals.amountText}</td>
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
                <div className="erp-material-contract-signature__label">
                  日期：
                </div>
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
                <div className="erp-material-contract-signature__label">
                  日期：
                </div>
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
        </div>
      </div>

      <Modal
        open={pdfPreviewOpen}
        title="采购合同 PDF 预览"
        onCancel={() => setPdfPreviewOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 24 }}
        destroyOnHidden
      >
        {pdfPreviewURL ? (
          <iframe
            title="采购合同 PDF 预览"
            src={pdfPreviewURL}
            className="erp-material-contract-pdf-frame"
          />
        ) : null}
      </Modal>
    </PrintWorkspaceShell>
  )
}
