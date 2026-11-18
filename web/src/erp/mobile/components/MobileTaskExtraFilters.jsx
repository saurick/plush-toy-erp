import React from 'react'
import MobileFilterChoices from './MobileFilterChoices.jsx'
import { WORKFLOW_TASK_DUE_OPTIONS } from '../../utils/workflowTaskListFilters.mjs'
import { businessDocumentTypeOptions, getBusinessDocumentTypeKey } from '../../config/businessModules.mjs'

export default function MobileTaskExtraFilters({
  options,
  sourceTypes = [],
  history = false,
  showDue = !history,
  onChange,
}) {
  const sources = businessDocumentTypeOptions([...sourceTypes, options.sourceType])
  const sourceOptions = [{ value: '', label: '全部' }, ...sources]
  const selectedSource = getBusinessDocumentTypeKey(options.sourceType)
  return (
    <>
      {showDue && (
      <MobileFilterChoices
        label="截止时间"
        value={options.due || 'all'}
        options={WORKFLOW_TASK_DUE_OPTIONS}
        onChange={(due) => onChange({ due: due === 'all' ? '' : due })}
      />
      )}
      {sources.length > 0 && (
      <MobileFilterChoices
        label="单据类型"
        value={selectedSource}
        options={sourceOptions}
        onChange={(sourceType) => onChange({ sourceType: sourceType || '' })}
      />
      )}
    </>
  )
}
