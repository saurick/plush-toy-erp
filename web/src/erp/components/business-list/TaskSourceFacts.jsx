import React from 'react'
import { Form } from 'antd'

// Keep the existing Form fields mounted; this is a compact view of their source values.
export default function TaskSourceFacts({ form, fields }) {
  const values = Form.useWatch((value) => value, { form, preserve: true }) || {}
  return (
    <dl className="mobile-task-facts__grid" aria-label="本次任务来源">
      {fields.map(({ name, label, options, value }) => {
        const raw = value ?? values[name]
        const display = options ? options.find((option) => String(option.value) === String(raw))?.label : raw
        return display !== undefined && display !== null && display !== '' ? (
          <div key={name} className="mobile-task-facts__field mobile-task-facts__field--wide">
            <dt>{label}</dt><dd>{display}</dd>
          </div>
        ) : null
      })}
    </dl>
  )
}
