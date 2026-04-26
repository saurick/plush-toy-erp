import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import ProcessingContractPaper from '../components/print/ProcessingContractPaper.jsx'
import PrintWorkspaceShell from '../components/print/PrintWorkspaceShell.jsx'
import {
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  createEmptyProcessingAttachment,
  createProcessingContractDraft,
  normalizeProcessingContractAttachments,
  normalizeProcessingLine,
  processingContractAttachmentSlots,
} from '../data/processingContractTemplate.mjs'
import {
  downloadPdfFromElement,
  openPdfPreviewFromElement,
  warmupPdfPreviewFromElement,
} from '../utils/printPdf.mjs'
import {
  PROCESSING_CONTRACT_MAX_ROWS,
  applyProcessingDetailCellMerge,
  deleteProcessingContractLine,
  splitProcessingDetailCellMerge,
  insertProcessingContractLine,
  updateProcessingContractLineCell,
} from '../utils/processingContractEditor.mjs'
import {
  buildPrintWorkspacePath,
  buildPrintWorkspaceDraftStorageKey,
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceStateID,
  resolvePrintWorkspaceDraftMode,
} from '../utils/printWorkspace.js'
import {
  findMergeAtCell,
  normalizeCellSelection,
} from '../utils/detailCellMerge.mjs'
import {
  syncPrintPageMarginForPaper,
  watchPrintPageMarginForPaper,
} from '../utils/printPageMargin.mjs'
import usePrintWorkspaceWindowSnapshot from '../utils/usePrintWorkspaceWindowSnapshot.js'

const DRAFT_STORAGE_KEY = '__plush_erp_processing_contract_print_draft__'
const ATTACHMENT_ACCEPT = 'image/*,.svg'
const PDF_PREVIEW_WARMUP_DELAY_MS = 450

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取附件失败，请重新上传'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = () =>
      reject(new Error('附件图片无法识别，请换一张图片重试'))
    image.onload = () => resolve(image)
    image.src = dataURL
  })
}

async function createAttachmentSnapshot(file) {
  const fileName = String(file?.name || '').trim()
  const fileType = String(file?.type || '').toLowerCase()
  const isSVG =
    fileType === 'image/svg+xml' || fileName.toLowerCase().endsWith('.svg')

  if (!isSVG && !fileType.startsWith('image/')) {
    throw new Error('纸样 / 图样附件当前只支持图片格式')
  }

  const originalDataURL = await readFileAsDataURL(file)
  if (isSVG) {
    return {
      name: fileName,
      dataURL: originalDataURL,
      mimeType: fileType || 'image/svg+xml',
    }
  }

  const image = await loadImageFromDataURL(originalDataURL)
  const maxDimension = 1400
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1)
  )
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('浏览器暂不支持当前附件处理能力')
  }

  // 纸样快照会持久化到草稿并进入服务端 PDF 渲染，这里先压缩到可控尺寸。
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return {
    name: fileName,
    dataURL: canvas.toDataURL('image/jpeg', 0.86),
    mimeType: 'image/jpeg',
  }
}

