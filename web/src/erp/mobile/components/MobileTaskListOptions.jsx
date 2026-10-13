import React, { useState } from 'react'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import MobileFilterPopover from './MobileFilterPopover'
import WorkflowTaskDiscoveryFilters from '../../components/workflow/WorkflowTaskDiscoveryFilters.jsx'
import { taskDiscoveryFilterLabels } from '../../utils/workflowTaskDiscovery.mjs'
import {
  MOBILE_TASK_SORT_OPTIONS,
  MOBILE_TASK_STATUS_OPTIONS,
} from '../../utils/mobileTaskQueries.mjs'

export default function MobileTaskListOptions({
  contextLabel = '任务',
  sortKey,
  statusKey,
  options = {},
  profile,
  roleKey,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  return (
    <MobileFilterPopover
      contextLabel={contextLabel}
      title="筛选与排序"
      open={open}
      onOpenChange={setOpen}
      count={Number(sortKey !== 'newest') + Number(Boolean(statusKey)) + taskDiscoveryFilterLabels(options).length}
      onReset={() => onChange({ sortKey: 'newest', statusKey: '', moduleKey: '', chainKey: '', stageKey: '', assignee: '' })}
      testId="mobile-task-list-filter-trigger"
    >
      <fieldset>
        <legend>任务排序</legend>
        <SlidingSegmented
          block
          aria-label="任务排序"
          value={sortKey}
          options={MOBILE_TASK_SORT_OPTIONS}
          onChange={(value) => onChange({ sortKey: value, statusKey })}
        />
      </fieldset>
      <fieldset>
        <legend>任务状态</legend>
        <SlidingSegmented
          block
          aria-label="任务状态筛选"
          value={statusKey}
          options={MOBILE_TASK_STATUS_OPTIONS}
          onChange={(value) => onChange({ sortKey, statusKey: value })}
        />
      </fieldset>
      <WorkflowTaskDiscoveryFilters
        compact
        value={options}
        onChange={onChange}
        profile={profile}
        roleKey={roleKey}
      />
    </MobileFilterPopover>
  )
}
