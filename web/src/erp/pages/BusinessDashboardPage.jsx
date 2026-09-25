import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Popover, Select, Tag } from 'antd'
import { FilterOutlined, InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import FilterChip from '@/common/components/navigation/FilterChip'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listBusinessProgress } from '../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { canOpenRelatedDocumentPath } from '../utils/relatedDocumentNavigation.mjs'
import { effectiveSessionAllowsPage } from '../utils/adminProfileSync.mjs'
import { getWorkflowTaskOwnerRoleLabel } from '../utils/workflowTaskBoard.mjs'
import {
  progressQueryFromURL,
  progressDelivery,
  progressStatusLabel,
} from '../utils/businessProgress.mjs'
import BusinessProgressDrawer from '../components/business-visualizations/BusinessProgressDrawer.jsx'
import { DateRangeFilter } from '../components/business-list/BusinessListLayout.jsx'
import '../styles/app/progress-board.css'

const SCOPES = [
  { value: 'active', label: '在执行' },
  { value: 'ended', label: '已结束' },
  { value: 'all', label: '全部记录' },
]
const roleLabel = (key) =>
  key ? getWorkflowTaskOwnerRoleLabel({ owner_role_key: key }) : '未分配岗位'
const count = (value) =>
  Number.isSafeInteger(value)
    ? new Intl.NumberFormat('zh-CN').format(value)
    : '—'

