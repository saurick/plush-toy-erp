import React from 'react'
import { Input, Radio } from 'antd'
import {
  buildWorkflowTaskBlockReason,
  splitWorkflowTaskBlockReason,
  WORKFLOW_TASK_BLOCK_REASONS,
  WORKFLOW_TASK_BLOCK_REASON_LIMIT,
} from '../../utils/workflowTaskBlockReason.mjs'
import './workflowTaskBlockReason.css'

export default function WorkflowTaskBlockReason({ value = '', onChange, disabled = false }) {
  const detailID = React.useId()
  const { choice, detail } = splitWorkflowTaskBlockReason(value)
  const detailLimit = WORKFLOW_TASK_BLOCK_REASON_LIMIT - (choice ? choice.length + 1 : 0)
  return (
    <div className="workflow-task-block-reason">
      <fieldset>
        <legend>受阻原因</legend>
        <Radio.Group
          role="radiogroup"
          aria-label="受阻原因"
          aria-required="true"
          value={choice}
          disabled={disabled}
          onChange={(event) => onChange?.(buildWorkflowTaskBlockReason({ choice: event.target.value, detail }))}
        >
          {WORKFLOW_TASK_BLOCK_REASONS.map((label) => <Radio key={label} value={label}>{label}</Radio>)}
        </Radio.Group>
      </fieldset>
      <div className="workflow-task-block-reason__detail">
        <label htmlFor={detailID}>补充说明（选填）</label>
        <Input.TextArea
          id={detailID}
          value={detail}
          autoSize={{ minRows: 2, maxRows: 4 }}
          maxLength={detailLimit}
          showCount
          disabled={disabled}
          status={detail.length > detailLimit ? 'error' : undefined}
          aria-invalid={detail.length > detailLimit || undefined}
          placeholder="可补充具体情况或需要谁协助"
          onChange={(event) => onChange?.(buildWorkflowTaskBlockReason({ choice, detail: event.target.value }))}
        />
        {detail.length > detailLimit ? <span role="alert">补充说明最多 {detailLimit} 字，请缩短后提交。</span> : null}
      </div>
    </div>
  )
}
