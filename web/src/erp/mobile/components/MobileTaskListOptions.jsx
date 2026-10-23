import React, { useId, useState } from 'react'
import Select from '@/common/components/select/FilterSelect'
import MobileTaskExtraFilters from './MobileTaskExtraFilters.jsx'
import BusinessStatusFilter from '../../components/business-list/BusinessStatusFilter.jsx'
import MobileFilterChoices from './MobileFilterChoices.jsx'
import MobileFilterPopover from './MobileFilterPopover'
import { TASK_CALENDAR_SELECTION_OPTIONS, taskCalendarSelectionMode, defaultTaskCalendarDate } from '../../utils/workflowTaskCalendar.mjs'
import {
  MOBILE_TASK_SORT_OPTIONS,
  MOBILE_TASK_STATUS_OPTIONS,
} from '../../utils/mobileTaskQueries.mjs'

export default function MobileTaskListOptions({
  contextLabel = '任务',
  counts,
  loading,
  showSort = true,
  sortKey,
  statusKey,
  options = {},
  sourceTypes,
  calendarState,
  onChange,
  count,
  summary,
  onReset,
  triggerRef,
}) {
  const [open, setOpen] = useState(false)
  const sortID = useId()
  return (
    <MobileFilterPopover
      contextLabel={contextLabel}
      title={showSort ? '筛选与排序' : '任务筛选'}
      open={open}
      onOpenChange={setOpen}
      count={count}
      summary={summary}
      onReset={onReset}
      triggerRef={triggerRef}
      testId="mobile-task-list-filter-trigger"
    >
      {calendarState && (
      <fieldset role="presentation">
        <legend>任务截止</legend>
        <MobileFilterChoices
          label="任务截止筛选"
          value={taskCalendarSelectionMode(calendarState.selection)}
          options={TASK_CALENDAR_SELECTION_OPTIONS}
          onChange={(value) => calendarState.change({ selection: value === 'date' ? defaultTaskCalendarDate(calendarState.month) : value })}
        />
      </fieldset>
      )}
      <fieldset role="presentation">
        <legend>任务状态</legend>
        {calendarState ? <MobileFilterChoices label="任务状态筛选" value={statusKey} options={MOBILE_TASK_STATUS_OPTIONS} onChange={(value) => onChange({ statusKey: value })} /> : <BusinessStatusFilter
          counts={counts}
          loading={loading}
          allLabel="全部状态"
          aria-label="任务状态筛选"
          value={statusKey}
          options={MOBILE_TASK_STATUS_OPTIONS}
          onChange={(value) => onChange({ sortKey, statusKey: value })}
        />}
      </fieldset>
      <MobileTaskExtraFilters options={options} sourceTypes={sourceTypes} showDue={!calendarState} onChange={onChange} />
      {showSort && (
        <div className="mobile-filter-select-field mobile-filter-sort-field">
          <label htmlFor={sortID}>任务排序</label>
          <Select
            emptyValue="newest"
            placeholder="任务排序"
            id={sortID}
            aria-label="任务排序"
            value={sortKey}
            options={MOBILE_TASK_SORT_OPTIONS}
            onChange={(value) => onChange({ sortKey: value, statusKey })}
          />
        </div>
      )}
    </MobileFilterPopover>
  )
}
