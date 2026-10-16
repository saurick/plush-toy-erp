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
  const [month, setMonth] = useState(() =>
    dayjs(initial.dateFrom || currentBusinessDate()).startOf('month')
  )
  const first = month.subtract((month.day() + 6) % 7, 'day')
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
      <div
        className="erp-filter-date-selection"
        role="status"
        aria-live="polite"
      >
        {complete
          ? `${draft.dateFrom} 至 ${draft.dateTo}`
          : draft.dateFrom
            ? `${draft.dateFrom} 起，请选择结束日期`
            : '请选择开始日期'}
      </div>
      <div className="erp-filter-date-month">
        <Button
          aria-label="上个月"
          icon={<LeftOutlined />}
          onClick={() => setMonth(month.subtract(1, 'month'))}
        />
        <strong>{month.format('YYYY 年 M 月')}</strong>
        <Button
          aria-label="下个月"
          icon={<RightOutlined />}
          onClick={() => setMonth(month.add(1, 'month'))}
        />
      </div>
      <div className="erp-filter-date-week" aria-hidden="true">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div
        className="erp-filter-date-days"
        role="group"
        aria-label="选择日期范围"
      >
        {Array.from({ length: 42 }, (_, index) => {
          const day = first.add(index, 'day')
          const value = day.format('YYYY-MM-DD')
          const selected = value === draft.dateFrom || value === draft.dateTo
          const inRange =
            complete && value > draft.dateFrom && value < draft.dateTo
          return (
            <button
              key={value}
              type="button"
              aria-label={value}
              aria-pressed={selected}
              data-in-range={inRange}
              data-other-month={day.month() !== month.month()}
              onClick={() =>
                setDraft((current) => selectDateRangeDay(current, value))
              }
            >
              {day.date()}
            </button>
          )
        })}
      </div>
      <p className="erp-filter-date-hint">
        先选开始日期，再选结束日期；可选择同一天。选完后点击“应用日期”。
      </p>
    </BusinessModal>
  )
}
