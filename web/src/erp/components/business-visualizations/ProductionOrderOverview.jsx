import React, { useMemo } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import {
  buildProductionOrderOverviewModel,
  paginateVisualizationRows,
} from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
  VisualizationPagination,
} from './BusinessVisualizationFrame.jsx'

function scheduleText(row) {
  if (!row.plannedStartDate && !row.plannedEndDate) return '计划日期未填写'
  return `${row.plannedStartDate || '未填开始'} → ${row.plannedEndDate || '未填结束'}`
}

export default function ProductionOrderOverview({
  orders,
  loading,
  error,
  onRetry,
  onOpen,
  onShowProcess,
  onFilterStatus,
  switcher,
  viewState = {},
  onViewStateChange,
}) {
  const model = useMemo(
    () => buildProductionOrderOverviewModel(orders),
    [orders]
  )
  const filter = viewState.filter || 'all'
  const filtered = model.rows.filter(
    (row) =>
      filter === 'all' ||
      (filter === 'active'
        ? row.orderStatus === 'RELEASED'
        : row.scheduleStatus.key === filter)
  )
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const { rows } = pagination
  const changeFilter = (next) =>
    onViewStateChange?.({ ...viewState, filter: next, page: 1 })

  return (
    <BusinessVisualizationFrame
      className="erp-production-overview"
      switcher={switcher}
      title="生产总览"
      loading={loading}
      error={error}
      metrics={[
        {
          key: 'all',
          label: '全部',
          value: model.counts.total,
          tone: 'neutral',
        },
        {
          key: 'active',
          label: '生产中',
          value: model.counts.active,
          tone: 'neutral',
        },
        {
          key: 'overdue',
          label: '计划逾期',
          value: model.counts.overdue,
          tone: 'danger',
        },
        {
          key: 'dueSoon',
          label: '7 天内结束',
          value: model.counts.dueSoon,
          tone: 'warning',
        },
        {
          key: 'unscheduled',
          label: '未排结束日',
          value: model.counts.unscheduled,
          tone: 'neutral',
        },
      ].map((metric) => ({
        ...metric,
        selected: filter === metric.key,
        onClick: () => changeFilter(metric.key),
      }))}
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && filtered.length === 0}
        onRetry={onRetry}
      />
      {!loading && !error && model.rows.length > 0 ? (
        <>
          <div
            className="erp-production-overview__status-rail"
            aria-label="生产订单状态分布"
          >
            {model.statusGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                className={`erp-production-overview__status erp-production-overview__status--${group.tone}`}
                onClick={() => onFilterStatus?.(group.key)}
              >
                <span>{group.label}</span>
                <strong>{group.count}</strong>
                <i
                  aria-hidden="true"
                  style={{
                    width: `${group.count > 0 ? Math.max(8, group.percent) : 0}%`,
                  }}
                />
              </button>
            ))}
          </div>
          <div className="erp-production-overview__columns" aria-hidden="true">
            <span>生产订单</span>
            <span>计划周期</span>
            <span>当前提醒</span>
            <span>去向</span>
          </div>
          <div className="erp-production-overview__rows">
            {rows.map((row) => (
              <div className="erp-production-overview__row" key={row.id}>
                <button
                  type="button"
                  className="erp-production-overview__main"
                  onClick={() => onOpen?.(row)}
                >
                  <span className="erp-business-visual-identity">
                    <strong>{row.orderNo}</strong>
                    <small>{row.note || '查看订单与计划明细'}</small>
                  </span>
                  <span className="erp-production-overview__schedule">
                    {scheduleText(row)}
                  </span>
                  <span
                    className={`erp-business-visual-status erp-business-visual-status--${row.scheduleStatus.key}`}
                  >
                    {row.scheduleStatus.label}
                  </span>
                </button>
                <Button
                  type="link"
                  size="small"
                  icon={<ArrowRightOutlined aria-hidden="true" />}
                  iconPosition="end"
                  disabled={!['RELEASED', 'CLOSED'].includes(row.orderStatus)}
                  onClick={() => onShowProcess?.(row)}
                >
                  查看工序
                </Button>
              </div>
            ))}
          </div>
          <VisualizationPagination
            pagination={pagination}
            onChange={(page) => onViewStateChange?.({ ...viewState, page })}
          />
        </>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
