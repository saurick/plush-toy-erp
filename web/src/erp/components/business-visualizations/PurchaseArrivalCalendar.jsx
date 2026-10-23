import React, { useMemo } from 'react'
import {
  DownloadOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Button } from 'antd'
import dayjs from 'dayjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  buildPurchaseArrivalModel,
  filterPurchaseArrivalRows,
  moveBusinessDate,
  paginateVisualizationRows,
} from '../../utils/businessVisualizationModels.mjs'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  statusText,
} from '../../utils/masterDataOrderView.mjs'
import { BusinessDataTable } from '../business-list/BusinessListLayout.jsx'
import { DateInput } from '../business-list/BusinessDateInputs.jsx'
import { downloadBusinessListCSV } from '../business-list/BusinessListToolbarActions.jsx'
import {
  BusinessVisualizationFrame,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'

const confirmationLabel = (row) =>
  row.confirmedDate ? '供应商已确认' : '待供应商确认'
const columns = [
  { title: '采购单号', dataIndex: 'orderNo', width: 190, copyable: true, render: (value) => value || '采购订单未编号' },
  { title: '供应商', dataIndex: 'supplierName', width: 200, copyable: true, render: (value) => value || '供应商未填写' },
  {
    title: '订单状态',
    dataIndex: 'lifecycleStatus',
    width: 100,
    render: (value) => statusText(value, PURCHASE_ORDER_STATUS_LABELS),
    exportValue: (row) =>
      statusText(row.lifecycleStatus, PURCHASE_ORDER_STATUS_LABELS, undefined, { emptyText: '' }),
  },
  {
    title: '到货日期',
    dataIndex: 'arrivalDate',
    width: 160,
    render: (value, row) => (
      <span className="erp-arrival-calendar__date">
        <span>{value || '未填日期'}</span>
        {row.confirmedDate &&
        row.expectedDate &&
        row.confirmedDate !== row.expectedDate ? (
          <small>原预计 {row.expectedDate}</small>
        ) : null}
      </span>
    ),
    exportValue: (row) => row.arrivalDate || '',
  },
  {
    title: '日期确认',
    key: 'confirmation',
    width: 150,
    render: (_, row) => confirmationLabel(row),
    exportValue: confirmationLabel,
  },
  {
    title: '交期提醒',
    key: 'reminder',
    width: 140,
    render: (_, row) => (
      <span
        className={`erp-business-visual-status erp-business-visual-status--${row.status.key}`}
      >
        {row.status.label}
      </span>
    ),
    exportValue: (row) => row.status.label,
  },
]

export default function PurchaseArrivalCalendar({
  orders,
  loading,
  error,
  onRetry,
  onOpen,
  onSelect,
  selectedRowKeys = [],
  selectionDisabled = false,
  onClearQuery,
  hasQueryFilters = false,
  switcher,
  viewState = {},
  onViewStateChange,
}) {
  const today = currentBusinessDate()
  const startDate = viewState.startDate || today
  const filter = viewState.filter || 'all'
  const confirmation = viewState.confirmation || 'all'
  const change = (patch) =>
    onViewStateChange?.({ ...viewState, page: 1, ...patch })
  const model = useMemo(
    () => buildPurchaseArrivalModel(orders, { startDate, today, confirmation }),
    [orders, startDate, today, confirmation]
  )
  const filtered = useMemo(
    () =>
      filterPurchaseArrivalRows(model, {
        filter,
        selectedDate: viewState.selectedDate,
      }),
    [model, filter, viewState.selectedDate]
  )
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const selectionLabel =
    filter === 'date'
      ? `${viewState.selectedDate} 到货安排`
      : {
          all: '全部到货安排',
          period: '当前 14 天',
          overdue: '已逾期',
          dueSoon: '7 天内到货',
          unscheduled: '未填日期',
        }[filter]
  const movePeriod = (delta) =>
    change({
      startDate: moveBusinessDate(model.startDate, delta),
      filter: 'period',
      selectedDate: '',
    })
  const resetPlan = () =>
    change({
      filter: 'all',
      confirmation: 'all',
      selectedDate: '',
      startDate: today,
    })
  const choose = (row) => {
    if (!selectionDisabled) onSelect?.(row)
  }
  const emptyDescription = (
    <div className="erp-arrival-calendar__empty">
      <span>
        {filter === 'date'
          ? '所选日期暂无到货安排'
          : filter === 'period'
            ? '当前 14 天暂无到货安排'
            : '当前条件暂无采购订单'}
      </span>
      <div className="erp-arrival-calendar__empty-actions">
        {filter !== 'all' || confirmation !== 'all' ? (
          <Button onClick={resetPlan}>查看全部到货安排</Button>
        ) : null}
        {hasQueryFilters ? (
          <Button
            onClick={() => {
              resetPlan()
              onClearQuery?.()
            }}
          >
            清除查询条件
          </Button>
        ) : null}
      </div>
    </div>
  )
  return (
    <BusinessVisualizationFrame
      className="erp-purchase-arrival-visual"
      switcher={switcher}
      title="采购到货计划"
      loading={loading}
      error={error}
      metricsLabel="到货安排"
      countUnit="张"
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
        { key: 'period', label: '当前 14 天', value: model.counts.period },
      ].map((metric) => ({
        ...metric,
        selected: filter === metric.key,
        onClick: () => change({ filter: metric.key, selectedDate: '' }),
      }))}
    >
      <div className="erp-arrival-calendar__toolbar">
        <div className="erp-arrival-calendar__period">
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
              change({ startDate: today, filter: 'date', selectedDate: today })
            }
          >
            今天
          </Button>
        </div>
        <div className="erp-arrival-calendar__filters">
          <div className="erp-arrival-calendar__date-jump">
            <DateInput
              aria-label="跳转到货日期"
              placeholder="跳转日期"
              value={viewState.selectedDate || ''}
              onChange={(date) =>
                change(
                  date
                    ? { startDate: date, selectedDate: date, filter: 'date' }
                    : { selectedDate: '', filter: 'period' }
                )
              }
            />
          </div>
          <FilterSelect
            emptyValue="all"
            label="到货日期确认状态"
            placeholder="到货日期确认状态"
            aria-label="到货日期确认状态"
            value={confirmation}
            onChange={(value) => change({ confirmation: value })}
            options={[
              { value: 'all', label: '全部确认状态' },
              { value: 'confirmed', label: '供应商已确认' },
              { value: 'unconfirmed', label: '待供应商确认' },
            ]}
          />
          {filter !== 'all' || confirmation !== 'all' || startDate !== today ? (
            <Button onClick={resetPlan}>重置到货筛选</Button>
          ) : null}
        </div>
      </div>
      <VisualizationState loading={loading} error={error} onRetry={onRetry} />
      {!loading && !error ? (
        <>
          <div className="erp-arrival-calendar__calendar">
            <div
              className="erp-arrival-calendar__days"
              aria-label="14 天到货安排"
            >
              {model.days.map((day) => {
                const selected =
                  filter === 'date' && day.dateKey === viewState.selectedDate
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    aria-label={`${day.dateKey}，${day.items.length} 张采购订单`}
                    aria-current={day.dateKey === today ? 'date' : undefined}
                    aria-pressed={selected}
                    className={[
                      'erp-arrival-calendar__day',
                      day.dateKey === today
                        ? 'erp-arrival-calendar__day--today'
                        : '',
                      selected ? 'erp-arrival-calendar__day--selected' : '',
                      day.items.length
                        ? ''
                        : 'erp-arrival-calendar__day--muted',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() =>
                      change(
                        selected
                          ? { selectedDate: '', filter: 'period' }
                          : { selectedDate: day.dateKey, filter: 'date' }
                      )
                    }
                  >
                    <span className="erp-arrival-calendar__day-label">
                      <span className="erp-arrival-calendar__day-number">
                        {dayjs(day.dateKey).format('MM-DD')}
                      </span>
                      <small>
                        周{'日一二三四五六'[dayjs(day.dateKey).day()]}
                      </small>
                    </span>
                    <strong>
                      {day.items.length} <small>单</small>
                    </strong>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="erp-arrival-calendar__detail">
            <div className="erp-arrival-calendar__detail-head">
              <div>
                <strong>{selectionLabel}</strong>
                <span>
                  {filtered.length} 张订单
                  {confirmation !== 'all'
                    ? ` · ${confirmation === 'confirmed' ? '供应商已确认' : '待供应商确认'}`
                    : ''}
                </span>
              </div>
              <Button
                icon={<DownloadOutlined aria-hidden="true" />}
                disabled={filtered.length === 0}
                onClick={() =>
                  downloadBusinessListCSV({
                    filename: `采购到货计划_${today}.csv`,
                    columns,
                    rows: filtered,
                  })
                }
              >
                导出当前结果
              </Button>
            </div>
            <BusinessDataTable
              rowKey="id"
              columns={columns}
              dataSource={filtered}
              rowSelection={{
                type: 'radio',
                selectedRowKeys,
                getCheckboxProps: () => ({ disabled: selectionDisabled }),
                onChange: (_, rows) => choose(rows[0]),
              }}
              rowClassName={(row) =>
                selectedRowKeys.includes(row.id) ? 'ant-table-row-selected' : ''
              }
              onRow={(row) => ({ onClick: () => choose(row) })}
              onOpenRecord={(row) => {
                if (!selectionDisabled) onOpen?.(row)
              }}
              pagination={
                filtered.length
                  ? {
                      current: pagination.page,
                      pageSize: pagination.pageSize,
                      total: pagination.total,
                      showSizeChanger: false,
                      onChange: (page) => change({ page }),
                    }
                  : false
              }
              emptyDescription={emptyDescription}
            />
            <p className="erp-arrival-calendar__note">
              按订单交期提醒，供应商确认日期优先；实际到货以收货记录为准。
            </p>
          </div>
        </>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
