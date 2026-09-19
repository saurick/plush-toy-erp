import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  computeMaterialPurchaseTotals,
  buildMaterialPurchaseContractBusinessDraft,
  updateMaterialPurchaseField,
  updateMaterialPurchaseLineCell,
  updateMaterialPurchaseClause,
} from '../../utils/materialPurchaseContractEditor.mjs'
import {
  buildMaterialPurchaseContractBatchDraft,
  formatMaterialPurchaseContractBatchProblems,
  getMaterialPurchaseContractBatchProblems,
  getMaterialPurchaseContractOutputBatches,
  MATERIAL_PURCHASE_CONTRACT_BATCH_MAX,
} from '../../utils/materialPurchaseContractBatch.mjs'
import {
  getPrintOutputProblem,
  getPrintDraftProblems,
  inspectPrintImageBudget,
} from '../../utils/printOutputPreflight.mjs'
import {
  downloadPdfFromElement,
  openPdfPreviewFromElement,
} from '../../utils/printPdf.mjs'
import {
  DEFAULT_CONTINUED_STAGE_WRAP_CLASS,
  applyPrintPageMargin,
  detectPrintContinuationFromHeight,
  resolvePaperRenderedHeight,
} from '../../utils/printPageMargin.mjs'
import { MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY } from '../../utils/printWorkspace.js'
import { preparePrintWorkspaceSnapshot } from '../../utils/printWorkspaceOutput.mjs'
import {
  useFlushPrintWorkspaceDraftOnPageExit,
  usePersistentPrintWorkspaceDraft,
} from '../../utils/usePersistentPrintWorkspaceDraft.js'
import usePrintWorkspaceFeedback from '../../utils/usePrintWorkspaceFeedback.js'
import usePrintWorkspaceWindowState from '../../utils/usePrintWorkspaceWindowState.js'
import MaterialPurchaseContractPaper from './MaterialPurchaseContractPaper.jsx'
import PrintWorkspaceShell from './PrintWorkspaceShell.jsx'
import { PrintToolButton } from './PrintWorkspaceTools.jsx'

const noop = () => {}

function normalizeBatchDraft(batchDraft, template) {
  return buildMaterialPurchaseContractBatchDraft(
    (Array.isArray(batchDraft?.contracts) ? batchDraft.contracts : []).map(
      (contract) => ({
        ...contract,
        draft: buildMaterialPurchaseContractBusinessDraft(
          contract?.draft,
          template?.sample
        ),
      })
    ),
    batchDraft
  )
}