function loadDraft({
  forceFresh = false,
  storageKey = DRAFT_STORAGE_KEY,
} = {}) {
  if (typeof window === 'undefined') {
    return createProcessingContractDraft()
  }

  if (forceFresh) {
    return createProcessingContractDraft()
  }

  try {
    const raw = window.localStorage.getItem(storageKey) || ''
    if (!raw) {
      return createProcessingContractDraft()
    }

    const parsed = JSON.parse(raw)
    const { attachments, lines, ...rest } = parsed || {}
    return {
      ...createProcessingContractDraft(),
      ...rest,
      lines: Array.isArray(lines)
        ? lines.map((line) => normalizeProcessingLine(line))
        : createProcessingContractDraft().lines,
      attachments: normalizeProcessingContractAttachments(attachments),
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

function resolveRestoredToolbarStatus(resetDraftOnOpen, sourceTag) {
  if (resetDraftOnOpen) {
    return '已按菜单入口恢复默认加工合同样例。'
  }
  if (sourceTag === '业务记录带值') {
    return '已从业务页带入加工合同草稿，可继续核对并打印。'
  }
  return '顶部工具栏已接入当前打印窗口主工作流。'
}

export default function ProcessingContractPrintWorkspacePage() {
  const { templateKey } = useParams()
  const [searchParams] = useSearchParams()
  const paperRef = useRef(null)
  const stageWrapRef = useRef(null)
  const attachmentInputRefs = useRef({})
  const workspaceStateID = resolvePrintWorkspaceStateID(searchParams)
  const entrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const sourceTag =
    entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
      ? '业务记录带值'
      : '使用默认模板'
  const resetDraftOnOpen =
    resolvePrintWorkspaceDraftMode(searchParams) ===
    PRINT_WORKSPACE_DRAFT_MODE.FRESH
  const draftStorageKey = workspaceStateID
    ? buildPrintWorkspaceDraftStorageKey(
        PROCESSING_CONTRACT_TEMPLATE_KEY,
        workspaceStateID
      )
    : DRAFT_STORAGE_KEY
  const workspaceURL = useMemo(() => {
    if (!workspaceStateID || typeof window === 'undefined') {
      return ''
    }

    return new URL(
      buildPrintWorkspacePath(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource,
        draftMode: resetDraftOnOpen
          ? PRINT_WORKSPACE_DRAFT_MODE.FRESH
          : PRINT_WORKSPACE_DRAFT_MODE.RESTORE,
        stateID: workspaceStateID,
      }),
      window.location.origin
    ).toString()
  }, [entrySource, resetDraftOnOpen, workspaceStateID])
  const [contract, setContract] = useState(() =>
    loadDraft({
      forceFresh: resetDraftOnOpen,
      storageKey: draftStorageKey,
    })
  )
  const [rowSelectionMode, setRowSelectionMode] = useState(false)
  const [selectedLineIndex, setSelectedLineIndex] = useState(null)
  const [cellSelectionMode, setCellSelectionMode] = useState(false)
  const [mergeSelectionAnchor, setMergeSelectionAnchor] = useState(null)
  const [mergeSelectionFocus, setMergeSelectionFocus] = useState(null)
  const [activeCell, setActiveCell] = useState(null)
  const [showFormula, setShowFormula] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [toolbarStatus, setToolbarStatus] = useState(() =>
    resolveRestoredToolbarStatus(resetDraftOnOpen, sourceTag)
  )

  useEffect(() => {
    document.title = '加工合同打印窗口'
  }, [])

  useEffect(() => {
    setContract(
      loadDraft({
        forceFresh: resetDraftOnOpen,
        storageKey: draftStorageKey,
      })
    )
    setRowSelectionMode(false)
    setSelectedLineIndex(null)
    setCellSelectionMode(false)
    setMergeSelectionAnchor(null)
    setMergeSelectionFocus(null)
    setActiveCell(null)
    setShowFormula(false)
    setBusyAction('')
    setToolbarStatus(resolveRestoredToolbarStatus(resetDraftOnOpen, sourceTag))
  }, [draftStorageKey, resetDraftOnOpen, sourceTag, templateKey])

  useEffect(() => {
    window.localStorage.setItem(draftStorageKey, JSON.stringify(contract))
  }, [contract, draftStorageKey])

  useEffect(() => {
    if (!paperRef.current) {
      return undefined
    }

    return watchPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-processing-contract-paper--continued',
    })
  }, [])

  usePrintWorkspaceWindowSnapshot({
    stateID: workspaceStateID,
    templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
    workspaceURL,
    observeNodeRef: paperRef,
    suspended: busyAction !== '',
  })

  useEffect(() => {
    if (busyAction || !paperRef.current) {
      return undefined
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled || !paperRef.current) {
        return
      }

      syncPrintPageMarginForPaper(paperRef.current, {
        stageWrapElement: stageWrapRef.current,
        paperContinuedClass: 'erp-processing-contract-paper--continued',
      })
      warmupPdfPreviewFromElement(paperRef.current, {
        title: '加工合同 PDF 预览',
        fileName: 'processing-contract-preview.pdf',
        templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
      }).catch(() => {})
    }, PDF_PREVIEW_WARMUP_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [busyAction, contract])

  if (templateKey !== PROCESSING_CONTRACT_TEMPLATE_KEY) {
    return <Navigate to="/erp/print-center" replace />
  }

  const mergeSelection = normalizeCellSelection(
    mergeSelectionAnchor,
    mergeSelectionFocus
  )
  const activeMerge =
    activeCell != null
      ? findMergeAtCell(
          contract.merges,
          activeCell.rowIndex,
          activeCell.colIndex
        )
      : null
  const canApplyMerge =
    Boolean(cellSelectionMode && mergeSelection) &&
    (mergeSelection.rowStart !== mergeSelection.rowEnd ||
      mergeSelection.colStart !== mergeSelection.colEnd)
  const canSplitMerge = Boolean(cellSelectionMode && activeMerge)

  const resetCellSelection = () => {
    setMergeSelectionAnchor(null)
    setMergeSelectionFocus(null)
    setActiveCell(null)
  }

  const setField = (field, value) => {
    setContract((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const setLineField = (index, field, value, options = {}) => {
    setContract((current) => {
      const nextLines = updateProcessingContractLineCell(
        current.lines,
        index,
        field,
        value,
        options
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
      if (nextValue) {
        setCellSelectionMode(false)
        resetCellSelection()
        setToolbarStatus('已进入明细行选择模式，请点击中间明细表中的目标行。')
      } else {
        setSelectedLineIndex(null)
        setToolbarStatus('已退出明细行选择模式。')
      }
      return nextValue
    })
  }

  const handleToggleCellSelectionMode = () => {
    setCellSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setRowSelectionMode(false)
        setSelectedLineIndex(null)
        resetCellSelection()
        setToolbarStatus(
          '已进入单元格选区模式，请在右侧加工明细表里依次点选起点和终点。'
        )
      } else {
        resetCellSelection()
        setToolbarStatus('已退出单元格选区模式。')
      }
      return nextValue
    })
  }

  const handleSelectCell = (rowIndex, colIndex) => {
    const nextCell = { rowIndex, colIndex }
    setActiveCell(nextCell)
    const currentSelection = normalizeCellSelection(
      mergeSelectionAnchor,
      mergeSelectionFocus
    )
    const hasExpandedSelection =
      currentSelection &&
      (currentSelection.rowStart !== currentSelection.rowEnd ||
        currentSelection.colStart !== currentSelection.colEnd)

    if (!mergeSelectionAnchor || hasExpandedSelection) {
      setMergeSelectionAnchor(nextCell)
      setMergeSelectionFocus(nextCell)
      setToolbarStatus(
        `已选中第 ${rowIndex + 1} 行第 ${colIndex + 1} 列，请继续点终点或直接拆分当前合并块。`
      )
      return
    }

    setMergeSelectionFocus(nextCell)
    const nextSelection = normalizeCellSelection(mergeSelectionAnchor, nextCell)
    const rowCount = nextSelection.rowEnd - nextSelection.rowStart + 1
    const colCount = nextSelection.colEnd - nextSelection.colStart + 1
    setToolbarStatus(
      `已选中 ${rowCount} × ${colCount} 的矩形区域，可继续合并。`
    )
  }

  const handleInsertLine = (position) => {
    const result = insertProcessingContractLine({
      lines: contract.lines,
      merges: contract.merges,
      selectedLineIndex,
      contractNo: contract.contractNo,
      position,
    })
    if (!result.ok) {
      setToolbarStatus(result.message)
      message.warning(result.message)
      return
    }

    setContract((current) => ({
      ...current,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedLineIndex(result.selectedLineIndex)
    setToolbarStatus(result.message)
  }

  const handleRemoveLine = () => {
    const result = deleteProcessingContractLine({
      lines: contract.lines,
      merges: contract.merges,
      selectedLineIndex,
      contractNo: contract.contractNo,
    })
    if (!result.ok) {
      setToolbarStatus(result.message)
      message.warning(result.message)
      return
    }

    setContract((current) => ({
      ...current,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedLineIndex(result.selectedLineIndex)
    setToolbarStatus(result.message)
  }

  const withPdfAction = async (actionKey, runner) => {
    if (!paperRef.current || busyAction) {
      return
    }

    syncPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-processing-contract-paper--continued',
    })
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
      await openPdfPreviewFromElement(paperRef.current, {
        title: '加工合同 PDF 预览',
        fileName: formatExportFileName(),
        templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
      })
    })

  const handleDownloadPdf = () =>
    withPdfAction('download', async () => {
      await downloadPdfFromElement(paperRef.current, {
        title: '加工合同 PDF 预览',
        fileName: formatExportFileName(),
        templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
      })
    })

  const handlePrint = () => {
    syncPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-processing-contract-paper--continued',
    })
    window.print()
  }

  const handleApplyMerge = () => {
    const result = applyProcessingDetailCellMerge({
      lines: contract.lines,
      merges: contract.merges,
      selection: mergeSelection,
    })
    if (!result.ok) {
      setToolbarStatus(result.message)
      message.warning(result.message)
      return
    }

    setContract((current) => ({
      ...current,
      lines: result.lines,
      merges: result.merges,
    }))
    const mergedAnchor = mergeSelection
      ? {
          rowIndex: mergeSelection.rowStart,
          colIndex: mergeSelection.colStart,
        }
      : null
    setActiveCell(mergedAnchor)
    setMergeSelectionAnchor(mergedAnchor)
    setMergeSelectionFocus(mergedAnchor)
    setToolbarStatus(result.message)
  }

  const handleSplitMerge = () => {
    const result = splitProcessingDetailCellMerge({
      merges: contract.merges,
      rowIndex: activeCell?.rowIndex,
      colIndex: activeCell?.colIndex,
    })
    if (!result.ok) {
      setToolbarStatus(result.message)
      message.warning(result.message)
      return
    }

    setContract((current) => ({
      ...current,
      merges: result.merges,
    }))
    setToolbarStatus(result.message)
  }

  const handleAttachmentUploadClick = (slotKey) => {
    attachmentInputRefs.current[slotKey]?.click()
  }

  const handleAttachmentFileChange = async (slot, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setToolbarStatus(`正在处理${slot.title}...`)
    try {
      const snapshot = await createAttachmentSnapshot(file)
      setContract((current) => ({
        ...current,
        attachments: {
          ...current.attachments,
          [slot.key]: snapshot,
        },
      }))
      setToolbarStatus(`已同步${slot.title}到右侧附件位。`)
      message.success(`已同步${slot.title}：${file.name}`)
    } catch (error) {
      setToolbarStatus(`上传${slot.title}失败。`)
      message.error(getActionErrorMessage(error, `处理${slot.title}`))
    }
  }

  const handleAttachmentClear = (slot) => {
    setContract((current) => ({
      ...current,
      attachments: {
        ...current.attachments,
        [slot.key]: createEmptyProcessingAttachment(),
      },
    }))
    setToolbarStatus(`已清空${slot.title}。`)
    message.success(`已清空${slot.title}`)
  }

  const resetDraft = () => {
    setContract(createProcessingContractDraft())
    setSelectedLineIndex(null)
    setRowSelectionMode(false)
    setCellSelectionMode(false)
    resetCellSelection()
    setShowFormula(false)
    setToolbarStatus('已恢复默认加工合同样例。')
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
        纸样 / 图样附件通过左侧按钮独立上传，会同步进入右侧页底附件位，并随 PDF
        / 打印一起输出。
      </div>
      <div className="erp-processing-contract-upload-bar__actions">
        {processingContractAttachmentSlots.map((slot) => {
          const attachmentSnapshot = contract.attachments?.[slot.key]
          const hasAttachment = Boolean(attachmentSnapshot?.dataURL)
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
                  active: hasAttachment,
                })}
                onClick={() => handleAttachmentUploadClick(slot.key)}
                title={
                  hasAttachment
                    ? `${slot.title}：${attachmentSnapshot.name}`
                    : `上传${slot.title}`
                }
              >
                上传{slot.title}
              </button>
              {hasAttachment ? (
                <button
                  type="button"
                  className={getToolbarButtonClassName()}
                  onClick={() => handleAttachmentClear(slot)}
                >
                  清空
                </button>
              ) : null}
              <span
                className="erp-processing-contract-upload-bar__status"
                title={attachmentSnapshot?.name || slot.title}
              >
                {hasAttachment
                  ? `已同步：${attachmentSnapshot.name}`
                  : '未上传'}
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
                <input
                  className="erp-print-shell__detail-editor"
                  type="text"
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(event) =>
                    setLineField(index, 'amount', event.target.value, {
                      amountInputPhase: 'input',
                    })
                  }
                  onBlur={(event) =>
                    setLineField(index, 'amount', event.target.value, {
                      amountInputPhase: 'commit',
                    })
                  }
                />
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
      sourceTag={sourceTag}
      statusText={
        busyAction === 'preview'
          ? '正在生成在线 PDF...'
          : busyAction === 'download'
            ? '正在下载 PDF...'
            : toolbarStatus
      }
      panelTip="提示：左侧字段与右侧加工合同固定版式双向同步，右侧表格和条款区可直接编辑，打印时仅输出右侧模板。"
      prepareSignature={`${draftStorageKey}:${resetDraftOnOpen ? 'fresh' : 'restore'}`}
      detailEditor={detailEditor}
      fieldRows={fieldRows}
      formulaPanel={
        showFormula ? (
          <>
            <strong>加工合同计算规则</strong>
            <span>1. 默认金额 = 委托加工数量 × 单价。</span>
            <span>
              2. 合计数量 = 所有明细数量求和；合计金额 = 所有明细金额求和。
            </span>
            <span>
              3.
              如合同快照已有确认金额，可直接改写委托加工金额；未手工改写时会继续按数量
              × 单价带值。
            </span>
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
              className={getToolbarButtonClassName({
                active: cellSelectionMode,
              })}
              onClick={handleToggleCellSelectionMode}
            >
              {cellSelectionMode ? '取消选区' : '选择单元格'}
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleApplyMerge}
              disabled={!canApplyMerge}
            >
              合并选区
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleSplitMerge}
              disabled={!canSplitMerge}
            >
              拆分当前
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName({ active: showFormula })}
              onClick={() => setShowFormula((current) => !current)}
            >
              计算规则
            </button>
            <span className="erp-print-shell__counter">
              加工明细行: {contract.lines.length}/{PROCESSING_CONTRACT_MAX_ROWS}
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
      <div className="erp-print-shell__stage-wrap" ref={stageWrapRef}>
        <ProcessingContractPaper
          paperRef={paperRef}
          contract={contract}
          attachments={contract.attachments}
          selectedLineIndex={selectedLineIndex}
          lineSelectionMode={rowSelectionMode}
          cellSelectionMode={cellSelectionMode}
          mergeSelection={mergeSelection}
          activeCell={activeCell}
          onSelectLine={setSelectedLineIndex}
          onSelectCell={handleSelectCell}
          onFieldChange={setField}
          onLineFieldChange={setLineField}
          onClauseChange={setClause}
        />
      </div>
    </PrintWorkspaceShell>
  )
}
