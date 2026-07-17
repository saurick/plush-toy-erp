import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Navigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import PrintAppendixImageManager from '../components/print/PrintAppendixImages.jsx'
import ProcessingContractPaper from '../components/print/ProcessingContractPaper.jsx'
import PrintWorkspaceShell from '../components/print/PrintWorkspaceShell.jsx'
import {
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  createBlankProcessingContractDraft,
  createProcessingContractBusinessDraft,
  createProcessingContractDraft,
  normalizeProcessingContractDraft,
} from '../data/processingContractTemplate.mjs'
import {
  PDF_ACTION_UI_STALE_TIMEOUT_MS,
  downloadPdfFromElement,
  openPdfPreviewFromElement,
  preloadPdfPreviewFromElement,
  schedulePdfPreviewWarmup,
} from '../utils/printPdf.mjs'
import {
  PROCESSING_CONTRACT_MAX_ROWS,
  applyProcessingDetailCellMerge,
  clearProcessingContractSignatureDraft,
  deleteProcessingContractLine,
  splitProcessingDetailCellMerge,
  insertProcessingContractLine,
  updateProcessingContractLineCell,
} from '../utils/processingContractEditor.mjs'
import {
  buildRestorablePrintWorkspaceURL,
  buildPrintWorkspaceDraftStorageKey,
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  persistPrintWorkspaceDraftSnapshot,
  readInitialPrintWorkspaceDraftFromWindowName,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceStateID,
  resolvePrintWorkspaceDraftMode,
  resolvePrintWorkspaceCustomerKey,
} from '../utils/printWorkspace.js'
import {
  findMergeAtCell,
  normalizeCellSelection,
} from '../utils/detailCellMerge.mjs'
import {
  syncPrintPageMarginForPaper,
  watchPrintPageMarginForPaper,
} from '../utils/printPageMargin.mjs'
import { normalizePrintAppendixImages } from '../utils/printAppendixImages.mjs'
import usePrintWorkspaceWindowSnapshot from '../utils/usePrintWorkspaceWindowSnapshot.js'
import {
  useFlushPrintWorkspaceDraftOnPageExit,
  usePersistentPrintWorkspaceDraft,
} from '../utils/usePersistentPrintWorkspaceDraft.js'

const DRAFT_STORAGE_KEY = '__plush_erp_processing_contract_print_draft__'

function loadDraft({
  forceFresh = false,
  storageKey = DRAFT_STORAGE_KEY,
  workspaceStateID = '',
  businessInput = false,
} = {}) {
  const fallbackDraft = businessInput
    ? createProcessingContractBusinessDraft()
    : createProcessingContractDraft()

  if (typeof window === 'undefined') {
    return fallbackDraft
  }

  if (forceFresh) {
    return fallbackDraft
  }

  const initialDraft = readInitialPrintWorkspaceDraftFromWindowName(
    PROCESSING_CONTRACT_TEMPLATE_KEY,
    workspaceStateID
  )
  if (initialDraft) {
    return businessInput
      ? createProcessingContractBusinessDraft(initialDraft)
      : normalizeProcessingContractDraft(initialDraft)
  }

  try {
    const raw = window.localStorage.getItem(storageKey) || ''
    if (!raw) {
      return fallbackDraft
    }

    const parsed = JSON.parse(raw)
    return businessInput
      ? createProcessingContractBusinessDraft(parsed)
      : normalizeProcessingContractDraft(parsed)
  } catch {
    return fallbackDraft
  }
}

function formatExportFileName() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `加工合同-${stamp}.pdf`
}

function resolveRestoredToolbarStatus(resetDraftOnOpen, sourceTag) {
  if (resetDraftOnOpen) {
    return '已恢复默认加工合同示例。'
  }
  if (sourceTag === '来自业务页面') {
    return '已从业务页面带入加工合同内容，可继续核对并打印。'
  }
  return '打印窗口已准备好，可以开始编辑。'
}