export default function MaterialPurchaseContractBatchWorkbench({
  template,
  initialBatchDraft,
  draftStorageKey = '',
  workspaceStateID = '',
  workspaceURL = '',
  customerKey = '',
}) {
  const normalizedInitialDraft = useMemo(
    () => normalizeBatchDraft(initialBatchDraft, template),
    [initialBatchDraft, template]
  )
  const [
    batchDraft,
    setBatchDraft,
    flushDraft,
    batchDraftRef,
    persistenceStatus,
  ] = usePersistentPrintWorkspaceDraft(
    () => normalizedInitialDraft,
    draftStorageKey
  )
  const { feedback, reportFeedback, clearFeedback } =
    usePrintWorkspaceFeedback()
  const [pdfAction, setPdfAction] = useState('')
  const batchRootRef = useRef(null)
  const stageWrapRef = useRef(null)
  const outputBusy = useRef(false)
  const [revealKey, setRevealKey] = useState('')
  const batches = useMemo(
    () => getMaterialPurchaseContractOutputBatches(batchDraft),
    [batchDraft]
  )
  const batchIndex = Math.min(
    batchDraft.batchIndex,
    Math.max(0, batches.length - 1)
  )
  const currentContracts = batches[batchIndex] || []
  const selectedCount = batches.reduce(
    (count, batch) => count + batch.length,
    0
  )
  const missingFields = useMemo(
    () =>
      new Map(
        batchDraft.contracts.map((contract) => [
          contract,
          getPrintDraftProblems(template, contract.draft),
        ])
      ),
    [batchDraft, template]
  )
  const contractKey = (contract) =>
    String(contract.purchaseOrderID || contract.orderNo)

  const updateContract = (key, update) => {
    if (outputBusy.current) return
    setBatchDraft((current) => ({
      ...current,
      contracts: current.contracts.map((contract) =>
        contractKey(contract) === key
          ? { ...contract, draft: update(contract.draft) }
          : contract
      ),
    }))
  }

  const revealContract = (contract) => {
    const nextBatch = batches.findIndex((batch) => batch.includes(contract))
    if (nextBatch < 0 || outputBusy.current) return
    setBatchDraft((current) => ({ ...current, batchIndex: nextBatch }))
    setRevealKey(contractKey(contract))
  }

  useEffect(() => {
    if (!revealKey) return
    const document = Array.from(batchRootRef.current?.children || []).find(
      (element) => element.dataset.contractKey === revealKey
    )
    if (!document) return
    document.scrollIntoView({ block: 'start', behavior: 'instant' })
    document
      .querySelector('[contenteditable="true"][data-print-empty="true"]')
      ?.focus({ preventScroll: true })
    setRevealKey('')
  }, [batchIndex, batchDraft, revealKey])

  useEffect(() => {
    setBatchDraft(normalizedInitialDraft)
    setPdfAction('')
    clearFeedback()
  }, [clearFeedback, normalizedInitialDraft, setBatchDraft])

  useFlushPrintWorkspaceDraftOnPageExit(flushDraft)
  usePrintWorkspaceWindowState({
    stateID: workspaceStateID,
    templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    workspaceURL,
  })

  const syncBatchPrintPageMargin = useCallback(() => {
    const root = batchRootRef.current
    const papers = Array.from(
      root?.querySelectorAll?.('.erp-material-contract-paper') || []
    )
    const hasContinuation = papers.some((paper) =>
      detectPrintContinuationFromHeight(resolvePaperRenderedHeight(paper))
    )
    if (root?.ownerDocument) {
      applyPrintPageMargin(root.ownerDocument, hasContinuation)
    }
    papers.forEach((paper) => {
      paper.classList.toggle(
        'erp-material-contract-paper--continued',
        hasContinuation &&
          detectPrintContinuationFromHeight(resolvePaperRenderedHeight(paper))
      )
    })
    stageWrapRef.current?.classList?.toggle(
      DEFAULT_CONTINUED_STAGE_WRAP_CLASS,
      hasContinuation
    )
    return hasContinuation
  }, [])

  useEffect(() => {
    const root = batchRootRef.current
    const ownerWindow = root?.ownerDocument?.defaultView
    const stageWrap = stageWrapRef.current
    if (!root || !ownerWindow) {
      return undefined
    }

    syncBatchPrintPageMargin()
    const observer = new ownerWindow.ResizeObserver(syncBatchPrintPageMargin)
    root
      .querySelectorAll('.erp-material-contract-paper')
      .forEach((paper) => observer.observe(paper))
    ownerWindow.addEventListener('resize', syncBatchPrintPageMargin)
    return () => {
      observer.disconnect()
      ownerWindow.removeEventListener('resize', syncBatchPrintPageMargin)
      applyPrintPageMargin(root.ownerDocument, false)
      stageWrap?.classList?.remove(DEFAULT_CONTINUED_STAGE_WRAP_CLASS)
    }
  }, [batchIndex, currentContracts.length, syncBatchPrintPageMargin])

  const checkOutput = useCallback(() => {
    const root = batchRootRef.current
    const stored = batchDraftRef.current
    const outputBatches = getMaterialPurchaseContractOutputBatches(stored)
    const currentBatch = {
      ...stored,
      contracts:
        outputBatches[
          Math.min(stored.batchIndex, Math.max(0, outputBatches.length - 1))
        ] || [],
    }
    const problems = getMaterialPurchaseContractBatchProblems(
      template,
      currentBatch
    )
    if (problems.length > 0) {
      reportFeedback(
        'output',
        formatMaterialPurchaseContractBatchProblems(problems),
        'error'
      )
      return false
    }
    const papers = Array.from(
      root?.querySelectorAll?.('.erp-material-contract-paper') || []
    )
    if (papers.length !== currentBatch.contracts.length) {
      reportFeedback(
        'output',
        '批量合同纸面尚未准备完成，请稍后重试。',
        'error'
      )
      return false
    }
    for (let index = 0; index < papers.length; index += 1) {
      const contract = currentBatch.contracts[index]
      const problem = getPrintOutputProblem(
        template,
        contract.draft,
        papers[index]
      )
      if (problem) {
        reportFeedback(
          'output',
          `${contract.orderNo || `第 ${index + 1} 份采购合同`}：${problem}`,
          'error'
        )
        return false
      }
    }
    const imageProblem = inspectPrintImageBudget(root).problem
    if (imageProblem) {
      reportFeedback('output', imageProblem, 'error')
      return false
    }
    return true
  }, [batchDraftRef, reportFeedback, template])

  const buildPdfFileName = useCallback(
    () => `采购合同-第${batchIndex + 1}批-${currentContracts.length}份.pdf`,
    [batchIndex, currentContracts.length]
  )

  const handlePreviewPDF = async () => {
    if (outputBusy.current) return
    clearFeedback()
    if (!batchRootRef.current) return
    outputBusy.current = true
    setPdfAction('preview')
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      syncBatchPrintPageMargin()
      await openPdfPreviewFromElement(batchRootRef.current, {
        title: '采购合同批量 PDF 预览',
        fileName: buildPdfFileName(),
        templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        customerKey,
      })
      reportFeedback('output', '已生成批量采购合同 PDF 预览。')
    } catch (error) {
      reportFeedback(
        'output',
        getActionErrorMessage(error, '生成批量 PDF 预览'),
        'error'
      )
    } finally {
      outputBusy.current = false
      setPdfAction('')
    }
  }

  const handleDownloadPDF = async () => {
    if (outputBusy.current) return
    clearFeedback()
    if (!batchRootRef.current) return
    outputBusy.current = true
    setPdfAction('download')
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      syncBatchPrintPageMargin()
      await downloadPdfFromElement(batchRootRef.current, {
        title: '采购合同批量 PDF 预览',
        fileName: buildPdfFileName(),
        templateKey: MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
        customerKey,
      })
      reportFeedback('output', '已开始下载批量采购合同 PDF。')
    } catch (error) {
      reportFeedback(
        'output',
        getActionErrorMessage(error, '下载批量 PDF'),
        'error'
      )
    } finally {
      outputBusy.current = false
      setPdfAction('')
    }
  }

  const handlePrint = async () => {
    if (outputBusy.current) return
    outputBusy.current = true
    setPdfAction('print')
    clearFeedback()
    try {
      await preparePrintWorkspaceSnapshot({
        windowLike: window,
        beforeSnapshot: flushDraft,
      })
      if (!checkOutput()) return
      syncBatchPrintPageMargin()
      window.print()
    } catch (error) {
      reportFeedback(
        'output',
        getActionErrorMessage(error, '批量打印采购合同'),
        'error'
      )
    } finally {
      outputBusy.current = false
      setPdfAction('')
    }
  }

  const getToolbarButtonClassName = ({ primary = false } = {}) =>
    `erp-print-shell__button ${
      primary
        ? 'erp-print-shell__button--primary'
        : 'erp-print-shell__button--ghost'
    }`

  return (
    <PrintWorkspaceShell
      title={`采购合同批量打印（${batchDraft.contracts.length} 份）`}
      sourceTag="逐份核对 · 批量输出"
      feedback={feedback}
      onClearFeedback={clearFeedback}
      tools={[]}
      draftTitle="本次采购合同"
      draftDefaultOpen
      persistenceStatus={persistenceStatus}
      onRetrySave={flushDraft}
      workspaceClassName="erp-material-contract-batch-workbench"
      prepareSignature={`${draftStorageKey}:batch:${batchIndex}`}
      draftActions={
        <div className="erp-material-contract-batch-summary">
          {batchDraft.sourceLabel ? (
            <p>来源汇总：{batchDraft.sourceLabel}</p>
          ) : null}
          <p role="status">
            共 {batchDraft.contracts.length} 份，已选 {selectedCount} 份
          </p>
          <p>
            已带入{' '}
            {batchDraft.contracts.reduce(
              (count, contract) => count + contract.sourceOrders.length,
              0
            )}{' '}
            张采购单
          </p>
          <p>可直接在右侧补齐内容；修改仅保存在本窗口。</p>
          <label className="erp-material-contract-batch-select-all">
            <input
              type="checkbox"
              checked={selectedCount === batchDraft.contracts.length}
              disabled={pdfAction !== ''}
              onChange={(event) => {
                const included = event.target.checked
                setBatchDraft((current) => ({
                  ...current,
                  batchIndex: 0,
                  contracts: current.contracts.map((contract) => ({
                    ...contract,
                    included,
                  })),
                }))
              }}
            />
            全选本次合同
          </label>
          <ul aria-label="本次采购合同清单">
            {batchDraft.contracts.map((contract) => {
              const fields = missingFields.get(contract) || []
              const included = contract.included !== false
              return (
                <li key={contractKey(contract)} data-included={included}>
                  <input
                    type="checkbox"
                    aria-label={`选择合同 ${contract.orderNo}`}
                    checked={included}
                    disabled={pdfAction !== ''}
                    onChange={(event) => {
                      const { checked } = event.target
                      setBatchDraft((current) => ({
                        ...current,
                        contracts: current.contracts.map((item) =>
                          contractKey(item) === contractKey(contract)
                            ? { ...item, included: checked }
                            : item
                        ),
                      }))
                    }}
                  />
                  <button
                    type="button"
                    className="erp-material-contract-batch-link"
                    disabled={!included || pdfAction !== ''}
                    onClick={() => revealContract(contract)}
                    aria-label={`核对合同 ${contract.orderNo}`}
                  >
                    <strong>
                      {contract.draft.supplierName || '供应方待填写'}
                    </strong>
                    <span>{contract.sourceOrders.length} 张采购单</span>
                    <small>
                      {contract.sourceOrders
                        .map((order) => order.orderNo)
                        .join('、')}
                    </small>
                    {contract.splitReasons.length > 0 ? (
                      <small>
                        {contract.splitReasons.join('、')}不同，已分开
                      </small>
                    ) : null}
                    <small
                      data-incomplete={fields.length > 0}
                      title={fields.join('、')}
                    >
                      {!included
                        ? '本次不打印'
                        : fields.length
                          ? `待补：${fields.slice(0, 3).join('、')}${fields.length > 3 ? `等 ${fields.length} 项` : ''}`
                          : '资料齐全'}
                    </small>
                  </button>
                </li>
              )
            })}
          </ul>
          {batches.length > 1 ? (
            <label className="erp-material-contract-batch-pages">
              输出批次
              <select
                aria-label="输出批次"
                value={batchIndex}
                disabled={pdfAction !== ''}
                onChange={(event) => {
                  const index = Number(event.target.value)
                  setBatchDraft((current) => ({
                    ...current,
                    batchIndex: index,
                  }))
                }}
              >
                {batches.map((batch, index) => (
                  <option key={index} value={index}>
                    第 {index + 1} 批 / 共 {batches.length} 批（第{' '}
                    {index * MATERIAL_PURCHASE_CONTRACT_BATCH_MAX + 1}–
                    {index * MATERIAL_PURCHASE_CONTRACT_BATCH_MAX +
                      batch.length}{' '}
                    份）
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      }
      toolbarActions={
        <div className="erp-print-shell__toolbar-group">
          <span className="erp-material-contract-batch-output-count">
            {batches.length > 1
              ? `第 ${batchIndex + 1}/${batches.length} 批 · `
              : ''}
            本次输出 {currentContracts.length} 份
          </span>
          <PrintToolButton
            icon="preview"
            type="button"
            className={getToolbarButtonClassName()}
            onClick={handlePreviewPDF}
            disabled={pdfAction !== '' || currentContracts.length === 0}
          >
            {pdfAction === 'preview' ? '生成中…' : '在线预览 PDF'}
          </PrintToolButton>
          <PrintToolButton
            icon="download"
            type="button"
            className={getToolbarButtonClassName()}
            onClick={handleDownloadPDF}
            disabled={pdfAction !== '' || currentContracts.length === 0}
          >
            {pdfAction === 'download' ? '生成中…' : '下载 PDF'}
          </PrintToolButton>
          <PrintToolButton
            icon="print"
            type="button"
            className={getToolbarButtonClassName({ primary: true })}
            onClick={handlePrint}
            disabled={pdfAction !== '' || currentContracts.length === 0}
          >
            打印
          </PrintToolButton>
        </div>
      }
    >
      <div className="erp-print-shell__stage-wrap" ref={stageWrapRef}>
        {currentContracts.length === 0 ? (
          <p>请选择本次需要打印的合同。</p>
        ) : null}
        <div className="erp-material-contract-batch" ref={batchRootRef}>
          {currentContracts.map((contract) => (
            <section
              className="erp-material-contract-batch__document"
              data-purchase-order-id={
                contract.sourceOrders.length === 1
                  ? contract.purchaseOrderID || undefined
                  : undefined
              }
              data-purchase-order-ids={contract.sourceOrders
                .map((order) => order.id)
                .join(',')}
              data-purchase-order-no={contract.orderNo}
              data-contract-key={contractKey(contract)}
              key={contractKey(contract)}
            >
              <MaterialPurchaseContractPaper
                draft={contract.draft}
                templateModesActive={pdfAction !== ''}
                handleFieldCommit={(field, value) =>
                  updateContract(contractKey(contract), (draft) =>
                    updateMaterialPurchaseField(draft, field, value)
                  )
                }
                handleLineCommit={(row, column, value, options) =>
                  updateContract(contractKey(contract), (draft) => ({
                    ...draft,
                    lines: updateMaterialPurchaseLineCell(
                      draft.lines,
                      row,
                      column,
                      value,
                      options
                    ),
                  }))
                }
                handleClauseCommit={(section, index, value) =>
                  updateContract(contractKey(contract), (draft) => ({
                    ...draft,
                    clauses: updateMaterialPurchaseClause(
                      draft.clauses,
                      section,
                      index,
                      value
                    ),
                  }))
                }
                selectedRowIndex={null}
                rowSelectionMode={false}
                setSelectedRowIndex={noop}
                activeCell={null}
                mergeSelection={null}
                cellSelectionMode={false}
                handleSelectCell={noop}
                totals={computeMaterialPurchaseTotals(contract.draft.lines, {
                  merges: contract.draft.merges,
                })}
              />
            </section>
          ))}
        </div>
      </div>
    </PrintWorkspaceShell>
  )
}
