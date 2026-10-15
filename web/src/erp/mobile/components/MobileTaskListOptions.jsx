import React, { useState } from 'react'
import MobileTaskExtraFilters from './MobileTaskExtraFilters.jsx'
import BusinessStatusFilter from '../../components/business-list/BusinessStatusFilter.jsx'
import MobileFilterChoices from './MobileFilterChoices.jsx'
import MobileFilterPopover from './MobileFilterPopover'
import WorkflowTaskDiscoveryFilters from '../../components/workflow/WorkflowTaskDiscoveryFilters.jsx'
import { taskDiscoveryFilterLabels } from '../../utils/workflowTaskDiscovery.mjs'
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
  profile,
  roleKey,
  people,
  sourceTypes,
  peopleError,
  onRetryPeople,
  calendarState,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  return (
    <MobileFilterPopover
      contextLabel={contextLabel}
      title={showSort ? '筛选与排序' : '任务筛选'}
      open={open}
      onOpenChange={setOpen}
      count={Number(showSort && sortKey !== 'newest') + Number(Boolean(statusKey)) + taskDiscoveryFilterLabels(options).length + Number(!calendarState && Boolean(options.due)) + Number(Boolean(options.sourceType)) + Number(Boolean(calendarState && taskCalendarSelectionMode(calendarState.selection) !== 'date'))}
      onReset={() => {
        onChange({ sortKey: showSort ? 'newest' : sortKey, statusKey: '', due: '', sourceType: '', assignee: '' })
        if (calendarState) calendarState.change({ selection: defaultTaskCalendarDate(calendarState.month) })
      }}
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
      {showSort && (
        <fieldset role="presentation">
          <legend>任务排序</legend>
          <MobileFilterChoices
            label="任务排序"
            value={sortKey}
            options={MOBILE_TASK_SORT_OPTIONS}
            onChange={(value) => onChange({ sortKey: value, statusKey })}
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
  )
}
