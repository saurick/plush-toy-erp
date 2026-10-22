import React, { useId } from 'react'
import MobileFilterChoices from './MobileFilterChoices.jsx'
import { WORKFLOW_TASK_DUE_OPTIONS } from '../../utils/workflowTaskListFilters.mjs'
import { getWorkflowTaskSourceTypeLabel } from '../../utils/dashboardTaskDisplay.mjs'
import FilterSelect from '@/common/components/select/FilterSelect'

export default function MobileTaskExtraFilters({
  options,
  sourceTypes = [],
  history = false,
  showDue = !history,
  onChange,
}) {
  const sourceID = useId()
  const sources = [
    ...new Set([...sourceTypes, options.sourceType].filter(Boolean)),
  ]
  const sourceOptions = [{ value: '', label: '全部' }, ...sources.map((value) => ({
    value,
    label: getWorkflowTaskSourceTypeLabel(value),
  }))]
  return (
    <>
      {showDue && (
        <fieldset role="presentation">
          <legend>截止时间</legend>
          <MobileFilterChoices
            label="截止时间"
            value={options.due || 'all'}
            options={WORKFLOW_TASK_DUE_OPTIONS}
            onChange={(due) => onChange({ due: due === 'all' ? '' : due })}
          />
        </fieldset>
      )}
      {sources.length > 4 ? (
        <div className="mobile-filter-select-field">
          <label htmlFor={sourceID}>来源单据</label>
          <FilterSelect
            placeholder="来源单据"
            id={sourceID}
            aria-label="来源单据"
            value={options.sourceType || ''}
            options={sourceOptions}
            onChange={(sourceType) => onChange({ sourceType: sourceType || '' })}
          />
        </div>
      ) : sources.length > 0 && (
        <fieldset role="presentation">
          <legend>来源单据</legend>
          <MobileFilterChoices
            label="来源单据"
            value={options.sourceType || ''}
            options={sourceOptions}
            onChange={(sourceType) => onChange({ sourceType: sourceType || '' })}
          />
        </fieldset>
      )}
    </>
  )
}
