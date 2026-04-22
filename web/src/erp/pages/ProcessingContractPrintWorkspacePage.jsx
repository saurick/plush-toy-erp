import React, { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import ProcessingContractPaper from '../components/print/ProcessingContractPaper.jsx'
import PrintWorkspaceShell from '../components/print/PrintWorkspaceShell.jsx'
import {
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  createEmptyProcessingLine,
  createProcessingContractDraft,
  processingContractAttachmentSlots,
  resolveProcessingLineAmount,
} from '../data/processingContractTemplate.mjs'

const DRAFT_STORAGE_KEY = '__plush_erp_processing_contract_print_draft__'
const ATTACHMENT_ACCEPT = 'image/*,.pdf,.svg'

function createEmptyAttachmentState() {
  return processingContractAttachmentSlots.reduce((state, slot) => {
    state[slot.key] = null
    return state
  }, {})
}

function loadDraft() {
  if (typeof window === 'undefined') {
    return createProcessingContractDraft()
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      return createProcessingContractDraft()
    }

    const parsed = JSON.parse(raw)
    const { attachments: _legacyAttachments, ...rest } = parsed || {}
    return {
      ...createProcessingContractDraft(),
      ...rest,
    }
  } catch (error) {
    return createProcessingContractDraft()
  }
}

function formatExportFileName() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `processing-contract_${stamp}.pdf`
}

async function getHtml2Pdf() {
  const moduleRef = await import('html2pdf.js')
  return moduleRef.default || moduleRef
}

function buildExportNode(sourceNode) {
  const clone = sourceNode.cloneNode(true)
  clone.classList.add('erp-processing-contract-paper--export')
  clone
    .querySelectorAll('.erp-processing-contract-table__row--selected')
    .forEach((element) => {
      element.classList.remove('erp-processing-contract-table__row--selected')
    })
  return clone
}

