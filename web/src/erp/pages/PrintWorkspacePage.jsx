import React, { lazy, useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Result } from 'antd'
import {
  AUTH_SESSION_CHANGED_EVENT,
  getCurrentUser,
} from '../../common/auth/auth.js'
import { clearRetiredPrintWindowState } from '../../common/auth/printWindowStorageCleanup.mjs'
import { getPrintTemplateByKey } from '../config/printTemplates.mjs'
import { getPrintWorkspaceDraftScope } from '../utils/printWorkspaceScope.mjs'
import {
  buildPrintWorkspaceDraftStorageKey,
  PRINT_WORKSPACE_DRAFT_MODE,
  readInitialPrintWorkspaceDraftFromWindowName,
  resolvePrintWorkspaceDraftMode,
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
      queueMicrotask(() => {
        // 会话清理会通知外观订阅者；先在事件回调中完成，再触发页面渲染。
        getCurrentUser()
        setSessionRevision((value) => value + 1)
      })
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
  const workspaceStateID = resolvePrintWorkspaceStateID(searchParams)
  const storageKey = buildPrintWorkspaceDraftStorageKey(
    templateKey,
    workspaceStateID,
    scope
  )
  const restoreDraft = resolvePrintWorkspaceDraftMode(searchParams) === PRINT_WORKSPACE_DRAFT_MODE.RESTORE
  const [prepared, setPrepared] = useState(null)
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  useEffect(() => {
    clearRetiredPrintWindowState()
    if (!accountID || !restoreDraft) return undefined
    const initialDraft = readInitialPrintWorkspaceDraftFromWindowName(templateKey, workspaceStateID, window, storageKey)
    let cancelled = false
    preparePrintDraftStorage(storageKey).then((status) => {
      if (cancelled) return
      setPrepared({
        storageKey,
        restoreAttempt,
        blocked: status === 'unreadable' || (status === 'unavailable' && !initialDraft),
      })
    })
    return () => {
      cancelled = true
    }
  }, [accountID, restoreDraft, storageKey, restoreAttempt, templateKey, workspaceStateID])
  if (!user) return <Navigate to="/admin-login" replace />
  if (restoreDraft && (prepared?.storageKey !== storageKey || prepared.restoreAttempt !== restoreAttempt)) {
    return <div role="status">正在恢复本窗口内容…</div>
  }
  if (restoreDraft && prepared.blocked) {
    return (
      <div role="alert">
        <Result
          status="warning"
          title="无法恢复此窗口的草稿"
          subTitle="原草稿仍保留。请重试，或从来源单据重新打开打印窗口。"
          extra={<Button type="primary" onClick={() => setRestoreAttempt((value) => value + 1)}>重新读取</Button>}
        />
      </div>
    )
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
