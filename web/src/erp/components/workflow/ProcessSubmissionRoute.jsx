import React, { useEffect, useState } from 'react'
import { Button, Space, Typography } from 'antd'
import { getProcessSubmissionRoute } from '../../api/customerConfigApi.mjs'
import { getWorkflowResponsibilityParts } from '../../utils/workflowTaskLabels.mjs'
import { approvalConditionSummary } from '../../utils/approvalCondition.mjs'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'

// The server resolves the active revision. The submission itself still decides
// the amount gate and freezes its own configuration in the existing transaction.
export default function ProcessSubmissionRoute({ processKey, customerKey, open = true }) {
  const [result, setResult] = useState(null)
  const [reload, setReload] = useState(0)
  const requestKey = JSON.stringify([processKey, customerKey || '', reload])
  useEffect(() => {
    if (!open || !processKey) {
      setResult(null)
      return undefined
    }
    const controller = new AbortController()
    getProcessSubmissionRoute(
      { process_key: processKey, ...(customerKey ? { customer_key: customerKey } : {}) },
      { signal: controller.signal }
    ).then(
      (route) => {
        if (!controller.signal.aborted) setResult({ requestKey, route })
      },
      () => {
        if (!controller.signal.aborted) setResult({ requestKey, failed: true })
      }
    )
    return () => controller.abort()
  }, [processKey, customerKey, requestKey, open])

  if (!open || !processKey) return null
  const current = result?.requestKey === requestKey ? result : null
  if (!current) return <Typography.Text type="secondary" role="status">正在读取审批去向…</Typography.Text>
  if (current.failed) {
    return (
      <Space size={8} wrap role="status">
        <Typography.Text type="danger">暂时无法确认审批去向</Typography.Text>
        <Button size="small" onClick={() => setReload((value) => value + 1)}>重新读取</Button>
      </Space>
    )
  }
  const { route } = current
  const responsibility = getWorkflowResponsibilityParts({ roleKey: route.owner_role_key, assigneeName: route.assignee_display_name, pending: true, approval: true })
  return (
    <Space direction="vertical" size={4} role="status" aria-label="审批去向">
      <Typography.Text>
        {route.condition.mode === 'amount' ? '需审批时' : '提交后'}：<WorkflowResponsibilities items={[responsibility]} />
      </Typography.Text>
      {route.condition.mode === 'amount' ? (
        <Typography.Text type="secondary">
          {approvalConditionSummary(route.approval_key, route.condition)}；是否免审以提交结果为准
        </Typography.Text>
      ) : null}
    </Space>
  )
}
