import React from 'react'
import { Button } from 'antd'
import { getEngineeringMaterialRequest } from '../../api/masterDataOrderApi.mjs'
import {
  canReadEngineeringMaterial,
  getEngineeringMaterialTaskContext,
  isEngineeringMaterialTask,
} from '../../utils/engineeringMaterialTask.mjs'
import {
  buildCurrentTaskStageModel,
  buildEngineeringMaterialStageModel,
} from '../../utils/workflowTaskHandlingChain.mjs'
import {
  formatProcessStartedAt,
  getProcessLabel,
  getProcessStatusLabel,
} from '../../utils/processRuntimePresentation.mjs'
import WorkflowProcessStageTrack from './WorkflowProcessStageTrack.jsx'

export default function WorkflowTaskHandlingChain({
  task,
  profile,
  processContext,
  processContextState = 'idle',
  onRetryProcess,
  variant = 'desktop',
}) {
  const source = getEngineeringMaterialTaskContext(task)
  const processLinked = Boolean(task?.process_instance_id)
  const materialTask = isEngineeringMaterialTask(task)
  const canRead = canReadEngineeringMaterial(profile)
  const sourceKey = `${profile?.id}:${task?.id}:${task?.version}:${source?.orderID}:${source?.requestID}:${canRead}`
  const orderID = source?.orderID
  const requestID = source?.requestID
  const [result, setResult] = React.useState(null)
  const [reload, setReload] = React.useState(0)
  React.useEffect(() => {
    if (processLinked || !orderID || !requestID || !canRead) return undefined
    const controller = new AbortController()
    setResult(null)
    getEngineeringMaterialRequest(
      { sales_order_id: orderID, request_id: requestID },
      { signal: controller.signal }
    )
      .then((request) => {
        if (controller.signal.aborted) return
        const model = buildEngineeringMaterialStageModel(task, request)
        setResult({ key: sourceKey, model, state: model ? 'ready' : 'error' })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key: sourceKey, state: 'error' })
        }
      })
    return () => controller.abort()
  }, [sourceKey, processLinked, reload, orderID, requestID, canRead, task])

  if (!task) return null
  const current = result?.key === sourceKey ? result : null
  const state = processLinked
    ? processContextState
    : materialTask && source && canRead
      ? current?.state || 'loading'
      : 'ready'
  const model = processLinked
    ? null
    : materialTask && canRead && source
      ? current?.model
      : buildCurrentTaskStageModel(task)
  const retry = processLinked
    ? onRetryProcess
    : () => setReload((value) => value + 1)
  return (
    <section
      className={
        variant === 'mobile'
          ? 'erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
          : 'erp-task-action-drawer__summary'
      }
      aria-label="任务处理链"
      data-testid={
        variant === 'mobile'
          ? 'mobile-task-process-context'
          : 'workflow-task-handling-chain'
      }
    >
      <h3 className="erp-task-action-drawer__section-title">任务处理链</h3>
      {state === 'loading' || state === 'idle' ? (
        <p role="status">正在读取任务处理链</p>
      ) : state === 'error' ? (
        <div role="alert">
          <p>暂时无法读取任务处理链，请重新读取。</p>
          {retry ? (
            <Button size="small" onClick={retry}>
              重新读取
            </Button>
          ) : null}
        </div>
      ) : processLinked && processContext ? (
        <>
          <div className="erp-task-action-drawer__meta-grid erp-task-action-drawer__process-meta">
            <div>
              <span>业务流程</span>
              <strong>
                {getProcessLabel(processContext.process_instance)}
              </strong>
            </div>
            <div>
              <span>发起时间</span>
              <strong>
                {formatProcessStartedAt(
                  processContext.process_instance.started_at
                )}
              </strong>
            </div>
            <div>
              <span>流程状态</span>
              <strong>
                {getProcessStatusLabel(processContext.process_instance)}
              </strong>
            </div>
          </div>
          <WorkflowProcessStageTrack
            context={processContext}
            variant={variant}
          />
        </>
      ) : model ? (
        <WorkflowProcessStageTrack model={model} variant={variant} />
      ) : null}
      {materialTask && !processLinked && (!source || !canRead) ? (
        <p className="erp-material-summary-hint">
          {source
            ? '当前账号未开放用料审批记录查看。'
            : '用料来源无法核对，请刷新任务。'}
        </p>
      ) : null}
    </section>
  )
}