export default function ProcessingContractPrintWorkspacePage() {
  const { templateKey } = useParams()
  const [searchParams] = useSearchParams()
  const outletContext = useOutletContext()
  const profileCustomerKey =
    outletContext?.adminProfile?.effective_session?.customer?.key || ''
  const customerKey = useMemo(
    () => resolvePrintWorkspaceCustomerKey(searchParams, profileCustomerKey),
    [profileCustomerKey, searchParams]
  )
  const paperRef = useRef(null)
  const stageWrapRef = useRef(null)
  const workspaceStateID = resolvePrintWorkspaceStateID(searchParams)
  const entrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const sourceTag =
    entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
      ? '来自业务页面'
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

    return buildRestorablePrintWorkspaceURL(PROCESSING_CONTRACT_TEMPLATE_KEY, {
      entrySource,
      customerKey,
      stateID: workspaceStateID,
    })
  }, [customerKey, entrySource, workspaceStateID])
  const [contract, setContract, flushContractDraft] =
    usePersistentPrintWorkspaceDraft(() =>
      loadDraft({
        forceFresh: resetDraftOnOpen,
        storageKey: draftStorageKey,
        workspaceStateID,
        businessInput: entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
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
  const [busyActionStartedAt, setBusyActionStartedAt] = useState(0)
  const pdfPreviewPreloadRef = useRef(null)
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
        workspaceStateID,
        businessInput: entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
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
    setBusyActionStartedAt(0)
    setToolbarStatus(resolveRestoredToolbarStatus(resetDraftOnOpen, sourceTag))
  }, [
    draftStorageKey,
    entrySource,
    resetDraftOnOpen,
    setContract,
    sourceTag,
    templateKey,
    workspaceStateID,
  ])

  useFlushPrintWorkspaceDraftOnPageExit(flushContractDraft)

  useEffect(() => {
    persistPrintWorkspaceDraftSnapshot(draftStorageKey, contract)
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
    if (!busyAction || typeof window === 'undefined') {
      return undefined
    }

    const startedAt = Number(busyActionStartedAt)
    const elapsed =
      Number.isFinite(startedAt) && startedAt > 0
        ? Date.now() - startedAt
        : PDF_ACTION_UI_STALE_TIMEOUT_MS
    const remainingMs = Math.max(0, PDF_ACTION_UI_STALE_TIMEOUT_MS - elapsed)
    const timeoutID = window.setTimeout(() => {
      setBusyAction('')
      setBusyActionStartedAt(0)
      setToolbarStatus(
        busyAction === 'download'
          ? 'PDF 下载等待超时，请重新点击下载 PDF。'
          : 'PDF 预览等待超时，请重新点击在线预览 PDF。'
      )
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutID)
    }
  }, [busyAction, busyActionStartedAt])

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

  const handleAppendixImagesChange = (images) => {
    let persisted = true
    setContract((current) => {
      const nextContract = {
        ...current,
        appendixImages: normalizePrintAppendixImages(images),
      }
      persisted =
        !draftStorageKey ||
        persistPrintWorkspaceDraftSnapshot(draftStorageKey, nextContract)
      return nextContract
    })
    return persisted
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
    setBusyActionStartedAt(Date.now())
    setBusyAction(actionKey)
    try {
      await runner()
    } catch (error) {
      message.error(getActionErrorMessage(error, '生成 PDF'))
    } finally {
      setBusyAction('')
      setBusyActionStartedAt(0)
    }
  }

  const warmupPreviewPdf = useCallback(() => {
    if (!paperRef.current || busyAction || pdfPreviewPreloadRef.current) {
      return
    }

    syncPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-processing-contract-paper--continued',
    })
    const preloadPromise = preloadPdfPreviewFromElement(paperRef.current, {
      title: '加工合同 PDF 预览',
      fileName: formatExportFileName(),
      templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
      customerKey,
    })
      .catch(() => null)
      .finally(() => {
        if (pdfPreviewPreloadRef.current === preloadPromise) {
          pdfPreviewPreloadRef.current = null
        }
      })
    pdfPreviewPreloadRef.current = preloadPromise
  }, [busyAction, customerKey])

  useEffect(() => {
    pdfPreviewPreloadRef.current = null
  }, [contract])

  useEffect(
    () => schedulePdfPreviewWarmup(warmupPreviewPdf),
    [contract, warmupPreviewPdf]
  )

  useEffect(
    () => () => {
      pdfPreviewPreloadRef.current = null
    },
    []
  )

  if (templateKey !== PROCESSING_CONTRACT_TEMPLATE_KEY) {
    return <Navigate to="/erp/print-center" replace />
  }

  const handlePreviewPdf = () =>
    withPdfAction('preview', async () => {
      await openPdfPreviewFromElement(paperRef.current, {
        title: '加工合同 PDF 预览',
        fileName: formatExportFileName(),
        templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
        customerKey,
      })
    })

  const handleDownloadPdf = () =>
    withPdfAction('download', async () => {
      await downloadPdfFromElement(paperRef.current, {
        title: '加工合同 PDF 预览',
        fileName: formatExportFileName(),
        templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
        customerKey,
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

  const resetDraft = () => {
    setContract(createProcessingContractDraft())
    setSelectedLineIndex(null)
    setRowSelectionMode(false)
    setCellSelectionMode(false)
    resetCellSelection()
    setShowFormula(false)
    setToolbarStatus('已恢复默认加工合同样例。')
  }

  const handleBlankDraft = () => {
    modal.confirm({
      title: '生成空白加工合同',
      content:
        '将清空当前窗口中的合同内容、明细和末尾图片，保留模板结构与合同条款。此操作不会修改业务记录。',
      okText: '生成空白模板',
      cancelText: '取消',
      onOk: () => {
        setContract((current) => createBlankProcessingContractDraft(current))
        setSelectedLineIndex(null)
        setRowSelectionMode(false)
        setCellSelectionMode(false)
        resetCellSelection()
        setShowFormula(false)
        setBusyAction('')
        setToolbarStatus('已生成空白加工合同，模板结构和合同条款已保留。')
      },
    })
  }

  const handleClearSignature = () => {
    setContract((current) => clearProcessingContractSignatureDraft(current))
    setToolbarStatus('已清空签字人，纸面保留日期和甲乙方手签位置。')
    message.success('已清空签字人')
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
      key: 'buyerSigner',
      label: '甲方签名',
      value: contract.buyerSigner,
      onChange: (value) => setField('buyerSigner', value),
    },
    {
      key: 'supplierSigner',
      label: '乙方签名',
      value: contract.supplierSigner,
      onChange: (value) => setField('supplierSigner', value),
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

  const detailEditor = (
    <section className="erp-print-shell__detail-panel">
      <h4>加工明细分行编辑</h4>
      <table className="erp-print-shell__detail-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>加工项目</th>
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
                  value={line.processingItem}
                  onChange={(event) =>
                    setLineField(index, 'processingItem', event.target.value)
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
      panelTip="左侧修改会立即显示在右侧合同中；普通末尾图片自动两张一行，长图自动整行，每张可切换排版，打印时只输出右侧合同。"
      prepareSignature={`${draftStorageKey}:${resetDraftOnOpen ? 'fresh' : 'restore'}`}
      panelActions={
        <PrintAppendixImageManager
          images={contract.appendixImages}
          onImagesChange={handleAppendixImagesChange}
          onStatusChange={setToolbarStatus}
        />
      }
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
              如合同中已有确认金额，可直接改写委托加工金额；未手工改写时会继续按数量
              × 单价自动计算。
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
              移除当前行
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
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleClearSignature}
            >
              手签留白
            </button>
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handleBlankDraft}
            >
              空白模板
            </button>
          </div>

          <div className="erp-print-shell__toolbar-group">
            <button
              type="button"
              className={getToolbarButtonClassName()}
              onClick={handlePreviewPdf}
              onFocus={warmupPreviewPdf}
              onMouseEnter={warmupPreviewPdf}
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
      <div className="erp-print-shell__stage-wrap" ref={stageWrapRef}>
        <ProcessingContractPaper
          paperRef={paperRef}
          contract={contract}
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
