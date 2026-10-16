import React from 'react'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Pagination,
  Spin,
  Tag,
} from 'antd'
import { WorkflowTaskStatus } from '@/common/consts/statuses.generated.mjs'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import FilterChip from '@/common/components/navigation/FilterChip'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import SearchInput from '@/common/components/SearchInput'
import useLiveSearch from '@/common/hooks/useLiveSearch'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import {
  getWorkflowTask,
  listWorkflowExceptions,
} from '../../api/workflowApi.mjs'
import {
  taskDiscoveryRequest,
  taskDiscoveryFilterLabels,
} from '../../utils/workflowTaskDiscovery.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '../../utils/workflowTaskBoard.mjs'
import WorkflowTaskDiscoveryFilters from './WorkflowTaskDiscoveryFilters.jsx'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator'
import './workflowExceptions.css'

const states = {
  open: '待定方案',
  executing: '执行与复检中',
  closed: '已闭环',
  corrected: '检验更正后合格',
}
const dispositions = {
  SCRAP: '报废',
  WIP_CONCESSION: '在制让步',
  OVER_ISSUE: '超领',
  REWORK_ORIGINAL: '原厂返工',
  REWORK_SWITCH: '换厂返工',
  REMAKE: '补料重做',
  RETURN_TO_VENDOR: '退回厂商',
  REPLACE: '换货',
  REWORK: '返工复检',
}