async function createPdfBlob(sourceNode) {
  const html2pdf = await getHtml2Pdf()
  const sandbox = document.createElement('div')
  sandbox.className = 'erp-processing-contract-export-sandbox'
  const exportNode = buildExportNode(sourceNode)
  sandbox.appendChild(exportNode)
  document.body.appendChild(sandbox)

  try {
    const worker = html2pdf()
      .set({
        margin: 0,
        filename: formatExportFileName(),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(exportNode)

    const pdf = await worker.toPdf().get('pdf')
    return pdf.output('blob')
  } finally {
    document.body.removeChild(sandbox)
  }
}

export default function ProcessingContractPrintWorkspacePage() {
  const { templateKey } = useParams()
  const paperRef = useRef(null)
  const attachmentInputRefs = useRef({})
  const [contract, setContract] = useState(() => loadDraft())
  const [attachmentFiles, setAttachmentFiles] = useState(() =>
    createEmptyAttachmentState()
  )
  const [rowSelectionMode, setRowSelectionMode] = useState(false)
  const [selectedLineIndex, setSelectedLineIndex] = useState(null)
  const [showFormula, setShowFormula] = useState(false)
  const [busyAction, setBusyAction] = useState('')

  useEffect(() => {
    document.title = '加工合同打印窗口'
  }, [])

  useEffect(() => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(contract))
  }, [contract])

  if (templateKey !== PROCESSING_CONTRACT_TEMPLATE_KEY) {
    return <Navigate to="/erp/print-center" replace />
  }

  const setField = (field, value) => {
    setContract((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const setLineField = (index, field, value) => {
    setContract((current) => {
      const nextLines = current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
      return {
        ...current,
        lines: nextLines,
      }
    })
  }

  const setClause = (groupKey, index, value) => {
    setContract((current) => ({
      ...current,
      clauses: {
        ...current.clauses,
        [groupKey]: current.clauses[groupKey].map((item, itemIndex) =>
          itemIndex === index ? value : item
        ),
      },
    }))
  }

  const handleToggleRowSelectionMode = () => {
    setRowSelectionMode((current) => {
      const nextValue = !current
      if (!nextValue) {
        setSelectedLineIndex(null)
      }
      return nextValue
    })
  }

  const handleInsertLine = (position) => {
    setContract((current) => {
      const nextLines = [...current.lines]
      const baseIndex =
        selectedLineIndex === null
          ? nextLines.length
          : Math.max(0, Math.min(selectedLineIndex, nextLines.length))
      const insertIndex =
        position === 'before'
          ? baseIndex
          : Math.min(baseIndex + 1, nextLines.length)
      nextLines.splice(
        insertIndex,
        0,
        createEmptyProcessingLine(current.contractNo || '')
      )
      setSelectedLineIndex(insertIndex)
      return {
        ...current,
        lines: nextLines,
      }
    })
  }

  const handleRemoveLine = () => {
    if (selectedLineIndex === null) {
      return
    }

    setContract((current) => {
      if (current.lines.length <= 1) {
        setSelectedLineIndex(0)
        return {
          ...current,
          lines: [createEmptyProcessingLine(current.contractNo || '')],
        }
      }

      const nextLines = current.lines.filter(
        (_, index) =>
          index !== Math.min(selectedLineIndex, current.lines.length - 1)
      )
      const nextSelectedIndex = Math.max(
        0,
        Math.min(selectedLineIndex, nextLines.length - 1)
      )
      setSelectedLineIndex(nextSelectedIndex)
      return {
        ...current,
        lines: nextLines,
      }
    })
  }

  const withPdfAction = async (actionKey, runner) => {
    if (!paperRef.current || busyAction) {
      return
    }

    setBusyAction(actionKey)
    try {
      await runner()
    } catch (error) {
      message.error(getActionErrorMessage(error, '生成 PDF'))
    } finally {
      setBusyAction('')
    }
  }

  const handlePreviewPdf = () =>
    withPdfAction('preview', async () => {
      const blob = await createPdfBlob(paperRef.current)
      const blobURL = URL.createObjectURL(blob)
      const previewWindow = window.open(blobURL, '_blank')
      if (!previewWindow) {
        URL.revokeObjectURL(blobURL)
        throw new Error('浏览器拦截了 PDF 预览弹窗，请允许弹窗后重试')
      }
      window.setTimeout(() => URL.revokeObjectURL(blobURL), 60_000)
    })

  const handleDownloadPdf = () =>
    withPdfAction('download', async () => {
      const blob = await createPdfBlob(paperRef.current)
      const blobURL = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobURL
      link.download = formatExportFileName()
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.setTimeout(() => URL.revokeObjectURL(blobURL), 1_000)
    })

  const handlePrint = () => {
    window.print()
  }

  const handleAttachmentUploadClick = (slotKey) => {
    attachmentInputRefs.current[slotKey]?.click()
  }

  const handleAttachmentFileChange = (slot, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setAttachmentFiles((current) => ({
      ...current,
      [slot.key]: file,
    }))
    message.success(`已选择${slot.title}：${file.name}`)
  }

  const resetDraft = () => {
    setContract(createProcessingContractDraft())
    setAttachmentFiles(createEmptyAttachmentState())
    setSelectedLineIndex(null)
    setRowSelectionMode(false)
    setShowFormula(false)
    message.success('已恢复默认加工合同样例')
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
      label: '合同编号',
      value: contract.contractNo,
      onChange: (value) => setField('contractNo', value),
    },
    {
      key: 'orderDateText',
      label: '下单日期',
      value: contract.orderDateText,
      onChange: (value) => setField('orderDateText', value),
    },
    {
      key: 'returnDateText',
      label: '回货日期',
      value: contract.returnDateText,
      onChange: (value) => setField('returnDateText', value),
    },
    {
      key: 'supplierName',
      label: '加工方名称',
      value: contract.supplierName,
      onChange: (value) => setField('supplierName', value),
    },
    {
      key: 'supplierContact',
      label: '联系人',
      value: contract.supplierContact,
      onChange: (value) => setField('supplierContact', value),
    },
    {
      key: 'supplierPhone',
      label: '联系电话',
      value: contract.supplierPhone,
      onChange: (value) => setField('supplierPhone', value),
    },
    {
      key: 'supplierAddress',
      label: '供应商地址',
      value: contract.supplierAddress,
      multiline: true,
      rows: 3,
      onChange: (value) => setField('supplierAddress', value),
    },
    {
      key: 'buyerCompany',
      label: '委托单位',
      value: contract.buyerCompany,
      onChange: (value) => setField('buyerCompany', value),
    },
    {
      key: 'buyerContact',
      label: '委托人',
      value: contract.buyerContact,
      onChange: (value) => setField('buyerContact', value),
    },
    {
      key: 'buyerPhone',
      label: '委托方电话',
      value: contract.buyerPhone,
      onChange: (value) => setField('buyerPhone', value),
    },
    {
      key: 'buyerAddress',
      label: '公司地址',
      value: contract.buyerAddress,
      multiline: true,
      rows: 3,
      onChange: (value) => setField('buyerAddress', value),
    },
    {
      key: 'buyerSignDateText',
      label: '甲方日期',
      value: contract.buyerSignDateText,
      onChange: (value) => setField('buyerSignDateText', value),
    },
    {
      key: 'supplierSignDateText',
      label: '乙方日期',
      value: contract.supplierSignDateText,
      onChange: (value) => setField('supplierSignDateText', value),
    },
    ...Object.entries(contract.clauses).flatMap(([groupKey, values]) =>
      values.map((item, index) => ({
        key: `${groupKey}-${index}`,
        label:
          groupKey === 'delivery'
            ? `来货要求 ${index + 1}`
            : groupKey === 'contract'
              ? `合同约定 ${index + 1}`
              : `结算方式 ${index + 1}`,
        value: item,
        multiline: true,
        rows: 3,
        onChange: (value) => setClause(groupKey, index, value),
      }))
    ),
  ]

  const attachmentUploadBar = (
    <section className="erp-processing-contract-upload-bar">
      <div className="erp-processing-contract-upload-bar__copy">
        纸样 / 图样附件独立上传，仅作为合同附件快照保留，不进入右侧模板或 PDF。
      </div>
      <div className="erp-processing-contract-upload-bar__actions">
        {processingContractAttachmentSlots.map((slot) => {
          const selectedFile = attachmentFiles[slot.key]
          return (
            <div
              key={slot.key}
              className="erp-processing-contract-upload-bar__item"
            >
              <input
                ref={(node) => {
                  attachmentInputRefs.current[slot.key] = node
                }}
                className="erp-processing-contract-upload-bar__input"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(event) => handleAttachmentFileChange(slot, event)}
              />
              <button
                type="button"
                className={getToolbarButtonClassName({
                  active: Boolean(selectedFile),
                })}
                onClick={() => handleAttachmentUploadClick(slot.key)}
                title={
                  selectedFile
                    ? `${slot.title}：${selectedFile.name}`
                    : `上传${slot.title}`
                }
              >
                上传{slot.title}
              </button>
              <span
                className="erp-processing-contract-upload-bar__status"
                title={selectedFile?.name || slot.title}
              >
                {selectedFile ? `已选：${selectedFile.name}` : '未上传'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )

  const detailEditor = (
    <section className="erp-print-shell__detail-panel">
      <h4>加工明细分行编辑</h4>
      <table className="erp-print-shell__detail-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>工序名称</th>
            <th>数量</th>
            <th>单价</th>
            <th>金额</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {contract.lines.map((line, index) => (
            <tr key={`processing-panel-line-${index}`}>
              <td className="erp-print-shell__detail-index-cell">
                {index + 1}
              </td>
              <td>
                <textarea
                  className="erp-print-shell__detail-editor erp-print-shell__detail-editor--multiline"
                  rows={2}
                  value={line.processName}
                  onChange={(event) =>
                    setLineField(index, 'processName', event.target.value)
                  }
                />
              </td>
              <td>
                <input
                  className="erp-print-shell__detail-editor"
                  type="text"
                  value={line.quantity}
                  onChange={(event) =>
                    setLineField(index, 'quantity', event.target.value)
                  }
                />
              </td>
              <td>
                <input
                  className="erp-print-shell__detail-editor"
                  type="text"
                  value={line.unitPrice}
                  onChange={(event) =>
                    setLineField(index, 'unitPrice', event.target.value)
                  }
                />
              </td>
              <td>
                <div className="erp-print-shell__detail-static">
                  {resolveProcessingLineAmount(line) || '-'}
                </div>
              </td>
              <td>
                <textarea
                  className="erp-print-shell__detail-editor erp-print-shell__detail-editor--multiline"
                  rows={2}
                  value={line.remark}
                  onChange={(event) =>
                    setLineField(index, 'remark', event.target.value)
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
      title="加工合同"
      statusText={
        busyAction === 'preview'
          ? '正在生成在线 PDF...'
          : busyAction === 'download'
            ? '正在下载 PDF...'
            : '顶部工具栏与 trade-erp 打印壳页对齐。'
      }
      panelTip="提示：左侧字段与右侧加工合同固定版式双向同步，右侧表格和条款区可直接编辑，打印时仅输出右侧模板。"
      detailEditor={detailEditor}
      fieldRows={fieldRows}
      formulaPanel={
        showFormula ? (
          <>
            <strong>加工合同计算规则</strong>
            <span>1. 委托加工金额 = 委托加工数量 × 单价。</span>
            <span>
              2. 合计数量 = 所有明细数量求和；合计金额 = 所有明细金额求和。
            </span>
            <span>3. 调整单价或数量后，右侧合同金额会自动重算。</span>
          </>
        ) : null
      }
      toolbarActions={
        <>
          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={() => handleInsertLine('before')}
              disabled={selectedLineIndex === null}
            >
              上插一行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={() => handleInsertLine('after')}
              disabled={selectedLineIndex === null}
            >
              下插一行
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleRemoveLine}
              disabled={selectedLineIndex === null}
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
              className={getToolbarButtonClassName({ active: showFormula })}
              onClick={() => setShowFormula((current) => !current)}
            >
              计算规则
            </button>
            <span className="erp-print-shell__counter">
              加工明细行: {contract.lines.length}
            </span>
          </div>

          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={resetDraft}
            >
              恢复样例
            </button>
          </div>

          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handlePreviewPdf}
              disabled={busyAction !== ''}
            >
              {busyAction === 'preview' ? '生成中…' : '在线预览 PDF'}
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleDownloadPdf}
              disabled={busyAction !== ''}
            >
              {busyAction === 'download' ? '生成中…' : '下载 PDF'}
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
      {attachmentUploadBar}
      <div className="erp-print-shell__stage-wrap" ref={paperRef}>
        <ProcessingContractPaper
          contract={contract}
          selectedLineIndex={selectedLineIndex}
          lineSelectionMode={rowSelectionMode}
          onSelectLine={setSelectedLineIndex}
          onFieldChange={setField}
          onLineFieldChange={setLineField}
          onClauseChange={setClause}
        />
      </div>
    </PrintWorkspaceShell>
  )
}
