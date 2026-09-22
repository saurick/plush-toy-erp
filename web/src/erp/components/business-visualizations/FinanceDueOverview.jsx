import React, { useMemo, useState } from 'react'
import { Button } from 'antd'
import { buildFinanceDueModel } from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'

const INITIAL_VISIBLE_ROWS = 12

function money(value, currency) {
  if (value === null) return '—'
  return `${currency} ${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
  }).format(value)}`
}

export default function FinanceDueOverview({
  facts,
  loading,
  error,
  onRetry,
  onOpen,
  switcher,
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS)
  const model = useMemo(() => buildFinanceDueModel(facts), [facts])
  const rows = model.rows.slice(0, visibleCount)
  return (
    <BusinessVisualizationFrame
      className="erp-finance-due-visual"
      switcher={switcher}
      title="财务到期顺序"
      metrics={[
        {
          key: 'overdue',
          label: '逾期未结',
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
          key: 'unscheduled',
          label: '未填到期日',
          value: model.counts.unscheduled,
        },
        {
          key: 'settled',
          label: '已结清',
          value: model.counts.settled,
          tone: 'success',
        },
      ]}
    >
      <VisualizationState
        loading={loading}
        error={error}
        empty={!loading && !error && model.rows.length === 0}
        onRetry={onRetry}
      />
      {!loading && !error && rows.length > 0 ? (
        <div className="erp-finance-due-list">
          {rows.map((row) => (
            <button
              type="button"
              key={row.id}
              className="erp-finance-due-list__row"
              onClick={() => onOpen?.(row)}
            >
              <span className="erp-business-visual-identity">
                <strong>{row.factNo}</strong>
                <span>
                  {row.typeLabel} · {row.sourceNo}
                </span>
              </span>
              <span className="erp-finance-due-list__amount">
                <small>到期日期</small>
                <strong>{row.dueDate || '未填写'}</strong>
              </span>
              <span className="erp-finance-due-list__amount">
                <small>原金额</small>
                <strong>{money(row.amount, row.currency)}</strong>
              </span>
              <span className="erp-finance-due-list__amount">
                <small>未结金额</small>
                <strong>{money(row.outstanding, row.currency)}</strong>
              </span>
              <span
                className={`erp-business-visual-status erp-business-visual-status--${row.dueStatus.key}`}
              >
                {row.dueStatus.label}
              </span>
            </button>
          ))}
          {model.rows.length > rows.length ? (
            <Button
              type="text"
              className="erp-business-visual-more"
              onClick={() => setVisibleCount((count) => count + 20)}
            >
              再显示 {Math.min(20, model.rows.length - rows.length)} 条
            </Button>
          ) : null}
        </div>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
