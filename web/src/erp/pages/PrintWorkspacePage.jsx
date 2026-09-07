import React, { lazy, useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import { getPrintWorkspaceDraftScope } from '../utils/printWorkspaceScope.mjs'
import {
  buildPrintWorkspaceDraftStorageKey,
  resolvePrintWorkspaceStateID,
} from '../utils/printWorkspace.js'
import { preparePrintDraftStorage } from '../utils/printDraftStorage.mjs'

const MaterialPurchaseContractPrintWorkspacePage = lazy(
  () => import('./MaterialPurchaseContractPrintWorkspacePage.jsx')
)
const ProcessingContractPrintWorkspacePage = lazy(
  () => import('./ProcessingContractPrintWorkspacePage.jsx')
)
const EngineeringPrintWorkspacePage = lazy(
  () => import('./EngineeringPrintWorkspacePage.jsx')
)

export default function PrintWorkspacePage() {
  const { templateKey } = useParams()
  const [searchParams] = useSearchParams()
  const scope = getPrintWorkspaceDraftScope(searchParams)
  const storageKey = buildPrintWorkspaceDraftStorageKey(
    templateKey,
    resolvePrintWorkspaceStateID(searchParams),
    scope
  )
  const [preparedKey, setPreparedKey] = useState(null)
  useEffect(() => {
    let cancelled = false
    preparePrintDraftStorage(storageKey).finally(() => {
      if (!cancelled) setPreparedKey(storageKey)
    })
    return () => {
      cancelled = true
    }
  }, [storageKey])
  if (preparedKey !== storageKey) {
    return <div role="status">正在恢复本窗口内容…</div>
  }

  const Workspace = {
    materialContract: MaterialPurchaseContractPrintWorkspacePage,
    processingContract: ProcessingContractPrintWorkspacePage,
    engineering: EngineeringPrintWorkspacePage,
  }[getPrintTemplateByKey(templateKey)?.runtime?.workspace]
  return Workspace ? (
    <Workspace key={storageKey} />
  ) : (
    <Navigate to="/erp/print-center" replace />
  )
}
