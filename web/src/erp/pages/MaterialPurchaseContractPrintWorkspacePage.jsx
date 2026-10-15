import React, { useEffect, useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { getPrintWorkspaceDraftScope } from '../utils/printWorkspaceScope.mjs'
import MaterialPurchaseContractBatchWorkbench from '../components/print/MaterialPurchaseContractBatchWorkbench.jsx'
import MaterialPurchaseContractWorkbench from '../components/print/MaterialPurchaseContractWorkbench.jsx'
import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import { isMaterialPurchaseContractBatchDraft } from '../utils/materialPurchaseContractBatch.mjs'
import {
  buildPrintWorkspaceDraftStorageKey,
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  readInitialPrintWorkspaceDraftFromWindowName,
  readPrintWorkspaceDraftSnapshot,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceStateID,
  resolvePrintWorkspaceDraftMode,
} from '../utils/printWorkspace.js'

export default function MaterialPurchaseContractPrintWorkspacePage() {
  const [searchParams] = useSearchParams()
  const { accountKey, customerKey, configRevision } =
    getPrintWorkspaceDraftScope(searchParams)
  const template = getPrintTemplateByKey('material-purchase-contract')
  const workspaceStateID = resolvePrintWorkspaceStateID(searchParams)
  const entrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const resetDraftOnOpen =
    resolvePrintWorkspaceDraftMode(searchParams) ===
    PRINT_WORKSPACE_DRAFT_MODE.FRESH
  const draftStorageKey = workspaceStateID
    ? buildPrintWorkspaceDraftStorageKey(
        'material-purchase-contract',
        workspaceStateID,
        { customerKey, accountKey, configRevision }
      )
    : buildPrintWorkspaceDraftStorageKey('material-purchase-contract', '', {
        customerKey,
        accountKey,
        configRevision,
      })
  const initialWorkspaceDraft = useMemo(() => {
    if (resetDraftOnOpen) {
      return null
    }
    return (
      readInitialPrintWorkspaceDraftFromWindowName(
        'material-purchase-contract',
        workspaceStateID,
        window,
        draftStorageKey
      ) || readPrintWorkspaceDraftSnapshot(draftStorageKey)
    )
  }, [draftStorageKey, resetDraftOnOpen, workspaceStateID])
  const batchDraft = isMaterialPurchaseContractBatchDraft(initialWorkspaceDraft)
    ? initialWorkspaceDraft
    : null

  useEffect(() => {
    document.title = batchDraft ? '采购合同批量打印窗口' : '采购合同打印窗口'
  }, [batchDraft])

  if (!template) {
    return <Navigate to="/erp/print-center" replace />
  }

  if (batchDraft) {
    return (
      <MaterialPurchaseContractBatchWorkbench
        template={template}
        initialBatchDraft={batchDraft}
        draftStorageKey={draftStorageKey}
        customerKey={customerKey}
      />
    )
  }

  return (
    <MaterialPurchaseContractWorkbench
      template={template}
      draftStorageKey={draftStorageKey}
      resetDraftOnOpen={resetDraftOnOpen}
      workspaceStateID={workspaceStateID}
      businessInput={entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS}
      customerKey={customerKey}
      sourceTag={
        entrySource === PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS
          ? '业务记录带值'
          : '使用默认模板'
      }
    />
  )
}
