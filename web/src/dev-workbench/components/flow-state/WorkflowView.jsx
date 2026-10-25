import React, { useEffect, useState } from 'react'
import { Alert, Button, Empty, Spin, Tag } from 'antd'
import { WorkbenchEmpty, WorkbenchFacts, WorkbenchSection } from '../WorkbenchPattern.jsx'
import {
  getProcessOwnerPoolLabel,
  BusinessChainProjectionContext,
} from './FlowTaskContext.jsx'
import {
  formatQueryTime,
  Text,
  KeyValue,
  EvidenceDisclosure,
} from './FlowStateShared.jsx'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listWorkflowTaskEvents } from '@/erp/api/workflowApi.mjs'
import { getWorkflowTaskDisplayName } from '@/erp/utils/processRuntimePresentation.mjs'
import { buildWorkflowTaskEventTrailModel } from '@/erp/utils/workflowTaskEventPresentation.mjs'
import {
  getWorkflowTaskStatusMeta,
} from '@/erp/utils/workflowTaskBoard.mjs'

function useWorkflowEvents(taskId, revision) {
  const [state, setState] = useState({
    status: 'idle',
    items: [],
    truncated: false,
    error: '',
    queriedAt: '',
  })
  useEffect(() => {
    if (!taskId) {
      setState({
        status: 'idle',
        items: [],
        truncated: false,
        error: '',
        queriedAt: '',
      })
      return undefined
    }
    const controller = new AbortController()
    setState({
      status: 'loading',
      items: [],
      truncated: false,
      error: '',
      queriedAt: '',
    })
    listWorkflowTaskEvents(Number(taskId), {
      limit: 100,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            items: result.items,
            truncated: result.truncated,
            error: '',
            queriedAt: new Date().toISOString(),
          })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        setState({
          status: 'error',
          items: [],
          truncated: false,
          queriedAt: new Date().toISOString(),
          error: getActionErrorMessage(error, '读取任务协同记录', {
            fallback: '读取任务协同记录失败，请确认已登录且具备任务查看权限',
          }),
        })
      })
    return () => controller.abort()
  }, [taskId, revision])
  return state
}

function WorkflowView({
  projection,
  taskId,
  selectedTask,
  onBackToChain,
  onClearChainContext,
  onLocateTask,
}) {
  const [revision, setRevision] = useState(0)
  const events = useWorkflowEvents(taskId, revision)
  const model = buildWorkflowTaskEventTrailModel({
    events: events.items,
    task: selectedTask || {},
  })
  const status = selectedTask ? getWorkflowTaskStatusMeta(selectedTask) : null
  return (
    <div className="erp-dev-flow-view-stack" data-workflow-task={taskId || undefined}>
      <BusinessChainProjectionContext
        projection={projection}
        onBackToChain={onBackToChain}
        onClearChainContext={onClearChainContext}
      />
      {!taskId ? (
        <WorkbenchEmpty
          title="先选择要查看的任务"
          description="按来源单号、任务名称或编号定位后，查看处理人和协同事件。"
          action={<Button onClick={onLocateTask}>定位任务</Button>}
        />
      ) : null}
      {events.status === 'loading' ? (
        <div className="erp-dev-flow-loading" role="status">
          <Spin />
          <span>正在读取任务协同记录…</span>
        </div>
      ) : null}
      {events.status === 'error' ? (
        <Alert
          showIcon
          type="error"
          message="任务协同记录读取失败"
          description={events.error}
          action={<Button onClick={() => setRevision((value) => value + 1)}>重试</Button>}
        />
      ) : null}
      {events.status === 'ready' ? (
        <>
          <WorkbenchSection
            flat
            className="erp-dev-flow-specialist-summary"
            title={selectedTask ? getWorkflowTaskDisplayName(selectedTask) : `任务 ${taskId}`}
            description={selectedTask?.source_no || '来源单号未记录'}
            actions={status ? <Tag color={status.color}>{status.label}</Tag> : <Tag>状态见事件记录</Tag>}
          >
            <WorkbenchFacts items={model.responsibilityItems.filter((item) => item.key !== 'status')} />
          </WorkbenchSection>
          <WorkbenchSection
            flat
            className="erp-dev-flow-events"
            title="处理记录"
            actions={<Text type="secondary">{model.summaryLabel}</Text>}
          >
            {events.truncated ? (
              <Alert showIcon type="warning" message="只显示最近 100 条事件" />
            ) : null}
            {model.items.length > 0 ? (
              <ol>
                {model.items.map((item) => (
                  <li key={item.key} data-event-tone={item.tone}>
                    <span>{item.timeLabel}</span>
                    <strong>{item.label}</strong>
                    <p>{item.actorLabel}{item.transitionLabel ? ` · ${item.transitionLabel}` : ''}</p>
                    {item.reason ? <blockquote>{item.reason}</blockquote> : null}
                  </li>
                ))}
              </ol>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该任务暂无可见协同事件" />}
          </WorkbenchSection>
          <Text type="secondary">任务记录不代表库存、出货或财务结果已生效。</Text>
          <EvidenceDisclosure label="查询依据">
            <WorkbenchFacts items={[
              { label: '任务编号', value: selectedTask?.task_code || '未记录' },
              { label: '内部任务标识', value: <KeyValue value={String(taskId)} /> },
              { label: '任务类型', value: <KeyValue value={selectedTask?.task_group || '未记录'} /> },
              { label: '数据来源', value: 'workflow.list_task_events' },
              { label: '查询时间', value: formatQueryTime(events.queriedAt) },
            ]}
            />
          </EvidenceDisclosure>
        </>
      ) : null}
    </div>
  )
}

export {
  getProcessOwnerPoolLabel,
  BusinessChainProjectionContext,
  WorkflowView,
}
