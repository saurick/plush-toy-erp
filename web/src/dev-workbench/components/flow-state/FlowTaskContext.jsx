import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Space, Spin, Tag } from 'antd'
import { Text, cleanText } from './FlowStateShared.jsx'
import SearchInput from '@/common/components/SearchInput'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listWorkflowTasks } from '@/erp/api/workflowApi.mjs'
import { getWorkflowTaskDisplayName } from '@/erp/utils/processRuntimePresentation.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '@/erp/utils/workflowTaskBoard.mjs'
import { getPermissionCenterRoleName } from '../../../erp/utils/permissionCenterAccess.mjs'
import {
  buildDevFlowStateTaskLookupQuery,
  parseDevFlowStateTaskIDReference,
  resolveDevFlowStateTaskLookupPage,
} from '../../pages/devFlowStateTaskLookup.mjs'

function getProcessOwnerPoolLabel(ownerPool) {
  const label = getPermissionCenterRoleName({ role_key: ownerPool })
  return label === '已配置岗位' ? ownerPool : label
}

function BusinessChainProjectionContext({
  projection,
  onBackToChain,
  onClearChainContext,
}) {
  if (!projection) return null
  const nodeLabel = projection.node ? ` · ${projection.node.label}` : ''
  return (
    <section
      className="erp-dev-flow-chain-projection-context"
      data-chain-projection-context={projection.chain.key}
    >
      <div>
        <Text className="erp-dev-flow-eyebrow">当前按业务链分类查看</Text>
        <strong>
          {projection.chain.label}
          {nodeLabel}
        </strong>
        <span>
          {projection.steps.length} 个相关步骤 · {projection.scenarios.length}{' '}
          个已登记场景
        </span>
      </div>
      <Space wrap>
        {projection.responsibility.ownerPoolKeys.slice(0, 4).map((key) => (
          <Tag key={key}>{getProcessOwnerPoolLabel(key)}</Tag>
        ))}
        <Button size="small" onClick={onBackToChain}>
          回到链路步骤
        </Button>
        <Button size="small" onClick={onClearChainContext}>
          查看全部定义
        </Button>
      </Space>
    </section>
  )
}

