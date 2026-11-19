import React from 'react'
import { formatFilterDateRange } from '../../utils/filterDateRange.mjs'
import { PAYMENT_SUMMARY_PERIOD_PRESETS } from '../../utils/workbenchSummary.mjs'
import FilterDateRangePicker from '../business-list/FilterDateRangePicker.jsx'
import './paymentSummaryPeriodPicker.css'

export default function PaymentSummaryPeriodPicker({ periodRef, range, onChange }) {
  const caption = PAYMENT_SUMMARY_PERIOD_PRESETS.find(({ value }) => value === range.period)?.label || formatFilterDateRange(range)
  return (
    <FilterDateRangePicker
      label="统计期间"
      caption={caption}
      active
      clearAction={{ label: '恢复本月', visible: range.period !== 'month', onClick: () => onChange('month') }}
      dialogLabel="选择收付日期范围"
      triggerRef={periodRef}
      editor={{
        range,
        presets: PAYMENT_SUMMARY_PERIOD_PRESETS,
        selectedPreset: range.period,
        onPreset: ({ value }) => onChange(value),
        onApply: ({ dateFrom, dateTo }) => onChange('custom', dateFrom, dateTo),
      }}
    />
  )
}
