import React, { useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Spin, Tag } from 'antd'
import { WorkbenchEmpty, WorkbenchFacts, WorkbenchSection } from '../WorkbenchPattern.jsx'
import Select from '@/common/components/select/AppSelect'
import {
  getProcessOwnerPoolLabel,
  BusinessChainProjectionContext,
} from './FlowTaskContext.jsx'
import { useRuntimeContext } from './useFlowRuntime.mjs'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  formatQueryTime,
  Text,
  Title,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  asArray,
  EvidenceDisclosure,
  KeyValue,
} from './FlowStateShared.jsx'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import {
  formatProcessStartedAt,
  getProcessLabel,
  getProcessNodeLabel,
  buildWorkflowProcessStageModel,
  getProcessStatusLabel,
  getWorkflowTaskDisplayName,
} from '@/erp/utils/processRuntimePresentation.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '@/erp/utils/workflowTaskBoard.mjs'
import { getDevFlowStateTaskRuntimeAssociation } from '../../pages/devFlowStateTaskLookup.mjs'
import { createDevFlowDefinitionOptionFilter } from '../../pages/devFlowDefinitionSearch.mjs'
import { buildProcessDefinitionSelectOptions } from '../../pages/devFlowDefinitionSelectOptions.mjs'
import { buildDevFlowRuntimeResponsibility } from '../../pages/devFlowRuntimeResponsibility.mjs'

const PROCESS_STATUS_COLORS = Object.freeze({
  active: 'orange',
  blocked: 'red',
  completed: 'blue',
  waiting: 'default',
})

function ProcessDefinitionCard({ definition }) {
  const nodeByKey = new Map(definition.nodes.map((node) => [node.key, node]))
  const [selectedKey, select] = useState(definition.initial)
  const selected = nodeByKey.get(selectedKey) || definition.nodes[0]
  const flow = useMemo(
    () => ({
      entryNodeKeys: [definition.initial],
      nodes: definition.nodes.map((node) => ({
        ...node,
        kind: 'process_runtime',
        terminal: node.type === 'end',
        role: node.ownerPool ? getProcessOwnerPoolLabel(node.ownerPool) : null,
      })),
      edges: definition.edges.map((edge) => ({
        ...edge,
        label: edge.branchLabel,
        kind: edge.branchPolicy ? 'branches_to' : undefined,
      })),
    }),
    [definition]
  )
  return (
    <section className="erp-dev-flow-process-definition">
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text className="erp-dev-flow-eyebrow">流程定义与 variant</Text>
          <Title level={2}>{definition.label}</Title>

        </div>
        <Text type="secondary">流程定义</Text>
      </div>

      <BusinessFlowDiagram
        flow={flow}
        label={`${definition.label}定义图`}
        selectedKey={selected.key}
        onSelect={select}
      />
      <div className="erp-dev-fulfillment-guide__focus" aria-live="polite">
        <strong>{selected.label}</strong>
        <p>
          {selected.type === 'human_task' || selected.type === 'approval'
            ? '人工协同节点'
            : selected.type === 'domain_command'
              ? '领域命令节点'
              : '流程结束节点'}
          {selected.ownerPool
            ? ` · ${getProcessOwnerPoolLabel(selected.ownerPool)}`
            : ''}
        </p>
      </div>
      <EvidenceDisclosure value={definition} label="定义与代码依据">
        <WorkbenchFacts items={[
          { label: '流程标识', value: <KeyValue value={definition.key} /> },
          { label: '流程版本', value: definition.processVersion },
        ]}
        />
        <ul>
          {definition.edges.map((edge) => (
            <li key={edge.key}>
              <strong>{nodeByKey.get(edge.from)?.label || edge.from} → {nodeByKey.get(edge.to)?.label || edge.to}</strong>
              <span>{edge.branchPolicy ? edge.branchLabel || '结果分支' : '顺序推进'}</span>
            </li>
          ))}
        </ul>
      </EvidenceDisclosure>
    </section>
  )
}

function RuntimeResponsibilityEvidence({ model }) {
  const definitionCopy = model.matchedDefinitions.length
    ? `${model.processKey} · ${model.processVersion} · ${model.matchedDefinitions.length} 个匹配 variant`
    : '未找到与运行实例节点相符的版本化定义'
  const staticPoolCopy = model.currentItems.length
    ? model.currentItems
        .map((item) => {
          const roles = item.staticOwnerPoolKeys.map(getProcessOwnerPoolLabel)
          return `${item.nodeLabel}：${roles.length ? roles.join('、') : '静态定义未声明人工责任池'}`
        })
        .join('；')
    : '当前没有运行中节点'
  const runtimeResponsibilityCopy = model.currentItems.length
    ? model.currentItems
        .map(
          (item) =>
            `${item.nodeLabel}：${
              item.runtimeRoleKey
                ? getProcessOwnerPoolLabel(item.runtimeRoleKey)
                : '运行实例未返回责任岗位'
            }`
        )
        .join('；')
    : '当前没有运行中节点'
  return (
    <WorkbenchFacts
      aria-label="流程责任来源核对"
      items={[
      { label: '版本化静态定义', value: definitionCopy },
      { label: '当前节点定义责任池', value: staticPoolCopy },
      { label: '运行实例当前责任', value: runtimeResponsibilityCopy },
      { label: '当前任务岗位', value: model.taskRoleKey ? getProcessOwnerPoolLabel(model.taskRoleKey) : '任务未返回负责岗位' },
    ]}
    />
  )
}

