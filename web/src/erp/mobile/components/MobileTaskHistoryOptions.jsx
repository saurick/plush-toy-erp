import React, { useState } from 'react'
import { Button } from 'antd'
import MobileTaskExtraFilters from './MobileTaskExtraFilters.jsx'
import BusinessStatusFilter from '../../components/business-list/BusinessStatusFilter.jsx'
import MobileFilterChoices from './MobileFilterChoices.jsx'
import MobileFilterPopover from './MobileFilterPopover.jsx'
import WorkflowTaskDiscoveryFilters from '../../components/workflow/WorkflowTaskDiscoveryFilters.jsx'
import { taskDiscoveryFilterLabels } from '../../utils/workflowTaskDiscovery.mjs'
import FilterDateRangePicker from '../../components/business-list/FilterDateRangePicker.jsx'
import {
  WORKFLOW_HISTORY_PERIOD_OPTIONS,
  WORKFLOW_HISTORY_STATUS_OPTIONS,
} from '../../utils/workflowRoleTaskHistory.mjs'
import './mobileTaskHistoryOptions.css'

export default function MobileTaskHistoryOptions({ options, onChange, profile, roleKey, people, sourceTypes, peopleError, onRetryPeople, counts, loading }) {
  const { period = '', dateFrom = '', dateTo = '', statusKey = '' } = options
  const [open, setOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  return (
    <>
      <MobileFilterPopover
        contextLabel="已办"
        title="已办筛选"
        open={open}
        onOpenChange={setOpen}
        count={Number(period === 'custom') + Number(Boolean(statusKey)) + taskDiscoveryFilterLabels(options).length + Number(Boolean(options.sourceType))}
        testId="mobile-history-filter-trigger"
        onReset={() => {
        setCalendarOpen(false)
        onChange({ period: '', dateFrom: '', dateTo: '', statusKey: '', sourceType: '', assignee: '' })
      }}
      >
        <fieldset role="presentation">
          <legend className="mobile-filter-legend-action">
            <span>处理时间</span>
            <Button
              type="text"
              className="mobile-history-custom-date"
              aria-expanded={calendarOpen}
              onClick={() => { setOpen(false); setCalendarOpen(true) }}
            >
              {period === 'custom' ? `${dateFrom} 至 ${dateTo}` : '自定义日期'}
            </Button>
          </legend>
          <MobileFilterChoices
            label="处理时间筛选"
            options={WORKFLOW_HISTORY_PERIOD_OPTIONS}
            value={period === 'custom' ? null : period}
            onChange={(value) => {
            setCalendarOpen(false)
                onChange({ period: value, dateFrom: '', dateTo: '' })
          }}
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
        <WorkflowTaskDiscoveryFilters
          compact
          value={options}
          onChange={onChange}
          profile={profile}
          roleKey={roleKey}
          people={people}
          peopleError={peopleError}
          onRetryPeople={onRetryPeople}
        />
      </MobileFilterPopover>
      {calendarOpen && <FilterDateRangePicker
        title="选择处理日期范围"
        dateFrom={period === 'custom' ? dateFrom : ''}
        dateTo={period === 'custom' ? dateTo : ''}
        onCancel={() => { setCalendarOpen(false); setOpen(true) }}
        onApply={(range) => { onChange({ period: 'custom', ...range }); setCalendarOpen(false) }}
      />}
    </>
  )
}
