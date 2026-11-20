import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Popover } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import SupplementalHelp from '@/common/components/help/SupplementalHelp'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import FilterChip from '@/common/components/navigation/FilterChip'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import SearchInput from '@/common/components/SearchInput'
import Table from '@/common/components/table/AppTable'
import { applyBusinessServerColumnSorters, readBusinessServerTableSort } from '../../utils/moduleTableColumns.mjs'
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
  normalizeStatisticsStatus,
  statisticsPaginationFromURL,
  STATISTICS_PAGE_SIZE_OPTIONS,
  STATISTICS_AGES,
  STATISTICS_STATUSES,
} from '../../utils/businessStatistics.mjs'
import { DateRangeFilter } from '../business-list/BusinessDateInputs.jsx'
import WorkflowTaskPagination from '../workflow/WorkflowTaskPagination.jsx'
import { BusinessViewSurface } from './BusinessVisualizationFrame.jsx'
import '../../styles/app/business-statistics.css'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'

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
  { label: '表格', value: 'table' },
  { label: '图表', value: 'chart' },
]
const summaryScrollKey = 'business-statistics:summary-scroll'
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

function StatisticsChart({ groups, report, currency, onDrill }) {
  const [inspection, setInspection] = useState(null)
  const touchPointer = useRef(false)
  const ages = report === 'receivables'
  const segments = (ages ? STATISTICS_AGES : deliverySegments).filter(
    ([key]) => groups.some((group) => (ages ? group[key] : groupValue(group, key)) > 0)
  )
  // Touch holds the inspection open until the user dismisses it or chooses a source.
  useEffect(() => {
    if (!inspection?.anchor) return undefined
    const dismiss = (event) => {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        inspection.anchor.focus({ preventScroll: true })
        setInspection(null)
      } else if (
        !inspection.anchor.contains(event.target) &&
        !event.target.closest?.('.erp-statistics-chart-tooltip')
      ) {
        setInspection(null)
      }
    }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', dismiss, true)
    }
  }, [inspection])
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
      role="region"
      className="erp-statistics-chart"
      aria-label={ages ? '客户应收账龄图' : '交付订单分布图'}
    >
      <div className="erp-statistics-legend">
        <span>当前页 · {ages ? `未结金额（${currency}）` : '订单数（单）'}</span>
        {segments.map(([key, label]) => (
          <span key={key}>
            <i className={`erp-statistics-tone-${key}`} />
            {label}
          </span>
        ))}
      </div>
      <div className="erp-statistics-plot">
        {groups.map((group) => (
          <div className="erp-statistics-column" key={group.key}>
            <Button
              type="link"
              className="erp-statistics-chart-name"
              data-statistics-group={group.key}
              title={group.name}
              onClick={() => onDrill(group)}
            >
              {group.name}
            </Button>
            <div className="erp-statistics-bar-track">
              <div
                className="erp-statistics-stack"
                style={{
                  width: `${statisticsRatio(ages ? group.balance : String(group.count), maximum)}%`,
                }}
              >
                {segments.map(([key, label]) => {
                  const value = ages ? group[key] : groupValue(group, key)
                  const total = ages ? group.balance : String(group.count)
                  const share = statisticsRatio(String(value), total)
                  const segmentKey = `${group.key}:${key}`
                  const pinned = inspection?.key === segmentKey && inspection.anchor
                  const openSources = () => {
                    setInspection(null)
                    onDrill(group, sourceStatus(key))
                  }
                  return share > 0 ? (
                    <Popover
                      key={key}
                      trigger={['hover', 'focus']}
                      placement="top"
                      classNames={{ root: 'erp-statistics-chart-tooltip' }}
                      destroyOnHidden
                      open={inspection?.key === segmentKey}
                      onOpenChange={(open) =>
                        setInspection((current) =>
                          current?.anchor
                            ? current
                            : open
                              ? { key: segmentKey }
                              : current?.key === segmentKey
                                ? null
                                : current
                        )
                      }
                      content={
                        <div className="erp-statistics-chart-tooltip-content">
                          <strong className="erp-statistics-chart-tooltip-name">
                            {group.name}
                          </strong>
                          <div className="erp-statistics-chart-tooltip-value">
                            <span>{label}</span>
                            <strong>
                              {number(value, ages)} {ages ? currency : '单'}
                            </strong>
                          </div>
                          <span className="erp-statistics-chart-tooltip-total">
                            当前筛选{ages ? '未结' : '共'} {number(total, ages)}{' '}
                            {ages ? currency : '单'} · 占本行 {number(share)}%
                          </span>
                          {pinned ? (
                            <Button size="small" onClick={openSources}>
                              {ages ? '查看来源应收' : '查看来源订单'}
                            </Button>
                          ) : (
                            <span className="erp-statistics-chart-tooltip-action">
                              {ages ? '点击查看来源应收' : `点击查看这 ${number(value)} 单`}
                            </span>
                          )}
                        </div>
                      }
                    >
                      <button
                        type="button"
                        className={`erp-statistics-tone-${key}`}
                        style={{ width: `${share}%` }}
                        aria-label={`${group.name} · ${label} ${number(value, ages)} ${ages ? currency : '单'}`}
                        onPointerDown={(event) => {
                          touchPointer.current = event.pointerType === 'touch'
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setInspection(null)
                        }}
                        onClick={(event) => {
                          if (event.detail > 0 && touchPointer.current) {
                            const anchor = event.currentTarget
                            setInspection(pinned ? null : { key: segmentKey, anchor })
                          } else {
                            openSources()
                          }
                        }}
                      />
                    </Popover>
                  ) : null
                })}
              </div>
            </div>
            <span className="erp-statistics-chart-number">
              {number(ages ? group.balance : group.count, ages)}
            </span>
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
  allowDocumentNavigation = true,
}) {
  const canSales =
    canOpen('/erp/sales/project-orders/sales-orders') &&
    hasActionPermission(adminProfile, PermissionCode.SALES_ORDER_READ) &&
    hasActionPermission(adminProfile, PermissionCode.SALES_ORDER_ITEM_READ)
  const canFinance =
    canOpen('/erp/finance/receivables') &&
    hasActionPermission(adminProfile, PermissionCode.FINANCE_RECEIVABLE_READ) &&
    hasActionPermission(
      adminProfile,
      PermissionCode.FIELD_FINANCE_SETTLEMENT_READ
    )
  const queryKey = JSON.stringify(statisticsQueryFromURL(params))
  const query = useMemo(() => JSON.parse(queryKey), [queryKey])
  const groupKey = params.get('group_key') || ''
  const groupLabel = params.get('group_name') || ''
  const sourceFilter = normalizeStatisticsStatus(
    query.report,
    params.get('source_status')
  )
  const sourceFrom = params.get('source_from') || ''
  const sourceTo = params.get('source_to') || ''
  const { limit: sourcePageSize, offset: sourceOffset } =
    statisticsPaginationFromURL(params, {
      source: true,
      fallbackSize: query.limit,
    })
  const sourcePage = sourceOffset / sourcePageSize + 1
  const display = params.get('display') === 'chart' ? 'chart' : 'table'
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
  const backRef = useRef(null)
  const drillOrigin = useRef('')
  const sortHeaderIndex = useRef(null)
  const tableSticky = useMemo(() => ({ getContainer: () => bodyRef.current }), [])
  const data =
    active && state?.key === requestKey && state?.profile === adminProfile
      ? state.data
      : null
  const board = groupKey ? null : data
  useEffect(() => {
    if (error || !active || groupKey) sortHeaderIndex.current = null
    if (!board || sortHeaderIndex.current === null) return
    if (document.activeElement === document.body) {
      bodyRef.current?.querySelector('.erp-statistics-table thead tr')?.cells[sortHeaderIndex.current]?.focus({ preventScroll: true })
    }
    sortHeaderIndex.current = null
  }, [active, board, error, groupKey])
  const ages = query.report === 'receivables'
  const statusLabels = {
    ...STATISTICS_STATUSES,
    overdue: ages ? '逾期未结' : STATISTICS_STATUSES.overdue,
    undated: ages ? '未定到期日' : '未定交期',
  }
  const money = board?.access?.sales_amounts === true
  const canSortAmount =
    ages || hasActionPermission(adminProfile, PermissionCode.FIELD_SALES_COMMERCIAL_READ)
  const allowed = ages ? canFinance : canSales
  const update = useCallback(
    (changes, { resetPage = true, replace = false } = {}) => {
      // Navigation may already contain a filter edit that has not rendered yet.
      const next = new URLSearchParams(window.location.search)
      const fields = typeof changes === 'function' ? changes(next) : changes
      if (resetPage) {
        next.delete('stats_page')
        next.delete('source_page')
      }
      for (const [key, value] of Object.entries(fields)) {
        if (value == null || value === '') next.delete(key)
        else next.set(key, String(value))
      }
      setParams(next, { replace })
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
  const drill = (group, status = 'all') => {
    drillOrigin.current = group.key
    outlet?.pageUIState?.values?.set(
      summaryScrollKey,
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
    if (!active || !groupKey || !drillOrigin.current) return
    bodyRef.current?.scrollTo(0, 0)
    backRef.current?.focus({ preventScroll: true })
  }, [active, groupKey])
  useEffect(() => {
    const body = bodyRef.current
    if (!active || loading || groupKey || !data || !body) return
    const values = outlet?.pageUIState?.values
    const top = values?.get(summaryScrollKey)
    if (top != null) {
      body.scrollTop = top
      values.delete(summaryScrollKey)
    }
    if (drillOrigin.current) {
      Array.from(body.querySelectorAll('[data-statistics-group]'))
        .find((node) => node.dataset.statisticsGroup === drillOrigin.current)
        ?.focus({ preventScroll: true })
      drillOrigin.current = ''
    }
  }, [active, data, groupKey, loading, outlet?.pageUIState])
  const switchReport = (report) => {
    const changesGroup = params.get('group') === 'product'
    update({ report, status: '', sort: '', direction: '', ...(changesGroup ? { sq: '' } : {}), ...clearGroup })
  }
  const reportOptions = [
    ...(canSales ? [{ value: 'delivery', label: '交付汇总' }] : []),
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
  const startDate = query.period === 'custom' ? query.date_from : board?.date_from || ''
  const endDate = query.period === 'custom' ? query.date_to : board?.date_to || ''
  const updatePeriod = (period, from = '', to = '') =>
    update({ period, stfrom: from, stto: to, ...clearGroup })
  const product = query.group_by === 'product'
  const sortOptions = [
    ['count', ages ? '未结笔数' : '订单数', 'desc'],
    ['overdue', ages ? '逾期笔数' : '逾期单数', 'desc'],
    ['name', '名称', 'asc'],
    ...(canSortAmount ? [['amount', '金额', 'desc']] : []),
  ].map(([field, label, defaultDirection]) => {
    const direction = query.sort === field ? query.direction : defaultDirection
    return { value: `${field}:${direction}`, label: label + (direction === 'asc' ? '升序' : '降序') }
  })
  const sortFields = { name: 'name', count: 'count', overdue: 'overdue', ...(canSortAmount ? { [ages ? 'balance' : 'amount']: 'amount' } : {}) }
  const currentSort = `${query.sort}:${query.direction}`
  const tableSort = params.has('sort') ? { sort_by: query.sort, sort_direction: query.direction } : null
  const filters = (
    <div className="erp-statistics-filters" role="group" aria-label="统计筛选">
      {!ages && (
        <FilterChipGroup
          label="汇总维度"
          allowClear={false /* 不可清空：汇总必须选择客户或产品。 */}
          className="erp-business-filter-control"
          aria-label="汇总维度"
          value={query.group_by}
          options={[
            { value: 'customer', label: '按客户' },
            { value: 'product', label: '按产品' },
          ]}
          onChange={(group) => update({ group, sq: '', ...clearGroup })}
        />
      )}
      {!ages && (
        <DateRangeFilter
          options={[{ value: 'due_date', label: '订单交期' }]}
          startValue={startDate}
          endValue={endDate}
          onRangeChange={(from, to) => updatePeriod('custom', from, to)}
          shortcutFilter={{
            exclusive: true,
            emptyValue: 'all',
            options: [
              { value: 'all', label: '不限' },
              { value: 'month', label: '本月' },
              { value: 'soon', label: '未来 7 天' },
            ],
            value: query.period,
            onChange: updatePeriod,
          }}
        />
      )}
      <FilterChipGroup
        allowClear={false /* 不可清空：金额统计必须明确单一币种。 */}
        className="erp-business-filter-control erp-statistics-currency"
        label="币种"
        aria-label="统计币种"
        value={query.currency}
        options={['CNY', 'USD', 'HKD'].map((currency) => ({ value: currency, label: currency }))}
        onChange={(currency) => update({ currency, ...clearGroup })}
      />
      <SearchInput
        className="erp-statistics-search"
        aria-label={product ? '搜索产品' : '搜索客户'}
        placeholder={product ? '搜索产品' : '搜索客户'}
        value={query.keyword}
        resetKey={`${query.report}:${query.group_by}`}
        allowClear
        maxLength={100}
        onSearch={(sq) => update({ sq, ...clearGroup })}
      />
      <FilterChipGroup
        allowClear={false /* 不可清空：默认排序为单数或笔数降序。 */}
        className="erp-business-filter-control erp-statistics-sort"
        label="排序"
        aria-label="统计排序"
        value={sortOptions.some(({ value }) => value === currentSort) ? currentSort : undefined}
        options={sortOptions}
        onChange={(value) => {
          const [sort, direction] = value.split(':')
          update({ sort, direction })
        }}
      />
    </div>
  )
  const scopeHelp = (
    <SupplementalHelp
      label="统计口径"
      aria-label="查看统计口径"
      title={ages ? '应收账龄口径' : '交付汇总口径'}
      content={
        <div className="erp-statistics-help">
          {ages ? (
            <p>
              统计已过账的未结余额，扣除核销和红冲，计入冲正。按中国日期计算账龄，未填到期日单列；不同币种分开查看。
            </p>
          ) : (
            <>
              {query.period !== 'all' && (startDate || endDate) && (
                <p>当前订单交期：{startDate || '不限'} 至 {endDate || '不限'}。</p>
              )}
              <p>按实际出货判断交齐；交期按待交明细的最早交期。逾期与 7 天内交付只统计仍待交付的订单。</p>
              {product && <p>同一订单可能出现在多个产品行，筛选结果合计按订单去重。</p>}
              {money && (
                <p>
                  {product ? '货品金额按订单明细计算，不分摊税费、运费。' : '订单金额取冻结的订单总额。'}
                  已出货金额取出货快照，缺失时显示“—”。
                </p>
              )}
            </>
          )}
          <p>状态数字按其他查询条件统计。表格合计覆盖选中状态的全部结果，图表显示当前页。点击名称或状态数字可查看来源。</p>
        </div>
      }
    />
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
  const snapshot = (
    <span className="erp-statistics-meta">
      <span>{data ? `截至 ${dayjs(data.snapshot_at).format('YYYY-MM-DD HH:mm')}` : ''}</span>
    </span>
  )
  const metrics = (
    <div className="erp-statistics-summary-row">
      <div className="erp-statistics-metrics" role="group" aria-label={ages ? '账龄筛选' : '交付状态筛选'}>
        {metricItems.map(([key, label, value]) => (
          <FilterChip
            key={key}
            disabled={loading || !board}
            selected={query.status === key}
            count={
              <>
                <strong
                  className={
                    key === 'overdue' && !loading && Number(value) > 0
                      ? 'erp-statistics-danger'
                      : undefined
                  }
                >
                  {number(loading ? null : value, ages)}
                </strong>
                {!ages && <small>单</small>}
              </>
            }
            onClick={() => {
              if (key === 'all' && query.status === 'all') return
              update({ status: key === 'all' || query.status === key ? '' : key })
            }}
          >
            {label}
          </FilterChip>
        ))}
      </div>
      {snapshot}
    </div>
  )
  const valueLink = (row, key, asMoney = false) => {
    const text = number(row[key], asMoney)
    if (!(Number(row[key]) > 0)) return <span className="erp-statistics-inactive-value">{text}</span>
    return (
      <Button
        type="link"
        className={`erp-statistics-value${key === 'overdue' ? ' erp-statistics-danger' : ''}`}
        onClick={() => drill(row, ['count', 'balance'].includes(key) ? 'all' : sourceStatus(key))}
      >
        {text}
      </Button>
    )
  }
  const summaryColumns = [
    {
      title: query.group_by === 'product' ? '产品' : '客户',
      key: 'name',
      dataIndex: 'name',
      width: 260,
      render: (_, row) => (
        <Button
          type="link"
          className="erp-statistics-name"
          data-statistics-group={row.key}
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
      dataIndex: 'count',
      align: 'right',
      width: 90,
      render: (_, row) => valueLink(row, 'count'),
    },
  ]
  if (ages) {
    summaryColumns.push(
      {
        title: `未结金额 · ${query.currency}`,
        key: 'balance',
        dataIndex: 'balance',
        align: 'right',
        width: 155,
        render: (_, row) => valueLink(row, 'balance', true),
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
        dataIndex: key,
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
          dataIndex: 'amount',
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
  if (allowDocumentNavigation && ages && canOpen('/erp/finance/receivables')) {
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
  const sourceScope = [
    ages ? '应收账龄' : product ? '交付汇总 · 按产品' : '交付汇总 · 按客户',
    !ages && (sourceFrom || sourceTo || data?.date_from || data?.date_to
      ? `${sourceFrom || data?.date_from || '不限'} 至 ${sourceTo || data?.date_to || '不限'}`
      : query.period === 'all' ? '全部交期' : ''),
    query.status !== 'all' && statusLabels[query.status],
    query.currency,
  ].filter(Boolean).join(' · ')
  const sourceTitle = [
    data?.group_name || groupLabel,
    ages ? '应收来源' : '来源订单',
  ].filter(Boolean).join(' · ')
  const content = (
    <>
      <BusinessViewSurface
        className="erp-statistics-results"
        activeView={`statistics:${query.report}:${groupKey || query.group_by}:${display}`}
        loading={loading}
      >
        <div className="erp-statistics-toolbar">
          {groupKey ? (
            <>
              <div className="erp-statistics-result-head">
                <Button
                  ref={backRef}
                  icon={<ArrowLeftOutlined aria-hidden="true" />}
                  onClick={() => update(clearGroup, { resetPage: false })}
                >
                  返回汇总
                </Button>
                <strong className="erp-statistics-source-title">
                  {sourceTitle}
                </strong>
                <FilterChipGroup
                  allowClear
                  className="erp-statistics-source-filter"
                  label="来源状态"
                  aria-label="来源状态"
                  emptyValue="all"
                  value={sourceFilter}
                  options={statusOptions}
                  onChange={(source_status) =>
                    update({ source_status, source_page: '' }, { resetPage: false })
                  }
                />
              </div>
              <div className="erp-statistics-summary-row">
                <span className="erp-statistics-source-context">{sourceScope}</span>
                {snapshot}
              </div>
            </>
          ) : (
            <>
              <div
                className="erp-statistics-summary-head"
                data-report={query.report}
                data-custom-period={!ages && query.period === 'custom' ? '' : undefined}
              >
                <div className="erp-statistics-report-picker">
                  {reportOptions.length > 1 ? (
                    <SlidingTabList
                      aria-label="统计内容"
                      value={query.report}
                      options={reportOptions}
                      onChange={switchReport}
                    />
                  ) : (
                    <strong>{reportOptions[0]?.label || '经营统计'}</strong>
                  )}
                  {scopeHelp}
                </div>
                {allowed && filters}
                <div className="erp-business-visual-switch">
                  <Segmented
                    aria-label="页面展示方式"
                    value={display}
                    options={displayOptions}
                    onChange={(value) =>
                      update({ display: value === 'chart' ? value : '' }, { resetPage: false })
                    }
                  />
                </div>
              </div>
              {allowed && metrics}
            </>
          )}
        </div>
        <div className="erp-statistics-body" ref={bodyRef} aria-busy={loading}>
          {!allowed ? (
            <Empty state="denied" description="当前账号没有此统计的来源查看权限" detail="请联系管理员核对权限。" />
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
              {(groupKey || display === 'table') && (
                <Table
                  sticky={tableSticky}
                  className="erp-statistics-table"
                  size="small"
                  bordered
                  rowKey={groupKey ? 'id' : 'key'}
                  columns={groupKey ? sourceColumns : applyBusinessServerColumnSorters(summaryColumns, sortFields, tableSort)}
                  onChange={(_page, _filters, sorter) => {
                    sortHeaderIndex.current = document.activeElement?.closest('.erp-statistics-table th')?.cellIndex ?? null
                    const next = readBusinessServerTableSort(sorter, sortFields)
                    update({ sort: next?.sort_by, direction: next?.sort_direction })
                  }}
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
                                    ? '筛选结果合计'
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
              {!groupKey && display === 'chart' && (
                <StatisticsChart
                  groups={board.groups}
                  report={query.report}
                  currency={query.currency}
                  onDrill={drill}
                />
              )}
              {!groupKey && display === 'table' &&
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
          pageSizeOptions={STATISTICS_PAGE_SIZE_OPTIONS}
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
  return { canUse: canSales || canFinance, content }
}
const amountKeysForTable = [
  'amount',
  'shipped_amount',
  'balance',
  ...STATISTICS_AGES.map(([key]) => key),
]
