import React from 'react'
import { Button, Popover } from 'antd'
import { taskClassificationPresentation } from '../../utils/workflowTaskDiscovery.mjs'
import './workflowTaskClassification.css'

export default function WorkflowTaskClassification({ task }) {
  const { label, path } = taskClassificationPresentation(task)
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef(null)
  React.useEffect(() => setOpen(false), [task?.id, label, path])
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  if (!label) return null
  return (
    <dl className="workflow-task-info-card__classification">
      <dt>任务分类</dt>
      <dd className="workflow-task-classification__value">
        <span>{label}</span>
        {path ? (
          <Popover
            trigger="click"
            placement="bottomRight"
            open={open}
            onOpenChange={setOpen}
            content={<div className="workflow-task-classification__path"><strong>完整分类路径</strong><p>{path}</p></div>}
          >
            <Button
              ref={trigger}
              type="text"
              size="small"
              className="workflow-task-classification__trigger"
              aria-label="查看分类详情"
              aria-expanded={open}
              onKeyDown={closeOnEscape}
            >
              分类详情
            </Button>
          </Popover>
        ) : null}
      </dd>
    </dl>
  )
}
