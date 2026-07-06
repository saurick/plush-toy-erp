import React, { useEffect, useMemo } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import MaterialPurchaseContractWorkbench from '../components/print/MaterialPurchaseContractWorkbench.jsx'
import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import {
  buildRestorablePrintWorkspaceURL,
  buildPrintWorkspaceDraftStorageKey,
  PRINT_WORKSPACE_DRAFT_MODE,
  PRINT_WORKSPACE_ENTRY_SOURCE,
  resolvePrintWorkspaceEntrySource,
  resolvePrintWorkspaceStateID,
  resolvePrintWorkspaceDraftMode,
} from '../utils/printWorkspace.js'

const MATERIAL_PURCHASE_DRAFT_STORAGE_KEY =
  '__plush_erp_material_purchase_contract_print_draft__'

export default function MaterialPurchaseContractPrintWorkspacePage() {
  const [searchParams] = useSearchParams()
  const customerKey = useMemo(
    () => String(searchParams.get('customer_key') || '').trim(),
    [searchParams]
  )
  const template = getPrintTemplateByKey('material-purchase-contract')
  const workspaceStateID = resolvePrintWorkspaceStateID(searchParams)
  const entrySource = resolvePrintWorkspaceEntrySource(searchParams)
  const resetDraftOnOpen =
    resolvePrintWorkspaceDraftMode(searchParams) ===
    PRINT_WORKSPACE_DRAFT_MODE.FRESH
  const draftStorageKey = workspaceStateID
    ? buildPrintWorkspaceDraftStorageKey(
        'material-purchase-contract',
        workspaceStateID
      )
    : MATERIAL_PURCHASE_DRAFT_STORAGE_KEY
  const workspaceURL = useMemo(() => {
    if (!workspaceStateID || typeof window === 'undefined') {
      return ''
    }

    return buildRestorablePrintWorkspaceURL('material-purchase-contract', {
      entrySource,
      customerKey,
      stateID: workspaceStateID,
    })
  }, [customerKey, entrySource, workspaceStateID])

  useEffect(() => {
    document.title = '采购合同打印窗口'
  }, [])

  if (!template) {
    return <Navigate to="/erp/print-center" replace />
  }

  return (
    <MaterialPurchaseContractWorkbench
      template={template}
      draftStorageKey={draftStorageKey}
      resetDraftOnOpen={resetDraftOnOpen}
      workspaceStateID={workspaceStateID}
      workspaceURL={workspaceURL}
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
