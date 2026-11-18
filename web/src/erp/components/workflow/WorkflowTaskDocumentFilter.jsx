import React, { useId } from 'react'
import FilterField from '../../../common/components/navigation/FilterField.jsx'
import FilterChipGroup from '../../../common/components/navigation/FilterChipGroup.jsx'
import SlidingTabList from '../../../common/components/navigation/SlidingTabList.jsx'
import { businessDocumentSectionOptions, getBusinessDocumentSectionKey } from '../../config/businessModules.mjs'
import './workflowTaskDocumentFilter.css'

const allSections = businessDocumentSectionOptions()

export default function WorkflowTaskDocumentFilter({ section = 'all', value = 'all', options = [], onChange }) {
  const panelId = useId()
  const availableSections = new Set(options.map(({ value: source }) => getBusinessDocumentSectionKey(source)))
  const sections = [
    { value: 'all', label: '全部模块' },
    ...allSections.filter(({ value: key }) => availableSections.has(key) || key === section),
  ]
  const types = options.filter(({ value: source }) => source !== 'all' && (section === 'all' || getBusinessDocumentSectionKey(source) === section))
  return (
    <FilterField label="单据类型" className="workflow-task-document-filter erp-business-filter-field--choices">
      <SlidingTabList className="erp-navigation-tabs erp-navigation-tabs--options workflow-task-document-filter__modules" aria-label="单据所属业务模块">
        {sections.map((item) => (
          <button
            key={item.value}
            id={`${panelId}-${item.value}`}
            type="button"
            role="tab"
            aria-controls={panelId}
            aria-selected={item.value === section}
            onClick={() => {
              if (item.value !== section) onChange({ sourceSection: item.value, sourceType: 'all' })
            }}
          >
            {item.label}
          </button>
        ))}
      </SlidingTabList>
      <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${section}`} className="workflow-task-document-filter__types">
        <FilterChipGroup
          aria-label="单据类型"
          options={types}
          value={value}
          allowClear
          emptyValue="all"
          onChange={(sourceType) => onChange({ sourceSection: sourceType === 'all' ? section : getBusinessDocumentSectionKey(sourceType) || 'all', sourceType })}
        />
      </div>
    </FilterField>
  )
}
