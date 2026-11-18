import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Spin, Tag } from 'antd'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listBusinessProgressTasks } from '../../api/businessProgressApi.mjs'
import { SelectFilter } from '../business-list/BusinessListLayout.jsx'
import WorkflowTaskPagination from '../workflow/WorkflowTaskPagination.jsx'
import { getWorkflowTaskOwnerRoleLabel, TASK_BOARD_ROLE_OPTIONS } from '../../utils/workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { progressStatusLabel } from '../../utils/businessProgress.mjs'

const statusOptions = [
  { value: 'all', label: '全部任务' },
  { value: 'open', label: '待处理' },
  { value: 'ended', label: '已结束' },
]
const initialQuery = { status: 'all', role: '', size: 20, page: 1 }

export default function ProgressRelatedTasks({ detail, mobile, saved, focusTaskID, scrollRef, onRemember, onOpen }) {
  const [query, setQuery] = useState(() => ({ ...initialQuery, ...saved }))
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const tail = useRef(null)
  const cache = useRef(null)
  const { view, id } = detail.row
  const { status, role, size, page } = query
  const group = JSON.stringify([view, id, status, role, size])
  const initial = status === 'all' && !role && size === 20
  const firstPage = { rows: detail.sections.tasks, total: detail.task_total }
  const previewRoles = new Set(firstPage.rows.map((record) => record.role))
  const roles = detail.has_more.tasks ? TASK_BOARD_ROLE_OPTIONS : TASK_BOARD_ROLE_OPTIONS.filter((item) => previewRoles.has(item.value))
  const local = initial && page === 1
  const current = result?.detail === detail && result.group === group ? result : null
  const shown = local ? firstPage : (mobile || current?.page === page ? current : null)
  const busy = !local && (!current || current.page !== page) && !current?.error
  const change = (patch) => {
    const next = { ...query, page: 1, ...patch }
    onRemember(next)
    setQuery(next)
    if (!mobile || next.page === 1) scrollRef.current?.scrollTo({ top: 0 })
  }
  const restoreTop = useRef(saved?.scrollTop)
  const restoreFocus = useRef(focusTaskID)
  useLayoutEffect(() => {
    if (!busy && shown && restoreTop.current != null && scrollRef.current) {
      scrollRef.current.scrollTop = restoreTop.current
      restoreTop.current = null
    }
    if (!busy && shown && !mobile && restoreFocus.current) {
      scrollRef.current?.querySelector(`[data-progress-task-id="${Number(restoreFocus.current)}"]`)?.focus({ preventScroll: true })
      restoreFocus.current = null
    }
  }, [busy, shown, scrollRef, mobile])

  useEffect(() => {
    if (local) {
      cache.current = null
      return undefined
    }
    const controller = new AbortController()
    const previous = cache.current
    let loaded = mobile && previous?.detail === detail && previous.group === group && previous.page <= page ? previous : null
    if (mobile && !loaded && initial) loaded = { detail, group, page: 1, rows: detail.sections.tasks, total: detail.task_total }
    const load = async () => {
      setResult(loaded ? { ...loaded, error: '' } : null)
      try {
        const start = mobile ? (loaded?.page || 0) + 1 : page
        for (let n = start; n <= page; n++) {
          const batch = await listBusinessProgressTasks({
            view,
            id,
            limit: size,
            offset: (n - 1) * size,
            task_status: status,
            ...(role ? { owner_role_key: role } : {}),
          }, { signal: controller.signal })
          if (controller.signal.aborted) return
          const rows = mobile && loaded
            ? [...new Map([...loaded.rows, ...batch.rows].map((row) => [row.id, row])).values()]
            : batch.rows
          loaded = { detail, group, page: n, rows, total: batch.total }
          cache.current = loaded
          setResult(loaded)
          const last = Math.max(1, Math.ceil(batch.total / size))
          if (page > last && (!mobile || n >= last)) {
            setQuery((previousQuery) => ({ ...previousQuery, page: last }))
            break
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) setResult({ ...loaded, detail, group, error: getActionErrorMessage(error, '读取本单关联任务') })
      }
    }
    load()
    return () => controller.abort()
  }, [detail, group, id, initial, local, mobile, page, retry, role, size, status, view])

  const more = mobile && shown && page * size < shown.total
  const append = useRef(null)
  append.current = () => change({ page: page + 1 })
  useEffect(() => {
    if (!more || busy || current?.error || !tail.current) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) append.current()
    }, { root: scrollRef.current, rootMargin: '0px 0px 100px' })
    observer.observe(tail.current)
    return () => observer.disconnect()
  }, [more, busy, current?.error, page, scrollRef])
  return (
    <>
      <Space wrap>
        <FilterChipGroup aria-label="本单任务状态" options={statusOptions} value={status} onChange={(value) => change({ status: value })} />
        {(role || roles.length > 1) && (
          <SelectFilter
            aria-label="筛选负责岗位"
            placeholder="负责岗位"
            options={roles}
            showSearch={roles.length > 4}
            value={role || undefined}
            onChange={(value) => change({ role: value || '' })}
          />
        )}
      </Space>
      <p className="erp-progress-hint">仅显示当前账号可见的关联任务。任务完成不代表已经生产、入库或出货。</p>
      {current?.error && !local && <Alert type="error" showIcon message={current.error} action={<Button onClick={() => setRetry((n) => n + 1)}>重新读取</Button>} />}
      {shown?.rows?.map((record) => (
        <article className="erp-progress-record" key={record.id}>
          <div className="erp-progress-record-main">
            <strong>{getWorkflowTaskDisplayName({ task_name: record.label })}</strong>
            <span>{record.number}</span>
            {record.note && <p>{record.note}</p>}
            <span>{record.owner || '未分配处理人'} · {getWorkflowTaskOwnerRoleLabel({ owner_role_key: record.role })}</span>
            {record.date && <span>日期 {record.date}</span>}
          </div>
          <div className="erp-progress-record-actions">
            <Tag color={record.status === 'blocked' ? 'red' : undefined}>{progressStatusLabel(record.status)}</Tag>
            {onOpen && (
              <Button
                type={mobile ? 'default' : 'link'}
                size={mobile ? 'middle' : 'small'}
                data-progress-task-id={record.id}
                aria-label={`查看任务 ${record.number || record.label}`}
                onClick={() => onOpen(record, { ...query, scrollTop: scrollRef.current?.scrollTop || 0 })}
              >
                查看任务
              </Button>
            )}
          </div>
        </article>
      ))}
      {busy && <Spin aria-label="正在读取本单任务" />}
      {shown?.total === 0 && !busy && <Empty description="暂无可见记录" />}
      {mobile ? more && <div ref={tail}><Button onClick={() => append.current()} disabled={busy || Boolean(current?.error)}>继续查看本单任务</Button></div> :
        shown?.total > 0 && <WorkflowTaskPagination
          current={page}
          pageSize={size}
          total={shown.total}
          recordLabel="本单任务"
          onChange={(nextPage, nextSize) => change({ size: nextSize, page: nextPage })}
        />}
    </>
  )
}
