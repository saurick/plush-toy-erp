import React from 'react'
import { Button, Space } from 'antd'
import { lineItemFieldIndex, revealBusinessLineItemErrors } from './businessLineItemDisclosure.mjs'
import { useBusinessLineItemGroupErrors } from './useBusinessLineItemGroups.js'

export function BusinessLineItemGroupErrorCount({ controller, groupId }) {
  const count = useBusinessLineItemGroupErrors(controller).get(groupId) || 0
  return count ? ` · ${count} 项待修改` : null
}

export default function BusinessLineItemGroupControls({ controller, form, label, groupCount }) {
  const counts = useBusinessLineItemGroupErrors(controller)
  const errors = [...counts.values()].reduce((total, count) => total + count, 0)
  const locate = async () => {
    const fields = form.getFieldsError().filter((field) => field.errors.length > 0 && lineItemFieldIndex(field.name, controller.fieldName) !== null)
    if (!fields.length) return
    revealBusinessLineItemErrors(form, fields)
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    form.scrollToField(fields[0].name, { focus: true, block: 'nearest' })
  }
  return (
    <div className="erp-line-item-group-controls" role="group" aria-label={`${label}分组`}>
      <span className="erp-line-item-group-controls__count">{groupCount} 组</span>
      <Space size={4} wrap>
        <Button size="small" disabled={false} onClick={controller.expandAll}>全部展开</Button>
        <Button size="small" disabled={false} onClick={controller.collapseAll}>全部收起</Button>
        {errors ? <Button size="small" disabled={false} onClick={locate}>{errors} 项待修改 · 定位</Button> : null}
      </Space>
    </div>
  )
}
