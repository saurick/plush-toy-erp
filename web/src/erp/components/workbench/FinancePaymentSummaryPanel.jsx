import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Alert, Button, Space, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { canRestoreOverlayFocus, useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'
import {
  FinancePaymentDirection,
  FinancePaymentStatus,
} from '../../../common/consts/statuses.generated.mjs'
import { listFinancePayments } from '../../api/operationalFactApi.mjs'
import { unixSecondsToBusinessDate } from '../../utils/businessDate.mjs'
import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import {
  compareNumeric20Scale6Units,
  formatNumeric20Scale6Summary,
  numeric20Scale6AggregateUnits,
} from '../../utils/numeric20Scale6.mjs'
import {
  readPaymentSummaryPeriod,
  updateSummarySearch,
} from '../../utils/workbenchSummary.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
} from '../business-list/BusinessListLayout.jsx'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { paymentSourceReference } from '../finance/financePaymentPresentation.jsx'
import PaymentSummaryPeriodPicker from './PaymentSummaryPeriodPicker.jsx'

const { RECEIPT, DISBURSEMENT } = FinancePaymentDirection
const detailPageSize = 20
const sortTooltip = {
  target: 'sorter-icon',
  placement: 'bottom',
  styles: { root: { pointerEvents: 'none' } },
}
const money = (value) => formatNumeric20Scale6Summary(value, 2)
const amountUnits = (row, direction) => numeric20Scale6AggregateUnits(row[direction]?.amount ?? '0')
const detailColumns = [
  {
    title: '收付日期',
    dataIndex: 'occurred_at',
    render: (value) => unixSecondsToBusinessDate(value) || '—',
  },
  { title: '收付款单号', dataIndex: 'payment_no' },
  { title: '金额', dataIndex: 'amount', align: 'right', render: money },
  { title: '收付款账户摘要', dataIndex: 'account_ref' },
  { title: '业务凭据', dataIndex: 'evidence_ref' },
  {
    title: '关联来源',
    key: 'source',
    render: (_, row) => paymentSourceReference(row),
  },
]

function usePostedPayments({ dateFrom, dateTo }, refreshRevision, group, page = 1) {
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState(null)
  const currency = group?.currency
  const direction = group?.direction
  const request = useMemo(
    () => ({
      params: {
        ...(dateFrom ? { date_from: dateFrom, date_to: dateTo } : {}),
        status: FinancePaymentStatus.POSTED,
        ...(direction
          ? {
              currency,
              direction,
              limit: detailPageSize,
              offset: (page - 1) * detailPageSize,
            }
          : { include_totals: true, limit: 1 }),
      },
      refreshRevision,
      attempt,
    }),
    [dateFrom, dateTo, direction, currency, page, refreshRevision, attempt]
  )
  useEffect(() => {
    const controller = new AbortController()
    const label = direction ? '读取收付款明细' : '读取收付款汇总'
    listFinancePayments(request.params, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        if (!Array.isArray(direction ? data?.payments : data?.totals)) {
          throw new Error('收付款查询结果不完整')
        }
        setResponse({ request, data })
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setResponse({ request, error: getActionErrorMessage(cause, label) })
        }
      })
    return () => controller.abort()
  }, [request, direction])
  const current = response?.request === request ? response : null
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    retry: () => setAttempt((n) => n + 1),
  }
}

function queryError(error, retry) {
  return (
    <Alert
      type="error"
      showIcon
      message={error}
      action={<Button onClick={retry}>重新加载</Button>}
    />
  )
}

function PaymentDetailRows({ range, group, refreshRevision }) {
  const [page, setPage] = useState(1)
  const { data, loading, error, retry } = usePostedPayments(
    range,
    refreshRevision,
    group,
    page
  )
  useEffect(() => {
    if (!data) return
    const lastPage = Math.max(1, Math.ceil(data.total / detailPageSize))
    if (page > lastPage) setPage(lastPage)
  }, [data, page])
  if (error) return queryError(error, retry)
  return (
    <Table
      rowKey="id"
      size="small"
      columns={detailColumns}
      dataSource={data?.payments || []}
      loading={loading}
      locale={{ emptyText: '没有符合条件的已入账记录' }}
      pagination={{
        current: page,
        pageSize: detailPageSize,
        total: data?.total ?? group.count,
        showSizeChanger: false,
        onChange: setPage,
      }}
    />
  )
}

