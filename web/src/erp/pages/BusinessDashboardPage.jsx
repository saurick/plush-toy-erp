import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Popover, Spin, Tag } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import SupplementalHelp from '@/common/components/help/SupplementalHelp'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SearchInput from '@/common/components/SearchInput'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listBusinessProgress } from '../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { canOpenRelatedDocumentPath } from '../utils/relatedDocumentNavigation.mjs'
import { BUSINESS_ROUTE_PATHS } from '../utils/masterDataOrderView.mjs'
import { effectiveSessionAllowsPage } from '../utils/adminProfileSync.mjs'
import { openWorkflowTaskRow } from '../utils/workflowTaskEntry.mjs'
import {
  progressQueryFromURL,
  progressSourcePath,
  progressAttention,
  progressExtraFilters,
  progressFilterCount,
  progressFilterReset,
  withProgressFilters,
} from '../utils/businessProgress.mjs'
import useBusinessStatistics from '../components/business-visualizations/useBusinessStatistics.jsx'
import BusinessProgressFilterFields, {
  ProgressDueFilters,
  ProgressBlockedFilter,
  ProgressDeliveryFilters,
  ProgressDeliverySwitch,
} from '../components/business-visualizations/BusinessProgressFilters.jsx'
import ProgressDeliveryLines from '../components/business-visualizations/ProgressDeliveryLines.jsx'
import ProgressSortHeader from '../components/business-visualizations/ProgressSortHeader.jsx'
import { BusinessProgressSort } from '@/common/consts/statuses.generated.mjs'
import BusinessProgressDrawer from '../components/business-visualizations/BusinessProgressDrawer.jsx'
import {
  ProgressIdentity,
  ProgressDue,
  ProgressDelivery,
  ProgressAttention,
} from '../components/business-visualizations/ProgressCompactContent.jsx'
import WorkflowTaskPagination from '../components/workflow/WorkflowTaskPagination.jsx'
import { PageHeaderCard } from '../components/business-list/BusinessListLayout.jsx'
import FilterDateRangePicker from '../components/business-list/FilterDateRangePicker.jsx'
import BusinessFilterPopoverContent, { businessFilterPopoverOverflow } from '../components/business-list/BusinessFilterPopoverContent.jsx'
import '../styles/app/progress-board.css'

