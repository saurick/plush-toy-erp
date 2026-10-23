import React, { useContext, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Spin, Tag } from 'antd'
import { AUTH_SESSION_CHANGED_EVENT } from '@/common/auth/auth'
import { SelectionActionOverlayContext } from '../business-list/BusinessListLayout.jsx'
import BusinessLink from '../business-list/BusinessLink.jsx'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { listWorkflowTracking } from '../../api/workflowApi.mjs'
import { trackingStatus, trackingStatusColor, trackingTitle, trackingURL } from '../../utils/workflowTracking.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'
import WorkflowTrackingDrawer from './WorkflowTrackingDrawer.jsx'
import WorkflowTaskPagination from './WorkflowTaskPagination.jsx'

export default function WorkflowSourceProgressButton({ sourceType, sourceID, profile, disabled = false, onOpenChange }) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState(null)
  const [selection, setSelection] = useState(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const trigger = useRef(null)
  const setActionOverlayOpen = useContext(SelectionActionOverlayContext)
  const canRead = hasActionPermission(profile, PermissionCode.WORKFLOW_TASK_READ)
  const sourceKey = JSON.stringify([sourceType, sourceID, profile?.id, profile?.effective_session, profile?.permissions])
  const key = JSON.stringify([sourceKey, page, reload])
  const changeOpen = (value) => { setOpen(value); onOpenChange?.(value) }
  useEffect(() => {
    setOpen(false)
    setSelection(null)
    setPage(1)
    onOpenChange?.(false)
  }, [sourceKey, canRead, onOpenChange])
  useEffect(() => {
    if (!open || !canRead) return undefined
    const controller = new AbortController()
    setActionOverlayOpen?.(true)
    const closeForSessionChange = () => { controller.abort(); setResult(null); setSelection(null); setOpen(false); onOpenChange?.(false) }
    const onStorage = (event) => { if (event.key === null || event.key === 'admin_access_token') closeForSessionChange() }
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, closeForSessionChange)
    window.addEventListener('storage', onStorage)
    listWorkflowTracking({ scope: 'visible', source_type: sourceType, source_id: sourceID, limit: 20, offset: (page - 1) * 20 }, { signal: controller.signal }).then(
      (data) => {
        if (controller.signal.aborted) return
        if (data.items.some((item) => item.source_type !== sourceType || item.source_id !== sourceID)) {
          setResult({ key, error: true })
        } else if (page > Math.max(1, Math.ceil(data.total / 20))) {
          setPage(Math.max(1, Math.ceil(data.total / 20)))
        } else setResult({ key, data })
      },
      () => { if (!controller.signal.aborted) setResult({ key, error: true }) }
    )
    return () => {
      controller.abort()
      setActionOverlayOpen?.(false)
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, closeForSessionChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [open, canRead, sourceType, sourceID, page, key, onOpenChange, setActionOverlayOpen])
  const current = result?.key === key ? result : null
  const data = current?.data
  const selected = selection?.key === key ? selection.item : data?.total === 1 ? data.items[0] : null
  if (!canRead) return null
  return (
    <>
      <Button
        ref={trigger}
        size="small"
        disabled={disabled || !sourceType || !Number.isSafeInteger(sourceID) || sourceID <= 0}
        data-business-action-key="workflow-progress"
        aria-haspopup="dialog"
        onClick={() => { setPage(1); setSelection(null); setResult(null); setReload((value) => value + 1); changeOpen(true) }}
      >
        流程跟踪
      </Button>
      <WorkflowTrackingDrawer
        open={open}
        trackingRef={open && selected ? { kind: selected.kind, id: selected.id } : null}
        closeLabel="返回当前单据"
        onClose={() => changeOpen(false)}
        onAfterClose={() => trigger.current?.focus({ preventScroll: true })}
        navigation={selected && data.total > 1 ? <Button type="link" onClick={() => setSelection(null)}>选择其他流程（{data.total}）</Button> : null}
        overview={!current ? <Spin tip="正在读取关联流程"><div className="erp-workflow-tracking-loading" /></Spin> : current.error ? (
          <Alert type="error" showIcon message="关联流程读取失败" action={<Button onClick={() => setReload((value) => value + 1)}>重试</Button>} />
      ) : (
        <div className="erp-workflow-source-tracking">
          {data.total ? (
            <>
              <p>选择要查看的流程</p>
              <ul>
                {data.items.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <button type="button" onClick={() => setSelection({ key, item })}>
                      <span><strong>{trackingTitle(item)}</strong><Tag color={trackingStatusColor(item)}>{trackingStatus(item)}</Tag></span>
                      <span>{formatWorkflowTaskEventTime(item.started_at)} · {item.initiator_name || '发起人未提供'}</span>
                    </button>
                  </li>
              ))}
              </ul>
              {data.total > 20 ? <WorkflowTaskPagination total={data.total} current={page} pageSize={20} pageSizeOptions={[20]} recordLabel="关联流程" onChange={(value) => { setPage(value); setSelection(null) }} /> : null}
            </>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前单据暂无可见流程" />}
          <BusinessLink to={trackingURL(null, { type: sourceType, id: sourceID })}>打开任务管理</BusinessLink>
        </div>
      )}
      />
    </>
  )
}

WorkflowSourceProgressButton.selectionActionRole = 'related'
WorkflowSourceProgressButton.selectionActionVisible = ({ profile }) => hasActionPermission(profile, PermissionCode.WORKFLOW_TASK_READ)
