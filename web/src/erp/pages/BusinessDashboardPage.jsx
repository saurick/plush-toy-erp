import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Empty, Popover, Select, Spin, Tag } from 'antd'
import {
  ArrowRightOutlined,
  FilterOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import useLiveSearch from '@/common/hooks/useLiveSearch'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listBusinessProgress } from '../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { canOpenRelatedDocumentPath } from '../utils/relatedDocumentNavigation.mjs'
import { effectiveSessionAllowsPage } from '../utils/adminProfileSync.mjs'
import { getWorkflowTaskDisplayName } from '../utils/processRuntimePresentation.mjs'
import {
  progressQueryFromURL,
  progressDelivery,
  progressStages,
  PROGRESS_SCOPE_OPTIONS,
  progressFilterCount,
  PROGRESS_FILTER_RESET,
  withProgressFilters,
} from '../utils/businessProgress.mjs'
import useBusinessStatistics from '../components/business-visualizations/useBusinessStatistics.jsx'
import BusinessProgressFilterFields, { ProgressDueFilters, ProgressBlockedFilter } from '../components/business-visualizations/BusinessProgressFilters.jsx'
import BusinessProgressDrawer from '../components/business-visualizations/BusinessProgressDrawer.jsx'
import BusinessProgressSummary, {
  ProgressBadges,
} from '../components/business-visualizations/BusinessProgressSummary.jsx'
import WorkflowTaskCard from '../components/workflow/WorkflowTaskCard.jsx'
import WorkflowTaskPagination from '../components/workflow/WorkflowTaskPagination.jsx'
import { PageHeaderCard } from '../components/business-list/BusinessListLayout.jsx'
import { ProductThumbnail } from '../components/master-data/ProductIdentity.jsx'
import FilterDateRangePicker from '../components/business-list/FilterDateRangePicker.jsx'
import '../styles/app/progress-board.css'

