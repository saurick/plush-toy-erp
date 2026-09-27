import React, { useMemo } from 'react'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, DatePicker, Select } from 'antd'
import dayjs from 'dayjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  buildPurchaseArrivalModel,
  moveBusinessDate,
  paginateVisualizationRows,
} from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationPagination,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'

export default function PurchaseArrivalCalendar({
  orders,
  loading,
  error,
  onRetry,
  onOpen,
  switcher,
  viewState = {},
  onViewStateChange,
}) {
  const today = currentBusinessDate()
  const startDate = viewState.startDate || today
  const filter = viewState.filter || 'period'
  const confirmation = viewState.confirmation || 'all'
  const change = (patch) =>
    onViewStateChange?.({ ...viewState, page: 1, ...patch })
  const model = useMemo(
    () => buildPurchaseArrivalModel(orders, { startDate, today }),
    [orders, startDate, today]
  )
  const filtered = model.rows.filter((row) => {
    if (confirmation === 'confirmed' && !row.confirmedDate) return false
    if (confirmation === 'unconfirmed' && row.confirmedDate) return false
    if (filter === 'all') return true
    if (filter === 'date') {
      return (
        row.arrivalDate === viewState.selectedDate &&
        !['closed', 'cancelled'].includes(row.status.key)
      )
    }
    if (filter === 'period') {
      return (
        row.arrivalDate >= model.startDate &&
        row.arrivalDate <= model.endDate &&
        !['closed', 'cancelled'].includes(row.status.key)
      )
    }
    return row.status.key === filter
  })
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const selectionLabel =
    filter === 'date'
      ? viewState.selectedDate
      : {
          all: '全部到货安排',
          period: '当前 14 天',
          overdue: '已逾期',
          dueSoon: '7 天内到货',
          unscheduled: '未填日期',
        }[filter]
  const movePeriod = (delta) =>
    change({
      startDate: moveBusinessDate(startDate, delta),
      filter: 'period',
      selectedDate: '',
    })
  return (
    <BusinessVisualizationFrame
      className="erp-purchase-arrival-visual"
      switcher={switcher}
      title="采购到货计划"
      loading={loading}
      error={error}
      metrics={[
        { key: 'all', label: '全部', value: model.counts.total },
        {
          key: 'overdue',
          label: '已逾期',
          value: model.counts.overdue,
          tone: 'danger',
        },
        {
          key: 'dueSoon',
          label: '7 天内',
          value: model.counts.dueSoon,
          tone: 'warning',
        },
        {
          key: 'unscheduled',
          label: '未填日期',
          value: model.counts.unscheduled,
        },
      ].map((metric) => ({
        ...metric,
        selected: filter === metric.key,
        onClick: () => change({ filter: metric.key, selectedDate: '' }),
      }))}
    >
      <div className="erp-arrival-calendar__toolbar">
        <Button
          aria-label="前 14 天"
          icon={<LeftOutlined aria-hidden="true" />}
          onClick={() => movePeriod(-14)}
        />
        <strong>
          {model.startDate} — {model.endDate}
        </strong>
        <Button
          aria-label="后 14 天"
          icon={<RightOutlined aria-hidden="true" />}
          onClick={() => movePeriod(14)}
        />
        <Button
          onClick={() =>
            change({ startDate: today, filter: 'period', selectedDate: '' })
          }
        >
          今天
        </Button>
        <DatePicker
          aria-label="跳转到货日期"
          placeholder="跳转日期"
          value={viewState.selectedDate ? dayjs(viewState.selectedDate) : null}
          onChange={(_date, date) =>
            change(
              date
                ? { startDate: date, selectedDate: date, filter: 'date' }
                : { selectedDate: '', filter: 'period' }
            )
          }
        />
        <Select
          aria-label="到货日期确认状态"
          value={confirmation}
          onChange={(value) => change({ confirmation: value })}
          options={[
            { value: 'all', label: '全部确认状态' },
            { value: 'confirmed', label: '供应商已确认' },
            { value: 'unconfirmed', label: '待供应商确认' },
          ]}
        />
      </div>
      <VisualizationState loading={loading} error={error} onRetry={onRetry} />
      {!loading && !error ? (
        <>
          <div
            className="erp-arrival-calendar__days"
            aria-label="14 天到货安排"
          >
            {model.days.map((day) => {
              const count = day.items.filter(
                (row) =>
                  !['closed', 'cancelled'].includes(row.status.key) &&
                  (confirmation === 'all' ||
                    (confirmation === 'confirmed'
                      ? row.confirmedDate
                      : !row.confirmedDate))
              ).length
              return (
                <button
                  key={day.dateKey}
                  type="button"
                  aria-label={`${day.dateKey}，${count} 张采购订单`}
                  aria-current={day.dateKey === today ? 'date' : undefined}
                  aria-pressed={
                    filter === 'date' && day.dateKey === viewState.selectedDate
                  }
                  className={[
                    'erp-arrival-calendar__day',
                    day.dateKey === today
                      ? 'erp-arrival-calendar__day--today'
                      : '',
                    filter === 'date' && day.dateKey === viewState.selectedDate
                      ? 'erp-arrival-calendar__day--selected'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() =>
                    change({ selectedDate: day.dateKey, filter: 'date' })
                  }
                >
                  <span className="erp-arrival-calendar__day-label">
                    <span className="erp-arrival-calendar__day-number">
                      <span className="erp-arrival-calendar__day-month">
                        {dayjs(day.dateKey).format('MM-')}
                      </span>
                      {dayjs(day.dateKey).format('DD')}
                    </span>
                    <small>
                      周{'日一二三四五六'[dayjs(day.dateKey).day()]}
                    </small>
                  </span>
                  <strong>{count} 单</strong>
                </button>
              )
            })}
          </div>
          <div className="erp-arrival-calendar__detail">
            <div className="erp-arrival-calendar__detail-head">
              <strong>{selectionLabel}</strong>
              <span>{filtered.length} 张订单</span>
            </div>
            <VisualizationState empty={filtered.length === 0} />
            <div className="erp-arrival-calendar__orders">
              {pagination.rows.map((order) => (
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
                    {order.arrivalDate || '未填日期'} ·{' '}
                    {order.dateSource === 'confirmed'
                      ? '供应商确认日期'
                      : order.dateSource === 'expected'
                        ? '预计到货日期'
                        : '请补充到货日期'}
                  </small>
                </button>
              ))}
            </div>
            <VisualizationPagination
              pagination={pagination}
              onChange={(page) => change({ page })}
            />
          </div>
        </>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
