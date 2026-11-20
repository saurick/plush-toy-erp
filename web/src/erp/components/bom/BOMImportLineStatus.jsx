import React, { useEffect, useId, useState } from 'react'
import { Button, Popover } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { describeBOMImportLineStatus } from '../../utils/bomXlsxImport.mjs'
import './bomImportLineStatus.css'

function BOMImportIssueDetails({ issues, rowNumber }) {
  const [open, setOpen] = useState(false)
  const contentID = useId()
  const label = describeBOMImportLineStatus(issues)
  const source = rowNumber ? `Excel 第 ${rowNumber} 行` : '导入明细'
  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [open])
  return (
    <Popover
      trigger={['hover', 'click', 'focus']}
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
      classNames={{ root: 'erp-bom-import-issues-popover' }}
      title={`${source} · 待处理`}
      content={
        <ul id={contentID} className="erp-bom-import-issues">
          {issues.map((issue) => <li key={issue.field}>{issue.message}</li>)}
        </ul>
      }
    >
      <Button
        type="link"
        size="small"
        className="erp-bom-import-issue-trigger"
        icon={<ExclamationCircleOutlined />}
        aria-label={`${source}：${label}，查看完整缺项`}
        aria-expanded={open}
        aria-controls={open ? contentID : undefined}
      >
        {label}
      </Button>
    </Popover>
  )
}

export default function BOMImportLineStatus({ issues = [], rowNumber }) {
  return issues.length
    ? <BOMImportIssueDetails issues={issues} rowNumber={rowNumber} />
    : <span aria-label="无需处理">—</span>
}
