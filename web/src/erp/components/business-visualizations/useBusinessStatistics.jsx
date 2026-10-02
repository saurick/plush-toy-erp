import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Empty, Popover, Select, Table, Tag } from 'antd'
import { ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import FilterChip from '@/common/components/navigation/FilterChip'
import SearchInput from '@/common/components/SearchInput'
import useLiveSearch from '@/common/hooks/useLiveSearch'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  getBusinessStatistics,
  listBusinessStatisticsSources,
} from '../../api/businessStatisticsApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import {
  statisticsNumber as number,
  statisticsRatio,
  statisticsSum,
  statisticsQueryFromURL,
  statisticsPaginationFromURL,
  STATISTICS_AGES,
  STATISTICS_STATUSES,
} from '../../utils/businessStatistics.mjs'
import { DateRangeFilter } from '../business-list/BusinessListLayout.jsx'
import WorkflowTaskPagination from '../workflow/WorkflowTaskPagination.jsx'
import {
  BusinessViewSurface,
  BusinessViewSwitch,
} from './BusinessVisualizationFrame.jsx'
import '../../styles/app/business-statistics.css'

const clearGroup = {
  group_key: '',
  group_name: '',
  source_status: '',
  source_page: '',
  source_size: '',
  source_from: '',
  source_to: '',
}
const displayOptions = [
  { label: '图表与表格', value: 'combined' },
  { label: '表格', value: 'table' },
  { label: '图表', value: 'chart' },
]
const deliverySegments = [
  ['done', '已交齐'],
  ['pending_not_late', '待交付（未逾期）'],
  ['overdue', '逾期未交齐'],
  ['closed', '已关闭'],
  ['unknown', '资料待核对'],
]
const sourceStatus = (key) => (key === 'unknown_due' ? 'undated' : key)
const groupValue = (group, key) =>
  key === 'pending_not_late' ? group.pending - group.overdue : group[key]