export default function WorkflowExceptionPanel({
  profile,
  roleKey = '',
  onOpenTask,
  compact = false,
  refreshKey = 0,
  initialQuery = {},
  onQueryChange,
  scrollContainerRef,
  renderRefreshControl,
  trackingRef,
}) {
  const [filters, setFilters] = React.useState(initialQuery.filters || {})
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [keyword, setKeyword] = React.useState(initialQuery.keyword || '')
  const [state, setState] = React.useState(initialQuery.state || '')
  const [view, setView] = React.useState(initialQuery.view || '')
  const [page, setPage] = React.useState(initialQuery.page || 1)
  const [loadedCount, setLoadedCount] = React.useState(initialQuery.loadedCount || 20)
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState(null)
  const [opening, setOpening] = React.useState(null)
  const [actionError, setActionError] = React.useState('')
  const taskRead = React.useRef(null)
  const resultRef = React.useRef(null)
  const loadedCountRef = React.useRef(loadedCount)
  const appendPending = React.useRef(false)
  const sentinel = React.useRef(null)
  const restoreScroll = React.useRef(true)
  const begin = useLatestRequestCoordinator()
  resultRef.current = result
  loadedCountRef.current = loadedCount
  const access = `${profile?.id}:${JSON.stringify(profile?.effective_session || profile?.permissions || [])}`
  const request = JSON.stringify({
    ...taskDiscoveryRequest(filters),
    ...(roleKey ? { owner_role_key: roleKey } : {}),
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
    ...(state ? { state } : {}),
    ...(view ? { view } : {}),
    ...(trackingRef ? { tracking_kind: trackingRef.kind, tracking_id: trackingRef.id } : {}),
    limit: 20,
    offset: compact ? 0 : (page - 1) * 20,
  })
  const key = `${access}:${request}`
  const listField = view === 'tasks' ? 'tasks' : view === 'orders' ? 'orders' : 'items'
  React.useEffect(() => {
    onQueryChange?.({ filters, keyword, state, view, page, loadedCount })
  }, [filters, keyword, state, view, page, loadedCount, onQueryChange])
  React.useEffect(() => () => taskRead.current?.abort(), [key, refreshKey])
  const load = React.useCallback(async ({ append = false, showRefreshFeedback = false } = {}) => {
    const previous = resultRef.current?.key === key ? resultRef.current : null
    if (append && (appendPending.current || !previous?.hasMore)) return
    const read = begin('exceptions')
    appendPending.current = append
    setLoading(true)
    setActionError('')
    try {
      const params = JSON.parse(request)
      let offset = append ? previous.nextOffset : params.offset
      let rows = append ? previous.data[listField] : []
      let data
      let hasMore
      do {
        data = await listWorkflowExceptions({ ...params, offset }, { signal: read.signal })
        if (!read.isCurrent()) return
        const batch = data[listField]
        rows = [...new Map([...rows, ...batch].map((item) => [item.key || item.id, item])).values()]
        offset += batch.length
        hasMore = batch.length > 0 && offset < data.view_total
      } while (compact && !append && hasMore && offset < loadedCountRef.current)
      setResult({
        key,
        data: { ...data, [listField]: rows },
        nextOffset: offset,
        hasMore,
        updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      })
      if (compact) setLoadedCount(Math.max(20, offset))
      if (showRefreshFeedback) message.success({ key: 'mobile-exceptions-refresh', content: '异常记录已刷新' })
    } catch (error) {
      if (!read.isCurrent()) return
      const feedback = getActionErrorMessage(error, append ? '读取更多异常记录' : '读取异常记录')
      setResult(previous?.data
        ? { ...previous, appendError: append ? feedback : '', refreshError: append ? previous.refreshError : feedback }
        : { key, error: feedback })
    } finally {
      if (read.isCurrent()) {
        appendPending.current = false
        setLoading(false)
        read.finish()
      }
    }
  }, [begin, compact, key, listField, request])
  React.useEffect(() => {
    load()
    return () => { const read = begin('exceptions'); read.finish() }
  }, [begin, load, refreshKey])
  const current = result?.key === key ? result : null
  React.useLayoutEffect(() => {
    if (compact && current?.data && restoreScroll.current && scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTop = initialQuery.scrollTop || 0
      restoreScroll.current = false
    }
  }, [compact, current, initialQuery.scrollTop, scrollContainerRef])
  React.useEffect(() => {
    if (!compact || !scrollContainerRef?.current || !sentinel.current || !current?.hasMore || current.appendError || current.refreshError || loading || filterOpen) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load({ append: true })
    }, { root: scrollContainerRef.current, rootMargin: '0px 0px 180px 0px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [compact, current, filterOpen, load, loading, scrollContainerRef])
  const resetPosition = () => {
    restoreScroll.current = false
    setPage(1)
    setLoadedCount(20)
    scrollContainerRef?.current?.scrollTo({ top: 0 })
  }
  const selectState = (next) => {
    setState(next)
    resetPosition()
  }
  const search = useLiveSearch({ value: keyword, onSearch: (value) => { setKeyword(value); resetPosition() } })
  const openTask = async (id) => {
    if (taskRead.current && !taskRead.current.signal.aborted) return
    const controller = new AbortController()
    taskRead.current = controller
    setOpening({ id, key })
    setActionError('')
    try {
      const task = await getWorkflowTask(id, { signal: controller.signal })
      if (!controller.signal.aborted) onOpenTask?.(task)
    } catch (error) {
      if (!controller.signal.aborted) {
        setActionError(getActionErrorMessage(error, '打开异常关联任务'))
      }
    } finally {
      if (taskRead.current === controller) taskRead.current = null
      if (!controller.signal.aborted) setOpening(null)
    }
  }
  const renderTask = (task, showPath = true) => (
    <div key={task.id} className="workflow-exceptions__task">
      {onOpenTask ? (
        <Button
          type="link"
          loading={opening?.key === key && opening?.id === task.id}
          onClick={() => openTask(task.id)}
        >
          {getWorkflowTaskDisplayName(task)}
        </Button>
      ) : <strong>{getWorkflowTaskDisplayName(task)}</strong>}
      <span>
        {getWorkflowTaskOwnerRoleLabel(task)} ·{' '}
        {task.discovery?.assignee_name ? `${task.discovery.assignee_name} · ` : [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(task.task_status_key) ? '岗位待领取 · ' : ''}
        {getWorkflowTaskStatusMeta(task).label}
      </span>
      {showPath && task.discovery?.path ? <small>{task.discovery.path}</small> : null}
    </div>
  )
  const filterControls = (
    <WorkflowTaskDiscoveryFilters
      compact={compact}
      profile={profile}
      roleKey={roleKey}
      value={filters}
      onChange={(next) => {
        setFilters(next)
        resetPosition()
      }}
    />
  )
  return (
    <>
      {renderRefreshControl?.({ key, onRefresh: load, busy: loading, enabled: !filterOpen && opening?.key !== key, lastUpdated: current?.updatedAt })}
      <section className="workflow-exceptions" aria-label="异常记录" aria-busy={loading}>
        {!trackingRef ? (
          <>
            {compact ? (
              <Drawer
                title="筛选异常记录"
                placement="bottom"
                height="auto"
                styles={{ content: { maxHeight: '80dvh' } }}
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                footer={
                  <Button block type="primary" onClick={() => setFilterOpen(false)}>
                    查看结果
                  </Button>
                }
              >
                {filterControls}
              </Drawer>
            ) : (
              filterControls
            )}
            <div className="workflow-exceptions__query">
              {compact ? <MobileSearchInput
                aria-label="搜索异常单号、订单、批次或原因"
                placeholder="异常单号 / 订单 / 批次 / 原因"
                value={search.value}
                onChange={search.onChange}
                onCompositionStart={search.onCompositionStart}
                onCompositionEnd={search.onCompositionEnd}
                onPressEnter={search.onPressEnter}
                onClear={() => search.onChange({ currentTarget: { value: '' } })}
              /> : <SearchInput
                value={search.value}
                aria-label="搜索异常单号、订单、批次或原因"
                placeholder="异常单号 / 订单 / 批次 / 原因"
                maxLength={100}
                allowClear
                onChange={search.onChange}
                onCompositionStart={search.onCompositionStart}
                onCompositionEnd={search.onCompositionEnd}
                onPressEnter={search.onPressEnter}
              />}
              {compact ? (
                <Button onClick={() => setFilterOpen(true)}>
                  筛选
                  {Object.values(taskDiscoveryRequest(filters)).length
                    ? ` · ${Object.values(taskDiscoveryRequest(filters)).length}`
                    : ''}
                </Button>
              ) : null}
            </div>
            {compact && Object.keys(taskDiscoveryRequest(filters)).length ? (
              <p>
                {taskDiscoveryFilterLabels(filters)
                  .map((item) => item.label)
                  .join('；')}
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    setFilters({})
                    resetPosition()
                  }}
                >
                  清除
                </Button>
              </p>
            ) : null}
            <div className="workflow-exceptions__states" aria-label="异常处理状态">
              {[
                { label: '全部异常', value: '' },
                { label: '未闭环', value: 'open' },
                { label: '已闭环', value: 'closed' },
              ].map((option) => <FilterChip key={option.value} selected={state === option.value} onClick={() => selectState(option.value)}>{option.label}</FilterChip>)}
            </div>
            <SlidingSegmented
              block
              className="workflow-exceptions__views"
              aria-label="异常明细视图"
              value={view}
              options={[
                ['', '异常事件', '异常', 'total'],
                ['tasks', '待处理关联任务', '关联待办', 'pending_tasks'],
                ['orders', '受影响订单', '关联订单', 'affected_orders'],
              ].map(([value, label, shortLabel, count]) => ({
                value,
                title: label,
                label: <span>{compact ? shortLabel : label} <strong>{current?.data?.[count] ?? '—'}</strong></span>,
              }))}
              onChange={(value) => { setView(value); resetPosition() }}
            />
          </>
        ) : null}
        {actionError ? (
          <Alert type="error" showIcon message={actionError} />
        ) : null}
        {current?.refreshError ? <Alert type="error" showIcon message={current.refreshError} description="已保留上次结果。" action={<Button loading={loading} onClick={() => load()}>重试</Button>} /> : null}
        {!current ? (
          <Spin tip="正在读取异常记录">
            <div className="workflow-exceptions__loading" />
          </Spin>
        ) : current.error ? (
          <Alert
            type="error"
            showIcon
            message={current.error}
            action={
              <Button loading={loading} onClick={() => load()}>重试</Button>
            }
          />
        ) : (
          <>
            {view === 'tasks' ? (
              current.data.tasks.length ? (
                current.data.tasks.map((task) => renderTask(task))
              ) : (
                <Empty
                  description="当前条件下没有待处理关联任务"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )
            ) : view === 'orders' ? (
              current.data.orders.length ? (
                current.data.orders.map((order) => (
                  <article className="workflow-exceptions__item" key={order.id}>
                    <strong>{order.number}</strong>
                  </article>
                ))
              ) : (
                <Empty
                  description="当前条件下没有可见的关联订单"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )
            ) : current.data.items.length ? (
              current.data.items.map((item) => {
                const pending = item.tasks.filter((task) => [WorkflowTaskStatus.READY, WorkflowTaskStatus.BLOCKED].includes(task.task_status_key))
                return (
                  <article className="workflow-exceptions__item" key={item.key}>
                    <div className="workflow-exceptions__heading">
                      <strong>{item.number}</strong>
                      <Tag
                        color={
                          ['closed', 'corrected'].includes(item.state)
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {states[item.state]}
                      </Tag>
                    </div>
                    <p>
                      {item.orders.map((order) => order.number).join('、') ||
                        '无可见订单关联'}
                      {item.batch_no ? ` · ${item.batch_no}` : ''}
                    </p>
                    <p>{item.reason || '具体不合格项见检验记录'}</p>
                    <p>
                      处置：{dispositions[item.disposition] || '待业务确定方案'} ·
                      发生于 {item.occurred_at?.slice(0, 16).replace('T', ' ')}
                    </p>
                    {item.task_ids.length ? (
                      <>
                        {pending.length ? (
                          <div className="workflow-exceptions__pending">
                            <span>当前待办</span>
                            {pending.slice(0, 2).map((task) => renderTask(task, false))}
                          </div>
                        ) : null}
                        {item.task_ids.length > Math.min(pending.length, 2) ? (
                          <details className="workflow-exceptions__tasks">
                            <summary>全部关联任务 {item.task_ids.length} 项{pending.length > 2 ? `（另有${item.task_ids.length > item.tasks.length ? '至少' : ''} ${pending.length - 2} 项待办）` : ''}</summary>
                            {item.tasks.map((task) => renderTask(task))}
                            {item.task_ids.length > item.tasks.length ? (
                              <p>
                                当前列出前 {item.tasks.length}{' '}
                                项，可从关联任务进入完整处理链继续查看。
                              </p>
                            ) : null}
                          </details>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                )
              })
            ) : (
              <Empty
                description={trackingRef ? '本流程暂无可见异常记录' : '当前条件下没有异常记录'}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
            {compact ? (
              <div ref={sentinel} className="workflow-exceptions__more">
                {current.data[listField].length ? <span role="status">{current.hasMore ? `已显示 ${current.data[listField].length} / 共 ${current.data.view_total} 条` : `已显示全部 ${current.data.view_total} 条`}</span> : null}
                {current.appendError ? <><p role="alert">{current.appendError}，已加载记录仍保留。</p><Button loading={loading} onClick={() => load({ append: true })}>重新读取更多</Button></> : loading ? <Spin size="small" /> : current.hasMore ? <Button onClick={() => load({ append: true })}>加载更多</Button> : null}
              </div>
            ) : (
              <Pagination
                current={page}
                pageSize={20}
                total={current.data.view_total}
                showSizeChanger={false}
                onChange={setPage}
                hideOnSinglePage
              />
            )}
          </>
        )}
      </section>
    </>
  )
}
