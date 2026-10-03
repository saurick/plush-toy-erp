import React, { lazy, useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AUTH_SESSION_CHANGED_EVENT,
  getCurrentUser,
} from '../../common/auth/auth.js'
import { clearRetiredPrintWindowState } from '../../common/auth/printWindowStorageCleanup.mjs'
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
  const [sessionRevision, setSessionRevision] = useState(0)
  const user = getCurrentUser()
  const accountID = user?.id
  const expiresAt = user?.exp
  useEffect(() => {
    const refreshSession = () =>
      queueMicrotask(() => setSessionRevision((value) => value + 1))
    const onStorage = (event) => {
      if (event.key === null || event.key === 'admin_access_token') {
        refreshSession()
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refreshSession)
    window.addEventListener('focus', refreshSession)
    const expiryTimer = expiresAt
      ? setTimeout(
          refreshSession,
          Math.min(Math.max(0, expiresAt * 1000 - Date.now()), 2147483647)
        )
      : null
    return () => {
      clearTimeout(expiryTimer)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refreshSession)
      window.removeEventListener('focus', refreshSession)
    }
  }, [accountID, expiresAt, sessionRevision])
  const scope = getPrintWorkspaceDraftScope(searchParams)
  const storageKey = buildPrintWorkspaceDraftStorageKey(
    templateKey,
    resolvePrintWorkspaceStateID(searchParams),
    scope
  )
  const [preparedKey, setPreparedKey] = useState(null)
  useEffect(() => {
    let cancelled = false
    clearRetiredPrintWindowState()
    preparePrintDraftStorage(storageKey).finally(() => {
      if (!cancelled) setPreparedKey(storageKey)
    })
    return () => {
      cancelled = true
    }
  }, [storageKey])
  if (!user) return <Navigate to="/admin-login" replace />
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
