import React from 'react'
import { CopyOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { message } from '@/common/utils/antdApp'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceNo,
} from '../../utils/dashboardTaskDisplay.mjs'
import { formatWorkflowTaskCopy } from '../../utils/workflowTaskCopy.mjs'
import './workflowTaskCopy.css'

export function TaskCopyButton({ text, label, showLabel = false }) {
  if (!text?.trim()) return null
  return (
    <Button
      type="text"
      size="small"
      className={`erp-task-copy${showLabel ? ' erp-task-copy--label' : ''}`}
      icon={<CopyOutlined aria-hidden="true" />}
      aria-label={`复制${label}`}
      title={`复制${label}`}
      onClick={async (event) => {
        event.stopPropagation()
        const trigger = event.currentTarget
        try {
          await copyTextToClipboard(text)
          message.success(`${label}已复制`)
        } catch {
          message.error('复制失败，请在任务详情中选中文字复制')
        } finally {
          if (trigger.isConnected && document.activeElement === document.body) {
            trigger.focus({ preventScroll: true })
          }
        }
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {showLabel ? `复制${label}` : null}
    </Button>
  )
}

export function TaskCopyField({ value, label, children }) {
  return (
    <span className="erp-task-copy-field">
      <span className="erp-task-copy-field__value">{children}</span>
      <TaskCopyButton text={value} label={label} />
    </span>
  )
}

export function WorkflowTaskSource({ task, label }) {
  return (
    <TaskCopyField value={getWorkflowTaskSourceNo(task)} label="单据编号">
      {label || formatWorkflowTaskSource(task)}
    </TaskCopyField>
  )
}

export function WorkflowTaskCopySummary({ task, assigneeLabel }) {
  return (
    <TaskCopyButton
      text={formatWorkflowTaskCopy(task, { assigneeLabel })}
      label="任务信息"
      showLabel
    />
  )
}