function TaskLookupResults({ lookup, onSelectTask }) {
  if (lookup.status === 'loading') {
    return (
      <div className="erp-dev-flow-loading" role="status" aria-live="polite">
        <Spin />
        <span>正在当前账号可见任务中查找…</span>
      </div>
    )
  }
  if (lookup.status === 'error') {
    return (
      <Alert
        showIcon
        type="error"
        message="任务查找失败"
        description={lookup.error}
      />
    )
  }
  if (lookup.status !== 'ready') return null
  if (lookup.candidates.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="没有找到名称、任务编号或来源单号相符的可见任务"
      />
    )
  }
  return (
    <section className="erp-dev-flow-task-results" aria-label="任务查询结果">
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text strong>
            {lookup.candidates.length > 1
              ? `找到 ${lookup.candidates.length} 条同名或相关任务`
              : '找到 1 条相关任务'}
          </Text>
          <Text type="secondary">
            名称可能重复，请结合任务编号、来源单号、负责岗位和状态选择。
          </Text>
        </div>
        <Tag>{lookup.serverMatchCount} 条后端匹配</Tag>
      </div>
      {!lookup.complete ? (
        <Alert
          showIcon
          type="warning"
          message={`当前只读取最新 ${lookup.loadedCount} 条匹配任务`}
          description="结果不完整时不会自动选择；请补全任务名称、任务编号或来源单号。"
        />
      ) : null}
      <ul>
        {lookup.candidates.map((task) => {
          const status = getWorkflowTaskStatusMeta(task)
          const sourceNo = cleanText(task.source_no) || '未记录来源单号'
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onSelectTask(task)}
                aria-label={`读取任务：${getWorkflowTaskDisplayName(task)}；任务编号：${task.task_code}；来源单号：${sourceNo}`}
              >
                <span>
                  <strong>{getWorkflowTaskDisplayName(task)}</strong>
                  <Tag color={status.color}>{status.label}</Tag>
                </span>
                <small>任务编号：{task.task_code}</small>
                <small>来源单号：{sourceNo}</small>
                <small>负责岗位：{getWorkflowTaskOwnerRoleLabel(task)}</small>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TaskFinder({
  draft,
  onDraftChange,
  onClearTask,
  onSelectTask,
  taskId,
}) {
  const controllerRef = useRef(null)
  const [lookup, setLookup] = useState({
    status: 'idle',
    candidates: [],
    complete: true,
    loadedCount: 0,
    serverMatchCount: 0,
    error: '',
  })
  useEffect(() => () => controllerRef.current?.abort(), [])

  const selectTask = (task) => {
    controllerRef.current?.abort()
    setLookup((current) => ({
      ...current,
      status: 'selected',
      candidates: [],
      error: '',
    }))
    onDraftChange(task.task_name)
    onSelectTask(task.id, task)
  }

  const submit = async () => {
    const directTaskId = parseDevFlowStateTaskIDReference(draft)
    if (directTaskId) {
      controllerRef.current?.abort()
      setLookup((current) => ({
        ...current,
        status: 'selected',
        candidates: [],
        error: '',
      }))
      onSelectTask(directTaskId, null)
      return
    }
    let query
    try {
      query = buildDevFlowStateTaskLookupQuery(draft)
    } catch (error) {
      setLookup({
        status: 'error',
        candidates: [],
        complete: true,
        loadedCount: 0,
        serverMatchCount: 0,
        error: error.message,
      })
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLookup({
      status: 'loading',
      candidates: [],
      complete: true,
      loadedCount: 0,
      serverMatchCount: 0,
      error: '',
    })
    try {
      const data = await listWorkflowTasks(query, { signal: controller.signal })
      if (controller.signal.aborted) return
      const resolved = resolveDevFlowStateTaskLookupPage(data, draft)
      if (resolved.autoSelectedTask) {
        selectTask(resolved.autoSelectedTask)
        return
      }
      onClearTask()
      setLookup({ status: 'ready', error: '', ...resolved })
    } catch (error) {
      if (controller.signal.aborted || isRpcAbortError(error)) return
      setLookup({
        status: 'error',
        candidates: [],
        complete: true,
        loadedCount: 0,
        serverMatchCount: 0,
        error: getActionErrorMessage(error, '查找任务', {
          fallback: '查找任务失败，请确认已登录且具备任务查看权限',
        }),
      })
    }
  }

  return (
    <div className="erp-dev-flow-task-finder">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label htmlFor="dev-flow-task-search">查找后台任务</label>
        <SearchInput
          id="dev-flow-task-search"
          allowClear
          maxLength={200}
          value={draft}
          placeholder="粘贴完整任务名称、任务编号、来源单号或数字 task_id"
          searchHint="从电脑端后台「任务看板」复制完整任务名称；也支持任务编号、来源单号，数字 task_id 仅用于开发排障"
          onChange={(event) => {
            controllerRef.current?.abort()
            setLookup((current) => ({
              ...current,
              status: 'idle',
              candidates: [],
              error: '',
            }))
            onDraftChange(event.target.value)
          }}
        />
        <Button
          type="primary"
          htmlType="submit"
          loading={lookup.status === 'loading'}
        >
          查找并读取
        </Button>
        {taskId ? <Button onClick={onClearTask}>清除当前任务</Button> : null}
      </form>
      <Text type="secondary">
        从后台「任务看板」复制完整任务名称、任务编号或来源单号；数字 task_id
        仅用于开发排障，查询结果受当前账号可见范围限制。
      </Text>
      <TaskLookupResults lookup={lookup} onSelectTask={selectTask} />
    </div>
  )
}

export { getProcessOwnerPoolLabel, BusinessChainProjectionContext, TaskFinder }
