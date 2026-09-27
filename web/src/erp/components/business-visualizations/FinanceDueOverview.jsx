import React, { useMemo } from 'react'
import {
  buildFinanceDueModel,
  paginateVisualizationRows,
} from '../../utils/businessVisualizationModels.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
  VisualizationPagination,
} from './BusinessVisualizationFrame.jsx'

function money(value, currency) {
  if (value === null || !currency) return '—'
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
  viewState = {},
  onViewStateChange,
}) {
  const model = useMemo(() => buildFinanceDueModel(facts), [facts])
  const filter = viewState.filter || 'all'
  const filtered = model.rows.filter(
    (row) => filter === 'all' || row.dueStatus.key === filter
  )
  const pagination = paginateVisualizationRows(filtered, viewState.page)
  const { rows } = pagination
  const changeFilter = (next) =>
    onViewStateChange?.({ ...viewState, filter: next, page: 1 })
  return (
    <BusinessVisualizationFrame
      className="erp-finance-due-visual"
      switcher={switcher}
      title="财务到期顺序"
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
          key: 'overdue',
          label: '逾期未结',
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
          key: 'unknown',
          label: '金额待核对',
          value: model.counts.unknown,
          tone: 'warning',
        },
        {
          key: 'unscheduled',
          label: '未填到期日',
          value: model.counts.unscheduled,
          tone: 'neutral',
        },
        {
          key: 'settled',
          label: '已结清',
          value: model.counts.settled,
          tone: 'success',
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
          <VisualizationPagination
            pagination={pagination}
            onChange={(page) => onViewStateChange?.({ ...viewState, page })}
          />
        </div>
      ) : null}
    </BusinessVisualizationFrame>
  )
}
