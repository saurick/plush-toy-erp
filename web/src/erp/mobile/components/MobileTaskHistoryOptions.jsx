import React, { useCallback, useState } from 'react'
import { Button, Calendar } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import MobileFilterPopover from './MobileFilterPopover.jsx'
import WorkflowTaskDiscoveryFilters from '../../components/workflow/WorkflowTaskDiscoveryFilters.jsx'
import { taskDiscoveryFilterLabels } from '../../utils/workflowTaskDiscovery.mjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  WORKFLOW_HISTORY_PERIOD_OPTIONS,
  WORKFLOW_HISTORY_STATUS_OPTIONS,
} from '../../utils/workflowRoleTaskHistory.mjs'
import './mobileTaskHistoryOptions.css'

function renderCalendarHeader({ value, onChange }) {
  return (
    <div className="mobile-history-calendar-month">
      <Button
        aria-label="上个月"
        icon={<LeftOutlined />}
        onClick={() => onChange(value.subtract(1, 'month'))}
      />
      <span>{value.format('YYYY 年 M 月')}</span>
      <Button
        aria-label="下个月"
        icon={<RightOutlined />}
        onClick={() => onChange(value.add(1, 'month'))}
      />
    </div>
  )
}

export default function MobileTaskHistoryOptions({ options, onChange, profile, roleKey }) {
  const { period = '', dateFrom = '', dateTo = '', statusKey = '' } = options
  const [open, setOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [month, setMonth] = useState(() =>
    dayjs(dateFrom || currentBusinessDate())
  )
  const renderCalendarDay = useCallback(
    (date) => {
      const value = date.format('YYYY-MM-DD')
      const selected = startDate
        ? value === startDate
        : period === 'custom' && value >= dateFrom && value <= dateTo
      return (
        <div
          className="mobile-history-calendar-day"
          data-selected={Boolean(selected)}
        >
          {date.date()}
        </div>
      )
    },
    [dateFrom, dateTo, period, startDate]
  )
  const selectDate = (date, { source }) => {
    if (source !== 'date') return
    const value = date.format('YYYY-MM-DD')
    if (!startDate || value < startDate) {
      setStartDate(value)
      return
    }
    onChange({ period: 'custom', dateFrom: startDate, dateTo: value })
    setStartDate('')
    setCalendarOpen(false)
  }

  return (
    <MobileFilterPopover
      contextLabel="已办"
      title="已办筛选"
      open={open}
      onOpenChange={setOpen}
      count={Number(Boolean(period)) + Number(Boolean(statusKey)) + taskDiscoveryFilterLabels(options).length}
      testId="mobile-history-filter-trigger"
      onReset={() => {
        setCalendarOpen(false)
        setStartDate('')
        onChange({ period: '', dateFrom: '', dateTo: '', statusKey: '', moduleKey: '', chainKey: '', stageKey: '', assignee: '' })
      }}
    >
      <fieldset>
        <legend>处理时间</legend>
        <SlidingSegmented
          block
          aria-label="处理时间筛选"
          options={WORKFLOW_HISTORY_PERIOD_OPTIONS}
          value={period === 'custom' ? null : period}
          onChange={(value) => {
            setCalendarOpen(false)
            setStartDate('')
            onChange({ period: value, dateFrom: '', dateTo: '' })
          }}
        />
        <Button
          block
          className="mobile-history-custom-date"
          aria-expanded={calendarOpen}
          onClick={() => {
            setStartDate('')
            setMonth(dayjs(dateFrom || currentBusinessDate()))
            setCalendarOpen(!calendarOpen)
          }}
        >
          {period === 'custom' ? `${dateFrom} 至 ${dateTo}` : '自定义日期'}
        </Button>
        {calendarOpen && (
          <div
            className="mobile-history-calendar"
            aria-label="选择处理日期范围"
          >
            <p role="status">
              {startDate ? `${startDate} 起，请选择结束日期` : '请选择开始日期'}
            </p>
            <Calendar
              fullscreen={false}
              value={month}
              onPanelChange={setMonth}
              onSelect={selectDate}
              headerRender={renderCalendarHeader}
              fullCellRender={renderCalendarDay}
            />
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>处理结果</legend>
        <SlidingSegmented
          block
          aria-label="处理结果筛选"
          value={statusKey}
          options={WORKFLOW_HISTORY_STATUS_OPTIONS}
          onChange={(value) => onChange({ statusKey: value })}
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
