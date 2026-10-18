import React from 'react'
import { CopyOutlined, EllipsisOutlined, ExportOutlined, LinkOutlined } from '@ant-design/icons'
import { Button, Dropdown } from 'antd'
import { message } from '@/common/utils/antdApp'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import {
  formatWorkflowTaskSource,
  getWorkflowTaskSourceNo,
} from '../../utils/dashboardTaskDisplay.mjs'
import { formatWorkflowProductCopy, formatWorkflowTaskCopy } from '../../utils/workflowTaskCopy.mjs'
import { getWorkflowTaskIdentity } from '../../utils/workflowTaskIdentity.mjs'
import { workflowTaskLinkPath } from '../../utils/workflowTaskLink.mjs'
import './workflowTaskCopy.css'

async function copyTaskText(text, label, trigger) {
  try {
    await copyTextToClipboard(text)
    message.success(`${label}已复制`)
  } catch {
    message.error('复制失败，请在任务详情中选中文字复制')
  } finally {
    if (trigger?.isConnected && document.activeElement === document.body) {
      trigger.focus({ preventScroll: true })
    }
  }
}

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
      onClick={(event) => {
        event.stopPropagation()
        copyTaskText(text, label, event.currentTarget)
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

export function WorkflowTaskSource({ task, label, copyable = true, onOpen }) {
  const content = onOpen
    ? <Button type="link" className="erp-task-source-link" onClick={onOpen}>{label || formatWorkflowTaskSource(task)}<ExportOutlined aria-hidden="true" /></Button>
    : label || formatWorkflowTaskSource(task)
  if (!copyable) return content
  return (
    <TaskCopyField value={getWorkflowTaskSourceNo(task)} label="单据编号">
      {content}
    </TaskCopyField>
  )
}

function WorkflowTaskCopyMenu({ task, assigneeLabel, includeTask, includeLink }) {
  const triggerRef = React.useRef(null)
  const [open, setOpen] = React.useState(false)
  const handleKeyDown = (event) => {
    if (!open || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }
  const path = includeLink ? workflowTaskLinkPath(task?.id) : ''
  const identity = getWorkflowTaskIdentity(task)
  const entries = [
    ...(path ? [{ key: 'link', label: '任务链接', text: new URL(path, window.location.origin).href }] : []),
    ...(includeTask ? [{ key: 'task', label: '任务信息', text: formatWorkflowTaskCopy(task, { assigneeLabel }) }] : []),
    ...(identity.available && identity.items.length ? [{ key: 'products', label: identity.items.every((item) => item.kind === 'product') ? '产品信息' : identity.items.every((item) => item.kind === 'material') ? '物料信息' : '关联内容信息', text: formatWorkflowProductCopy(identity.items) }] : []),
  ].filter((entry) => entry.text.trim())
  return (
    <Dropdown
      rootClassName="erp-task-copy-menu"
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      autoFocus
      menu={{
        onKeyDown: handleKeyDown,
        items: entries.map((entry) => ({ key: entry.key, label: `复制${entry.label}`, icon: entry.key === 'link' ? <LinkOutlined aria-hidden="true" /> : <CopyOutlined aria-hidden="true" /> })),
        onClick: async ({ key, domEvent }) => {
          const trigger = triggerRef.current
          const entry = entries.find((item) => item.key === key)
          domEvent.preventDefault()
          domEvent.stopPropagation()
          setOpen(false)
          if (entry) await copyTaskText(entry.text, entry.label, trigger)
          if (trigger?.isConnected) trigger.focus({ preventScroll: true })
        },
      }}
    >
      <Button ref={triggerRef} className="erp-task-more" type="text" size="small" icon={<EllipsisOutlined aria-hidden="true" />} aria-label="更多操作" aria-haspopup="menu" aria-expanded={open} onKeyDown={handleKeyDown} onClick={(event) => event.stopPropagation()} />
    </Dropdown>
  )
}

export function WorkflowTaskCopySummary({ task, assigneeLabel, compact = false, taskOnly = false, includeTask = true, includeLink = true }) {
  const path = workflowTaskLinkPath(task?.id)
  if (compact) return <WorkflowTaskCopyMenu key={`${task?.id}:${task?.source_type}:${task?.source_id}:${task?.display_context?.available}`} task={task} assigneeLabel={assigneeLabel} includeTask={includeTask} includeLink={includeLink} />
  return (
    <>
      <TaskCopyButton
        text={formatWorkflowTaskCopy(task, { assigneeLabel })}
        label="任务信息"
        showLabel
      />
      {path && !taskOnly ? <TaskCopyButton text={new URL(path, window.location.origin).href} label="任务链接" showLabel /> : null}
    </>
  )
}
