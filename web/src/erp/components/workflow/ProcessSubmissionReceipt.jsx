import React, { useEffect, useState } from 'react'
import { Button, Space } from 'antd'
import { notification } from '@/common/utils/antdApp'
import { AUTH_SESSION_CHANGED_EVENT } from '@/common/auth/auth'
import { getWorkflowTracking } from '../../api/workflowApi.mjs'
import { submittedProcessRef, trackingHandoff, trackingResponsibilityParts, trackingURL } from '../../utils/workflowTracking.mjs'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'

function ReceiptContent({ result, loadProcess, noticeKey }) {
  const [state, setState] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const closeForSessionChange = () => {
      controller.abort()
      setState({ closed: true })
      notification.destroy(noticeKey)
    }
    const onStorage = (event) => {
      if (event.key === null || event.key === 'admin_access_token') closeForSessionChange()
    }
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, closeForSessionChange)
    window.addEventListener('storage', onStorage)
    setState(null)
    const read = async () => {
      const ref = submittedProcessRef(loadProcess ? await loadProcess() : result)
      if (controller.signal.aborted) return null
      if (!ref) throw new Error('missing process receipt')
      const detail = await getWorkflowTracking(ref, { signal: controller.signal })
      return { ref, summary: detail.summary }
    }
    read().then(
      (value) => { if (!controller.signal.aborted) setState(value) },
      () => { if (!controller.signal.aborted) setState({ failed: true }) }
    )
    return () => {
      controller.abort()
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, closeForSessionChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [result, loadProcess, reload, noticeKey])
  const ref = state?.ref || submittedProcessRef(result)
  if (state?.closed) return null
  return (
    <Space direction="vertical" size={8}>
      <span role="status">{!state ? '正在读取实际去向…' : state.failed ? '提交已成功，流转进度暂时无法读取。' : <>当前去向：{state.summary.current_tasks.length ? <WorkflowResponsibilities items={state.summary.current_tasks.map(trackingResponsibilityParts)} /> : trackingHandoff(state.summary)}</>}</span>
      <Space>
        {state?.failed ? <Button size="small" onClick={() => setReload((value) => value + 1)}>重新读取进度</Button> : null}
        <Button size="small" href={trackingURL(ref)}>流程跟踪</Button>
      </Space>
    </Space>
  )
}

// Called only after a confirmed write or authoritative readback. A failed
// progress read stays inside the receipt and must never trigger resubmission.
export function showProcessSubmissionReceipt({ result, loadProcess, title = '已提交' }) {
  const ref = submittedProcessRef(result)
  const key = `process-submission-${ref?.id || Date.now()}`
  notification.success({
    key,
    message: title,
    description: <ReceiptContent result={result} loadProcess={loadProcess} noticeKey={key} />,
    duration: 12,
  })
}
