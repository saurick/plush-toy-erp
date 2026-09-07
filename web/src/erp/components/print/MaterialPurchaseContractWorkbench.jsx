import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PrintToolButton } from './PrintWorkspaceTools.jsx'
import usePrintWorkspaceFeedback from '../../utils/usePrintWorkspaceFeedback.js'
import { getPrintOutputProblem } from '../../utils/printOutputPreflight.mjs'
import { modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  applyDetailCellMerge,
  buildBlankMaterialPurchaseContractDraft,
  clearMaterialPurchaseContractSignatureDraft,
  MATERIAL_PURCHASE_MAX_ROWS,
  buildMaterialPurchaseContractBusinessDraft,
  buildMaterialPurchaseContractDraft,
  computeMaterialPurchaseTotals,
  deleteMaterialPurchaseLine,
  findMergeAtCell,
  insertMaterialPurchaseLine,
  normalizeCellSelection,
  splitDetailCellMerge,
  updateMaterialPurchaseClause,
  updateMaterialPurchaseField,
  updateMaterialPurchaseLineCell,
} from '../../utils/materialPurchaseContractEditor.mjs'
import PrintWorkspaceShell, {
  PrintWorkspaceToolSection,
} from './PrintWorkspaceShell.jsx'
import {
  PDF_ACTION_UI_STALE_TIMEOUT_MS,
  downloadPdfFromElement,
  openPdfPreviewFromElement,
  preloadPdfPreviewFromElement,
  schedulePdfPreviewWarmup,
} from '../../utils/printPdf.mjs'
import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  readInitialPrintWorkspaceDraftFromWindowName,
  readPrintWorkspaceDraftSnapshot,
} from '../../utils/printWorkspace.js'
import {
  syncPrintPageMarginForPaper,
  watchPrintPageMarginForPaper,
} from '../../utils/printPageMargin.mjs'
import usePrintWorkspaceWindowState from '../../utils/usePrintWorkspaceWindowState.js'
import { preparePrintWorkspaceSnapshot } from '../../utils/printWorkspaceOutput.mjs'
import {
  useFlushPrintWorkspaceDraftOnPageExit,
  usePersistentPrintWorkspaceDraft,
} from '../../utils/usePersistentPrintWorkspaceDraft.js'
import { normalizePrintAppendixImages } from '../../utils/printAppendixImages.mjs'
import PrintAppendixImageManager from './PrintAppendixImages.jsx'
import MaterialPurchaseContractPaper from './MaterialPurchaseContractPaper.jsx'

function loadDraft(template, storageKey, options = {}) {
  const {
    forceFresh = false,
    workspaceStateID = '',
    businessInput = false,
  } = options
  const fallbackDraft = buildMaterialPurchaseContractDraft(template?.sample)
  const buildDraft = businessInput
    ? (draft) =>
        buildMaterialPurchaseContractBusinessDraft(draft, template?.sample)
    : (draft) =>
        buildMaterialPurchaseContractDraft({
          ...template?.sample,
          ...draft,
          lines: draft?.lines || template?.sample?.lines,
          clauses: draft?.clauses || template?.sample?.clauses,
          merges: draft?.merges || template?.sample?.merges,
        })
  if (forceFresh || !storageKey || typeof window === 'undefined') {
    return businessInput
      ? buildMaterialPurchaseContractBusinessDraft({}, template?.sample)
      : fallbackDraft
  }
  const initialDraft = readInitialPrintWorkspaceDraftFromWindowName(
    template?.key,
    workspaceStateID
  )
  if (initialDraft) {
    return buildDraft(initialDraft)
  }
  const storedDraft = readPrintWorkspaceDraftSnapshot(storageKey)
  if (!storedDraft) {
    return businessInput
      ? buildMaterialPurchaseContractBusinessDraft({}, template?.sample)
      : fallbackDraft
  }
  return buildDraft(storedDraft)
}