function PaymentPeriodTotals({ range, scope, refreshRevision, onShowAll }) {
  const [group, setGroup] = useState(null)
  const amountId = useId()
  const openerId = useRef(null)
  const overlay = useOverlayScope()
  const { data, loading, error, retry } = usePostedPayments(
    range,
    refreshRevision
  )
  const rows = useMemo(() => {
    const byCurrency = new Map()
    for (const item of data?.totals || []) {
      if (!byCurrency.has(item.currency)) {
        byCurrency.set(item.currency, { currency: item.currency })
      }
      byCurrency.get(item.currency)[item.direction] = item
    }
    return Array.from(byCurrency.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency)
    )
  }, [data])
  const columns = applyBusinessColumnSorters([
    { title: '币种', dataIndex: 'currency', showSorterTooltip: sortTooltip },
    ...[
      [RECEIPT, '收款'],
      [DISBURSEMENT, '付款'],
    ].flatMap(([direction, label]) => [
      {
        title: `已入账${label}`,
        dataIndex: direction,
        align: 'right',
        showSorterTooltip: sortTooltip,
        sorter: (left, right) => compareNumeric20Scale6Units(
          amountUnits(left, direction),
          amountUnits(right, direction)
        ),
        render: (item) =>
          item ? (
            <Button
              id={`${amountId}-${item.currency}-${direction}`}
              type="link"
              aria-label={`查看 ${item.currency} ${label}明细，金额 ${money(item.amount)}`}
              onClick={(event) => {
                openerId.current = event.currentTarget.id
                setGroup(item)
              }}
            >
              {money(item.amount)}
            </Button>
          ) : (
            '0.00'
          ),
      },
      {
        title: `${label}笔数`,
        key: `${direction}-count`,
        align: 'right',
        dataIndex: [direction, 'count'],
        showSorterTooltip: sortTooltip,
        sortValue: (row) => row[direction]?.count ?? 0,
        render: (count) => count ?? 0,
      },
    ]),
  ])
  return (
    <>
      {error ? (
        queryError(error, retry)
      ) : (
        <BusinessDataTable
          rowKey="currency"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          emptyDescription={loading ? '正在读取收付款汇总…' : range.dateFrom ? (
            <Space direction="vertical" size={0}>
              <span>所选期间没有已入账的收付款</span>
              <Button type="link" onClick={onShowAll}>查看全部历史</Button>
            </Space>
          ) : '没有已入账的收付款'}
        />
      )}
      <BusinessModal
        title={
          group
            ? `${group.currency} ${group.direction === RECEIPT ? '收款' : '付款'}明细`
            : '收付款明细'
        }
        open={Boolean(group)}
        onCancel={() => setGroup(null)}
        focusTriggerAfterClose={false}
        afterOpenChange={(open) => {
          // 窗口宽度变化可能重建表格单元格，按金额入口恢复焦点。
          if (!open && openerId.current && canRestoreOverlayFocus(overlay)) {
            document.getElementById(openerId.current)?.focus({ preventScroll: true })
          }
        }}
        footer={null}
      >
        {group && (
          <>
            <p className="erp-business-inline-note">{scope}</p>
            <PaymentDetailRows
              range={range}
              group={group}
              refreshRevision={refreshRevision}
            />
          </>
        )}
      </BusinessModal>
    </>
  )
}

function PaymentSummaryControls({ typeControl, periodRef, range, onChange, scope }) {
  return (
    <div className="erp-payment-summary-filters">
      {typeControl}
      <PaymentSummaryPeriodPicker periodRef={periodRef} range={range} onChange={onChange} />
      <Typography.Text type="secondary" role="status">
        {range.period === 'custom' || range.period === 'all' ? '仅已入账' : scope}
      </Typography.Text>
    </div>
  )
}

export default function FinancePaymentSummaryPanel({
  summaryTypeControl,
  refreshRevision,
}) {
  const [params, setParams] = useSearchParams()
  const periodRef = useRef(null)
  const range = readPaymentSummaryPeriod(params)
  const { dateFrom, dateTo } = range
  const dateLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} 至 ${dateTo}`
  const scope = `${dateLabel ? `收付日期：${dateLabel}` : '不限收付日期'} · 仅已入账`
  const changePeriod = (period, from, to) => {
    const next = updateSummarySearch(params, 'payments', {
      period: period === 'month' ? '' : period,
      from,
      to,
      date: '',
    })
    setParams(next, { replace: true })
  }
  return (
    <>
      <BusinessOperationPanel
        compact
        filters={
          <PaymentSummaryControls
            inline
            typeControl={summaryTypeControl}
            periodRef={periodRef}
            range={range}
            onChange={changePeriod}
            scope={scope}
          />
        }
      />
      <PaymentPeriodTotals
        key={`${range.dateFrom}:${range.dateTo}`}
        range={range}
        scope={scope}
        refreshRevision={refreshRevision}
        onShowAll={() => {
          changePeriod('all')
          periodRef.current?.focus({ preventScroll: true })
        }}
      />
    </>
  )
}
