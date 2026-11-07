import React, { useId, useLayoutEffect, useState } from 'react'
import { Button, Tooltip } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { useBusinessLineItemDisclosure } from './BusinessLineItemDisclosureContext.js'
import { useBusinessLineItemErrorCount } from './useBusinessLineItemGroups.js'

export function useBusinessLineItemDetails({ index, collapsible = true, defaultOpen = false }) {
  const disclosure = useBusinessLineItemDisclosure()
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const errorCount = useBusinessLineItemErrorCount(disclosure?.lineErrors, disclosure?.index ?? index)
  useLayoutEffect(() => {
    if (collapsible && errorCount) setOpen(true)
  }, [collapsible, errorCount, disclosure?.validationRevision])
  return { id, open, visible: !collapsible || open, errorCount, toggle: () => setOpen((current) => !current) }
}

export default function BusinessLineItemDetailsToggle({ index, label = '补充资料', details }) {
  const action = details.open ? '收起' : '展开'
  return (
    <Tooltip title={`${action}${label}`} trigger={['hover', 'focus']}>
      <Button
        className="erp-line-editor__details-toggle"
        type="text"
        disabled={false}
        aria-expanded={details.open}
        aria-controls={details.id}
        aria-label={`${action}第 ${index + 1} 行${label}`}
        onClick={details.toggle}
      >
        <RightOutlined className="erp-line-editor__details-arrow" aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}
