import React, { useEffect, useRef, useState } from 'react'
import { Button, Space } from 'antd'
import SearchInput from '@/common/components/SearchInput'
import AppPagination from '@/common/components/pagination/AppPagination'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  getFinanceFact,
  listFinanceFacts,
  listFinancePayments,
  listFinanceCreditNotes,
  listFinanceSourceAdjustments,
} from '@/erp/api/operationalFactApi.mjs'
import { paymentStatusLabel } from '@/erp/components/finance/financePaymentPresentation.jsx'
import {
  WorkbenchEmpty,
  WorkbenchNotice,
  WorkbenchSection,
  WorkbenchToolbar,
} from '../WorkbenchPattern.jsx'
import {
  FINANCE_TRACE_PAGE_SIZE as PAGE_SIZE,
  FINANCE_FACT_LABELS,
  financeStatus,
  financeAmount,
  financeTime,
  financeTracePage,
  financeTraceFact,
} from './financeTraceModel.mjs'
import './financeWorkbench.css'

const identity = (value) => value
function useFinanceRead(api, params, validate = identity) {
  const key = params === null ? '' : JSON.stringify(params)
  const [state, setState] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!key) return undefined
    const controller = new AbortController()
    const request = JSON.parse(key)
    api(request, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setState({
            key,
            revision,
            data: validate(value, request),
            at: new Date().toISOString(),
          })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({
            key,
            revision,
            error: getActionErrorMessage(error, '读取财务记录', {
              fallback: '读取失败，请确认已登录、具备相应查看权限且服务可用。',
            }),
          })
        }
      })
    return () => controller.abort()
  }, [api, key, revision, validate])
  return {
    ...(state?.key === key && state?.revision === revision ? state : {}),
    loading: Boolean(
      key && (state?.key !== key || state?.revision !== revision)
    ),
    retry: () => setRevision((value) => value + 1),
  }
}

function ReadStatus({ read }) {
  if (read.loading) {
    return <WorkbenchNotice title="正在读取财务记录…" tone="loading" />
  }
  if (read.error) {
    return (
      <WorkbenchNotice
        title="此部分未能读取"
        description={read.error}
        tone="error"
        action={<Button onClick={read.retry}>重新读取</Button>}
      />
    )
  }
  return null
}

function RecordTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  selectedID,
  renderExpanded,
}) {
  return (
    <div className="erp-dev-finance__table">
      <table data-table-lines="appearance">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <React.Fragment key={rowKey(row)}>
              <tr data-selected={row.id === selectedID || undefined}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
              {renderExpanded && row.id === selectedID ? (
                <tr>
                  <td colSpan={columns.length}>{renderExpanded(row)}</td>
                </tr>
              ) : null}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const pageValidators = Object.fromEntries(
  ['finance_facts', 'payments', 'credit_notes', 'adjustments'].map((field) => [
    field,
    (data, params) => financeTracePage(data, field, params),
  ])
)

function PagedRecords({
  title,
  description,
  api,
  params,
  field,
  columns,
  rowKey,
  emptyText,
  selectedID,
  renderExpanded,
  children,
}) {
  const [page, setPage] = useState(1)
  const read = useFinanceRead(
    api,
    { ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    pageValidators[field]
  )
  const { data } = read
  return (
    <WorkbenchSection
      title={title}
      description={description}
      flat
      footer={read.data ? `读取于 ${financeTime(read.at)}` : undefined}
      tools={
        <Button onClick={read.retry} disabled={read.loading}>
          刷新
        </Button>
      }
    >
      <ReadStatus read={read} />
      {data && !read.error && !read.loading ? (
        <>
          {data.rows.length ? (
            <RecordTable
              columns={columns}
              rows={data.rows}
              rowKey={rowKey}
              selectedID={selectedID}
              renderExpanded={renderExpanded}
            />
          ) : (
            <WorkbenchEmpty title={page > 1 ? '当前页已无记录' : emptyText} />
          )}
          {data.total > PAGE_SIZE || page > 1 ? (
            <div className="erp-dev-finance__pagination">
              <AppPagination
                current={page}
                pageSize={PAGE_SIZE}
                total={data.total}
                showSizeChanger={false}
                onChange={setPage}
                showTotal={(total) => `共 ${total} 条`}
              />
            </div>
          ) : null}
          {children}
        </>
      ) : null}
    </WorkbenchSection>
  )
}

const paymentColumns = [
  {
    key: 'no',
    label: '收付款单',
    render: (row) => (
      <>
        {row.payment_no || `记录 ${row.id}`}
        <small>
          {row.direction === 'RECEIPT' ? '收款' : '付款'} ·{' '}
          {paymentStatusLabel(row.status)}
        </small>
      </>
    ),
  },
  {
    key: 'amount',
    label: '金额',
    render: (row) => financeAmount(row.amount, row.currency),
  },
  {
    key: 'available',
    label: '当前可用',
    render: (row) => financeAmount(row.available_amount, row.currency),
  },
  {
    key: 'posted',
    label: '入账时间（中国）',
    render: (row) => financeTime(row.posted_at),
  },
]

function FactRelations({ fact }) {
  const [payment, setPayment] = useState(null)
  const params = { finance_fact_id: fact.id }
  return (
    <>
      <PagedRecords
        title="关联收付款与核销"
        description="按核销记录关联，包含已冲回记录；首款在尚未分配给此账款时不会出现在这里。"
        api={listFinancePayments}
        params={params}
        field="payments"
        emptyText="未查到与此账款关联的收付款"
        columns={[
          ...paymentColumns,
          {
            key: 'allocations',
            label: '本账款核销记录',
            render: (row) =>
              row.allocations
                .filter((item) => item.finance_fact_id === fact.id)
                .map((item) => (
                  <div key={item.id}>
                    {financeAmount(item.amount, item.currency)} ·{' '}
                    {financeStatus(item.status)}
                    {item.reversal_of_allocation_id ? (
                      <small>冲回核销 #{item.reversal_of_allocation_id}</small>
                    ) : null}
                  </div>
                )),
          },
          {
            key: 'refunds',
            label: '关联退款',
            render: (row) => (
              <Button type="link" onClick={() => setPayment(row)}>
                查看退款
              </Button>
            ),
          },
        ]}
      >
        {payment ? (
          <div className="erp-dev-finance__nested">
            <Button onClick={() => setPayment(null)}>收起退款</Button>
            <PagedRecords
              key={payment.id}
              title={`${payment.payment_no || '所选款项'}的退款`}
              description="只显示与这笔原款明确关联的退款，退款状态以各自记录为准。"
              api={listFinancePayments}
              params={{ refund_of_payment_id: payment.id }}
              field="payments"
              columns={paymentColumns}
              emptyText="未登记关联退款"
            />
          </div>
        ) : null}
      </PagedRecords>
      <PagedRecords
        title="已登记的账款调整"
        description="与原账分别保留。调增、调减和冲回记录不等同于实际资金收付。"
        api={listFinanceCreditNotes}
        params={params}
        field="credit_notes"
        emptyText="未登记账款调整"
        columns={[
          {
            key: 'no',
            label: '调整单',
            render: (row) => (
              <>
                {row.credit_note_no || `记录 ${row.id}`}
                <small>{financeStatus(row.status)}</small>
              </>
            ),
          },
          {
            key: 'amount',
            label: '方向与金额',
            render: (row) => (
              <>
                {row.balance_direction === 'INCREASE'
                  ? '调增'
                  : row.balance_direction === 'DECREASE'
                    ? '调减'
                    : '方向待核对'}{' '}
                · {financeAmount(row.amount, row.currency)}
              </>
            ),
          },
          {
            key: 'source',
            label: '来源 / 冲回',
            render: (row) =>
              row.reversal_of_credit_note_id
                ? `冲回调整 #${row.reversal_of_credit_note_id}`
                : row.source_id
                  ? `${row.source_type === 'purchase_return' ? '采购退货' : '采购调整'} #${row.source_id}`
                  : '手工调整',
          },
          {
            key: 'reason',
            label: '原因',
            render: (row) => row.reason || '未记录',
          },
        ]}
      />
      {fact.fact_type === 'PAYABLE' &&
      fact.source_type === 'purchase_receipt' ? (
        <PagedRecords
          title="采购待确认差额"
          description="来源已过账但财务尚未确认的差额；这里不自动生成调整或退款。"
          api={listFinanceSourceAdjustments}
          params={params}
          field="adjustments"
          rowKey={(row) => `${row.source_type}:${row.source_id}`}
          emptyText="没有待确认的采购差额"
          columns={[
            {
              key: 'source',
              label: '来源单据',
              render: (row) => row.source_no || `来源 #${row.source_id}`,
            },
            {
              key: 'amount',
              label: '方向与金额',
              render: (row) => (
                <>
                  {row.balance_direction === 'INCREASE' ? '调增' : '调减'} ·{' '}
                  {financeAmount(row.amount, row.currency)}
                </>
              ),
            },
            {
              key: 'at',
              label: '发生时间（中国）',
              render: (row) => financeTime(row.occurred_at),
            },
          ]}
        />
      ) : null}
    </>
  )
}

function SelectedFact({ id, onClear, focusOnOpen = true }) {
  const heading = useRef(null)
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus({ preventScroll: true })
  }, [id, focusOnOpen])
  const read = useFinanceRead(getFinanceFact, { id }, financeTraceFact)
  const fact = read.data
  return (
    <div
      ref={heading}
      tabIndex={-1}
      aria-label="所选账款详情"
      role="region"
      className="erp-dev-finance"
      data-finance-selected-record
    >
      <WorkbenchSection
        title={
          fact
            ? `${FINANCE_FACT_LABELS[fact.fact_type]} · ${fact.fact_no}`
            : '账款详情'
        }
        flat
        footer={
          read.data
            ? `读取于 ${financeTime(read.at)}；各部分独立读取，不构成同一时点快照。`
            : undefined
        }
        tools={
          <Space>
            <Button onClick={read.retry} disabled={read.loading}>
              刷新详情
            </Button>
            <Button onClick={onClear}>收起详情</Button>
          </Space>
        }
      >
        <ReadStatus read={read} />

      </WorkbenchSection>
      {fact && !read.error && !read.loading ? (
        ['RECEIVABLE', 'PAYABLE'].includes(fact.fact_type) ? (
          <FactRelations key={`${fact.id}:${read.revision}`} fact={fact} />
        ) : (
          <WorkbenchNotice
            title="此记录不直接参与收付款核销"
            description="发票与单笔核对保留各自事实；收付款关联在应收或应付记录下查询。"
          />
        )
      ) : null}
    </div>
  )
}

export default function FinanceTraceView({
  factID,
  onSelectFact,
  onOpenRules,
  inlineDetails = false,
}) {
  const selectedButton = useRef(null)
  const clearFact = () => {
    onSelectFact(null)
    selectedButton.current?.focus({ preventScroll: true })
  }
  const [keyword, setKeyword] = useState('')
  const [searchRevision, setSearchRevision] = useState(0)
  return (
    <div className="erp-dev-finance" data-finance-trace>
      <WorkbenchToolbar>
        <SearchInput
          className="erp-dev-finance__search"
          aria-label="查询财务记录"
          placeholder="账款号、来源单号或编号"
          value={keyword}
          onSearch={(value) => {
            setKeyword(value)
            onSelectFact(null)
          }}
          onSubmitted={(value) => {
            setSearchRevision((revision) => revision + 1)
            if (value === keyword) onSelectFact(null)
          }}
          allowClear
        />
        <span>当前登录环境 · 按读取权限展示</span>
      </WorkbenchToolbar>
      <PagedRecords
        key={`${keyword}:${searchRevision}`}
        title="账款记录"
        api={listFinanceFacts}
        params={{ keyword }}
        field="finance_facts"
        emptyText={keyword ? '没有匹配的账款' : '当前权限范围内没有账款'}
        selectedID={factID}
        renderExpanded={
          inlineDetails
            ? (row) => (
              <SelectedFact
                key={row.id}
                id={row.id}
                onClear={clearFact}
                onOpenRules={onOpenRules}
                focusOnOpen={false}
              />
              )
            : undefined
        }
        columns={[
          {
            key: 'no',
            label: '账款',
            render: (row) => (
              <Button
                type="link"
                aria-expanded={inlineDetails ? row.id === factID : undefined}
                onClick={(event) => {
                  selectedButton.current = event.currentTarget
                  onSelectFact(
                    inlineDetails && row.id === factID ? null : row.id
                  )
                }}
              >
                {row.fact_no || `记录 ${row.id}`}
              </Button>
            ),
          },
          {
            key: 'type',
            label: '类型 / 状态',
            render: (row) => (
              <>
                {FINANCE_FACT_LABELS[row.fact_type] || '类型待核对'}
                <small>{financeStatus(row.status)}</small>
              </>
            ),
          },
          {
            key: 'source',
            label: '来源单据',
            render: (row) =>
              row.source_no ||
              (row.source_id ? `来源 #${row.source_id}` : '未关联来源'),
          },
          {
            key: 'amount',
            label: '原账金额',
            render: (row) => financeAmount(row.amount, row.currency),
          },
          {
            key: 'balance',
            label: '未核销余额',
            render: (row) =>
              financeAmount(row.outstanding_amount, row.currency),
          },
        ]}
      />
      {!inlineDetails && factID ? (
        <SelectedFact
          key={factID}
          id={factID}
          onClear={clearFact}
          onOpenRules={onOpenRules}
        />
      ) : !factID ? (
        <WorkbenchEmpty
          title="选择一笔账款，查看收付、核销、调整与退款关联"
          description="只展示已读取的实际记录，不推断完整历史或补造缺失关联。"
        />
      ) : null}
    </div>
  )
}