export default function MaterialPurchaseContractWorkbench({
  template,
  draftStorageKey = '',
  resetDraftOnOpen = false,
  workspaceStateID = '',
  workspaceURL = '',
  sourceTag = '使用默认模板',
  businessInput = false,
  customerKey = '',
}) {
  const [draft, setDraft, flushDraft, draftRef, persistenceStatus] =
    usePersistentPrintWorkspaceDraft(
      () =>
        loadDraft(template, draftStorageKey, {
          forceFresh: resetDraftOnOpen,
          workspaceStateID,
          businessInput,
        }),
      draftStorageKey
    )
  const [rowSelectionMode, setRowSelectionMode] = useState(false)
  const [selectedRowIndex, setSelectedRowIndex] = useState(null)
  const [cellSelectionMode, setCellSelectionMode] = useState(false)
  const [mergeSelectionAnchor, setMergeSelectionAnchor] = useState(null)
  const [mergeSelectionFocus, setMergeSelectionFocus] = useState(null)
  const [activeCell, setActiveCell] = useState(null)
  const { feedback, reportFeedback, clearFeedback } =
    usePrintWorkspaceFeedback()
  const [pdfAction, setPdfAction] = useState('')
  const [pdfActionStartedAt, setPdfActionStartedAt] = useState(0)
  const pdfPreviewPreloadRef = useRef(null)
  const paperRef = useRef(null)
  const stageWrapRef = useRef(null)

  useEffect(() => {
    setDraft(
      loadDraft(template, draftStorageKey, {
        forceFresh: resetDraftOnOpen,
        workspaceStateID,
        businessInput,
      })
    )
    setRowSelectionMode(false)
    setSelectedRowIndex(null)
    setCellSelectionMode(false)
    setMergeSelectionAnchor(null)
    setMergeSelectionFocus(null)
    setActiveCell(null)
    setPdfAction('')
    setPdfActionStartedAt(0)
    clearFeedback()
  }, [
    clearFeedback,
    businessInput,
    draftStorageKey,
    resetDraftOnOpen,
    setDraft,
    sourceTag,
    template,
    workspaceStateID,
  ])

  useFlushPrintWorkspaceDraftOnPageExit(flushDraft)

  useEffect(() => {
    if (!paperRef.current) {
      return undefined
    }

    return watchPrintPageMarginForPaper(paperRef.current, {
      stageWrapElement: stageWrapRef.current,
      paperContinuedClass: 'erp-material-contract-paper--continued',
    })
  }, [])

  usePrintWorkspaceWindowState({
    stateID: workspaceStateID,
    templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    workspaceURL,
  })

  useEffect(() => {
    if (!pdfAction || typeof window === 'undefined') {
      return undefined
    }

    const startedAt = Number(pdfActionStartedAt)
    const elapsed =
      Number.isFinite(startedAt) && startedAt > 0
        ? Date.now() - startedAt
        : PDF_ACTION_UI_STALE_TIMEOUT_MS
    const remainingMs = Math.max(0, PDF_ACTION_UI_STALE_TIMEOUT_MS - elapsed)
    const timeoutID = window.setTimeout(() => {
      setPdfAction('')
      setPdfActionStartedAt(0)
      reportFeedback(
        'output',
        pdfAction === 'download'
          ? 'PDF 下载等待超时，请重新点击下载 PDF。'
          : 'PDF 预览等待超时，请重新点击在线预览 PDF。',
        'error'
      )
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutID)
    }
  }, [reportFeedback, pdfAction, pdfActionStartedAt])

  const totals = useMemo(
    () => computeMaterialPurchaseTotals(draft.lines, { merges: draft.merges }),
    [draft.lines, draft.merges]
  )
  const templateModesActive = rowSelectionMode || cellSelectionMode
  const mergeSelection = normalizeCellSelection(
    mergeSelectionAnchor,
    mergeSelectionFocus
  )

  const resetRowSelection = () => {
    setSelectedRowIndex(null)
  }

  const resetCellSelection = () => {
    setMergeSelectionAnchor(null)
    setMergeSelectionFocus(null)
    setActiveCell(null)
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

  const handleAppendixImagesChange = async (images) => {
    const persisted = await setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        appendixImages: normalizePrintAppendixImages(images),
      }
      return nextDraft
    })
    return !draftStorageKey || persisted
  }

  const handleLineCommit = (rowIndex, columnKey, nextValue, options = {}) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      lines: updateMaterialPurchaseLineCell(
        currentDraft.lines,
        rowIndex,
        columnKey,
        nextValue,
        options
      ),
    }))
  }

  const handleToggleRowSelectionMode = () => {
    clearFeedback()
    setRowSelectionMode((currentValue) => {
      const nextValue = !currentValue
      if (nextValue) {
        setCellSelectionMode(false)
        resetCellSelection()
      } else {
        resetRowSelection()
      }
      return nextValue
    })
  }

  const handleToggleCellSelectionMode = () => {
    clearFeedback()
    setCellSelectionMode((currentValue) => {
      const nextValue = !currentValue
      if (nextValue) {
        setRowSelectionMode(false)
        resetRowSelection()
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

  const handleApplyMerge = () => {
    const result = applyDetailCellMerge({
      lines: draft.lines,
      merges: draft.merges,
      selection: mergeSelection,
    })
    if (!result.ok) {
      reportFeedback('cells', result.message, 'error')
      return
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
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
    const result = splitDetailCellMerge({
      merges: draft.merges,
      rowIndex: activeCell?.rowIndex,
      colIndex: activeCell?.colIndex,
    })
    if (!result.ok) {
      reportFeedback('cells', result.message, 'error')
      return
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      merges: result.merges,
    }))
    reportFeedback('cells', result.message)
  }

  const handleInsertRow = (position) => {
    const result = insertMaterialPurchaseLine({
      lines: draft.lines,
      merges: draft.merges,
      selectedRowIndex,
      position,
    })
    if (!result.ok) {
      reportFeedback('rows', result.message, 'error')
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedRowIndex(result.selectedRowIndex)
    reportFeedback('rows', result.message)
  }

  const handleDeleteRow = () => {
    const result = deleteMaterialPurchaseLine({
      lines: draft.lines,
      merges: draft.merges,
      selectedRowIndex,
    })
    if (!result.ok) {
      reportFeedback('rows', result.message, 'error')
      return
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      lines: result.lines,
      merges: result.merges,
    }))
    setSelectedRowIndex(result.selectedRowIndex)
    reportFeedback('rows', result.message)
  }

  const buildPdfFileName = useCallback(
    () =>
      `${draft.contractNo || '采购合同'}-${draft.supplierName || '打印稿'}.pdf`,
    [draft.contractNo, draft.supplierName]
  )

  const syncPrintRuntimeMargin = useCallback(
    () =>
      syncPrintPageMarginForPaper(paperRef.current, {
        stageWrapElement: stageWrapRef.current,
        paperContinuedClass: 'erp-material-contract-paper--continued',
      }),
    []
  )

  const warmupPreviewPDF = useCallback(() => {
    if (!paperRef.current || pdfAction || pdfPreviewPreloadRef.current) {
      return
    }
    if (getPrintOutputProblem(template, draftRef.current, paperRef.current)) {
      return
    }

    syncPrintRuntimeMargin()
    const preloadPromise = preloadPdfPreviewFromElement(paperRef.current, {
      title: '采购合同 PDF 预览',
      fileName: buildPdfFileName(),
      templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
      customerKey,
    })
      .catch(() => null)
      .finally(() => {
        if (pdfPreviewPreloadRef.current === preloadPromise) {
          pdfPreviewPreloadRef.current = null
        }
      })
    pdfPreviewPreloadRef.current = preloadPromise
  }, [
    buildPdfFileName,
    customerKey,
    pdfAction,
    syncPrintRuntimeMargin,
    template,
    draftRef,
  ])

  useEffect(() => {
    pdfPreviewPreloadRef.current = null
  }, [draft])

  useEffect(
    () => schedulePdfPreviewWarmup(warmupPreviewPDF),
    [draft, warmupPreviewPDF]
  )

  useEffect(
    () => () => {
      pdfPreviewPreloadRef.current = null
    },
    []
  )

  const checkOutput = () => {
    const problem = getPrintOutputProblem(
      template,
      draftRef.current,
      paperRef.current
    )
    if (!problem) return true
    reportFeedback('output', problem, 'error')
    return false
  }

  const handlePreviewPDF = async () => {
    clearFeedback()
    if (!paperRef.current) {
      return
    }
    setPdfActionStartedAt(Date.now())
    setPdfAction('preview')
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      syncPrintRuntimeMargin()
      await openPdfPreviewFromElement(paperRef.current, {
        title: '采购合同 PDF 预览',
        fileName: buildPdfFileName(),
        templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        customerKey,
      })
      reportFeedback('output', '已生成在线 PDF 预览。')
    } catch (error) {
      const errorMessage = getActionErrorMessage(error, '生成 PDF 预览')
      reportFeedback('output', errorMessage, 'error')
    } finally {
      setPdfAction('')
      setPdfActionStartedAt(0)
    }
  }

  const handleDownloadPDF = async () => {
    clearFeedback()
    if (!paperRef.current) {
      return
    }
    setPdfActionStartedAt(Date.now())
    setPdfAction('download')
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      syncPrintRuntimeMargin()
      await downloadPdfFromElement(paperRef.current, {
        title: '采购合同 PDF 预览',
        fileName: buildPdfFileName(),
        templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        customerKey,
      })
      reportFeedback('output', '已开始下载 PDF。')
    } catch (error) {
      const errorMessage = getActionErrorMessage(error, '下载 PDF')
      reportFeedback('output', errorMessage, 'error')
    } finally {
      setPdfAction('')
      setPdfActionStartedAt(0)
    }
  }

  const handlePrint = async () => {
    clearFeedback()
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      syncPrintRuntimeMargin()
      window.print()
    } catch (error) {
      reportFeedback('output', getActionErrorMessage(error, '打印'), 'error')
    }
  }

  const handleResetDraft = () => {
    setDraft(buildMaterialPurchaseContractDraft(template?.sample))
    setRowSelectionMode(false)
    resetRowSelection()
    setCellSelectionMode(false)
    resetCellSelection()
    reportFeedback('draft', '已恢复样例。')
  }

  const handleBlankDraft = () => {
    clearFeedback()
    modal.confirm({
      title: '生成空白采购合同',
      content:
        '将清空当前窗口中的字段值、明细和末尾图片，保留模板结构与合同条款。此操作不会修改业务记录。',
      okText: '生成空白模板',
      cancelText: '取消',
      onOk: () => {
        setDraft((currentDraft) =>
          buildBlankMaterialPurchaseContractDraft(currentDraft)
        )
        setRowSelectionMode(false)
        resetRowSelection()
        setCellSelectionMode(false)
        resetCellSelection()
        reportFeedback(
          'draft',
          '已生成空白采购合同，模板结构和合同条款已保留。'
        )
      },
    })
  }

  const handleClearSignature = () => {
    setDraft((currentDraft) =>
      clearMaterialPurchaseContractSignatureDraft(currentDraft)
    )
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

  const activeMerge =
    activeCell != null
      ? findMergeAtCell(draft.merges, activeCell.rowIndex, activeCell.colIndex)
      : null
  const canApplyMerge =
    Boolean(cellSelectionMode && mergeSelection) &&
    (mergeSelection.rowStart !== mergeSelection.rowEnd ||
      mergeSelection.colStart !== mergeSelection.colEnd)
  const canSplitMerge = Boolean(cellSelectionMode && activeMerge)

  return (
    <PrintWorkspaceShell
      title="采购合同"
      sourceTag={draft.printMode === 'blank' ? '空白模板' : sourceTag}
      feedback={feedback}
      onClearFeedback={clearFeedback}
      tools={template.runtime.tools}
      persistenceStatus={persistenceStatus}
      onRetrySave={flushDraft}
      selectionMode={
        cellSelectionMode ? '选择单元格' : rowSelectionMode ? '选择明细行' : ''
      }
      selectionCount={
        cellSelectionMode && mergeSelection
          ? (mergeSelection.rowEnd - mergeSelection.rowStart + 1) *
            (mergeSelection.colEnd - mergeSelection.colStart + 1)
          : selectedRowIndex === null
            ? 0
            : 1
      }
      onReturnToEdit={() => {
        clearFeedback()
        setRowSelectionMode(false)
        setCellSelectionMode(false)
        resetRowSelection()
        resetCellSelection()
      }}
      selectionBounds={cellSelectionMode ? mergeSelection : null}
      selectionSummary={
        rowSelectionMode && selectedRowIndex !== null
          ? `第 ${selectedRowIndex + 1} 行`
          : ''
      }
      prepareSignature={`${draftStorageKey}:${resetDraftOnOpen ? 'fresh' : 'restore'}`}
      appendixActions={
        <PrintAppendixImageManager
          images={draft.appendixImages}
          onImagesChange={handleAppendixImagesChange}
          onStatusChange={(text, tone) =>
            reportFeedback('appendix', text, tone)
          }
        />
      }
      appendixCount={draft.appendixImages?.length || 0}
      formulaPanel={
        <>
          <span>默认金额 = 数量 × 单价</span>
          <span>如合同中已有确认金额，可直接改写采购金额。</span>
          <span>总计 = Σ 当前采购金额列</span>
          <span>单价保留 3 位小数，采购金额保留 2 位小数。</span>
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
                onClick={() => handleInsertRow('before')}
                disabled={selectedRowIndex == null}
              >
                上插一行
              </PrintToolButton>
              <PrintToolButton
                icon="down"
                type="button"
                className={getToolbarButtonClassName()}
                onClick={() => handleInsertRow('after')}
                disabled={selectedRowIndex == null}
              >
                下插一行
              </PrintToolButton>
              <PrintToolButton
                icon="remove"
                wide
                type="button"
                className={getToolbarButtonClassName()}
                onClick={handleDeleteRow}
                disabled={selectedRowIndex == null}
              >
                移除当前行
              </PrintToolButton>
              <span className="erp-print-shell__counter">
                采购明细行: {draft.lines.length}/{MATERIAL_PURCHASE_MAX_ROWS}
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
            onClick={handleResetDraft}
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
            onClick={handlePreviewPDF}
            onFocus={warmupPreviewPDF}
            onMouseEnter={warmupPreviewPDF}
            disabled={pdfAction !== ''}
          >
            {pdfAction === 'preview' ? '生成中…' : '在线预览 PDF'}
          </PrintToolButton>
          <PrintToolButton
            icon="download"
            type="button"
            className={getToolbarButtonClassName()}
            onClick={handleDownloadPDF}
            disabled={pdfAction !== ''}
          >
            {pdfAction === 'download' ? '生成中…' : '下载 PDF'}
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
        <MaterialPurchaseContractPaper
          draft={draft}
          paperRef={paperRef}
          templateModesActive={templateModesActive}
          handleFieldCommit={handleFieldCommit}
          handleLineCommit={handleLineCommit}
          handleClauseCommit={handleClauseCommit}
          selectedRowIndex={selectedRowIndex}
          rowSelectionMode={rowSelectionMode}
          setSelectedRowIndex={(index) => {
            clearFeedback()
            setSelectedRowIndex(index)
          }}
          activeCell={activeCell}
          mergeSelection={mergeSelection}
          cellSelectionMode={cellSelectionMode}
          handleSelectCell={handleSelectCell}
          totals={totals}
        />
      </div>
    </PrintWorkspaceShell>
  )
}
