import React, { useId, useRef, useState } from 'react'
import { CheckOutlined } from '@ant-design/icons'
import AnchoredControlPopover, { FilterPopoverButton } from '@/common/components/overlay/AnchoredControlPopover.jsx'
import FilterPopoverPanel from '@/common/components/overlay/FilterPopoverPanel.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import {
  handleFilterPanelTab,
  useFilterPopoverMaxHeight,
} from '@/erp/components/business-list/BusinessFilterPopoverContent.jsx'
import { WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import { TASK_HANDLING_FILTERS } from '../../config/devTaskHandling.mjs'

export default function TaskHandlingFilters({ values, onChange, onClear }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const maxHeight = useFilterPopoverMaxHeight(open, triggerRef)
  const selected = TASK_HANDLING_FILTERS
    .map(({ key, options }) => options.find(({ value }) => value === values[key])?.label)
    .filter(Boolean)
  const summary = selected.join(' · ')

  const dismiss = () => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }
  const closeOnEscape = (event) => {
    if (!open || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    dismiss()
  }
  const closeOnBlur = ({ relatedTarget }) => {
    if (open && relatedTarget && relatedTarget !== triggerRef.current && !panelRef.current?.contains(relatedTarget)) {
      setOpen(false)
    }
  }

  return (
    <WorkbenchToolbar>
      <AnchoredControlPopover
        trigger="click"
        placement="bottomLeft"
        open={open}
        onOpenChange={setOpen}
        afterOpenChange={(visible) => {
          const panel = panelRef.current
          if (visible && open && panel && !panel.contains(document.activeElement)) {
            panel.focus({ preventScroll: true })
          }
        }}
        destroyOnHidden
        content={(
          <section
            id={panelId}
            ref={panelRef}
            className="erp-dev-task-filter-panel"
            style={{ '--erp-filter-available-height': maxHeight && `${maxHeight}px` }}
            role="dialog"
            aria-label="筛选条件"
            tabIndex={-1}
            onKeyDownCapture={(event) => {
              closeOnEscape(event)
              if (!event.defaultPrevented) handleFilterPanelTab(event)
            }}
            onBlur={closeOnBlur}
          >
            <FilterPopoverPanel
              panelRef={panelRef}
              fieldsClassName="erp-dev-task-filter-panel__groups"
              onClear={onClear}
              clearDisabled={selected.length === 0}
              onDismiss={dismiss}
            >
              {TASK_HANDLING_FILTERS.map(({ key, label, options }) => (
                <FilterChipGroup
                  key={key}
                  label={label}
                  options={options}
                  value={values[key]}
                  onChange={(value) => onChange(key, value)}
                  selectedIndicator={<CheckOutlined aria-hidden="true" />}
                  allowClear
                />
              ))}
            </FilterPopoverPanel>
          </section>
        )}
      >
        <FilterPopoverButton
          ref={triggerRef}
          count={selected.length}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-describedby={summary ? `${panelId}-summary` : undefined}
          onKeyDown={closeOnEscape}
          onBlur={closeOnBlur}
        />
      </AnchoredControlPopover>
      {summary && <span id={`${panelId}-summary`} className="erp-dev-task-filter-summary">{summary}</span>}
    </WorkbenchToolbar>
  )
}
