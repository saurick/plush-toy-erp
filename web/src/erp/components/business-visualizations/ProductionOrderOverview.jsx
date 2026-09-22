import React, { useMemo, useState } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { buildProductionOrderOverviewModel } from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'

const INITIAL_VISIBLE_ROWS = 12

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
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS)
  const model = useMemo(
    () => buildProductionOrderOverviewModel(orders),
    [orders]
  )
  const rows = model.rows.slice(0, visibleCount)

  return (
    <BusinessVisualizationFrame
      className="erp-production-overview"
      switcher={switcher}
      title="生产总览"
      metrics={[
        {
          key: 'active',
          label: '生产中',
          value: model.counts.active,
        },
        {
          key: 'overdue',
          label: '计划逾期',
          value: model.counts.overdue,
          tone: 'danger',
        },
        {
          key: 'due-soon',
          label: '7 天内结束',
          value: model.counts.dueSoon,
          tone: 'warning',
        },
        {
          key: 'unscheduled',
          label: '未排结束日',
          value: model.counts.unscheduled,
          tone: model.counts.unscheduled > 0 ? 'warning' : 'success',
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
          {model.rows.length > rows.length ? (
            <Button
              type="text"
              className="erp-business-visual-more"
              onClick={() => setVisibleCount((count) => count + 20)}
            >
              再显示 {Math.min(20, model.rows.length - rows.length)} 条
            </Button>
          ) : null}
        </>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
