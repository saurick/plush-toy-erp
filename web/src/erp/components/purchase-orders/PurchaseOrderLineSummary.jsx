import React from 'react'
import { Form } from 'antd'

const text = (value) => String(value ?? '').trim()

export default function PurchaseOrderLineSummary({ form, fieldName, materials, identityOnly = false }) {
  const items = Form.useWatch('items', { form, preserve: true })
  const line = items?.[fieldName] || {}
  const display = { materialID: line.material_id, name: text(line.material_name_snapshot), color: text(line.color_snapshot) }
  const material = materials.find((item) => Number(item.id) === Number(display?.materialID))
  if (identityOnly) return display?.name || material?.name || '待选择材料'
  const nameDiffers = display?.name && display.name !== text(material?.name)
  const missingName = display?.materialID && !display.name
  const parts = [nameDiffers ? `下单：${display.name}` : missingName ? '下单名称未填写' : '', display?.color ? `颜色：${display.color}` : ''].filter(Boolean)
  return parts.length ? <div className="erp-purchase-line-summary">{parts.join(' · ')}</div> : null
}
