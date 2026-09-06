import React, { useEffect, useState } from 'react'
import { Alert, Empty, Spin, Tag } from 'antd'
import {
  getProcessOwnerPoolLabel,
  BusinessChainProjectionContext,
  TaskFinder,
} from './FlowTaskContext.jsx'
import {
  formatQueryTime,
  Text,
  Title,
  KeyValue,
  GuidanceDisclosure,
} from './FlowStateShared.jsx'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listWorkflowTaskEvents } from '@/erp/api/workflowApi.mjs'
import { getWorkflowTaskDisplayName } from '@/erp/utils/processRuntimePresentation.mjs'
import { buildWorkflowTaskEventTrailModel } from '@/erp/utils/workflowTaskEventPresentation.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '@/erp/utils/workflowTaskBoard.mjs'

function useWorkflowEvents(taskId) {
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
  }, [taskId])
  return state
}

function WorkflowView({
  projection,
  taskId,
  draft,
  selectedTask,
  onDraftChange,
  onClearTask,
  onSelectTask,
  onBackToChain,
  onClearChainContext,
}) {
  const events = useWorkflowEvents(taskId)
  const model = buildWorkflowTaskEventTrailModel({
    events: events.items,
    task: selectedTask || {},
  })
  const status = selectedTask ? getWorkflowTaskStatusMeta(selectedTask) : null
  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="workflow"
        title="Workflow 管“人”"
        summary="任务 done 不等于业务事实发生"
        description="它回答谁负责、谁审批、谁接棒，以及为什么阻塞或退回。任务 done 只表示协同任务结束，不证明库存、出货、质检或财务事实已经发生。"
      />
      <BusinessChainProjectionContext
        projection={projection}
        onBackToChain={onBackToChain}
        onClearChainContext={onClearChainContext}
      />
      <TaskFinder
        draft={draft}
        onDraftChange={onDraftChange}
        onClearTask={onClearTask}
        onSelectTask={onSelectTask}
        taskId={taskId}
      />
      {!taskId ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚未查询任务；请粘贴后台可见的任务名称、任务编号或来源单号"
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
        />
      ) : null}
      {events.status === 'ready' ? (
        <>
          <section className="erp-dev-flow-specialist-summary">
            <div className="erp-dev-flow-section-heading">
              <div>
                <Text className="erp-dev-flow-eyebrow">真实 Workflow 任务</Text>
                <Title level={2}>
                  {selectedTask
                    ? getWorkflowTaskDisplayName(selectedTask)
                    : `任务 ${taskId}`}
                </Title>
              </div>
              {status ? (
                <Tag color={status.color}>{status.label}</Tag>
              ) : (
                <Tag>状态见事件记录</Tag>
              )}
            </div>
            <dl>
              <div>
                <dt>任务类型</dt>
                <dd>
                  {selectedTask ? (
                    <>
                      <span>{getWorkflowTaskDisplayName(selectedTask)}</span>
                      <KeyValue value={selectedTask.task_group}>
                        {selectedTask.task_group}
                      </KeyValue>
                    </>
                  ) : (
                    '请通过名称或编号查询以显示任务类型'
                  )}
                </dd>
              </div>
              <div>
                <dt>负责岗位</dt>
                <dd>
                  {selectedTask
                    ? getWorkflowTaskOwnerRoleLabel(selectedTask)
                    : '从可见任务结果确认'}
                </dd>
              </div>
              <div>
                <dt>处理人</dt>
                <dd>
                  {selectedTask?.assignee_id
                    ? '已指定处理人'
                    : selectedTask
                      ? '岗位共同待办'
                      : '从可见任务结果确认'}
                </dd>
              </div>
              <div>
                <dt>来源单号</dt>
                <dd>{selectedTask?.source_no || '从可见任务结果确认'}</dd>
              </div>
              <div>
                <dt>数据来源</dt>
                <dd>workflow.list_task_events</dd>
              </div>
              <div>
                <dt>查询时间</dt>
                <dd>{formatQueryTime(events.queriedAt)}</dd>
              </div>
            </dl>
          </section>
          <Alert
            showIcon
            type="warning"
            message="Workflow task done ≠ Fact posted"
            description="即使任务显示“已完成”，仍必须到 Fact / Ledger 的权威真源确认业务结果和凭证。"
          />
          <section className="erp-dev-flow-responsibility">
            <div className="erp-dev-flow-section-heading">
              <div>
                <Text strong>当前责任</Text>
                <Text type="secondary">岗位、承接方式、状态和当前原因。</Text>
              </div>
            </div>
            <dl>
              {model.responsibilityItems.map((item) => (
                <div key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="erp-dev-flow-events">
            <div className="erp-dev-flow-section-heading">
              <div>
                <Text strong>协同事件</Text>
                <Text type="secondary">
                  只回答这条任务如何被处理，不冒充来源单据完整审批链。
                </Text>
              </div>
              <Tag>{model.summaryLabel}</Tag>
            </div>
            {events.truncated ? (
              <Alert showIcon type="warning" message="只显示最近 100 条事件" />
            ) : null}
            {model.items.length > 0 ? (
              <ol>
                {model.items.map((item) => (
                  <li key={item.key} data-event-tone={item.tone}>
                    <span>{item.timeLabel}</span>
                    <strong>{item.label}</strong>
                    <p>
                      {item.actorLabel}
                      {item.transitionLabel ? ` · ${item.transitionLabel}` : ''}
                    </p>
                    {item.reason ? (
                      <blockquote>{item.reason}</blockquote>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="该任务暂无可见协同事件"
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

export {
  getProcessOwnerPoolLabel,
  BusinessChainProjectionContext,
  TaskFinder,
  WorkflowView,
}