function Delivery({ row }) {
  const delivery = progressDelivery(row)
  return (
    <span className="erp-progress-delivery">
      <span className="erp-progress-delivery-copy">
        <span>{delivery.label}</span>
        <strong>{delivery.text}</strong>
      </span>
      {delivery.percent !== undefined && (
        <span
          className="erp-progress-track"
          role="progressbar"
          aria-label={row.view === 'orders' ? '实际出货比例' : '有效完工比例'}
          aria-valuenow={Math.round(delivery.percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${delivery.percent}%` }} />
        </span>
      )}
    </span>
  )
}

export default function BusinessDashboardPage() {
  const outlet = useOutletContext()
  const adminProfile = outlet?.adminProfile || null
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const statisticsActive = params.get('view') === 'statistics'
  const queryKey = JSON.stringify(progressQueryFromURL(params))
  const query = useMemo(() => JSON.parse(queryKey), [queryKey])
  const [dateOpen, setDateOpen] = useState(false)
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState(null)
  const summaryRef = useRef(null)
  const listRef = useRef(null)
  const begin = useLatestRequestCoordinator()
  const data =
    state?.key === queryKey && state?.profile === adminProfile
      ? state.data
      : null
  const view =
    (statisticsActive ? 'statistics' : query.view) ||
    (data && !data.access.sales && data.access.production
      ? 'production'
      : 'orders')
  const access = data?.access
  const [moreOpen, setMoreOpen] = useState(false)
  const [filterResetKey, setFilterResetKey] = useState(0)
  const filterTriggerRef = useRef(null)
  useEffect(() => {
    if (!moreOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      event.preventDefault()
      setMoreOpen(false)
      filterTriggerRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [moreOpen])
  const update = useCallback(
    (changes) => {
      // Route rendering can lag behind the URL during consecutive filter actions.
      const previous = new URLSearchParams(window.location.search)
      setParams(
        withProgressFilters(previous, {
          page: '',
          selected: '',
          view:
            progressQueryFromURL(previous).view ||
            (view === 'statistics' ? '' : view),
          ...changes,
        })
      )
      setSelection(null)
    },
    [setParams, view]
  )
  const progressSearch = useLiveSearch({
    value: query.keyword,
    onSearch: (keyword) => update({ q: keyword }),
  })
  const load = useCallback(async () => {
    const request = begin('business-progress')
    if (statisticsActive || !adminProfile?.id) {
      setLoading(false)
      request.finish()
      return false
    }
    setLoading(true)
    setError('')
    try {
      const result = await listBusinessProgress(query, {
        signal: request.signal,
      })
      if (!request.isCurrent()) return false
      setState({ key: queryKey, profile: adminProfile, data: result })
      return true
    } catch (failure) {
      if (request.isCurrent()) {
        setState(null)
        setError(getActionErrorMessage(failure, '查询业务进度'))
      }
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [adminProfile, begin, query, queryKey, statisticsActive])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (data?.total > 0 && query.offset >= data.total) {
      update({ page: Math.ceil(data.total / query.limit) })
    }
  }, [data, query.offset, query.limit, update])
  useEffect(() => {
    if (!statisticsActive) return outlet?.registerPageRefresh?.(load)
    return undefined
  }, [load, outlet, statisticsActive])
  useEffect(() => {
    setSelection(null)
  }, [adminProfile])
  const openDetail = useCallback(
    (row, section = 'lines') =>
      setSelection({
        id: row.id,
        view: row.view,
        orderNo: row.order_no,
        section,
        profile: adminProfile,
      }),
    [adminProfile]
  )
  const canOpen = useCallback(
    (path) => {
      if (path.startsWith('/erp/task-board')) {
        return (
          (adminProfile?.is_super_admin ||
            outlet?.allowedMenuPaths?.includes('/erp/task-board')) &&
          effectiveSessionAllowsPage(adminProfile, 'task-board', {
            isLocalDev: false,
            isSuperAdmin: adminProfile?.is_super_admin === true,
          })
        )
      }
      return canOpenRelatedDocumentPath({
        path,
        adminProfile,
        allowedMenuPaths: outlet?.allowedMenuPaths,
      })
    },
    [adminProfile, outlet?.allowedMenuPaths]
  )
  const statistics = useBusinessStatistics({
    active: statisticsActive,
    adminProfile,
    outlet,
    params,
    setParams,
    onOpenOrder: openDetail,
    canOpen,
    navigate,
  })
  const filterCount = progressFilterCount(query)
  const filterCounts = loading ? undefined : data?.counts
  const filterQuery = { ...query, view }
  const extraFilters = [
    query.owner && {
      key: 'owner',
      label: `负责人：${query.owner}`,
      clear: { owner: '' },
    },
    (query.date_from || query.date_to) && {
      key: 'date',
      label: `交期：${query.date_from || '不限'} 至 ${query.date_to || '不限'}`,
      clear: { from: '', to: '' },
    },
    query.unlinked_only && {
      key: 'unlinked_only',
      label: '仅看未关联销售',
      clear: { unlinked_only: false },
    },
  ].filter(Boolean)
  const hasFilters = query.keyword || filterCount > 0
  const selectedRow =
    data?.rows.find(
      (row) => `${row.view}:${row.id}` === params.get('selected')
    ) || data?.rows[0]
  const selectRow = (row, focusSummary = false) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('selected', `${row.view}:${row.id}`)
        return next
      },
      { replace: true }
    )
    if (focusSummary) {
      requestAnimationFrame(() => {
        summaryRef.current?.focus({ preventScroll: true })
        summaryRef.current?.scrollIntoView({ block: 'nearest' })
      })
    }
  }
  const selectedKey = params.get('selected')
  const selectedID = selectedRow?.id
  useEffect(() => {
    if (
      selectedKey &&
      selectedID &&
      window.matchMedia('(min-width: 901px)').matches
    ) {
      listRef.current
        ?.querySelector(`[data-progress-order-id="${selectedID}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedKey, selectedID])
  return (
    <section
      className={`erp-progress-board${statisticsActive ? ' erp-progress-board--statistics' : ''}`}
      aria-label="进度看板"
    >
      {dateOpen && (
        <FilterDateRangePicker
          title="选择交期日期范围"
          dateFrom={query.date_from}
          dateTo={query.date_to}
          onCancel={() => { setDateOpen(false); setMoreOpen(true) }}
          onApply={({ dateFrom, dateTo }) => {
            update({ from: dateFrom, to: dateTo })
            setDateOpen(false)
          }}
        />
      )}
      <PageHeaderCard
        compact
        title="进度看板"
        viewSwitch={
          <SlidingSegmented
            aria-label="进度查看方式"
            value={view}
            onChange={(next) => update({ view: next })}
            options={[
              {
                label: '经营统计',
                value: 'statistics',
                disabled: !statistics.canUse,
              },
              {
                label: '订单交付',
                value: 'orders',
                disabled: access?.sales === false,
              },
              {
                label: '生产执行',
                value: 'production',
                disabled: access?.production === false,
              },
            ]}
          />
        }
      />
      <div className="erp-progress-controls">
        <div className="erp-progress-toolbar">
          {statisticsActive ? (
            statistics.toolbar
          ) : (
            <>
              <Select
                aria-label="记录范围"
                value={query.scope}
                options={PROGRESS_SCOPE_OPTIONS}
                onChange={(scope) => update({ scope })}
                className="erp-progress-scope"
              />
              <div className="erp-progress-metric-row" role="group" aria-label="进度快捷筛选">
                <ProgressDueFilters query={filterQuery} counts={filterCounts} onChange={update} />
                <ProgressBlockedFilter query={filterQuery} counts={filterCounts} taskAccess={access?.tasks} onChange={update} />
              </div>
              <SearchInput
                className="erp-progress-search"
                aria-label="搜索订单、客户或产品"
                placeholder="搜单号、客户、产品"
                value={progressSearch.value}
                allowClear
                maxLength={100}
                onChange={progressSearch.onChange}
                onCompositionStart={progressSearch.onCompositionStart}
                onCompositionEnd={progressSearch.onCompositionEnd}
                onPressEnter={progressSearch.onPressEnter}
              />
              <Popover
                trigger="click"
                open={moreOpen}
                onOpenChange={setMoreOpen}
                placement="bottom"
                content={
                  <section className="erp-progress-filters" role="dialog" aria-label="筛选进度">
                    <BusinessProgressFilterFields
                      query={filterQuery}
                      counts={filterCounts}
                      taskAccess={access?.tasks}
                      resetKey={filterResetKey}
                      onChange={update}
                      onDateRange={() => { setMoreOpen(false); setDateOpen(true) }}
                    />
                    <Button block onClick={() => { setFilterResetKey((value) => value + 1); update(PROGRESS_FILTER_RESET) }}>重置筛选</Button>
                  </section>
                }
              >
                <Button ref={filterTriggerRef} icon={<FilterOutlined />} aria-haspopup="dialog" aria-expanded={moreOpen} aria-label={filterCount ? `筛选进度，已应用 ${filterCount} 项` : '筛选进度'}>
                  筛选{filterCount ? ` · ${filterCount}` : ''}
                </Button>
              </Popover>
              {canOpen('/erp/task-board') && (
                <Button type="text" onClick={() => navigate('/erp/task-board')}>
                  全部任务
                </Button>
              )}
              <Popover
                trigger="click"
                title="进度如何计算"
                content={
                  <div className="erp-progress-help">
                    <p>
                      出货进度按已实际出货数量计算，取消的出货不计入。不同单位分开查看。
                    </p>
                    <p>
                      领料按计划用量与已登记领料核对，不代表库存齐套。生产和质检展示批次状态，有效完工会扣除已登记返工量。
                    </p>
                    <p>
                      选项数量表示保留其他条件时，选择该项可查到的记录数；交期与任务受阻可以组合。筛选数量统计非默认范围、交期情况、任务受阻、销售关联、负责人和日期范围，不含搜索词。关联任务仅包含当前账号可见内容。
                    </p>
                  </div>
                }
              >
                <Button
                  type="text"
                  icon={<InfoCircleOutlined />}
                  aria-label="查看进度计算说明"
                />
              </Popover>
              <div className="erp-progress-freshness">
                {data
                  ? `更新于 ${dayjs(data.snapshot_at).format('HH:mm')}`
                  : loading
                    ? '正在查询…'
                    : '等待查询'}
              </div>
            </>
          )}
        </div>
        {statisticsActive ? (
          statistics.controls
        ) : extraFilters.length > 0 ? (
          <div className="erp-progress-active-filters">
            {extraFilters.map((item) => (
              <Tag key={item.key} closable onClose={() => update(item.clear)}>
                {item.label}
              </Tag>
            ))}
          </div>
        ) : null}
      </div>
      {statisticsActive ? (
        statistics.content
      ) : error ? (
        <Alert
          className="erp-progress-error"
          type="error"
          showIcon
          message={error}
          description="未显示旧结果，请重试或调整查询范围。"
          action={
            <Button onClick={load} aria-label="重试">
              重试
            </Button>
          }
        />
      ) : (
        <>
          <Spin spinning={loading}>
            <div className="erp-progress-layout" aria-busy={loading}>
              <section
                className="erp-progress-list-panel"
                aria-label={view === 'orders' ? '订单交付进度' : '生产执行进度'}
              >
                <div className="erp-progress-list" ref={listRef}>
                  {data?.rows.length ? (
                    data.rows.map((row) => {
                      const productionStage = progressStages(row, access).find(
                        (stage) => stage.key === 'production'
                      )
                      const selected =
                        selectedRow?.id === row.id &&
                        selectedRow?.view === row.view
                      return (
                        <WorkflowTaskCard
                          as="article"
                          key={`${row.view}:${row.id}`}
                          className={`erp-progress-row${selected ? ' is-selected' : ''}`}
                          contentClassName="erp-progress-row-select"
                          label={`查看 ${row.order_no} 进度摘要`}
                          onOpen={() => selectRow(row, true)}
                          openButtonProps={{
                            'data-progress-order-id': row.id,
                            'aria-pressed': selected,
                            'aria-controls': 'progress-summary',
                          }}
                        >
                          <span className="erp-progress-row-head">
                            <strong className="erp-progress-order">
                              {row.order_no}
                            </strong>
                            <ProgressBadges row={row} />
                          </span>
                          <span className="erp-progress-row-product">
                            <span className="erp-progress-row-product-image">
                              <ProductThumbnail
                                productId={row.product_id}
                                name={row.product}
                              />
                              {row.product_count > 1 && (
                                <span
                                  className="erp-progress-product-count"
                                  aria-hidden="true"
                                >
                                  +{row.product_count - 1}
                                </span>
                              )}
                            </span>
                            <span className="erp-progress-row-copy">
                              <strong>
                                {row.product}
                                {row.product_count > 1
                                  ? ` 等 ${row.product_count} 项`
                                  : ''}
                              </strong>
                              <span>
                                {row.customer ||
                                  (row.unlinked
                                    ? '含未关联订单的生产明细'
                                    : '—')}
                              </span>
                              <span
                                className={
                                  row.overdue ? 'erp-progress-danger' : ''
                                }
                              >
                                {row.due_date || '待确定'} ·{' '}
                                {view === 'orders' ? '交期' : '计划结束'}
                              </span>
                            </span>
                          </span>
                          <Delivery row={row} />
                          <span className="erp-progress-row-foot">
                            <span>
                              {access?.tasks && row.attention_task
                                ? row.attention_reason ||
                                  getWorkflowTaskDisplayName({
                                    task_name: row.attention_task,
                                  })
                                : productionStage && !productionStage.disabled
                                  ? `生产：${productionStage.text}`
                                  : '查看资料与交付进度'}
                            </span>
                            <ArrowRightOutlined aria-hidden="true" />
                          </span>
                        </WorkflowTaskCard>
                      )
                    })
                  ) : loading ? (
                    <div className="erp-progress-empty" role="status">
                      正在查询进度…
                    </div>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        hasFilters ? '没有符合条件的记录' : '当前范围暂无记录'
                      }
                    />
                  )}
                </div>
              </section>
              <aside
                className="erp-progress-summary"
                id="progress-summary"
                aria-label="当前订单阶段摘要"
              >
                {selectedRow ? (
                  <BusinessProgressSummary
                    row={selectedRow}
                    access={access}
                    headingRef={summaryRef}
                    onSelectSection={(section) =>
                      openDetail(selectedRow, section)
                    }
                    onOpenDetail={() => openDetail(selectedRow)}
                  />
                ) : loading ? (
                  <div className="erp-progress-empty" role="status">
                    正在读取阶段摘要…
                  </div>
                ) : (
                  <Empty description="暂无可查看的阶段摘要" />
                )}
              </aside>
            </div>
          </Spin>
          {!!data?.total && (
            <WorkflowTaskPagination
              recordLabel="进度"
              unit="单"
              current={query.offset / query.limit + 1}
              pageSize={query.limit}
              total={data.total}
              loading={loading}
              onChange={(page, size) => update({ page, page_size: size })}
            />
          )}
        </>
      )}
      <BusinessProgressDrawer
        selection={selection?.profile === adminProfile ? selection : null}
        onClose={() => setSelection(null)}
        adminProfile={adminProfile}
        canOpen={canOpen}
        onNavigate={navigate}
      />
    </section>
  )
}
