import React, { useMemo } from 'react'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { Alert, Empty, Select, Spin, Tag } from 'antd'
import {
  getProcessOwnerPoolLabel,
  BusinessChainProjectionContext,
  TaskFinder,
} from './FlowTaskContext.jsx'
import { useRuntimeContext } from './useFlowRuntime.mjs'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  formatQueryTime,
  escapeMermaid,
  Text,
  Title,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  asArray,
  EvidenceDisclosure,
  KeyValue,
  GuidanceDisclosure,
} from './FlowStateShared.jsx'
import { Markdown } from '@/common/components/markdown'
import {
  formatProcessStartedAt,
  getProcessLabel,
  getProcessNodeLabel,
  getProcessNodeStatusLabel,
  getProcessStatusLabel,
  getWorkflowTaskDisplayName,
  isDisplayOnlyWorkflowTask,
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

function buildProcessMermaid(definition) {
  if (!definition) return ''
  const ids = new Map(
    definition.nodes.map((node, index) => [node.key, `P${index}`])
  )
  const nodeByKey = new Map(definition.nodes.map((node) => [node.key, node]))
  const lines = ['flowchart LR']
  for (const node of definition.nodes) {
    lines.push(`  ${ids.get(node.key)}["${escapeMermaid(node.label)}"]`)
  }
  for (const edge of definition.edges) {
    const branchLabel =
      edge.branchLabel || nodeByKey.get(edge.to)?.label || '结果分支'
    const connector = edge.branchPolicy
      ? `-->|"${escapeMermaid(branchLabel)}"|`
      : '-->'
    lines.push(`  ${ids.get(edge.from)} ${connector} ${ids.get(edge.to)}`)
  }
  return lines.join('\n')
}

function ProcessDefinitionCard({ definition }) {
  const nodeByKey = new Map(definition.nodes.map((node) => [node.key, node]))
  const mermaid = buildProcessMermaid(definition)
  return (
    <section className="erp-dev-flow-process-definition">
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text className="erp-dev-flow-eyebrow">流程定义与 variant</Text>
          <Title level={2}>{definition.label}</Title>
          <KeyValue value={definition.key} />
        </div>
        <Tag>{definition.processVersion}</Tag>
      </div>
      <GuidanceDisclosure
        guidanceKey="process-definition"
        title="这是流程定义"
        summary="不是某次运行实例"
        description={definition.guardrail}
      />
      <div className="erp-dev-flow-process-layout">
        <div className="erp-dev-flow-process-graph erp-dev-docs-markdown">
          <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
        </div>
        <ol>
          {definition.nodes.map((node, index) => (
            <li key={node.key}>
              <span>{index + 1}</span>
              <div>
                <strong>{node.label}</strong>
                <small>
                  {node.type === 'human_task' || node.type === 'approval'
                    ? '人工协同节点'
                    : node.type === 'domain_command'
                      ? '领域命令节点'
                      : '流程结束节点'}
                </small>
                {node.ownerPool ? (
                  <Tag>
                    负责岗位：
                    {getProcessOwnerPoolLabel(node.ownerPool)}
                  </Tag>
                ) : null}
                <KeyValue value={node.key} />
              </div>
            </li>
          ))}
        </ol>
      </div>
      <details>
        <summary>查看定义边与代码证据</summary>
        <ul>
          {definition.edges.map((edge) => (
            <li key={edge.key}>
              <strong>
                {nodeByKey.get(edge.from)?.label || edge.from} →{' '}
                {nodeByKey.get(edge.to)?.label || edge.to}
              </strong>
              <span>
                {edge.branchPolicy
                  ? edge.branchLabel ||
                    `转到${nodeByKey.get(edge.to)?.label || edge.to}`
                  : '顺序推进'}
              </span>
            </li>
          ))}
        </ul>
        <EvidenceDisclosure value={definition} />
      </details>
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
  const alignmentWarning =
    model.definitionAlignment === 'different' ||
    model.taskAlignment === 'different'
  const alignmentCopy = alignmentWarning
    ? '静态责任池、运行实例责任或当前任务岗位存在差异，请回到正式流程配置与任务记录核对。'
    : model.definitionAlignment === 'aligned' &&
        model.taskAlignment === 'aligned'
      ? '静态责任池、运行实例当前责任与当前任务岗位一致。'
      : '只展示已读到的责任来源；缺失部分保持未确认，不从任务名称或流程名称猜测。'

  return (
    <section
      className="erp-dev-flow-responsibility"
      aria-label="流程责任来源核对"
    >
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text strong>责任来源核对</Text>
          <Text type="secondary">
            版本化静态定义、运行实例当前责任和当前任务岗位分开显示。
          </Text>
        </div>
      </div>
      <dl>
        <div>
          <dt>版本化静态定义</dt>
          <dd>{definitionCopy}</dd>
        </div>
        <div>
          <dt>当前节点定义责任池</dt>
          <dd>{staticPoolCopy}</dd>
        </div>
        <div>
          <dt>运行实例当前责任</dt>
          <dd>{runtimeResponsibilityCopy}</dd>
        </div>
        <div>
          <dt>当前任务岗位</dt>
          <dd>
            {model.taskRoleKey
              ? getProcessOwnerPoolLabel(model.taskRoleKey)
              : '任务未返回负责岗位'}
          </dd>
        </div>
      </dl>
      <Alert
        showIcon
        type={alignmentWarning ? 'warning' : 'info'}
        message={alignmentCopy}
        description="责任核对只说明流程与任务由谁承接，不推断具体处理人，也不证明 Source Document 或 Fact / Ledger 已生效。"
      />
    </section>
  )
}

function RuntimeUnlinkedTaskBoundary({ task, taskId }) {
  const displayOnly = isDisplayOnlyWorkflowTask(task)
  const status = task ? getWorkflowTaskStatusMeta(task) : null
  return (
    <section
      className="erp-dev-flow-unlinked-task"
      data-task-runtime-boundary={displayOnly ? 'display-only' : 'unlinked'}
    >
      <Alert
        showIcon
        type={displayOnly ? 'warning' : 'info'}
        message={
          displayOnly
            ? '已找到任务，但它是模拟展示数据'
            : '已找到任务，但它没有正式流程轨迹'
        }
        description={
          displayOnly
            ? '这个任务只用于演示任务列表，没有关联正式 ProcessRuntime。页面不会补造流程节点，也不能据此证明业务事实已经发生。'
            : '任务记录真实存在，但未关联正式 ProcessRuntime。页面不会根据任务名称或 payload 补造流程节点。'
        }
      />
      <div className="erp-dev-flow-section-heading">
        <div>
          <Text className="erp-dev-flow-eyebrow">已找到的任务</Text>
          <Title level={2}>
            {task ? getWorkflowTaskDisplayName(task) : `任务 ${taskId}`}
          </Title>
        </div>
        {status ? (
          <Tag color={status.color}>{status.label}</Tag>
        ) : (
          <Tag>未关联正式流程</Tag>
        )}
      </div>
      <dl>
        {task ? (
          <>
            <div>
              <dt>任务编号</dt>
              <dd>{task.task_code}</dd>
            </div>
            <div>
              <dt>来源单号</dt>
              <dd>{task.source_no || '未记录来源单号'}</dd>
            </div>
            <div>
              <dt>负责岗位</dt>
              <dd>{getWorkflowTaskOwnerRoleLabel(task)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>内部 task_id</dt>
          <dd>
            <KeyValue value={taskId} />
          </dd>
        </div>
        <div>
          <dt>流程轨迹</dt>
          <dd>未关联正式 ProcessRuntime</dd>
        </div>
      </dl>
    </section>
  )
}

function RuntimeView({
  catalog,
  projection,
  definition,
  taskId,
  draft,
  selectedTask,
  onSelectDefinition,
  onDraftChange,
  onClearTask,
  onSelectTask,
  onBackToChain,
  onClearChainContext,
}) {
  const definitions = projection
    ? projection.processDefinitions
    : catalog.processDefinitions
  const scopedCatalog = useMemo(
    () => ({ ...catalog, processDefinitions: definitions }),
    [catalog, definitions]
  )
  const searchProps = useDefinitionSelectSearch()
  const optionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(scopedCatalog, 'runtime'),
    [scopedCatalog]
  )
  const definitionOptions = useMemo(
    () => buildProcessDefinitionSelectOptions(scopedCatalog),
    [scopedCatalog]
  )
  const association = getDevFlowStateTaskRuntimeAssociation(selectedTask)
  const runtime = useRuntimeContext(taskId, association)
  const nodes = asArray(runtime.context?.nodes)
  const runtimeResponsibility = useMemo(
    () =>
      buildDevFlowRuntimeResponsibility({
        definitions: catalog.processDefinitions,
        context: runtime.context,
        task: selectedTask,
      }),
    [catalog.processDefinitions, runtime.context, selectedTask]
  )
  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="runtime"
        title="ProcessRuntime 管“路”"
        summary="completed 不等于事实落账"
        description="它区分流程定义、流程 variant 和具体运行实例，回答走到哪里、走过什么、为何等待、失败或重试。ProcessRuntime completed 不等于业务事实已落账。"
      />
      <BusinessChainProjectionContext
        projection={projection}
        onBackToChain={onBackToChain}
        onClearChainContext={onClearChainContext}
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-process-select">选择流程定义</label>
        {definition ? (
          <Select
            id="dev-flow-process-select"
            aria-label="选择流程定义"
            showSearch
            virtual={false}
            classNames={DEFINITION_SELECT_CLASS_NAMES}
            {...searchProps}
            filterOption={optionFilter}
            notFoundContent="没有匹配的流程定义"
            value={definition.key}
            options={definitionOptions}
            optionRender={renderDefinitionSelectOption}
            onChange={onSelectDefinition}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前业务链步骤没有登记 ProcessRuntime；请到状态或 Fact 视图继续核对。"
          />
        )}
        <Text type="secondary">
          当前范围登记{' '}
          {new Set(definitions.map((item) => item.processKey)).size} 个流程
          key、{definitions.length} 个 variant；客户预览只代表设计选择。
        </Text>
      </section>
      {definition ? <ProcessDefinitionCard definition={definition} /> : null}
      <section className="erp-dev-flow-runtime-query">
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text strong>定位具体运行实例</Text>
            <Text type="secondary">
              当前通用读取链只能从可见 Workflow 任务锚定实例。
            </Text>
          </div>
        </div>
        <Alert
          showIcon
          type="warning"
          message="真实流程请先用任务信息定位"
          description="粘贴任务名称、任务编号或来源单号即可，无需查询 ProcessRuntime 实例 ID。"
        />
        <TaskFinder
          draft={draft}
          onDraftChange={onDraftChange}
          onClearTask={onClearTask}
          onSelectTask={onSelectTask}
          taskId={taskId}
        />
      </section>
      {!taskId ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="无运行数据：尚未选择真实任务，当前只展示流程定义"
        />
      ) : null}
      {runtime.status === 'loading' ? (
        <div className="erp-dev-flow-loading" role="status">
          <Spin />
          <span>正在读取具体运行实例…</span>
        </div>
      ) : null}
      {runtime.status === 'error' ? (
        <Alert
          showIcon
          type="error"
          message="运行实例读取失败"
          description={runtime.error}
        />
      ) : null}
      {runtime.status === 'unlinked' ? (
        <RuntimeUnlinkedTaskBoundary task={selectedTask} taskId={taskId} />
      ) : null}
      {runtime.status === 'ready' ? (
        <section className="erp-dev-flow-runtime-instance">
          <div className="erp-dev-flow-section-heading">
            <div>
              <Text className="erp-dev-flow-eyebrow">具体运行实例</Text>
              <Title level={2}>
                {getProcessLabel(runtime.context.process_instance)}
              </Title>
            </div>
            <Tag
              color={
                PROCESS_STATUS_COLORS[runtime.context.process_instance.status]
              }
            >
              {getProcessStatusLabel(runtime.context.process_instance)}
            </Tag>
          </div>
          <dl>
            <div>
              <dt>实例 ID</dt>
              <dd>
                <KeyValue value={String(runtime.context.process_instance.id)} />
              </dd>
            </div>
            <div>
              <dt>流程 key</dt>
              <dd>
                <KeyValue
                  value={runtime.context.process_instance.process_key}
                />
              </dd>
            </div>
            <div>
              <dt>流程版本</dt>
              <dd>{runtime.context.process_instance.process_version}</dd>
            </div>
            <div>
              <dt>来源单号</dt>
              <dd>{runtime.context.source?.no || '未声明'}</dd>
            </div>
            <div>
              <dt>发起时间</dt>
              <dd>
                {formatProcessStartedAt(
                  runtime.context.process_instance.started_at
                )}
              </dd>
            </div>
            <div>
              <dt>数据来源</dt>
              <dd>workflow.get_task_process_context</dd>
            </div>
            <div>
              <dt>查询时间</dt>
              <dd>{formatQueryTime(runtime.queriedAt)}</dd>
            </div>
          </dl>
          <Alert
            showIcon
            type="warning"
            message="尚未证明业务事实已落账"
            description="下面的 completed 只属于 ProcessRuntime 节点；不会把 Workflow 或 Fact / Ledger 节点一并标成完成。"
          />
          <RuntimeResponsibilityEvidence model={runtimeResponsibility} />
          <ol className="erp-dev-flow-runtime-nodes">
            {nodes.map((node) => (
              <li
                key={node.id}
                data-node-status={node.status}
                aria-current={
                  ['active', 'blocked'].includes(node.status)
                    ? 'step'
                    : undefined
                }
              >
                <span>
                  {node.status === 'completed' ? (
                    <CheckCircleOutlined />
                  ) : node.status === 'blocked' ? (
                    <ExclamationCircleOutlined />
                  ) : (
                    <ClockCircleOutlined />
                  )}
                </span>
                <div>
                  <strong>{getProcessNodeLabel(node)}</strong>
                  <KeyValue value={node.node_key} />
                  <small>尝试次数：{node.attempt || 1}</small>
                </div>
                <Tag color={PROCESS_STATUS_COLORS[node.status]}>
                  {getProcessNodeStatusLabel(node)}
                </Tag>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

export { RuntimeView }
