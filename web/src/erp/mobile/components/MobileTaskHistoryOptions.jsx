import React, { useState } from 'react'
import MobileTaskExtraFilters from './MobileTaskExtraFilters.jsx'
import BusinessStatusFilter from '../../components/business-list/BusinessStatusFilter.jsx'
import MobileFilterChoices from './MobileFilterChoices.jsx'
import MobileFilterPopover from './MobileFilterPopover.jsx'
import {
  WORKFLOW_HISTORY_PERIOD_OPTIONS,
  WORKFLOW_HISTORY_STATUS_OPTIONS,
} from '../../utils/workflowRoleTaskHistory.mjs'

export default function MobileTaskHistoryOptions({ options, onChange, sourceTypes, counts, loading }) {
  const { period = '', statusKey = '' } = options
  const [open, setOpen] = useState(false)
  return (
    <MobileFilterPopover
      contextLabel="已办"
      title="已办筛选"
      open={open}
      onOpenChange={setOpen}
      count={Number(Boolean(statusKey)) + Number(Boolean(options.sourceType))}
      testId="mobile-history-filter-trigger"
      onReset={() => onChange({ period: '', statusKey: '', sourceType: '' })}
    >
      <fieldset role="presentation">
        <legend>处理时间</legend>
        <MobileFilterChoices
          label="处理时间筛选"
          options={WORKFLOW_HISTORY_PERIOD_OPTIONS}
          value={period}
          onChange={(value) => onChange({ period: value })}
        />
      </fieldset>
      <fieldset role="presentation">
        <legend>处理结果</legend>
        <BusinessStatusFilter
          counts={counts}
          loading={loading}
          allLabel="全部结果"
          aria-label="处理结果筛选"
          value={statusKey}
          options={WORKFLOW_HISTORY_STATUS_OPTIONS}
          onChange={(value) => onChange({ statusKey: value })}
        />
      </fieldset>
      <MobileTaskExtraFilters options={options} sourceTypes={sourceTypes} history onChange={onChange} />
    </MobileFilterPopover>
  )
}
