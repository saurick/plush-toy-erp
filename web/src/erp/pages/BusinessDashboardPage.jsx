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
import FilterChip from '@/common/components/navigation/FilterChip'
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
} from '../utils/businessProgress.mjs'
import useBusinessStatistics from '../components/business-visualizations/useBusinessStatistics.jsx'
import BusinessProgressDrawer from '../components/business-visualizations/BusinessProgressDrawer.jsx'
import BusinessProgressSummary, {
  ProgressBadges,
} from '../components/business-visualizations/BusinessProgressSummary.jsx'
import WorkflowTaskCard from '../components/workflow/WorkflowTaskCard.jsx'
import WorkflowTaskPagination from '../components/workflow/WorkflowTaskPagination.jsx'
import { DateRangeFilter } from '../components/business-list/BusinessListLayout.jsx'
import { ProductThumbnail } from '../components/master-data/ProductIdentity.jsx'
import '../styles/app/progress-board.css'

const SCOPES = [
  { value: 'active', label: '在执行' },
  { value: 'ended', label: '已结束' },
  { value: 'all', label: '全部记录' },
]
const count = (value) =>
  Number.isSafeInteger(value)
    ? new Intl.NumberFormat('zh-CN').format(value)
    : '—'

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
  const [owner, setOwner] = useState(query.owner)
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
  const update = useCallback(
    (changes) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete('page')
        next.delete('selected')
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value === null || value === undefined) {
            next.delete(key)
          } else next.set(key, String(value))
        }
        return next
      })
      setSelection(null)
    },
    [setParams]
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
    setOwner(query.owner)
  }, [query.owner])
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
  const metrics = [
    {
      key: 'all',
      label:
        SCOPES.find((item) => item.value === query.scope)?.label || '在执行',
      number: data?.counts.total,
    },
    { key: 'overdue', label: '已逾期', number: data?.counts.overdue },
    { key: 'due_soon', label: '7 天内到期', number: data?.counts.due_soon },
    {
      key: 'blocked',
      label: '任务阻塞',
      number: access?.tasks === false ? undefined : data?.counts.blocked,
    },
    { key: 'undated', label: '未定交期', number: data?.counts.undated },
  ]
  const extraFilters = [
    query.owner && `处理人：${query.owner}`,
    query.date_from && `从 ${query.date_from}`,
    query.date_to && `至 ${query.date_to}`,
  ].filter(Boolean)
  const hasFilters =
    query.keyword ||
    query.owner ||
    query.date_from ||
    query.date_to ||
    query.risk !== 'all' ||
    query.scope !== 'active'
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
      <div className="erp-progress-controls">
        <div className="erp-progress-toolbar">
          <SlidingSegmented
            aria-label="进度查看方式"
            value={view}
            onChange={(next) => update({ view: next, risk: 'all' })}
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
          {statisticsActive ? (
            statistics.toolbar
          ) : (
            <>
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
              <Select
                aria-label="记录范围"
                value={query.scope}
                options={SCOPES}
                onChange={(value) => update({ scope: value })}
                className="erp-progress-scope"
              />
              <Popover
                trigger="click"
                open={moreOpen}
                onOpenChange={setMoreOpen}
                placement="bottom"
                content={
                  <div className="erp-progress-filters">
                    <label htmlFor="progress-owner">处理人或业务负责人</label>
                    <SearchInput
                      id="progress-owner"
                      value={owner}
                      placeholder="输入姓名"
                      allowClear
                      onChange={(event) => setOwner(event.target.value)}
                      onPressEnter={(event) => {
                        update({ owner: event.target.value.trim() })
                        setMoreOpen(false)
                      }}
                      suffix={
                        <Button
                          type="text"
                          size="small"
                          onClick={() => {
                            update({ owner: owner.trim() })
                            setMoreOpen(false)
                          }}
                        >
                          应用
                        </Button>
                      }
                      maxLength={100}
                    />
                    <span>交期范围</span>
                    <DateRangeFilter
                      startValue={query.date_from}
                      endValue={query.date_to}
                      onStartChange={(value) => update({ from: value })}
                      onEndChange={(value) => update({ to: value })}
                    />
                    {view === 'production' && (
                      <Button
                        onClick={() => {
                          update({ risk: 'unlinked' })
                          setMoreOpen(false)
                        }}
                      >
                        查看未关联销售的生产单
                      </Button>
                    )}
                  </div>
                }
              >
                <Button icon={<FilterOutlined />} aria-label="筛选">
                  筛选{extraFilters.length ? ` · ${extraFilters.length}` : ''}
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
                      顶部统计对应当前搜索及范围，风险分类可重叠；关联任务仅包含当前账号可见内容。
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
            </>
          )}
        </div>
        {statisticsActive ? (
          statistics.controls
        ) : (
          <>
            <div
              className="erp-progress-metric-row"
              role="group"
              aria-label="按风险筛选进度"
            >
              {metrics.map((metric) => (
                <FilterChip
                  className="erp-progress-metric"
                  key={metric.key}
                  selected={query.risk === metric.key}
                  count={count(loading ? undefined : metric.number)}
                  disabled={
                    loading ||
                    !data ||
                    (metric.key === 'blocked' && access?.tasks === false)
                  }
                  onClick={() => update({ risk: metric.key })}
                >
                  {metric.label}
                </FilterChip>
              ))}
              <div className="erp-progress-freshness">
                {data
                  ? `更新于 ${dayjs(data.snapshot_at).format('HH:mm')}`
                  : loading
                    ? '正在查询…'
                    : '等待查询'}
              </div>
            </div>
            {(extraFilters.length > 0 || hasFilters) && (
              <div className="erp-progress-active-filters">
                {query.keyword && <Tag>搜索：{query.keyword}</Tag>}
                {extraFilters.map((item) => (
                  <Tag key={item}>{item}</Tag>
                ))}
                {query.risk === 'unlinked' && <Tag>含未关联销售的生产明细</Tag>}
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setOwner('')
                    update({
                      q: '',
                      owner: '',
                      from: '',
                      to: '',
                      risk: '',
                      scope: '',
                    })
                  }}
                >
                  清空筛选
                </Button>
              </div>
            )}
          </>
        )}
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
