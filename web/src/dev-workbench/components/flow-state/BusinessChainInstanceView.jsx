import React, { useEffect, useState } from 'react'
import { Alert, Button, Empty, Space, Spin, Tag } from 'antd'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { getDevTaskReadingSelection } from '../../pages/devFlowViewContext.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import Select from '@/common/components/select/AppSelect'
import FilterChip from '@/common/components/navigation/FilterChip'
import {
  getWorkflowTask,
  getWorkflowTaskHandlingChain,
} from '@/erp/api/workflowApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { buildWorkflowBusinessChain } from '@/erp/utils/workflowBusinessChain.mjs'
import { getWorkflowTaskDisplayName } from '@/erp/utils/processRuntimePresentation.mjs'
import { resolveWorkflowTaskEntryPath } from '@/erp/utils/dashboardTaskDisplay.mjs'
import { formatQueryTime } from './FlowStateShared.jsx'

// Tasks describe responsibility; source records remain the authority for business results.
export default function BusinessChainInstanceView({
  taskId,
  onSelectTask,
  onTaskLoaded,
  onOpenView,
}) {
  const [state, setState] = useState(null)
  const [retry, setRetry] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const filter = searchParams.get(queryKeys.taskFilter) || 'all'
  const groupKey = searchParams.get(queryKeys.taskGroup) || null
  const changeFilter = (kind, group) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (kind === 'all') next.delete(queryKeys.taskFilter)
        else next.set(queryKeys.taskFilter, kind)
        if (group) next.set(queryKeys.taskGroup, group)
        else next.delete(queryKeys.taskGroup)
        return next
      },
      { replace: true, state: location.state }
    )
  useEffect(() => {
    setState(null)
    if (!taskId) return undefined
    const controller = new AbortController()
    Promise.all([
      getWorkflowTask(Number(taskId), { signal: controller.signal }),
      getWorkflowTaskHandlingChain(Number(taskId), {
        signal: controller.signal,
      }),
    ])
      .then(([task, data]) => {
        if (controller.signal.aborted) return
        setState({
          taskId,
          task,
          model: buildWorkflowBusinessChain(data, Number(taskId)),
          at: new Date().toISOString(),
        })
        onTaskLoaded(task)
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({
            taskId,
            error: getActionErrorMessage(error, '读取关联任务', {
              fallback: '读取失败，请确认已登录且具备任务查看权限',
            }),
          })
        }
      })
    return () => controller.abort()
  }, [taskId, retry, onTaskLoaded])

  if (!taskId) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="输入单号或任务，查看实际进度与异常"
      />
    )
  }
  const current = state?.taskId === taskId ? state : null
  if (!current) {
    return (
      <div className="erp-dev-flow-loading" role="status">
        <Spin />
        正在读取关联任务…
      </div>
    )
  }
  if (current.error) {
    return (
      <Alert
        type="error"
        showIcon
        message="关联任务读取失败"
        description={current.error}
        action={
          <Button
            onClick={() => {
              setState(null)
              setRetry((value) => value + 1)
            }}
          >
            重新读取
          </Button>
        }
      />
    )
  }
  const sourcePath = resolveWorkflowTaskEntryPath(current.task)
  const groups = [...current.model.main, ...current.model.exceptions]
  const activeGroupKey = groups.some((group) => group.key === groupKey)
    ? groupKey
    : null
  const unknownGroup = Boolean(groupKey && !activeGroupKey)
  const readingTarget = getDevTaskReadingSelection(current.task)
  const pending = (task) => ['ready', 'blocked'].includes(task.task_status_key)
  const filterGroups = (items) =>
    items
      .filter(
        (group) =>
          !unknownGroup && (!activeGroupKey || group.key === activeGroupKey)
      )
      .map((group) => ({
        ...group,
        tasks: group.tasks.filter(
          (task) => filter !== 'pending' || pending(task)
        ),
      }))
      .filter((group) => group.tasks.length > 0)
  const main = filter === 'exceptions' ? [] : filterGroups(current.model.main)
  const exceptions = filterGroups(current.model.exceptions)
  const counts = {
    all: groups.reduce((count, group) => count + group.tasks.length, 0),
    pending: groups.reduce(
      (count, group) => count + group.tasks.filter(pending).length,
      0
    ),
    exceptions: current.model.exceptions.length,
  }
  const renderGroup = (group) => (
    <section
      className="erp-dev-flow-instance-stage"
      key={group.key}
      data-current={group.current || undefined}
    >
      <header>
        <strong>{group.label}</strong>
        {group.open ? (
          <Tag color={group.blocked ? 'error' : 'processing'}>
            {group.open} 项待处理
          </Tag>
        ) : (
          <Tag>任务已结束</Tag>
        )}
      </header>
      <ul className="erp-dev-flow-instance-records">
        {group.tasks.map((task) => (
          <li
            key={task.id}
            data-task-record={task.id}
            data-pending={pending(task) || undefined}
            data-blocked={task.task_status_key === 'blocked' || undefined}
          >
            <button
              type="button"
              aria-current={task.current ? 'step' : undefined}
              onClick={() => onSelectTask(task.id, null)}
            >
              <strong>
                {getWorkflowTaskDisplayName(task)}
                {task.current ? ' · 当前任务' : ''}
              </strong>
              <span>{task.responsibilityLabel}</span>
              <small>
                {[
                  ...new Set([task.batch_no, task.source_no].filter(Boolean)),
                ].join(' · ')}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
  return (
    <section className="erp-dev-flow-instance" data-instance-task={taskId}>
      <header className="erp-dev-flow-instance-heading">
        <div>
          <h2>{getWorkflowTaskDisplayName(current.task)}</h2>
          <span>
            {current.task.source_no || '未记录来源单号'} · 查询于{' '}
            {formatQueryTime(current.at)}
          </span>
        </div>
        <Space wrap>
          {sourcePath ? <Link to={sourcePath}>打开业务页面</Link> : null}
          <Button onClick={() => onOpenView('workflow')}>协同记录</Button>
          <Button onClick={() => onOpenView('runtime')}>流程轨迹</Button>
        </Space>
      </header>
      <p className="erp-dev-flow-instance-note">
        当前账号可见的已生成任务；任务结束不代替入库、质检或发货结果。
        {current.model.truncated
          ? '关联任务较多，当前最多展示 100 项；未展示部分请到业务页面核对。'
          : ''}
      </p>
      <div className="erp-dev-flow-instance-filters">
        <Space role="group" aria-label="关联任务筛选">
          {[
            ['all', '全部任务'],
            ['pending', '待处理'],
            ['exceptions', '异常分支'],
          ].map(([key, label]) => (
            <FilterChip
              key={key}
              selected={filter === key}
              count={counts[key]}
              onClick={() => {
                changeFilter(key, null)
              }}
            >
              {label}
            </FilterChip>
          ))}
        </Space>
        <Select
          label="环节或分支"
          aria-label="选择业务环节或异常分支"
          placeholder="环节或分支"
          allowClear
          showSearch
          optionFilterProp="label"
          virtual={false}
          value={activeGroupKey}
          onChange={(value) => {
            changeFilter('all', value || null)
          }}
          options={[
            {
              label: '主链环节',
              options: current.model.main.map((group) => ({
                value: group.key,
                label: group.label,
              })),
            },
            {
              label: '异常分支',
              options: current.model.exceptions.map((group) => ({
                value: group.key,
                label: group.label,
              })),
            },
          ]}
        />
        <span>
          显示{' '}
          {[...main, ...exceptions].reduce(
            (count, group) => count + group.tasks.length,
            0
          )}{' '}
          / {counts.all} 项已读取任务
        </span>
      </div>
      {unknownGroup ? (
        <Alert
          type="warning"
          message="该环节或分支不在当前可见记录中"
          action={
            <Button onClick={() => changeFilter('all', null)}>清除筛选</Button>
          }
        />
      ) : null}
      {readingTarget ? (
        <div className="erp-dev-flow-instance-reading">
          <Button
            type="link"
            onClick={() => onOpenView('chain', readingTarget)}
          >
            {readingTarget[queryKeys.roleTab] === 'exceptions'
              ? '查看异常处理路径'
              : '查看对应办理流程'}
          </Button>
        </div>
      ) : null}
      {exceptions.length ? (
        <section
          className="erp-dev-flow-instance-exceptions"
          aria-label="关联异常分支"
        >
          <h3>异常分支</h3>
          <div className="erp-dev-flow-instance-stages">
            {exceptions.map(renderGroup)}
          </div>
        </section>
      ) : null}
      {main.length ? (
        <section aria-label="关联业务环节">
          <h3>主链环节</h3>
          <div className="erp-dev-flow-instance-stages">
            {main.map(renderGroup)}
          </div>
        </section>
      ) : null}
      {!main.length && !exceptions.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前条件下没有关联任务"
        />
      ) : null}
    </section>
  )
}
