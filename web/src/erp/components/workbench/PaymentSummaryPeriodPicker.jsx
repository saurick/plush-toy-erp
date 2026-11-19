import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CalendarOutlined, DownOutlined } from '@ant-design/icons'
import { Button, Popover } from 'antd'
import FilterChip from '@/common/components/navigation/FilterChip.jsx'
import { canRestoreOverlayFocus, useOverlayPopupAlign, useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'
import { isCompleteDateRange } from '../../utils/filterDateRange.mjs'
import { PAYMENT_SUMMARY_PERIOD_PRESETS } from '../../utils/workbenchSummary.mjs'
import { FilterDateRangeCalendar, FilterDateRangeSelection } from '../business-list/FilterDateRangePicker.jsx'
import './paymentSummaryPeriodPicker.css'

const popupAlign = { overflow: { adjustX: true, adjustY: true, shiftX: true, shiftY: true } }

function PeriodEditor({ id, panelRef, maxHeight, range, onCommit, onCancel, onEscape }) {
  const [draft, setDraft] = useState(() => ({ dateFrom: range.dateFrom, dateTo: range.dateTo }))
  const handleKey = (event) => {
    onEscape(event)
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll('button:enabled')]
      .filter((control) => control.getClientRects().length)
    const [first] = controls
    const last = controls.at(-1)
    if (event.shiftKey && (event.target === first || event.target === event.currentTarget)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  return (
    <section
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label="选择收付日期范围"
      tabIndex={-1}
      onKeyDownCapture={handleKey}
      className="erp-payment-period__panel"
      style={{ maxHeight }}
    >
      <div className="erp-filter-chip-group erp-payment-period__presets" role="group" aria-label="快捷期间">
        {PAYMENT_SUMMARY_PERIOD_PRESETS.map(({ value, label }) => (
          <FilterChip key={value} selected={value === range.period} onClick={() => onCommit(value)}>
            {label}
          </FilterChip>
        ))}
      </div>
      <div className="erp-payment-period__calendar">
        <FilterDateRangeCalendar draft={draft} setDraft={setDraft} paired />
        <footer className="erp-payment-period__footer">
          <FilterDateRangeSelection draft={draft} />
          <div className="erp-payment-period__actions">
            <Button onClick={onCancel}>取消</Button>
            <Button
              type="primary"
              disabled={!isCompleteDateRange(draft)}
              onClick={() => onCommit('custom', draft.dateFrom, draft.dateTo)}
            >
              应用日期
            </Button>
          </div>
        </footer>
      </div>
    </section>
  )
}

export default function PaymentSummaryPeriodPicker({ periodRef, range, onChange }) {
  const id = useId()
  const panelRef = useRef(null)
  const overlay = useOverlayScope()
  const align = useOverlayPopupAlign(popupAlign)
  const [open, setOpen] = useState(false)
  const [visit, setVisit] = useState(0)
  const [maxHeight, setMaxHeight] = useState()
  const pane = overlay?.enabled ? overlay.host : null
  const fitHeight = useCallback(() => {
    const anchor = periodRef.current?.getBoundingClientRect()
    if (!anchor) return
    const bounds = pane?.getBoundingClientRect()
    const top = Math.max(0, bounds?.top ?? 0)
    const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight)
    const space = Math.max(anchor.top - top, bottom - anchor.bottom)
    // 可用高度需扣除浮层内边距与触发按钮间距。
    setMaxHeight(Math.max(120, Math.floor(space - 36)))
  }, [pane, periodRef])
  useEffect(() => {
    if (!open) return undefined
    const resize = new ResizeObserver(fitHeight)
    if (pane) resize.observe(pane)
    window.addEventListener('resize', fitHeight)
    window.addEventListener('scroll', fitHeight, true)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', fitHeight)
      window.removeEventListener('scroll', fitHeight, true)
    }
  }, [fitHeight, open, pane])
  const { dateFrom, dateTo } = range
  const spansDays = range.period === 'custom' && dateFrom !== dateTo
  const caption = range.period === 'custom'
    ? (spansDays ? `${dateFrom} 至 ${dateTo}` : dateFrom)
    : PAYMENT_SUMMARY_PERIOD_PRESETS.find(({ value }) => value === range.period).label
  const changeOpen = (next) => {
    if (next) {
      fitHeight()
      setVisit((current) => current + 1)
    }
    setOpen(next)
  }
  const close = () => {
    setOpen(false)
    if (canRestoreOverlayFocus(overlay)) periodRef.current?.focus({ preventScroll: true })
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
      onOpenChange={changeOpen}
      afterOpenChange={(visible) => {
        if (visible && [periodRef.current, document.body].includes(document.activeElement)) {
          panelRef.current?.focus({ preventScroll: true })
        }
      }}
      trigger="click"
      placement="bottomLeft"
      align={align}
      arrow={false}
      destroyOnHidden
      classNames={{ root: 'erp-payment-period-popover' }}
      content={
        <PeriodEditor
          key={visit}
          id={id}
          panelRef={panelRef}
          maxHeight={maxHeight}
          range={range}
          onCancel={close}
          onEscape={escape}
          onCommit={(...values) => {
            onChange(...values)
            close()
          }}
        />
      }
    >
      <Button
        ref={periodRef}
        className="erp-payment-period__trigger"
        aria-label={`统计期间：${caption}`}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        onKeyDown={escape}
        icon={<CalendarOutlined aria-hidden="true" />}
      >
        <span className="erp-payment-period__label">统计期间</span>
        <span className="erp-payment-period__value">
          {spansDays ? <><span>{dateFrom}</span> 至 <span>{dateTo}</span></> : caption}
        </span>
        <DownOutlined aria-hidden="true" />
      </Button>
    </Popover>
  )
}
