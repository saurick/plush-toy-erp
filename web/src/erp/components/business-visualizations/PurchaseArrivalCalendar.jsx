import React, { useEffect, useMemo, useState } from 'react'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  buildPurchaseArrivalModel,
  moveMonthKey,
  normalizeMonthKey,
} from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export default function PurchaseArrivalCalendar({
  orders,
  loading,
  error,
  onRetry,
  onOpen,
  switcher,
}) {
  const today = currentBusinessDate()
  const [monthKey, setMonthKey] = useState(() => normalizeMonthKey('', today))
  const [selectedDate, setSelectedDate] = useState(today)
  const model = useMemo(
    () => buildPurchaseArrivalModel(orders, { monthKey, today }),
    [monthKey, orders, today]
  )
  useEffect(() => {
    if (selectedDate === 'unscheduled') return
    if (!selectedDate.startsWith(monthKey)) {
      setSelectedDate(`${monthKey}-01`)
    }
  }, [monthKey, selectedDate])
  const selectedItems =
    model.days.find((day) => day.dateKey === selectedDate)?.items || []

  return (
    <BusinessVisualizationFrame
      className="erp-purchase-arrival-visual"
      switcher={switcher}
      title="采购到货日历"
      metrics={[
        {
          key: 'overdue',
          label: '已逾期',
          value: model.counts.overdue,
          tone: 'danger',
        },
        {
          key: 'due-soon',
          label: '7 天内',
          value: model.counts.dueSoon,
          tone: 'warning',
        },
        {
          key: 'confirmed',
          label: '已确认日期',
          value: model.counts.confirmed,
          tone: 'success',
        },
        {
          key: 'unscheduled',
          label: '未填日期',
          value: model.counts.unscheduled,
        },
      ]}
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && model.rows.length === 0}
        onRetry={onRetry}
      />
      {!loading && !error && model.rows.length > 0 ? (
        <div className="erp-arrival-calendar-layout">
          <div className="erp-arrival-calendar">
            <div className="erp-arrival-calendar__toolbar">
              <Button
                type="text"
                aria-label="上一个月"
                icon={<LeftOutlined aria-hidden="true" />}
                onClick={() => setMonthKey((value) => moveMonthKey(value, -1))}
              />
              <strong>{model.monthLabel}</strong>
              <Button
                type="text"
                aria-label="下一个月"
                icon={<RightOutlined aria-hidden="true" />}
                onClick={() => setMonthKey((value) => moveMonthKey(value, 1))}
              />
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setMonthKey(normalizeMonthKey('', today))
                  setSelectedDate(today)
                }}
              >
                今天
              </Button>
            </div>
            <div className="erp-arrival-calendar__weekdays" aria-hidden="true">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>周{weekday}</span>
              ))}
            </div>
            <div className="erp-arrival-calendar__days">
              {model.days.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  aria-label={`${day.dateKey}，${day.items.length} 张采购订单`}
                  className={[
                    'erp-arrival-calendar__day',
                    day.inMonth ? '' : 'erp-arrival-calendar__day--muted',
                    day.dateKey === today
                      ? 'erp-arrival-calendar__day--today'
                      : '',
                    day.dateKey === selectedDate
                      ? 'erp-arrival-calendar__day--selected'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedDate(day.dateKey)}
                >
                  <span className="erp-arrival-calendar__day-number">
                    {day.day}
                  </span>
                  {day.items.length > 0 ? (
                    <strong>{day.items.length} 单</strong>
                  ) : null}
                  <span className="erp-arrival-calendar__markers">
                    {[...new Set(day.items.map((item) => item.status.key))]
                      .slice(0, 3)
                      .map((status) => (
                        <i key={status} data-status={status} />
                      ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <aside className="erp-arrival-calendar__detail">
            <div className="erp-arrival-calendar__detail-head">
              <div>
                <strong>{selectedDate}</strong>
                <span className="erp-arrival-calendar__detail-count">
                  {selectedDate === 'unscheduled'
                    ? model.unscheduled.length
                    : selectedItems.length}{' '}
                  张订单
                </span>
              </div>
              {model.unscheduled.length > 0 ? (
                <button
                  type="button"
                  className="erp-arrival-calendar__unscheduled"
                  onClick={() => setSelectedDate('unscheduled')}
                >
                  未填日期 {model.unscheduled.length}
                </button>
              ) : null}
            </div>
            <div className="erp-arrival-calendar__orders">
              {(selectedDate === 'unscheduled'
                ? model.unscheduled
                : selectedItems
              ).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="erp-arrival-calendar__order"
                  onClick={() => onOpen?.(order)}
                >
                  <span className="erp-arrival-calendar__order-identity">
                    <strong>{order.orderNo}</strong>
                    <small>{order.supplierName}</small>
                  </span>
                  <span
                    className={`erp-business-visual-status erp-business-visual-status--${order.status.key}`}
                  >
                    {order.status.label}
                  </span>
                  <small className="erp-arrival-calendar__order-source">
                    {order.dateSource === 'confirmed'
                      ? '供应商确认日期'
                      : order.dateSource === 'expected'
                        ? '预计到货日期'
                        : '请补充到货日期'}
                  </small>
                </button>
              ))}
              {(selectedDate === 'unscheduled'
                ? model.unscheduled
                : selectedItems
              ).length === 0 ? (
                <p className="erp-arrival-calendar__empty">当天没有到货安排</p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