function StatisticsChart({ groups, report, onDrill }) {
  const ages = report === 'receivables'
  const segments = (ages ? STATISTICS_AGES : deliverySegments).filter(
    ([key]) =>
      !['closed', 'unknown', 'unknown_due'].includes(key) ||
      groups.some((group) => group[key] > 0)
  )
  const values = groups.map((group) =>
    ages ? group.balance : String(group.count)
  )
  // Pixel ratios are approximate; labels and table values retain exact decimals.
  const maximum = values.reduce(
    (result, value) =>
      result === '0' || statisticsRatio(value, result) > 100 ? value : result,
    '0'
  )
  return (
    <div
      className="erp-statistics-chart"
      aria-label={ages ? '客户应收账龄图' : '交付订单分布图'}
    >
      <div className="erp-statistics-legend">
        <span>{ages ? '未结金额' : '订单数 · 单'} · 当前页</span>
        {segments.map(([key, label]) => (
          <span key={key}>
            <i className={`erp-statistics-tone-${key}`} />
            {label}
          </span>
        ))}
      </div>
      <div
        className="erp-statistics-plot"
        style={{ '--statistics-columns': Math.max(groups.length, 1) }}
      >
        {groups.map((group) => (
          <div className="erp-statistics-column" key={group.key}>
            <Button
              type="link"
              className="erp-statistics-chart-number"
              onClick={() => onDrill(group)}
            >
              {number(ages ? group.balance : group.count)}
            </Button>
            <div className="erp-statistics-bar-track">
              <div
                className="erp-statistics-stack"
                style={{
                  height: `${statisticsRatio(ages ? group.balance : String(group.count), maximum)}%`,
                }}
              >
                {segments.map(([key, label]) => {
                  const value = ages ? group[key] : groupValue(group, key)
                  return statisticsRatio(
                    String(value),
                    ages ? group.balance : String(group.count)
                  ) > 0 ? (
                    <button
                      type="button"
                      key={key}
                      className={`erp-statistics-tone-${key}`}
                      style={{
                        height: `${statisticsRatio(String(value), ages ? group.balance : String(group.count))}%`,
                      }}
                      aria-label={`${group.name} · ${label} ${number(value)}${ages ? '' : ' 单'}`}
                      onClick={() => onDrill(group, sourceStatus(key))}
                    />
                  ) : null
                })}
              </div>
            </div>
            <Button
              type="link"
              className="erp-statistics-chart-name"
              title={group.name}
              onClick={() => onDrill(group)}
            >
              {group.name}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function useBusinessStatistics({
  active,
  adminProfile,
  outlet,
  params,
  setParams,
  onOpenOrder,
  canOpen,
  navigate,
}) {
  const canSales =
    hasActionPermission(adminProfile, 'sales_order.read') &&
    hasActionPermission(adminProfile, 'sales_order_item.read')
  const canFinance =
    hasActionPermission(adminProfile, 'finance.receivable.read') &&
    hasActionPermission(adminProfile, 'field.finance_settlement.read')
  const queryKey = JSON.stringify(statisticsQueryFromURL(params))
  const query = useMemo(() => JSON.parse(queryKey), [queryKey])
  const groupKey = params.get('group_key') || ''
  const groupLabel = params.get('group_name') || ''
  const sourceFilter = params.get('source_status') || 'all'
  const sourceFrom = params.get('source_from') || ''
  const sourceTo = params.get('source_to') || ''
  const { limit: sourcePageSize, offset: sourceOffset } =
    statisticsPaginationFromURL(params, {
      source: true,
      fallbackSize: query.limit,
    })
  const sourcePage = sourceOffset / sourcePageSize + 1
  const display = ['chart', 'table'].includes(params.get('display'))
    ? params.get('display')
    : 'combined'
  const requestKey = JSON.stringify([
    queryKey,
    groupKey,
    sourceFilter,
    sourcePage,
    sourcePageSize,
    sourceFrom,
    sourceTo,
  ])
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const begin = useLatestRequestCoordinator()
  const bodyRef = useRef(null)
  const data =
    active && state?.key === requestKey && state?.profile === adminProfile
      ? state.data
      : null
  const board = groupKey ? null : data
  const ages = query.report === 'receivables'
  const statusLabels = {
    ...STATISTICS_STATUSES,
    undated: ages ? '未定到期日' : '未定交期',
  }
  const money = board?.access?.sales_amounts === true
  const allowed = ages ? canFinance : canSales
  const update = useCallback(
    (changes, { resetPage = true, replace = false } = {}) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (resetPage) {
            next.delete('stats_page')
            next.delete('source_page')
          }
          for (const [key, value] of Object.entries(changes)) {
            if (value == null || value === '') next.delete(key)
            else next.set(key, String(value))
          }
          return next
        },
        { replace }
      )
    },
    [setParams]
  )

  const load = useCallback(async () => {
    const request = begin('business-statistics')
    if (!active || !adminProfile?.id || !allowed) {
      setLoading(false)
      request.finish()
      return false
    }
    setLoading(true)
    setError('')
    try {
      const response = groupKey
        ? await listBusinessStatisticsSources(
            {
              ...query,
              ...((sourceFrom || sourceTo) && query.report === 'delivery'
                ? { period: 'custom', date_from: sourceFrom, date_to: sourceTo }
                : {}),
              group_key: groupKey,
              source_status: sourceFilter,
              limit: sourcePageSize,
              offset: sourceOffset,
            },
            { signal: request.signal }
          )
        : await getBusinessStatistics(query, { signal: request.signal })
      if (!request.isCurrent()) return false
      setState({ key: requestKey, profile: adminProfile, data: response })
      return true
    } catch (failure) {
      if (request.isCurrent()) {
        setState(null)
        setError(getActionErrorMessage(failure, '查询经营统计'))
      }
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    active,
    adminProfile,
    allowed,
    begin,
    groupKey,
    query,
    requestKey,
    sourceFilter,
    sourcePageSize,
    sourceOffset,
    sourceFrom,
    sourceTo,
  ])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (active) return outlet?.registerPageRefresh?.(load)
    return undefined
  }, [active, load, outlet])
  useEffect(() => {
    if (!data?.total) return
    const pageSize = groupKey ? sourcePageSize : query.limit
    const offset = groupKey ? sourceOffset : query.offset
    if (offset >= data.total) {
      update(
        {
          [groupKey ? 'source_page' : 'stats_page']: Math.ceil(
            data.total / pageSize
          ),
        },
        { resetPage: false, replace: true }
      )
    }
  }, [
    data,
    groupKey,
    query.offset,
    query.limit,
    sourcePageSize,
    sourceOffset,
    update,
  ])
  const search = useLiveSearch({
    value: query.keyword,
    onSearch: (keyword) => update({ sq: keyword, ...clearGroup }),
  })
  const drill = (group, status = 'all') => {
    outlet?.pageUIState?.values?.set(
      'business-statistics:summary-scroll',
      bodyRef.current?.scrollTop || 0
    )
    update(
      {
        group_key: group.key,
        group_name: group.name,
        source_status: status,
        source_from: board?.date_from,
        source_to: board?.date_to,
        source_page: '',
        source_size: '',
      },
      { resetPage: false }
    )
  }
  useEffect(() => {
    if (!loading && !groupKey && data && bodyRef.current) {
      bodyRef.current.scrollTop =
        outlet?.pageUIState?.values?.get(
          'business-statistics:summary-scroll'
        ) || 0
    }
  }, [data, groupKey, loading, outlet?.pageUIState])
  const switchReport = (report) =>
    update({
      report,
      group: report === 'receivables' ? 'customer' : query.group_by,
      status: 'all',
      sort: 'count',
      ...clearGroup,
    })
  const reportOptions = [
    ...(canSales ? [{ value: 'delivery', label: '订单交付' }] : []),
    ...(canFinance ? [{ value: 'receivables', label: '应收账龄' }] : []),
  ]
  useEffect(() => {
    if (active && !allowed && (canSales || canFinance)) {
      update(
        {
          report: canSales ? 'delivery' : 'receivables',
          group: 'customer',
          status: 'all',
          ...clearGroup,
        },
        { replace: true }
      )
    }
  }, [active, allowed, canSales, canFinance, update]) // Same source permissions as the formal pages.
  const toolbar = (
    <>
      <span className="erp-statistics-toolbar-spacer" />
      <label htmlFor="statistics-report">统计内容</label>
      <Select
        id="statistics-report"
        aria-label="统计内容"
        value={query.report}
        options={reportOptions}
        onChange={switchReport}
      />
      <span className="erp-statistics-meta">
        <span>
          {data
            ? `截至 ${dayjs(data.snapshot_at).format('YYYY-MM-DD HH:mm')}`
            : loading
              ? '正在查询…'
              : '等待查询'}
        </span>
      </span>
      <Popover
        trigger="click"
        title="统计口径"
        content={
          <div className="erp-statistics-help">
            <p>
              订单按有效明细的实际出货判断交齐，草稿、未生效和取消订单不计入；交期按未交付明细的最早交期筛选。逾期与
              7 天内交付仅计算仍待交付的订单。
            </p>
            <p>
              客户按档案归组，产品按产品档案归组。产品汇总按订单去重，同一订单可能出现在多个产品行；底部合计再次去重。
            </p>
            <p>
              客户金额使用订单冻结总额；产品金额使用明细货品金额，不分摊税费、运费。已出货金额使用出货快照，缺失时显示“—”。
            </p>
            <p>
              应收按当前已过账的未结余额计算，扣除核销和红冲并计入冲正。按中国日期划分账龄，未填到期日单列；不同币种分开查看。
            </p>
            <p>
              图表显示当前页，合计包含筛选后的完整数据。选择数字可查看同一筛选下的来源。
            </p>
          </div>
        }
      >
        <Button
          type="text"
          icon={<InfoCircleOutlined />}
          aria-label="查看统计口径"
        />
      </Popover>
    </>
  )
  const counts = board?.counts
  const metricItems = ages
    ? [
        ['all', '未结应收', counts?.balance],
        [
          'overdue',
          '逾期未结',
          counts
            ? statisticsSum([
                counts.late_7,
                counts.late_30,
                counts.late_60,
                counts.late_more,
              ])
            : null,
        ],
        ['not_due', '未到期', counts?.not_due],
        ['undated', '未定到期日', counts?.unknown_due],
      ]
    : [
        ['all', '订单总数', counts?.count],
        ['done', '已交齐', counts?.done],
        ['pending', '待交付', counts?.pending],
        ['overdue', '当前逾期', counts?.overdue],
      ]
  const controls = (
    <>
      <div className="erp-statistics-filters">
        {!ages && (
          <>
            <span>订单交期</span>
            <Select
              aria-label="交期范围"
              value={query.period}
              options={[
                { value: 'month', label: '本月' },
                { value: 'soon', label: '未来 7 天' },
                { value: 'all', label: '全部交期' },
                { value: 'custom', label: '自定义' },
              ]}
              onChange={(period) => update({ period, ...clearGroup })}
            />
            <DateRangeFilter
              startValue={
                query.period === 'custom'
                  ? query.date_from
                  : data?.date_from || ''
              }
              endValue={
                query.period === 'custom' ? query.date_to : data?.date_to || ''
              }
              onStartChange={(value) =>
                update({
                  period: 'custom',
                  stfrom: value,
                  stto: query.date_to || data?.date_to || '',
                  ...clearGroup,
                })
              }
              onEndChange={(value) =>
                update({
                  period: 'custom',
                  stto: value,
                  stfrom: query.date_from || data?.date_from || '',
                  ...clearGroup,
                })
              }
            />
          </>
        )}
        <SearchInput
          aria-label={query.group_by === 'product' ? '搜索产品' : '搜索客户'}
          placeholder={query.group_by === 'product' ? '搜索产品' : '搜索客户'}
          allowClear
          maxLength={100}
          value={search.value}
          onChange={search.onChange}
          onCompositionStart={search.onCompositionStart}
          onCompositionEnd={search.onCompositionEnd}
          onPressEnter={search.onPressEnter}
        />
        <span className="erp-statistics-toolbar-spacer" />
        <span className="erp-statistics-meta">
          {ages ? '当前已过账未结余额' : '按订单交期范围，交付以实际出货为准'}
        </span>
        <Select
          aria-label="统计币种"
          value={query.currency}
          options={['CNY', 'USD', 'HKD'].map((currency) => ({
            value: currency,
            label: `币种 ${currency}`,
          }))}
          onChange={(currency) => update({ currency, ...clearGroup })}
        />
      </div>
      {!groupKey ? (
        <div className="erp-statistics-metrics" aria-label="统计概览">
          {metricItems.map(([key, label, value]) => (
            <FilterChip
              key={key}
              disabled={loading || !board}
              selected={query.status === key}
              count={
                <>
                  <strong
                    className={key === 'overdue' ? 'erp-statistics-danger' : ''}
                  >
                    {number(loading ? null : value, ages)}
                  </strong>
                  {!ages && <small>单</small>}
                </>
              }
              onClick={() => update({ status: key })}
            >
              {label}
            </FilterChip>
          ))}
          {!ages && money && (
            <span className="erp-statistics-total-amount">
              {query.group_by === 'product' ? '货品金额' : '合同金额'}{' '}
              <strong>{number(board?.totals.amount, true)}</strong>{' '}
              {query.currency}
            </span>
          )}
        </div>
      ) : (
        <div className="erp-statistics-source-context">
          <Tag>
            {statusLabels[query.status] || '全部'} · {query.currency}
          </Tag>
          <span>沿用汇总筛选查看来源{!ages && '订单'}</span>
        </div>
      )}
    </>
  )
  const valueLink = (row, key, asMoney = false) => (
    <Button
      type="link"
      className={`erp-statistics-value${key === 'overdue' ? ' erp-statistics-danger' : ''}`}
      disabled={row[key] === 0 || row[key] == null}
      onClick={() => drill(row, sourceStatus(key))}
    >
      {number(row[key], asMoney)}
    </Button>
  )
  const summaryColumns = [
    {
      title: query.group_by === 'product' ? '产品' : '客户',
      key: 'name',
      width: 260,
      render: (_, row) => (
        <Button
          type="link"
          className="erp-statistics-name"
          title={row.name}
          onClick={() => drill(row)}
        >
          {row.name}
        </Button>
      ),
    },
    {
      title: ages ? '未结笔数' : '订单数',
      key: 'count',
      align: 'right',
      width: 90,
      render: (_, row) => valueLink(row, 'count'),
    },
  ]
  // Count drills into all records, rather than a status named "count".
  summaryColumns[1].render = (_, row) => (
    <Button
      type="link"
      className="erp-statistics-value"
      onClick={() => drill(row)}
    >
      {number(row.count)}
    </Button>
  )
  if (ages) {
    summaryColumns.push(
      {
        title: `未结金额 · ${query.currency}`,
        key: 'balance',
        align: 'right',
        width: 155,
        render: (_, row) => (
          <Button
            type="link"
            className="erp-statistics-value"
            onClick={() => drill(row)}
          >
            {number(row.balance, true)}
          </Button>
        ),
      },
      ...STATISTICS_AGES.map(([key, label]) => ({
        title: label,
        key,
        align: 'right',
        width: 150,
        render: (_, row) => valueLink(row, key, true),
      }))
    )
  } else {
    summaryColumns.push(
      ...[
        ['done', '已交齐'],
        ['pending', '待交付'],
        ['overdue', '当前逾期'],
        ['soon', '7 天内交付'],
        ['closed', '已关闭'],
        ['unknown', '待核对'],
      ].map(([key, title]) => ({
        key,
        title,
        align: 'right',
        width: 105,
        render: (_, row) => valueLink(row, key),
      }))
    )
    if (money) {
      summaryColumns.push(
        {
          title: `${query.group_by === 'product' ? '货品' : '订单'}金额 · ${query.currency}`,
          key: 'amount',
          align: 'right',
          width: 170,
          render: (_, row) => number(row.amount, true),
        },
        {
          title: `已出货金额 · ${query.currency}`,
          key: 'shipped_amount',
          align: 'right',
          width: 180,
          render: (_, row) => number(row.shipped_amount, true),
        }
      )
    }
  }
  const sourceColumns = [
    {
      title: ages ? '应收编号' : '销售单号',
      key: 'number',
      width: 190,
      render: (_, row) =>
        ages ? (
          row.number
        ) : (
          <Button
            type="link"
            onClick={() =>
              onOpenOrder({ id: row.id, view: 'orders', order_no: row.number })
            }
          >
            {row.number}
          </Button>
        ),
    },
    { title: '客户', dataIndex: 'customer', width: 190 },
    ...(!ages
      ? [
          {
            title: query.group_by === 'product' ? '产品' : '订单产品',
            key: 'product',
            width: 230,
            render: (_, row) =>
              `${row.product || '未填写产品'}${row.product_count > 1 ? ` 等 ${row.product_count} 项` : ''}`,
          },
          {
            title: '订单数量',
            key: 'ordered_quantity',
            align: 'right',
            width: 130,
            render: (_, row) =>
              row.ordered_quantity == null
                ? '按单位查看'
                : `${number(row.ordered_quantity)} ${row.unit}`,
          },
          {
            title: '已出货',
            key: 'shipped_quantity',
            align: 'right',
            width: 130,
            render: (_, row) =>
              row.shipped_quantity == null
                ? '—'
                : `${number(row.shipped_quantity)} ${row.unit}`,
          },
        ]
      : [{ title: '来源出货', dataIndex: 'source_number', width: 180 }]),
    {
      title: ages ? '到期日' : '订单交期',
      key: 'due_date',
      width: 125,
      render: (_, row) => row.due_date || '未确定',
    },
    {
      title: ages ? '账龄' : '交付状态',
      key: 'status',
      width: 145,
      render: (_, row) => (
        <span
          className={
            row.status === 'overdue' || row.status.startsWith('late_')
              ? 'erp-statistics-danger'
              : ''
          }
        >
          {statusLabels[row.status] || row.status}
        </span>
      ),
    },
    ...(ages || data?.access.sales_amounts
      ? [
          {
            title: `${ages ? '未结' : query.group_by === 'product' ? '货品' : '订单'}金额 · ${query.currency}`,
            key: 'amount',
            align: 'right',
            width: 170,
            render: (_, row) => number(row.amount, true),
          },
        ]
      : []),
    ...(!ages ? [{ title: '业务负责人', dataIndex: 'owner', width: 130 }] : []),
  ]
  if (ages && canOpen('/erp/finance/receivables')) {
    sourceColumns[0].render = (_, row) => (
      <Button
        type="link"
        onClick={() =>
          navigate(
            `/erp/finance/receivables?link_keyword=${encodeURIComponent(row.number)}`
          )
        }
      >
        {row.number}
      </Button>
    )
  }
  const statusOptions = (
    ages
      ? [
          'all',
          'overdue',
          'not_due',
          'late_7',
          'late_30',
          'late_60',
          'late_more',
          'undated',
        ]
      : [
          'all',
          'done',
          'pending',
          'overdue',
          'soon',
          'closed',
          'unknown',
          'undated',
        ]
  ).map((value) => ({ value, label: statusLabels[value] }))
  const content = (
    <>
      <BusinessViewSurface
        className="erp-statistics-results"
        activeView={`statistics:${query.report}:${groupKey || query.group_by}:${display}`}
        loading={loading}
      >
        <div className="erp-statistics-result-head">
          {groupKey ? (
            <>
              <Button
                icon={<ArrowLeftOutlined />}
                aria-label="返回汇总"
                onClick={() => update(clearGroup, { resetPage: false })}
              >
                返回汇总
              </Button>
              <strong title={data?.group_name || groupLabel}>
                {data?.group_name || groupLabel || '来源明细'} ·{' '}
                {ages ? '应收来源' : '来源订单'}
              </strong>
            </>
          ) : (
            <strong>
              {ages
                ? '客户应收账龄'
                : query.group_by === 'product'
                  ? '产品交付汇总'
                  : '客户交付汇总'}{' '}
              <small>{number(board?.total)} 项</small>
            </strong>
          )}
          <span className="erp-statistics-toolbar-spacer" />
          {groupKey ? (
            <Select
              aria-label="来源状态"
              value={sourceFilter}
              options={statusOptions}
              onChange={(source_status) =>
                update({ source_status, source_page: '' }, { resetPage: false })
              }
            />
          ) : (
            <>
              {!ages && (
                <Select
                  aria-label="汇总维度"
                  value={query.group_by}
                  options={[
                    { value: 'customer', label: '按客户' },
                    { value: 'product', label: '按产品' },
                  ]}
                  onChange={(group) => update({ group, sq: '', ...clearGroup })}
                />
              )}
              <Select
                aria-label="统计排序"
                value={`${query.sort}:${query.direction}`}
                options={[
                  { value: 'count:desc', label: '按单数 ↓' },
                  { value: 'overdue:desc', label: '按逾期 ↓' },
                  { value: 'name:asc', label: '按名称 ↑' },
                  ...(money || ages
                    ? [{ value: 'amount:desc', label: '按金额 ↓' }]
                    : []),
                ]}
                onChange={(value) => {
                  const [sort, direction] = value.split(':')
                  update({ sort, direction })
                }}
              />
              <BusinessViewSwitch
                value={display}
                options={displayOptions}
                onChange={(value) =>
                  update({ display: value }, { resetPage: false })
                }
              />
            </>
          )}
        </div>
        <div className="erp-statistics-body" ref={bodyRef} aria-busy={loading}>
          {!allowed ? (
            <Empty description="当前账号没有此统计的来源查看权限" />
          ) : error ? (
            <Alert
              type="error"
              showIcon
              message={error}
              description="旧结果已清除，请重试或调整筛选。"
              action={<Button onClick={load}>重试</Button>}
            />
          ) : loading || !data ? (
            <div className="erp-statistics-state" role="status">
              正在查询统计…
            </div>
          ) : data.total === 0 ? (
            <Empty description="当前筛选暂无记录" />
          ) : (
            <>
              {!groupKey && display !== 'table' && (
                <StatisticsChart
                  groups={board.groups}
                  report={query.report}
                  onDrill={drill}
                />
              )}
              {!groupKey && (
                <div className="erp-statistics-context">
                  <span>
                    当前范围：
                    {ages
                      ? '当前未结应收'
                      : query.period === 'all'
                        ? '全部交期订单'
                        : `${board.date_from || '不限'} 至 ${board.date_to || '不限'}`}{' '}
                    · {statusLabels[query.status] || '全部'} · 合计覆盖完整筛选
                    {query.group_by === 'product' ? ' · 订单合计去重' : ''}
                  </span>
                  <span>点击数字查看来源{!ages && '订单'}</span>
                </div>
              )}
              {(groupKey || display !== 'chart') && (
                <Table
                  className="erp-statistics-table"
                  size="small"
                  bordered
                  rowKey={groupKey ? 'id' : 'key'}
                  columns={groupKey ? sourceColumns : summaryColumns}
                  dataSource={groupKey ? data.rows : board.groups}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  summary={
                    !groupKey
                      ? () => (
                        <Table.Summary>
                          <Table.Summary.Row>
                            {summaryColumns.map((column, index) => (
                              <Table.Summary.Cell
                                key={column.key}
                                index={index}
                                align={column.align}
                              >
                                {index === 0
                                    ? '全部筛选合计'
                                    : number(
                                        board.totals[column.key],
                                        amountKeysForTable.includes(column.key)
                                      )}
                              </Table.Summary.Cell>
                              ))}
                          </Table.Summary.Row>
                        </Table.Summary>
                        )
                      : undefined
                  }
                />
              )}
              {!groupKey &&
                (board.totals.missing_amount > 0 ||
                  board.totals.missing_shipment_amount > 0) &&
                money && (
                  <p className="erp-statistics-missing">
                    金额快照缺失：订单或明细{' '}
                    {number(board.totals.missing_amount)} 项，出货{' '}
                    {number(board.totals.missing_shipment_amount)}{' '}
                    项。对应金额显示“—”，请从来源单据核对。
                  </p>
                )}
            </>
          )}
        </div>
      </BusinessViewSurface>
      {!!data?.total && !loading && !error && (
        <WorkflowTaskPagination
          recordLabel={groupKey ? (ages ? '应收来源' : '来源订单') : '统计汇总'}
          unit={groupKey ? (ages ? '笔' : '单') : '项'}
          current={groupKey ? sourcePage : query.offset / query.limit + 1}
          pageSize={groupKey ? sourcePageSize : query.limit}
          total={data.total}
          loading={loading}
          onChange={(page, size) =>
            update(
              {
                [groupKey ? 'source_page' : 'stats_page']: page,
                [groupKey ? 'source_size' : 'stats_size']: size,
              },
              { resetPage: false }
            )
          }
        />
      )}
    </>
  )
  return { canUse: canSales || canFinance, toolbar, controls, content }
}
const amountKeysForTable = [
  'amount',
  'shipped_amount',
  'balance',
  ...STATISTICS_AGES.map(([key]) => key),
]