function Stage({ label, text, tone = '', onClick, disabled }) {
  return (
    <button
      type="button"
      className={`erp-progress-stage ${tone}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={`${label}：${text}`}
    >
      <span>{label}</span>
      <strong>{text}</strong>
    </button>
  )
}

function Delivery({ row, onClick }) {
  const delivery = progressDelivery(row)
  return (
    <button
      type="button"
      className="erp-progress-delivery"
      onClick={onClick}
      aria-label={`${delivery.label}：${delivery.text}`}
    >
      <span>{delivery.label}</span>
      <strong>{delivery.text}</strong>
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
    </button>
  )
}

export default function BusinessDashboardPage() {
  const outlet = useOutletContext()
  const adminProfile = outlet?.adminProfile || null
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const queryKey = JSON.stringify(progressQueryFromURL(params))
  const query = useMemo(() => JSON.parse(queryKey), [queryKey])
  const [keyword, setKeyword] = useState(query.keyword)
  const [owner, setOwner] = useState(query.owner)
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState(null)
  const begin = useLatestRequestCoordinator()
  const data =
    state?.key === queryKey && state?.profile === adminProfile
      ? state.data
      : null
  const view =
    query.view ||
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
  const load = useCallback(async () => {
    const request = begin('business-progress')
    if (!adminProfile?.id) {
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
      if (result.total > 0 && query.offset >= result.total) {
        update({ page: Math.ceil(result.total / query.limit) })
      }
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
  }, [adminProfile, begin, query, queryKey, update])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => outlet?.registerPageRefresh?.(load), [load, outlet])
  useEffect(() => {
    setKeyword(query.keyword)
    setOwner(query.owner)
  }, [query.keyword, query.owner])
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
  const columns = [
    {
      title: view === 'orders' ? '订单 / 客户 / 产品' : '生产单 / 产品',
      key: 'identity',
      width: 244,
      render: (_, row) => (
        <div className="erp-progress-identity">
          <button
            type="button"
            onClick={() => openDetail(row)}
            className="erp-progress-order"
            data-progress-order-id={row.id}
          >
            {row.order_no}
          </button>
          <strong>
            {row.product}
            {row.product_count > 1 ? ` 等 ${row.product_count} 项` : ''}
          </strong>
          <span>
            {row.customer || (row.unlinked ? '含未关联订单的生产明细' : '—')} ·{' '}
            {progressStatusLabel(row.status)}
          </span>
        </div>
      ),
    },
    {
      title: view === 'orders' ? '交期' : '计划结束',
      key: 'due',
      width: 106,
      render: (_, row) => (
        <div className="erp-progress-date">
          <strong className={row.overdue ? 'erp-progress-danger' : ''}>
            {row.due_date || '待确定'}
          </strong>
          {row.overdue ? (
            <Tag color="red">已逾期</Tag>
          ) : row.due_soon ? (
            <Tag color="orange">7 天内到期</Tag>
          ) : !row.active ? (
            <span>已结束</span>
          ) : (
            <span>交期跟踪</span>
          )}
        </div>
      ),
    },
    {
      title: '各环节进展',
      key: 'stages',
      width: view === 'orders' ? 314 : 256,
      render: (_, row) => (
        <div className="erp-progress-stages">
          {view === 'orders' && (
            <Stage
              label="资料"
              text={
                row.engineering_total
                  ? `${row.engineering_ready}/${row.engineering_total} 确认`
                  : '待完善'
              }
              onClick={() => openDetail(row, 'lines')}
              tone={
                row.engineering_ready === row.engineering_total &&
                row.engineering_total
                  ? 'is-complete'
                  : ''
              }
            />
          )}
          <Stage
            label="领料"
            text={
              !access?.production
                ? '无权限'
                : !row.material_total
                  ? '待核对'
                  : row.material_pending
                    ? `${row.material_pending} 项待领`
                    : '已领齐'
            }
            disabled={!access?.production}
            tone={row.material_pending ? 'is-attention' : ''}
            onClick={() => openDetail(row, 'materials')}
          />
          <Stage
            label="生产"
            text={
              !access?.wip
                ? '无权限'
                : row.current_operation
                  ? row.current_operation +
                    (row.operation_count > 1 ? '等' : '')
                  : row.in_progress_batches
                    ? `${row.in_progress_batches} 批在制`
                    : row.outsourced_batches
                      ? `${row.outsourced_batches} 批委外`
                      : row.planned_batches
                        ? `${row.planned_batches} 批待开`
                        : row.production_orders
                          ? `${row.production_orders} 张单`
                          : '未关联'
            }
            disabled={!access?.wip}
            onClick={() =>
              openDetail(
                row,
                row.in_progress_batches ||
                  row.outsourced_batches ||
                  row.planned_batches
                  ? 'batches'
                  : 'production'
              )
            }
          />
          <Stage
            label="质检"
            text={
              !access?.wip
                ? '无权限'
                : row.waiting_batches
                  ? `${row.waiting_batches} 批待检`
                  : row.rejected_batches
                    ? `${row.rejected_batches} 批不合格`
                    : '查看批次'
            }
            disabled={!access?.wip}
            tone={
              row.waiting_batches || row.rejected_batches ? 'is-attention' : ''
            }
            onClick={() => openDetail(row, 'batches')}
          />
        </div>
      ),
    },
    {
      title: view === 'orders' ? '交付进度' : '完工进度',
      key: 'delivery',
      width: 170,
      render: (_, row) => (
        <Delivery row={row} onClick={() => openDetail(row)} />
      ),
    },
    {
      title: '当前待办 / 处理人',
      key: 'attention',
      width: 214,
      render: (_, row) => (
        <div className="erp-progress-attention">
          {row.attention_task ? (
            <>
              <button
                type="button"
                className={row.blocked ? 'erp-progress-danger' : ''}
                onClick={() => openDetail(row, 'tasks')}
              >
                {row.attention_reason || row.attention_task}
              </button>
              <span>
                {row.attention_owner || '未分配处理人'} ·{' '}
                {roleLabel(row.attention_role)}
              </span>
              {row.open_tasks > 1 && (
                <button
                  type="button"
                  className="erp-progress-more-tasks"
                  onClick={() => openDetail(row, 'tasks')}
                >
                  另有 {row.open_tasks - 1} 项待办
                </button>
              )}
            </>
          ) : (
            <>
              <span>{access?.tasks ? '暂无可见待办' : '任务无查看权限'}</span>
              {row.sales_owner && <span>业务负责人：{row.sales_owner}</span>}
            </>
          )}
        </div>
      ),
    },
  ]
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
  return (
    <section className="erp-progress-board" aria-label="进度看板">
      <div className="erp-progress-controls">
        <div className="erp-progress-toolbar">
          <SlidingSegmented
            aria-label="进度查看方式"
            value={view}
            onChange={(next) => update({ view: next, risk: 'all' })}
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
            ]}
          />
          <SearchInput
            className="erp-progress-search"
            aria-label="搜索订单、客户或产品"
            placeholder="搜单号、客户、产品"
            value={keyword}
            allowClear
            maxLength={100}
            onChange={(event) => {
              setKeyword(event.target.value)
              if (!event.target.value && query.keyword) update({ q: '' })
            }}
            onPressEnter={(event) => update({ q: event.target.value.trim() })}
            suffix={
              <Button
                type="text"
                size="small"
                aria-label="查询进度"
                onClick={() => update({ q: keyword.trim() })}
              >
                查询
              </Button>
            }
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
        </div>
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
              count={count(metric.number)}
              disabled={metric.key === 'blocked' && access?.tasks === false}
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
                setKeyword('')
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
      </div>
      {!error && (
        <p className="erp-progress-mobile-hint">
          左右滑动查看进度，点单号查看全部明细
        </p>
      )}
      {error ? (
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
        <Table
          aria-label={view === 'orders' ? '订单交付进度' : '生产执行进度'}
          className="erp-progress-table"
          columns={columns.map((column) => ({ ...column, align: 'left' }))}
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={data?.rows || []}
          scroll={{ x: view === 'orders' ? 1048 : 990 }}
          locale={{
            emptyText: loading ? (
              '正在查询进度…'
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  hasFilters ? '没有符合条件的记录' : '当前范围暂无记录'
                }
              />
            ),
          }}
          pagination={{
            current: query.offset / query.limit + 1,
            pageSize: query.limit,
            total: data?.total || 0,
            showSizeChanger: false,
            showTotal: (total) => `共 ${count(total)} 单`,
            onChange: (page) => update({ page }),
          }}
        />
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
