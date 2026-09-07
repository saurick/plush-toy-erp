import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { PrintToolButton } from '../components/print/PrintWorkspaceTools.jsx'
import usePrintWorkspaceFeedback from '../utils/usePrintWorkspaceFeedback.js'
import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import { getPrintOutputProblem } from '../utils/printOutputPreflight.mjs'
import { getPrintWorkspaceDraftScope } from '../utils/printWorkspaceScope.mjs'
import { modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import PrintAppendixImageManager from '../components/print/PrintAppendixImages.jsx'
import ProcessingContractPaper from '../components/print/ProcessingContractPaper.jsx'
import PrintWorkspaceShell, {
  PrintWorkspaceToolSection,
} from '../components/print/PrintWorkspaceShell.jsx'
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
  readInitialPrintWorkspaceDraftFromWindowName,
  readPrintWorkspaceDraftSnapshot,
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
import { normalizePrintAppendixImages } from '../utils/printAppendixImages.mjs'
import usePrintWorkspaceWindowState from '../utils/usePrintWorkspaceWindowState.js'
import { preparePrintWorkspaceSnapshot } from '../utils/printWorkspaceOutput.mjs'
import {
  useFlushPrintWorkspaceDraftOnPageExit,
  usePersistentPrintWorkspaceDraft,
} from '../utils/usePersistentPrintWorkspaceDraft.js'

function loadDraft({
  forceFresh = false,
  storageKey = '',
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

  const storedDraft = readPrintWorkspaceDraftSnapshot(storageKey)
  if (!storedDraft) {
    return fallbackDraft
  }
  return businessInput
    ? createProcessingContractBusinessDraft(storedDraft)
    : normalizeProcessingContractDraft(storedDraft)
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

export default function ProcessingContractPrintWorkspacePage() {
  const template = getPrintTemplateByKey(PROCESSING_CONTRACT_TEMPLATE_KEY)
  const { templateKey } = useParams()
  const [searchParams] = useSearchParams()
  const { accountKey, customerKey, configRevision } =
    getPrintWorkspaceDraftScope(searchParams)
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
        workspaceStateID,
        { customerKey, accountKey, configRevision }
      )
    : buildPrintWorkspaceDraftStorageKey(PROCESSING_CONTRACT_TEMPLATE_KEY, '', {
        customerKey,
        accountKey,
        configRevision,
      })
  const workspaceURL = useMemo(() => {
    if (!workspaceStateID || typeof window === 'undefined') {
      return ''
    }

    return buildRestorablePrintWorkspaceURL(PROCESSING_CONTRACT_TEMPLATE_KEY, {
      entrySource,
      customerKey,
      configRevision,
      stateID: workspaceStateID,
    })
  }, [configRevision, customerKey, entrySource, workspaceStateID])
  const [
    contract,
    setContract,
    flushContractDraft,
    contractRef,
    persistenceStatus,
  ] = usePersistentPrintWorkspaceDraft(
    () =>
      loadDraft({
        forceFresh: resetDraftOnOpen,
        storageKey: draftStorageKey,
        workspaceStateID,
        businessInput: entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
      }),
    draftStorageKey
  )
  const [rowSelectionMode, setRowSelectionMode] = useState(false)
  const [selectedLineIndex, setSelectedLineIndex] = useState(null)
  const [cellSelectionMode, setCellSelectionMode] = useState(false)
  const [mergeSelectionAnchor, setMergeSelectionAnchor] = useState(null)
  const [mergeSelectionFocus, setMergeSelectionFocus] = useState(null)
  const [activeCell, setActiveCell] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [busyActionStartedAt, setBusyActionStartedAt] = useState(0)
  const pdfPreviewPreloadRef = useRef(null)
  const { feedback, reportFeedback, clearFeedback } =
    usePrintWorkspaceFeedback()

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
    setBusyAction('')
    setBusyActionStartedAt(0)
    clearFeedback()
  }, [
    clearFeedback,
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
    if (!paperRef.current) {
      return undefined
    }

    return watchPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-processing-contract-paper--continued',
    })
  }, [])

  usePrintWorkspaceWindowState({
    stateID: workspaceStateID,
    templateKey: PROCESSING_CONTRACT_TEMPLATE_KEY,
    workspaceURL,
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
      reportFeedback(
        'output',
        busyAction === 'download'
          ? 'PDF 下载等待超时，请重新点击下载 PDF。'
          : 'PDF 预览等待超时，请重新点击在线预览 PDF。',
        'error'
      )
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutID)
    }
  }, [reportFeedback, busyAction, busyActionStartedAt])

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

  const handleAppendixImagesChange = async (images) => {
    const persisted = await setContract((current) => {
      const nextContract = {
        ...current,
        appendixImages: normalizePrintAppendixImages(images),
      }
      return nextContract
    })
    return !draftStorageKey || persisted
  }

  const handleToggleRowSelectionMode = () => {
    clearFeedback()
    setRowSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setCellSelectionMode(false)
        resetCellSelection()
      } else {
        setSelectedLineIndex(null)
      }
      return nextValue
    })
  }

  const handleToggleCellSelectionMode = () => {
    clearFeedback()
    setCellSelectionMode((current) => {
      const nextValue = !current
      if (nextValue) {
        setRowSelectionMode(false)
        setSelectedLineIndex(null)
        resetCellSelection()
      } else {
        resetCellSelection()
      }
      return nextValue
    })
  }

  const handleSelectCell = (rowIndex, colIndex) => {
    clearFeedback()
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
      return
    }

    setMergeSelectionFocus(nextCell)
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
      reportFeedback('rows', result.message, 'error')
      return
    }

    setContract((current) => ({
      ...current,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedLineIndex(result.selectedLineIndex)
    reportFeedback('rows', result.message)
  }

  const handleRemoveLine = () => {
    const result = deleteProcessingContractLine({
      lines: contract.lines,
      merges: contract.merges,
      selectedLineIndex,
      contractNo: contract.contractNo,
    })
    if (!result.ok) {
      reportFeedback('rows', result.message, 'error')
      return
    }

    setContract((current) => ({
      ...current,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedLineIndex(result.selectedLineIndex)
    reportFeedback('rows', result.message)
  }

  const withPdfAction = async (actionKey, runner) => {
    if (!paperRef.current || busyAction) {
      return
    }

    clearFeedback()
    setBusyActionStartedAt(Date.now())
    setBusyAction(actionKey)
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushContractDraft,
      })
      if (!checkOutput()) return
      syncPrintPageMarginForPaper(paperRef.current, {
        stageWrapElement: stageWrapRef.current,
        paperContinuedClass: 'erp-processing-contract-paper--continued',
      })
      await runner()
    } catch (error) {
      reportFeedback(
        'output',
        getActionErrorMessage(error, '生成 PDF'),
        'error'
      )
    } finally {
      setBusyAction('')
      setBusyActionStartedAt(0)
    }
  }

  const warmupPreviewPdf = useCallback(() => {
    if (
      getPrintOutputProblem(template, contractRef.current, paperRef.current)
    ) {
      return
    }
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
  }, [busyAction, contractRef, customerKey, template])

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

  const checkOutput = () => {
    const problem = getPrintOutputProblem(
      template,
      contractRef.current,
      paperRef.current
    )
    if (!problem) return true
    reportFeedback('output', problem, 'error')
    return false
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

  const handlePrint = async () => {
    clearFeedback()
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushContractDraft,
      })
      if (!checkOutput()) return
      syncPrintPageMarginForPaper(paperRef.current, {
        stageWrapElement: stageWrapRef.current,
        paperContinuedClass: 'erp-processing-contract-paper--continued',
      })
      window.print()
    } catch (error) {
      reportFeedback('output', getActionErrorMessage(error, '打印'), 'error')
    }
  }

  const handleApplyMerge = () => {
    const result = applyProcessingDetailCellMerge({
      lines: contract.lines,
      merges: contract.merges,
      selection: mergeSelection,
    })
    if (!result.ok) {
      reportFeedback('cells', result.message, 'error')
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
    reportFeedback('cells', result.message)
  }

  const handleSplitMerge = () => {
    const result = splitProcessingDetailCellMerge({
      merges: contract.merges,
      rowIndex: activeCell?.rowIndex,
      colIndex: activeCell?.colIndex,
    })
    if (!result.ok) {
      reportFeedback('cells', result.message, 'error')
      return
    }

    setContract((current) => ({
      ...current,
      merges: result.merges,
    }))
    reportFeedback('cells', result.message)
  }

  const resetDraft = () => {
    setContract(createProcessingContractDraft())
    setSelectedLineIndex(null)
    setRowSelectionMode(false)
    setCellSelectionMode(false)
    resetCellSelection()
    reportFeedback('draft', '已恢复样例。')
  }

  const handleBlankDraft = () => {
    clearFeedback()
    modal.confirm({
      title: '生成空白加工合同',
      content:
        '将清空当前窗口中的合同内容、明细和末尾图片，保留模板结构与合同条款。此操作不会修改业务记录。',
      okText: '生成空白模板',
      cancelText: '取消',
      onOk: () => {
        setContract((current) => ({
          ...createBlankProcessingContractDraft(current),
          printMode: 'blank',
        }))
        setSelectedLineIndex(null)
        setRowSelectionMode(false)
        setCellSelectionMode(false)
        resetCellSelection()
        setBusyAction('')
        reportFeedback(
          'draft',
          '已生成空白加工合同，模板结构和合同条款已保留。'
        )
      },
    })
  }

  const handleClearSignature = () => {
    setContract((current) => clearProcessingContractSignatureDraft(current))
    reportFeedback('draft', '已清空签字人，保留日期和手签位置。')
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

  return (
    <PrintWorkspaceShell
      title="加工合同"
      sourceTag={contract.printMode === 'blank' ? '空白模板' : sourceTag}
      statusText={
        busyAction === 'preview'
          ? '正在生成在线 PDF...'
          : busyAction === 'download'
            ? '正在下载 PDF...'
            : ''
      }
      feedback={feedback}
      onClearFeedback={clearFeedback}
      tools={template.runtime.tools}
      persistenceStatus={persistenceStatus}
      onRetrySave={flushContractDraft}
      selectionMode={
        cellSelectionMode ? '选择单元格' : rowSelectionMode ? '选择明细行' : ''
      }
      selectionCount={
        cellSelectionMode && mergeSelection
          ? (mergeSelection.rowEnd - mergeSelection.rowStart + 1) *
            (mergeSelection.colEnd - mergeSelection.colStart + 1)
          : selectedLineIndex === null
            ? 0
            : 1
      }
      onReturnToEdit={() => {
        clearFeedback()
        setRowSelectionMode(false)
        setCellSelectionMode(false)
        setSelectedLineIndex(null)
        resetCellSelection()
      }}
      selectionBounds={cellSelectionMode ? mergeSelection : null}
      selectionSummary={
        rowSelectionMode && selectedLineIndex !== null
          ? `第 ${selectedLineIndex + 1} 行`
          : ''
      }
      prepareSignature={`${draftStorageKey}:${resetDraftOnOpen ? 'fresh' : 'restore'}`}
      appendixActions={
        <PrintAppendixImageManager
          images={contract.appendixImages}
          onImagesChange={handleAppendixImagesChange}
          onStatusChange={(text, tone) =>
            reportFeedback('appendix', text, tone)
          }
        />
      }
      appendixCount={contract.appendixImages?.length || 0}
      formulaPanel={
        <>
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
      }
      editorActions={
        <>
          <PrintWorkspaceToolSection
            title="明细行"
            tool="rows"
            feedback={feedback?.area === 'rows' ? feedback : null}
          >
            <div className="erp-print-shell__toolbar-group">
              <PrintToolButton
                icon="select"
                wide
                type="button"
                className={getToolbarButtonClassName({
                  active: rowSelectionMode,
                })}
                onClick={handleToggleRowSelectionMode}
              >
                {rowSelectionMode ? '返回编辑' : '选择明细行'}
              </PrintToolButton>
              <PrintToolButton
                icon="up"
                type="button"
                className={getToolbarButtonClassName()}
                onClick={() => handleInsertLine('before')}
                disabled={selectedLineIndex === null}
              >
                上插一行
              </PrintToolButton>
              <PrintToolButton
                icon="down"
                type="button"
                className={getToolbarButtonClassName()}
                onClick={() => handleInsertLine('after')}
                disabled={selectedLineIndex === null}
              >
                下插一行
              </PrintToolButton>
              <PrintToolButton
                icon="remove"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                onClick={handleRemoveLine}
                disabled={selectedLineIndex === null}
              >
                移除当前行
              </PrintToolButton>
              <span className="erp-print-shell__counter">
                加工明细行: {contract.lines.length}/
                {PROCESSING_CONTRACT_MAX_ROWS}
              </span>
            </div>
          </PrintWorkspaceToolSection>
          <PrintWorkspaceToolSection
            title="单元格"
            tool="cells"
            feedback={feedback?.area === 'cells' ? feedback : null}
          >
            <div className="erp-print-shell__toolbar-group">
              <PrintToolButton
                icon="cells"
                wide
                type="button"
                className={getToolbarButtonClassName({
                  active: cellSelectionMode,
                })}
                onClick={handleToggleCellSelectionMode}
              >
                {cellSelectionMode ? '返回编辑' : '选择单元格'}
              </PrintToolButton>
              <PrintToolButton
                icon="merge"
                type="button"
                className={getToolbarButtonClassName()}
                onClick={handleApplyMerge}
                disabled={!canApplyMerge}
              >
                合并选区
              </PrintToolButton>
              <PrintToolButton
                icon="split"
                type="button"
                className={getToolbarButtonClassName()}
                onClick={handleSplitMerge}
                disabled={!canSplitMerge}
              >
                拆分当前
              </PrintToolButton>
            </div>
          </PrintWorkspaceToolSection>
        </>
      }
      draftActions={
        <div className="erp-print-shell__toolbar-group">
          <PrintToolButton
            icon="reset"
            wide
            type="button"
            className={getToolbarButtonClassName()}
            onClick={resetDraft}
          >
            恢复样例
          </PrintToolButton>
          <PrintToolButton
            icon="signature"
            wide
            type="button"
            className={getToolbarButtonClassName()}
            onClick={handleClearSignature}
          >
            手签留白
          </PrintToolButton>
          <PrintToolButton
            icon="blank"
            wide
            type="button"
            className={getToolbarButtonClassName()}
            onClick={handleBlankDraft}
          >
            空白模板
          </PrintToolButton>
        </div>
      }
      toolbarActions={
        <div className="erp-print-shell__toolbar-group">
          <PrintToolButton
            icon="preview"
            type="button"
            className={getToolbarButtonClassName()}
            onClick={handlePreviewPdf}
            onFocus={warmupPreviewPdf}
            onMouseEnter={warmupPreviewPdf}
            disabled={busyAction !== ''}
          >
            {busyAction === 'preview' ? '生成中…' : '在线预览 PDF'}
          </PrintToolButton>
          <PrintToolButton
            icon="download"
            type="button"
            className={getToolbarButtonClassName()}
            onClick={handleDownloadPdf}
            disabled={busyAction !== ''}
          >
            {busyAction === 'download' ? '生成中…' : '下载 PDF'}
          </PrintToolButton>
          <PrintToolButton
            icon="print"
            type="button"
            className={getToolbarButtonClassName({ primary: true })}
            onClick={handlePrint}
          >
            打印
          </PrintToolButton>
        </div>
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
          onSelectLine={(index) => {
            clearFeedback()
            setSelectedLineIndex(index)
          }}
          onSelectCell={handleSelectCell}
          onFieldChange={setField}
          onLineFieldChange={setLineField}
          onClauseChange={setClause}
        />
      </div>
    </PrintWorkspaceShell>
  )
}
