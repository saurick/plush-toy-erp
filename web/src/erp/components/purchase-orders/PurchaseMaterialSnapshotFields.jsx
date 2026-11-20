import React from 'react'
import { Form, Input } from 'antd'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'

const SNAPSHOT_FIELDS = [
  { name: 'material_code_snapshot', source: 'code', label: '下单材料编码', maxLength: 64 },
  { name: 'material_name_snapshot', source: 'name', label: '下单材料名称', maxLength: 255 },
  { name: 'color_snapshot', source: 'color', label: '下单颜色', maxLength: 64 },
]
export default function PurchaseMaterialSnapshotFields({ fieldName, disabled }) {
  return (
    <>
      {SNAPSHOT_FIELDS.map((field) => (
        <Form.Item
          key={field.name}
          className={`erp-line-item-field erp-line-item-field--snapshot-${field.source === 'code' ? 'code' : field.source === 'name' ? 'name' : 'small'}`}
          name={[fieldName, field.name]}
          label={field.label}
        >
          {field.source === 'name'
            ? <BusinessTextArea minRows={1} maxLength={field.maxLength} disabled={disabled} />
            : <Input maxLength={field.maxLength} disabled={disabled} />}
        </Form.Item>
      ))}
    </>
  )
}