export default function BusinessDashboardPage() {
  const outlet = useOutletContext()
  const adminProfile = outlet?.adminProfile || null
  const navigate = useNavigate()
  const location = useLocation()
  const pendingProgressReturn = useRef(location.state?.progressReturn)
  const [params, setSearchParams] = useSearchParams()
  const setParams = useCallback(
    (next, options) => setSearchParams(next, { state: { ...location.state, progressReturn: undefined }, ...options }),
    [setSearchParams, location.state]
  )
  const statisticsActive = params.get('view') === 'statistics'
  const queryKey = JSON.stringify(progressQueryFromURL(params))
  const query = useMemo(() => JSON.parse(queryKey), [queryKey])
  const [dateOpen, setDateOpen] = useState(false)
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState(null)
  const listRef = useRef(null)
  const navigateFromProgress = (path, detailContext, rowID) => {
    const historyState = window.history.state
    const target = new URL(path, window.location.origin)
    const returnToDetail = target.searchParams.has('task_id') || target.searchParams.get('view') === 'followup'
    const progressReturn = {
      adminID: adminProfile.id,
      scrollTop: listRef.current?.scrollTop || 0,
      rowID,
      selection: returnToDetail && selection && detailContext ? {
        id: selection.id, view: selection.view, lineID: selection.lineID, orderNo: selection.orderNo, ...detailContext,
      } : null,
    }
    window.history.replaceState({ ...historyState, usr: { ...historyState?.usr, progressReturn } }, '')
    navigate(path, { state: { progressOrigin: { adminID: adminProfile.id, orderNo: selection?.orderNo, index: historyState?.idx } } })
  }
  const viewQueries = useRef({})
  const deliveryQueries = useRef({})
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
  const lines = view === 'orders' && query.display === 'lines'
  const [moreOpen, setMoreOpen] = useState(false)
  const filterTriggerRef = useRef(null)
  const filterPanelRef = useRef(null)
  const filterPanelId = React.useId()
  const closeFilters = () => {
    setMoreOpen(false)
    filterTriggerRef.current?.focus({ preventScroll: true })
  }
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
  const changeView = (nextView) => {
    const previous = new URLSearchParams(window.location.search)
    const keys = ['q', 'scope', 'due_status', 'blocked_only', 'unlinked_only', 'owner', 'owner_name', 'from', 'to', 'page', 'page_size', 'selected', 'display', 'delivery_status', 'sales_order_id', 'customer_id', 'sort_by', 'sort_direction']
    if (view === 'orders' || view === 'production') {
      viewQueries.current[view] = Object.fromEntries(keys.filter((key) => previous.has(key)).map((key) => [key, previous.get(key)]))
    } else if (view === 'statistics') {
      viewQueries.current.statistics = previous.get('display') === 'chart' ? { display: 'chart' } : {}
    }
    keys.forEach((key) => previous.delete(key))
    for (const [key, value] of Object.entries(viewQueries.current[nextView] || {})) previous.set(key, value)
    previous.set('view', nextView)
    setParams(nextView === 'statistics' ? previous : withProgressFilters(previous, {}))
    setSelection(null)
  }
  const changeDeliveryDisplay = (display) => {
    const previous = new URLSearchParams(window.location.search)
    const current = previous.get('display') === 'lines' ? 'lines' : 'orders'
    const keys = ['page', 'page_size', 'due_status', 'delivery_status', 'blocked_only', 'sort_by', 'sort_direction']
    deliveryQueries.current[current] = Object.fromEntries(keys.map((key) => [key, previous.get(key) || '']))
    const saved = deliveryQueries.current[display]
    update({
      page: saved?.page || '',
      page_size: saved?.page_size || '',
      sort_by: saved?.sort_by || '',
      sort_direction: saved?.sort_direction || '',
      display: display === 'lines' ? 'lines' : '',
      due_status: display === 'orders' ? saved?.due_status || '' : '',
      delivery_status: display === 'lines' ? saved?.delivery_status || '' : '',
      blocked_only: display === 'orders' ? saved?.blocked_only || '' : '',
    })
  }
  const progressSearch = {
    resetKey: query.view,
    value: query.keyword,
    onSearch: (keyword) => update({ q: keyword }),
  }
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
    viewQueries.current = {}
    deliveryQueries.current = {}
  }, [adminProfile])
  const openDetail = useCallback(
    (row, section = null) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.set('selected', `${row.line ? 'line' : row.view}:${row.id}`)
          return next
        },
        { replace: true }
      )
      setSelection({
        id: row.line?.sales_order_id || row.id,
        lineID: row.line ? row.id : undefined,
        view: row.view,
        orderNo: row.order_no,
        section,
        profile: adminProfile,
      })
    },
    [adminProfile, setParams]
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
  const salesReturn = location.state?.salesDeliveryReturn
  const canReturnToSales = salesReturn?.adminID === adminProfile?.id &&
    salesReturn?.pathname === BUSINESS_ROUTE_PATHS.salesOrders &&
    (salesReturn.search === '' || typeof salesReturn.search === 'string' && salesReturn.search.startsWith('?')) &&
    canOpen(BUSINESS_ROUTE_PATHS.salesOrders)
  const returnToSales = () => navigate(
    { pathname: BUSINESS_ROUTE_PATHS.salesOrders, search: salesReturn.search },
    { replace: true, state: { restoredSalesDeliverySelection: salesReturn.selection } }
  )
  const filterCount = progressFilterCount(query)
  const filterCounts = loading ? undefined : data?.counts
  const filterQuery = { ...query, view }
  const extraFilters = progressExtraFilters(query)
  const hasFilters = query.id || query.keyword || filterCount > 0 || query.due_status !== 'all' ||
    lines && query.delivery_status !== 'all' || query.blocked_only
  const selectedRow =
    data?.rows.find(
      (row) => `${row.line ? 'line' : row.view}:${row.id}` === params.get('selected')
    ) || null
  const selectedKey = params.get('selected')
  const selectedID = selectedRow?.id
  useEffect(() => {
    const saved = pendingProgressReturn.current
    if (data && saved?.adminID === adminProfile?.id) {
      pendingProgressReturn.current = null
      if (listRef.current) listRef.current.scrollTop = saved.scrollTop
      if (saved.selection) setSelection({ ...saved.selection, profile: adminProfile })
      else if (saved.rowID) listRef.current?.querySelector(`[data-progress-order-id="${Number(saved.rowID)}"] .erp-progress-task-entry`)?.focus({ preventScroll: true })
      return
    }
    if (
      selectedKey &&
      selectedID &&
      window.matchMedia('(min-width: 901px)').matches
    ) {
      listRef.current
        ?.querySelector(`[data-progress-${lines ? 'line' : 'order'}-id="${selectedID}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedKey, selectedID, lines, data, adminProfile])
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
          onCancel={() => {
            setDateOpen(false)
            setMoreOpen(true)
          }}
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
          <SlidingTabList
            aria-label="进度查看方式"
            value={view}
            onChange={changeView}
            options={[
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
              {
                label: '经营统计',
                value: 'statistics',
                disabled: !statistics.canUse,
              },
            ]}
          />
        }
      />
      {!statisticsActive && (
        <div className="erp-progress-controls">
          {(canReturnToSales || query.id) && (
            <div className="erp-progress-order-context">
              {canReturnToSales && <Button icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={returnToSales}>返回销售订单</Button>}
              {query.id && (
                <Tag closable onClose={() => update({ sales_order_id: '' })}>
                  {data?.rows[0]?.order_no ? `订单：${data.rows[0].order_no}` : '仅看本单'}
                </Tag>
              )}
            </div>
          )}
          <div className={`erp-progress-toolbar${lines ? ' erp-progress-toolbar--delivery' : ''}`}>
            {view === 'orders' && <ProgressDeliverySwitch query={filterQuery} onChange={changeDeliveryDisplay} />}
            {!lines && (
              <div
                className="erp-progress-metric-row"
                role="group"
                aria-label="进度快捷筛选"
              >
                <ProgressDueFilters
                  compact
                  query={filterQuery}
                  counts={filterCounts}
                  onChange={update}
                />
                <ProgressBlockedFilter
                  compact
                  query={filterQuery}
                  counts={filterCounts}
                  taskAccess={access?.tasks}
                  onChange={update}
                />
              </div>
            )}
            <div className="erp-progress-query">
              <div className="erp-progress-lookup">
                <SearchInput
                  className="erp-progress-search"
                  aria-label="搜索订单、客户或产品"
                  placeholder="搜单号、客户、产品"
                  {...progressSearch}
                  allowClear
                  maxLength={100}
                />
                <Popover
                  trigger="click"
                  open={moreOpen}
                  onOpenChange={setMoreOpen}
                  placement="bottomRight"
                  autoAdjustOverflow={businessFilterPopoverOverflow}
                  classNames={{ root: 'erp-business-filter-popover' }}
                  afterOpenChange={(visible) => {
                    if (visible && [filterTriggerRef.current, document.body].includes(document.activeElement)) {
                      filterPanelRef.current?.focus({ preventScroll: true })
                    }
                  }}
                  content={
                    <BusinessFilterPopoverContent
                      id={filterPanelId}
                      panelRef={filterPanelRef}
                      triggerRef={filterTriggerRef}
                      open={moreOpen}
                      label="筛选进度"
                      onDismiss={closeFilters}
                      onClear={() => update(progressFilterReset(query))}
                      clearDisabled={!filterCount}
                    >
                      <BusinessProgressFilterFields
                        adminProfile={adminProfile}
                        query={filterQuery}
                        counts={filterCounts}
                        taskAccess={access?.tasks}
                        open={moreOpen}
                        onChange={update}
                        onDateRange={() => {
                          setMoreOpen(false)
                          setDateOpen(true)
                        }}
                      />
                    </BusinessFilterPopoverContent>
                  }
                >
                  <Button
                    ref={filterTriggerRef}
                    icon={<FilterOutlined />}
                    aria-haspopup="dialog"
                    aria-controls={moreOpen ? filterPanelId : undefined}
                    aria-expanded={moreOpen}
                    aria-label={
                      filterCount
                        ? `筛选进度，已应用 ${filterCount} 项`
                        : '筛选进度'
                    }
                  >
                    筛选{filterCount ? ` · ${filterCount}` : ''}
                  </Button>
                </Popover>
                <SupplementalHelp
                  label="进度计算"
                  aria-label="查看进度计算说明"
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
                        选项数量表示保留其他条件时，选择该项可查到的记录数；交期与任务受阻可以组合。筛选数量只统计额外条件；搜索词、已逾期、7天内和受阻快捷项不重复计数，清空筛选时保留。关联任务仅包含当前账号可见内容。
                      </p>
                    </div>
                  }
                />
              </div>
              {lines && (
                <ProgressDeliveryFilters query={filterQuery} counts={filterCounts} onChange={update} />
              )}
            </div>
          </div>
          {extraFilters.length > 0 ? (
            <div className="erp-progress-active-filters">
              {extraFilters.map((item) => (
                <Tag key={item.key} closable onClose={() => update(item.clear)}>
                  {item.label}
                </Tag>
              ))}
            </div>
          ) : null}
        </div>
      )}
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
            <section
              className="erp-progress-list-panel"
              aria-busy={loading}
              aria-label={view === 'orders' ? '订单交付进度' : '生产执行进度'}
            >
              <div className="erp-progress-list" ref={listRef}>
                {lines ? (
                  <ProgressDeliveryLines rows={data?.rows || []} snapshotAt={data?.snapshot_at} onOpen={openDetail} selectedID={selectedID} query={query} onSort={update} />
                ) : (
                  <table
                    className="erp-progress-table"
                    data-table-lines="appearance"
                    aria-label={
                      view === 'orders'
                        ? '订单交付紧凑总览'
                        : '生产执行紧凑总览'
                    }
                  >
                    <thead>
                      <tr>
                        <ProgressSortHeader field={BusinessProgressSort.ORDER_NO} query={query} onSort={update} label={view === 'orders' ? '订单号' : '生产单号'}>
                          {view === 'orders' ? '订单 / 产品' : '生产单 / 产品'}
                        </ProgressSortHeader>
                        <ProgressSortHeader field={BusinessProgressSort.DUE_DATE} query={query} onSort={update}>
                          {view === 'orders' ? '交期' : '计划结束'}
                        </ProgressSortHeader>
                        <th scope="col">
                          {view === 'orders'
                            ? '已出货 / 订购'
                            : '有效完工 / 计划'}
                        </th>
                        <th scope="col">当前关注 / 处理人</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.rows.map((row) => {
                        const attention = progressAttention(row, access)
                        const selected =
                          selectedRow?.id === row.id &&
                          selectedRow?.view === row.view
                        return (
                          <tr
                            key={`${row.view}:${row.id}`}
                            className={`erp-progress-row${selected ? ' is-selected' : ''}`}
                            data-progress-order-id={row.id}
                            data-row-action
                            onClick={(event) =>
                              openWorkflowTaskRow(event, () => openDetail(row))
                            }
                          >
                            <td className="erp-progress-identity-cell">
                              <ProgressIdentity row={row} onOpen={() => openDetail(row)} />
                            </td>
                            <td className="erp-progress-due-cell">
                              <ProgressDue
                                row={row}
                                snapshotAt={data.snapshot_at}
                              />
                            </td>
                            <td className="erp-progress-delivery-cell">
                              <ProgressDelivery
                                row={row}
                                showProgress
                                onOpenDetails={() => openDetail(row, 'lines')}
                              />
                            </td>
                            <td className="erp-progress-attention-cell">
                              <div className="erp-progress-attention-content">
                                <ProgressAttention row={row} access={access} />
                                {attention.taskCount > 0 &&
                                canOpen('/erp/task-board') && (
                                  <Button
                                    type="link"
                                    className="erp-progress-task-entry"
                                    aria-label={`查看 ${row.order_no} 的关联任务`}
                                    onClick={() =>
                                      attention.taskID
                                        ? navigateFromProgress(progressSourcePath({ kind: 'task', id: attention.taskID }), null, row.id)
                                        : openDetail(row, 'tasks')
                                    }
                                  >
                                    查看任务 <ArrowRightOutlined />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {!data?.rows.length && (loading ? (
                  <div className="erp-progress-empty" role="status">
                    正在查询进度…
                  </div>
                ) : (
                  <Empty
                    description={
                      hasFilters ? '没有符合条件的记录' : '当前范围暂无记录'
                    }
                  />
                ))}
              </div>
            </section>
          </Spin>
          {!!data?.total && (
            <WorkflowTaskPagination
              recordLabel="进度"
              unit={lines ? '条' : '单'}
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
        onNavigate={navigateFromProgress}
      />
    </section>
  )
}
