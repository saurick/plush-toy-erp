import React, { useContext, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import { dateFilterPresets, formatFilterDateRange } from '../../utils/filterDateRange.mjs'
import { BusinessFilterPanelContext } from './BusinessFilterPanelContext.mjs'
import FilterDateRangePicker, { DateRangePanel, DateRangeTrigger } from './FilterDateRangePicker.jsx'

export default function DateRangeFilter({
  options = [], value, startValue = '', endValue = '', onRangeChange, shortcutFilter,
  required = false, allowManual = true, allowPartial = !required,
}) {
  const panel = useContext(BusinessFilterPanelContext)
  const id = useId()
  const triggerRef = useRef(null)
  const dateType = options.find((option) => option.value === value) || options[0]
  const field = dateType?.value
  const label = dateType?.label || '日期范围'
  const range = { dateFrom: startValue, dateTo: endValue }
  const exclusive = Boolean(shortcutFilter?.exclusive)
  const shortcuts = shortcutFilter?.options || []
  const shortcut = shortcuts.find((option) => option.value === shortcutFilter?.value)
  const periods = exclusive ? [] : dateFilterPresets(options.some(({ upcoming }) => upcoming))
    .filter(({ value: period }) => !required || period)
    .map((preset) => ({ ...preset, label: preset.value ? preset.label : '不限', upcoming: preset.value === 'next7d' }))
  const appliedPreset = shortcut || periods.find((preset) => (
    (!preset.upcoming || dateType?.upcoming) && preset.from === startValue && preset.to === endValue
  ))
  const caption = appliedPreset?.label || formatFilterDateRange(range, required ? '请选择期间' : '不限')
  const dialogLabel = '选择日期范围'
  const emptyShortcut = shortcutFilter?.emptyValue ?? ''
  const apply = ({ dateFrom, dateTo }, nextField) => {
    if (shortcut || dateFrom !== startValue || dateTo !== endValue || nextField !== field) {
      onRangeChange(dateFrom, dateTo, nextField)
    }
  }
  const editor = {
    field,
    fields: options,
    range,
    title: options.length > 1 ? '日期范围' : label,
    presets: [...shortcuts, ...periods],
    selectedPreset: appliedPreset?.value,
    allowManual,
    allowPartial,
    onApply: apply,
    onPreset: (preset, nextField) => {
      if (shortcuts.includes(preset)) {
        if (preset !== shortcut) shortcutFilter.onChange(preset.value)
        return
      }
      apply({ dateFrom: preset.from, dateTo: preset.to }, nextField)
    },
  }
  const active = exclusive && shortcut
    ? shortcut.value !== emptyShortcut
    : Boolean(startValue || endValue || (shortcut && shortcut.value !== emptyShortcut))
  const clearAction = required ? undefined : {
    label: `清除${label}`,
    visible: active,
    onClick: () => {
      if (exclusive) shortcutFilter.onChange(emptyShortcut)
      else onRangeChange('', '', field)
    },
  }
  const editing = panel?.detail?.key === id
  return (
    <FilterField label={panel && dateType ? `日期范围 · ${label}` : '日期范围'} className="erp-business-filter-control erp-business-date-range-filter">
      {panel ? (
        <DateRangeTrigger
          ref={triggerRef}
          label={label}
          caption={caption}
          drillIn
          active={active}
          clearAction={clearAction}
          aria-expanded={editing}
          aria-controls={editing ? panel.panelRef.current.id : undefined}
          onClick={() => panel.openDetail(id, dialogLabel, triggerRef.current)}
        />
      ) : (
        <FilterDateRangePicker label={label} caption={caption} active={active} clearAction={clearAction} dialogLabel={dialogLabel} editor={editor} />
      )}
      {editing && createPortal(
        <DateRangePanel
          {...editor}
          onBack={panel.closeDetail}
          onCancel={panel.closeDetail}
          onPreset={(...args) => { editor.onPreset(...args); panel.closeDetail() }}
          onApply={(...args) => { editor.onApply(...args); panel.closeDetail() }}
        />,
        panel.panelRef.current,
      )}
    </FilterField>
  )
}
