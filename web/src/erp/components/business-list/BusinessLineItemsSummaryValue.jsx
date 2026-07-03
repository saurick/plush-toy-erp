import React from 'react'
import { Form } from 'antd'

export default function BusinessLineItemsSummaryValue({
  name = 'items',
  summarize,
  select,
}) {
  return (
    <Form.Item
      noStyle
      shouldUpdate={(previous, current) => previous?.[name] !== current?.[name]}
    >
      {({ getFieldValue }) => {
        const summary = summarize(getFieldValue(name) || [])
        return select(summary)
      }}
    </Form.Item>
  )
}
