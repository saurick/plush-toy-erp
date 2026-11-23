import React, { useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Button, Input, Popover, Tooltip } from 'antd'
import { CalendarOutlined, CloseCircleFilled, DownOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import FilterChip from '@/common/components/navigation/FilterChip.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import { canRestoreOverlayFocus, useOverlayPopupAlign, useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import { DATE_INPUT_VALUE_FORMAT, isDateInputRangeReversed, parseDateInputValue } from '../../utils/dateRange.mjs'
import { formatFilterDateRange, selectDateRangeDay } from '../../utils/filterDateRange.mjs'
import { handleFilterPanelTab, useFilterPopoverMaxHeight } from './BusinessFilterPopoverContent.jsx'
import './filterDateRangePicker.css'

const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const popupAlign = { overflow: { adjustX: true, adjustY: true, shiftX: true, shiftY: true } }

function DateRangeMonth({ month, range, onSelect, today, previous = false }) {
  const first = month.subtract((month.day() + 6) % 7, 'day')
  return (
    <div className={previous ? 'erp-filter-date-calendar__previous' : undefined}>
      <div className="erp-filter-date-week" aria-hidden="true">
        {weekdays.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="erp-filter-date-days" role="group" aria-label={month.format('YYYY 年 M 月')}>
        {Array.from({ length: 42 }, (_, index) => {
          const day = first.add(index, 'day')
          const value = day.format(DATE_INPUT_VALUE_FORMAT)
          if (day.month() !== month.month()) return <span key={value} aria-hidden="true" />
          return (
            <button
              key={value}
              type="button"
              aria-label={value}
              aria-current={value === today ? 'date' : undefined}
              aria-pressed={value === range.dateFrom || value === range.dateTo}
              data-in-range={Boolean(range.dateFrom && range.dateTo && value > range.dateFrom && value < range.dateTo)}
              onClick={() => onSelect(value)}
            >
              {day.date()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DateRangeCalendar({ month, setMonth, range, onSelect, today }) {
  const previous = month.subtract(1, 'month')
  const monthProps = { range, onSelect, today }
  return (
    <div>
      <div className="erp-filter-date-month">
        <Button aria-label="上个月" icon={<LeftOutlined />} onClick={() => setMonth((current) => current.subtract(1, 'month'))} />
        <div className="erp-filter-date-calendar__headings" aria-live="polite">
          <strong className="erp-filter-date-calendar__previous">{previous.format('YYYY 年 M 月')}</strong>
          <strong>{month.format('YYYY 年 M 月')}</strong>
        </div>
        <Button aria-label="下个月" icon={<RightOutlined />} onClick={() => setMonth((current) => current.add(1, 'month'))} />
      </div>
      <div className="erp-filter-date-calendar__months">
        <DateRangeMonth month={previous} previous {...monthProps} />
        <DateRangeMonth month={month} {...monthProps} />
      </div>
    </div>
  )
}

export function DateRangePanel({
  range, field, fields = [], title, presets = [], selectedPreset, allowManual = false, allowPartial = false,
  onPreset, onApply, onCancel, onBack,
}) {
  const today = currentBusinessDate()
  const [draftField, setDraftField] = useState(field)
  const [draft, setDraft] = useState(() => ({ ...range, awaitingEnd: false }))
  const [month, setMonth] = useState(() => (
    parseDateInputValue(range.dateTo) || parseDateInputValue(range.dateFrom) || parseDateInputValue(today)
  ).startOf('month'))
  const [manual, setManual] = useState(false)
  const fromInputRef = useRef(null)
  const manualId = useId()
  useLayoutEffect(() => {
    if (manual) fromInputRef.current?.focus({ preventScroll: true })
  }, [manual])

  const dateType = fields.find((option) => option.value === draftField)
  const from = parseDateInputValue(draft.dateFrom)
  const to = parseDateInputValue(draft.dateTo)
  const bounds = { dateFrom: from?.format(DATE_INPUT_VALUE_FORMAT) || '', dateTo: to?.format(DATE_INPUT_VALUE_FORMAT) || '' }
  const invalidFormat = Boolean((draft.dateFrom && !from) || (draft.dateTo && !to))
  const reversed = isDateInputRangeReversed(from, to)
  const issue = invalidFormat ? '请输入 YYYY-MM-DD 格式的日期' : reversed ? '结束日期不能早于开始日期' : ''
  const applyDisabled = Boolean(issue || draft.awaitingEnd || (allowPartial ? !(from || to) : !(from && to)))
  const selection = draft.awaitingEnd ? `${bounds.dateFrom} 起，请选择结束日期` : formatFilterDateRange(bounds, '请选择开始日期')

  const selectDay = (date) => {
    setDraft((current) => {
      const next = selectDateRangeDay(current.awaitingEnd ? current : {}, date)
      return { ...next, awaitingEnd: !next.dateTo }
    })
  }
  const enterDate = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value, awaitingEnd: false }))
    const parsed = parseDateInputValue(value)
    if (parsed) setMonth(parsed.startOf('month'))
  }

  return (
    <div className="erp-filter-date-panel">
      {(title || fields.length > 1) && (
        <header className="erp-filter-date-header">
          <div className="erp-filter-date-heading">
            {onBack && <Button aria-label="返回筛选" icon={<LeftOutlined />} onClick={onBack} />}
            {title && <strong>{title}</strong>}
          </div>
          {fields.length > 1 && <FilterChipGroup aria-label="日期类型" options={fields} value={draftField} onChange={setDraftField} />}
        </header>
      )}
      <div className="erp-filter-date-layout" data-presets={Boolean(presets.length)}>
        {presets.length > 0 && (
          <div className="erp-filter-chip-group erp-filter-date-presets" role="group" aria-label="快捷期间">
            {presets.map((preset) => {
              const unavailable = preset.upcoming && !dateType?.upcoming
              return (
                <FilterChip
                  key={preset.value}
                  data-unavailable={unavailable || undefined}
                  disabled={Boolean(unavailable)}
                  selected={Boolean(!unavailable && selectedPreset === preset.value)}
                  onClick={() => onPreset(preset, draftField)}
                >
                  {preset.label}
                </FilterChip>
              )
            })}
          </div>
        )}
        <div className="erp-filter-date-calendar">
          <DateRangeCalendar month={month} setMonth={setMonth} range={bounds} onSelect={selectDay} today={today} />
          {manual && (
            <div className="erp-filter-date-manual" id={manualId}>
              <label>
                开始日期
                <Input ref={fromInputRef} value={draft.dateFrom} placeholder={DATE_INPUT_VALUE_FORMAT} maxLength={10} status={issue ? 'error' : undefined} aria-invalid={Boolean(issue)} onChange={(event) => enterDate('dateFrom', event.target.value)} />
              </label>
              <label>
                结束日期
                <Input value={draft.dateTo} placeholder={DATE_INPUT_VALUE_FORMAT} maxLength={10} status={issue ? 'error' : undefined} aria-invalid={Boolean(issue)} onChange={(event) => enterDate('dateTo', event.target.value)} />
              </label>
            </div>
          )}
          <footer className="erp-filter-date-footer">
            <div className="erp-filter-date-feedback">
              <span className="erp-filter-date-selection" data-invalid={Boolean(issue)} role="status" aria-live="polite">{issue || selection}</span>
              {allowManual && <Button type="text" aria-expanded={manual} aria-controls={manual ? manualId : undefined} onClick={() => setManual((value) => !value)}>{manual ? '收起日期输入' : '输入日期'}</Button>}
            </div>
            <div className="erp-filter-date-actions">
              <Button onClick={onCancel}>取消</Button>
              <Button type="primary" disabled={applyDisabled} onClick={() => onApply(bounds, draftField)}>应用日期</Button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

export const DateRangeTrigger = React.forwardRef(({ label, caption, drillIn = false, active = false, clearAction, ...props }, ref) => {
  const trigger = useRef(null)
  useImperativeHandle(ref, () => trigger.current, [])

  return (
    <span className="erp-filter-date-control" data-drill-in={drillIn} data-clearable={Boolean(clearAction)}>
      <Button
        {...props}
        ref={trigger}
        className="erp-filter-date-trigger"
        aria-label={`${label}：${caption}`}
        aria-haspopup="dialog"
        data-active={active}
        icon={<CalendarOutlined aria-hidden="true" />}
      >
        <span className="erp-filter-date-trigger__text">
          {!drillIn && <span className="erp-filter-date-trigger__label">{label}</span>}
          <span className="erp-filter-date-trigger__value">{caption}</span>
        </span>
        <span className="erp-filter-date-trigger__arrow" aria-hidden="true">
          {drillIn ? <RightOutlined /> : <DownOutlined />}
        </span>
      </Button>
      {clearAction?.visible && (
        <Tooltip title={clearAction.label} trigger={['hover', 'focus']}>
          <Button
            className="erp-filter-date-control__clear"
            aria-label={clearAction.label}
            icon={<CloseCircleFilled aria-hidden="true" />}
            onClick={() => {
              clearAction.onClick()
              trigger.current?.focus({ preventScroll: true })
            }}
          />
        </Tooltip>
      )}
    </span>
  )
})

export default function FilterDateRangePicker({ label, caption, active, clearAction, dialogLabel, triggerRef, editor }) {
  const id = useId()
  const ownTriggerRef = useRef(null)
  const ref = triggerRef || ownTriggerRef
  const panelRef = useRef(null)
  const overlay = useOverlayScope()
  const align = useOverlayPopupAlign(popupAlign)
  const [open, setOpen] = useState(false)
  const [visit, setVisit] = useState(0)
  const maxHeight = useFilterPopoverMaxHeight(open, ref)
  const close = () => {
    setOpen(false)
    if (canRestoreOverlayFocus(overlay)) ref.current?.focus({ preventScroll: true })
  }
  const escape = (event) => {
    if (!open || event.key !== 'Escape' || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          ref.current?.focus({ preventScroll: true })
          setVisit((current) => current + 1)
        }
        setOpen(next)
      }}
      afterOpenChange={(visible) => {
        if (visible && [ref.current, document.body].includes(document.activeElement)) panelRef.current?.focus({ preventScroll: true })
      }}
      trigger="click"
      placement="bottomLeft"
      align={align}
      arrow={false}
      destroyOnHidden
      classNames={{ root: 'erp-filter-date-popover' }}
      content={
        <section
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={dialogLabel}
          tabIndex={-1}
          onKeyDownCapture={(event) => {
            escape(event)
            handleFilterPanelTab(event)
          }}
          className="erp-filter-date-popover__content"
          style={{ maxHeight }}
        >
          <DateRangePanel
            key={visit}
            {...editor}
            onCancel={close}
            onPreset={(...args) => { editor.onPreset(...args); close() }}
            onApply={(...args) => { editor.onApply(...args); close() }}
          />
        </section>
      }
    >
      <DateRangeTrigger
        ref={ref}
        label={label}
        caption={caption}
        active={active}
        clearAction={clearAction && {
          ...clearAction,
          onClick: () => {
            setOpen(false)
            clearAction.onClick()
          },
        }}
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        onKeyDown={escape}
      />
    </Popover>
  )
}