function RuntimeUnlinkedTaskBoundary({ task, taskId }) {
  const status = task ? getWorkflowTaskStatusMeta(task) : null
  return (
    <WorkbenchSection
      flat
      className="erp-dev-flow-unlinked-task"
      data-task-runtime-boundary="unlinked"
      title={task ? getWorkflowTaskDisplayName(task) : `任务 ${taskId}`}
      description="已找到任务，但它没有正式流程轨迹"
      actions={status ? <Tag color={status.color}>{status.label}</Tag> : null}
    >
      <WorkbenchFacts items={[
        { label: '来源单号', value: task?.source_no || '未记录来源单号' },
        { label: '负责岗位', value: task ? getWorkflowTaskOwnerRoleLabel(task) : '待确认' },
      ]}
      />
      <EvidenceDisclosure label="任务关联依据">
        <WorkbenchFacts items={[
          { label: '任务编号', value: task?.task_code || '未记录' },
          { label: '内部任务标识', value: <KeyValue value={taskId} /> },
          { label: '流程轨迹', value: '未关联正式 ProcessRuntime' },
        ]}
        />
      </EvidenceDisclosure>
    </WorkbenchSection>
  )
}

function RuntimeView({
  catalog,
  projection,
  definition,
  taskId,
  selectedTask,
  onSelectDefinition,
  onBackToChain,
  onClearChainContext,
  onLocateTask,
  onBrowseDefinitions,
}) {
  const definitions = projection ? projection.processDefinitions : catalog.processDefinitions
  const scopedCatalog = useMemo(() => ({ ...catalog, processDefinitions: definitions }), [catalog, definitions])
  const searchProps = useDefinitionSelectSearch()
  const optionFilter = useMemo(() => createDevFlowDefinitionOptionFilter(scopedCatalog, 'runtime'), [scopedCatalog])
  const definitionOptions = useMemo(() => buildProcessDefinitionSelectOptions(scopedCatalog), [scopedCatalog])
  const association = getDevFlowStateTaskRuntimeAssociation(selectedTask)
  const [revision, setRevision] = useState(0)
  const runtime = useRuntimeContext(taskId, association, revision)
  const nodes = asArray(runtime.context?.nodes)
  const stageModel = runtime.status === 'ready' ? buildWorkflowProcessStageModel(runtime.context) : null
  const runtimeResponsibility = useMemo(() => buildDevFlowRuntimeResponsibility({
    definitions: catalog.processDefinitions,
    context: runtime.context,
    task: selectedTask,
  }), [catalog.processDefinitions, runtime.context, selectedTask])
  const responsibilityMismatch = runtimeResponsibility.definitionAlignment === 'different' || runtimeResponsibility.taskAlignment === 'different'
  const currentNodes = asArray(runtime.context?.current_nodes)
  return (
    <div className="erp-dev-flow-view-stack">
      <BusinessChainProjectionContext projection={projection} onBackToChain={onBackToChain} onClearChainContext={onClearChainContext} />
      {!taskId ? (
        <>
          <div className="erp-dev-flow-inline-note">
            <Text type="secondary">当前查看流程定义；实际进度按任务查询。</Text>
            <Button onClick={onLocateTask}>定位任务</Button>
          </div>
          <section className="erp-dev-flow-definition-selector">
            <label htmlFor="dev-flow-process-select">选择流程定义</label>
            {definitions.length > 0 ? (
              <Select
                placeholder="选择流程定义"
                id="dev-flow-process-select"
                aria-label="选择流程定义"
                showSearch
                virtual={false}
                classNames={DEFINITION_SELECT_CLASS_NAMES}
                {...searchProps}
                filterOption={optionFilter}
                notFoundContent="没有匹配的流程定义"
                value={definition?.key}
                labelRender={() => definition?.label}
                options={definitionOptions}
                optionRender={renderDefinitionSelectOption}
                onChange={onSelectDefinition}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前业务没有登记流程定义，可查看状态与流转规则或事实定义。" />}
          </section>
          {definition ? <ProcessDefinitionCard key={definition.key} definition={definition} /> : definitions.length > 0 ? <WorkbenchEmpty title="请选择流程定义" /> : null}
        </>
      ) : null}
      {runtime.status === 'loading' ? <div className="erp-dev-flow-loading" role="status"><Spin /><span>正在读取具体运行实例…</span></div> : null}
      {runtime.status === 'error' ? (
        <Alert showIcon type="error" message="运行实例读取失败" description={runtime.error} action={<Button onClick={() => setRevision((value) => value + 1)}>重试</Button>} />
      ) : null}
      {runtime.status === 'unlinked' ? <RuntimeUnlinkedTaskBoundary task={selectedTask} taskId={taskId} /> : null}
      {runtime.status === 'ready' ? (
        <WorkbenchSection
          flat
          className="erp-dev-flow-runtime-instance"
          title={getProcessLabel(runtime.context.process_instance)}
          actions={<Tag color={PROCESS_STATUS_COLORS[runtime.context.process_instance.status]}>{getProcessStatusLabel(runtime.context.process_instance)}</Tag>}
        >
          <WorkbenchFacts items={[
            { label: '来源单号', value: runtime.context.source?.no || '未声明' },
            { label: '发起时间', value: formatProcessStartedAt(runtime.context.process_instance.started_at) },
            ...(runtime.context.process_instance.resolved_at ? [{ label: '结束时间', value: formatProcessStartedAt(runtime.context.process_instance.resolved_at) }] : []),
            ...(runtime.context.process_instance.resolution_reason ? [{ label: '结束原因', value: runtime.context.process_instance.resolution_reason }] : []),
            { label: '当前环节', value: currentNodes.map(getProcessNodeLabel).join('、') || '无运行中节点' },
            { label: '负责岗位', value: runtimeResponsibility.currentItems.map((item) => item.runtimeRoleKey ? getProcessOwnerPoolLabel(item.runtimeRoleKey) : '运行实例未返回责任岗位').join('、') || '无运行中节点' },
            ...(selectedTask?.blocked_reason ? [{ label: '当前原因', value: selectedTask.blocked_reason }] : []),
          ]}
          />
          {responsibilityMismatch ? <Alert type="warning" showIcon message="流程与任务的责任岗位存在差异，请核对责任来源。" /> : null}
          <ol className="erp-dev-flow-runtime-nodes" aria-label="实际流程节点">
            {stageModel.items.map((item) => (
              <li key={item.key} data-node-status={nodes.find((node) => node.id === item.id)?.status} data-node-tone={item.tone} aria-current={item.current ? 'step' : undefined}>
                <span>{item.tone === 'blocked' || item.tone === 'rejected' ? <ExclamationCircleOutlined /> : item.completed ? <CheckCircleOutlined /> : <ClockCircleOutlined />}</span>
                <div>
                  <strong>{item.label}</strong>{item.attemptLabel ? <small>{item.attemptLabel}</small> : null}
                  {item.startedAtLabel ? <small>开始：{item.startedAtLabel}</small> : null}
                  {item.completedAtLabel ? <small>结束：{item.completedAtLabel}</small> : null}
                </div>
                <Tag color={item.tone === 'blocked' || item.tone === 'rejected' ? 'red' : item.current ? 'orange' : 'default'}>{item.statusLabel}</Tag>
              </li>
            ))}
          </ol>
          {stageModel.items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无已发生的流程步骤" /> : null}
          {stageModel.hasUndecidedRoute ? <p>尚有待确定的后续路径；未激活分支不列为已发生步骤。</p> : null}
          <Text type="secondary">流程节点完成不代表库存、出货或财务结果已生效。</Text>
          <EvidenceDisclosure label="运行依据与责任核对">
            <WorkbenchFacts items={[
              { label: '实例标识', value: <KeyValue value={String(runtime.context.process_instance.id)} /> },
              { label: '流程标识', value: <KeyValue value={runtime.context.process_instance.process_key} /> },
              { label: '流程版本', value: runtime.context.process_instance.process_version },
              { label: '数据来源', value: 'workflow.get_task_process_context' },
              { label: '查询时间', value: formatQueryTime(runtime.queriedAt) },
            ]}
            />
            <RuntimeResponsibilityEvidence model={runtimeResponsibility} />
            <ul>{nodes.map((node) => <li key={node.id}><KeyValue value={node.node_key} /> · 尝试次数：{node.attempt || 1}</li>)}</ul>
          </EvidenceDisclosure>
        </WorkbenchSection>
      ) : null}
      {taskId ? <div className="erp-dev-flow-inline-note"><Button onClick={onBrowseDefinitions}>浏览流程定义</Button></div> : null}
    </div>
  )
}

export { RuntimeView }
