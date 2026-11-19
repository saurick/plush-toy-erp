import React, { useState } from 'react'
import { Button } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  isCompleteDateRange,
  selectDateRangeDay,
} from '../../utils/filterDateRange.mjs'
import BusinessModal from './BusinessModal.jsx'
import './filterDateRangePicker.css'

const weekdays = ['一', '二', '三', '四', '五', '六', '日']

export function FilterDateRangeSelection({ draft }) {
  const { dateFrom, dateTo } = draft
  return (
    <div className="erp-filter-date-selection" role="status" aria-live="polite">
      {dateTo
        ? `${dateFrom} 至 ${dateTo}`
        : dateFrom
          ? `${dateFrom} 起，请选择结束日期`
          : '请选择开始日期'}
    </div>
  )
}

function DateRangeMonth({ month, draft, onSelect, paired, today, previous = false }) {
  const first = month.subtract((month.day() + 6) % 7, 'day')
  const label = paired ? month.format('YYYY 年 M 月') : '选择日期范围'
  return (
    <div className={previous ? 'erp-filter-date-calendar__previous' : undefined}>
      <div className="erp-filter-date-week" aria-hidden="true">
        {weekdays.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="erp-filter-date-days" role="group" aria-label={label}>
        {Array.from({ length: 42 }, (_, index) => {
          const day = first.add(index, 'day')
          const value = day.format('YYYY-MM-DD')
          const outside = day.month() !== month.month()
          if (paired && outside) return <span key={value} aria-hidden="true" />
          return (
            <button
              key={value}
              type="button"
              aria-label={value}
              aria-current={paired && value === today ? 'date' : undefined}
              aria-pressed={value === draft.dateFrom || value === draft.dateTo}
              data-in-range={value > draft.dateFrom && value < draft.dateTo}
              data-other-month={outside}
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

export function FilterDateRangeCalendar({ draft, setDraft, paired = false }) {
  const today = currentBusinessDate()
  // 窄窗收起左侧月份时，右侧仍可看到已选结束日期。
  const [month, setMonth] = useState(() =>
    dayjs((paired ? draft.dateTo : draft.dateFrom) || today).startOf('month')
  )
  const previous = paired ? month.subtract(1, 'month') : null
  const monthProps = {
    draft,
    paired,
    today,
    onSelect: (value) => setDraft((current) => selectDateRangeDay(current, value)),
  }
  return (
    <div className={paired ? 'erp-filter-date-calendar--paired' : undefined}>
      <div className="erp-filter-date-month">
        <Button
          aria-label="上个月"
          icon={<LeftOutlined />}
          onClick={() => setMonth((current) => current.subtract(1, 'month'))}
        />
        <div className="erp-filter-date-calendar__headings" aria-live="polite">
          {previous && <strong className="erp-filter-date-calendar__previous">{previous.format('YYYY 年 M 月')}</strong>}
          <strong>{month.format('YYYY 年 M 月')}</strong>
        </div>
        <Button
          aria-label="下个月"
          icon={<RightOutlined />}
          onClick={() => setMonth((current) => current.add(1, 'month'))}
        />
      </div>
      <div className="erp-filter-date-calendar__months">
        {previous && <DateRangeMonth month={previous} previous {...monthProps} />}
        <DateRangeMonth month={month} {...monthProps} />
      </div>
    </div>
  )
}

// Mounted only while open so every visit starts from the committed range.
export default function FilterDateRangePicker({
  title,
  dateFrom = '',
  dateTo = '',
  onApply,
  onCancel,
}) {
  const initial = isCompleteDateRange({ dateFrom, dateTo })
    ? { dateFrom, dateTo }
    : { dateFrom: '', dateTo: '' }
  const [draft, setDraft] = useState(initial)
  const complete = isCompleteDateRange(draft)
  return (
    <BusinessModal
      open
      centered
      width={420}
      title={title}
      className="erp-filter-date-dialog erp-mobile-controls"
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="apply"
          type="primary"
          disabled={!complete}
          onClick={() => onApply(draft)}
        >
          应用日期
        </Button>,
      ]}
    >
      <FilterDateRangeSelection draft={draft} />
      <FilterDateRangeCalendar draft={draft} setDraft={setDraft} />
      <p className="erp-filter-date-hint">
        先选开始日期，再选结束日期；可选择同一天。选完后点击“应用日期”。
      </p>
    </BusinessModal>
  )
}
