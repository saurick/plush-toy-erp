import React from 'react'
import { Button, Space } from 'antd'
import { lineItemFieldIndex, revealBusinessLineItemErrors } from './businessLineItemDisclosure.mjs'
import { useBusinessLineItemGroupErrors } from './useBusinessLineItemGroups.js'

export default function BusinessLineItemGroupControls({ controller, form, label }) {
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
    <Space className="erp-line-item-group-controls" role="group" aria-label={`${label}分组`} size={4} wrap>
      <Button disabled={false} onClick={controller.expandAll}>全部展开</Button>
      <Button disabled={false} onClick={controller.collapseAll}>全部收起</Button>
      {errors ? <Button disabled={false} onClick={locate}>{errors} 项待修改 · 定位</Button> : null}
    </Space>
  )
}
