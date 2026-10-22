import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Button, Empty, Space, Spin, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import Select from '@/common/components/select/AppSelect'
import TaskFulfillmentGuide from './TaskFulfillmentGuide.jsx'
import BusinessChainTopics from './BusinessChainTopics.jsx'
import { useRuntimeContext } from './useFlowRuntime.mjs'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  formatQueryTime,
  escapeMermaid,
  Paragraph,
  Text,
  Title,
  cleanText,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  asArray,
  EvidenceDisclosure,
  KeyValue,
} from './FlowStateShared.jsx'
import { Markdown } from '@/common/components/markdown'

import {
  getProcessLabel,
} from '@/erp/utils/processRuntimePresentation.mjs'
import {
  buildDevBusinessChainProjection,
  buildDevBusinessChainRoleGuide,
  describeDevBusinessChainNode,
  describeDevBusinessChainResponsibility,
} from '../../config/devBusinessChainProjection.mjs'
import { getDevFlowStateTaskRuntimeAssociation } from '../../pages/devFlowStateTaskLookup.mjs'
import {
  createDevFlowDefinitionOptionFilter,
  normalizeDevFlowDefinitionSearchText,
} from '../../pages/devFlowDefinitionSearch.mjs'
import { buildBusinessChainSelectOptions } from '../../pages/devFlowDefinitionSelectOptions.mjs'
import {
  DEV_FLOW_STATE_OVERVIEW_CHAIN_KEY as ALL_BUSINESS_CHAINS_KEY,
  DEV_FLOW_STATE_QUERY_KEYS as QUERY_KEYS,
} from '../../pages/devFlowStateQuery.mjs'

const CHAIN_LAYER_PRESENTATION = Object.freeze({
  source_document: {
    label: '业务单据',
    technicalLabel: 'Source Document',
    color: 'blue',
    responsibility: '由具有该单据权限的业务经办岗位办理。',
    completion:
      '完成该单据允许的当前动作后，才按业务链进入下一步；单据状态不等于业务事实已经生效。',
    exception:
      '单据被退回、取消或关闭时，按该业务对象的状态规则处理，不在本页直接改状态。',
  },
  masterdata_lifecycle: {
    label: '基础资料',
    technicalLabel: 'MasterData',
    color: 'purple',
    responsibility: '由获授权的基础资料维护岗位负责。',
    completion:
      '资料已经生效并满足后续引用条件；停用或缺少有效版本时，依赖它的步骤不能继续。',
    exception: '先修正或启用权威基础资料，再回到业务链继续核对。',
  },
  process_runtime: {
    label: '流程运行',
    technicalLabel: 'ProcessRuntime',
    color: 'orange',
    responsibility:
      '系统按已登记流程推进；需要人工办理时，由对应岗位任务承接。',
    completion:
      '当前流程步骤按正式结果结束并进入已登记的下一步；流程走完不代表业务事实已经生效。',
    exception:
      '到“查责任与任务”查看等待、阻塞或退回原因，不在本页强改流程状态。',
  },
  workflow_task: {
    label: '岗位协同',
    technicalLabel: 'Workflow Task',
    color: 'green',
    responsibility: '由当前任务的责任人或责任池办理。',
    completion:
      '任务完成、阻塞或退回都会留下协同记录；任务完成不等于库存、出货或财务结果已经生效。',
    exception: '到“查责任与任务”查看原因、责任人和接棒记录。',
  },
  fact_ledger: {
    label: '已生效业务记录',
    technicalLabel: 'Fact / Ledger',
    color: 'red',
    responsibility:
      '由对应领域动作和有权限的岗位共同形成，权威结果以业务凭证为准。',
    completion: '正式业务凭证已经生效，并能按对应取消、调整或冲正规则纠正。',
    exception: '不能直接改状态；应使用对应业务对象的取消、调整或冲正路径。',
  },
  derived_result: {
    label: '计算结果',
    technicalLabel: 'Derived Result',
    color: 'geekblue',
    responsibility: '由系统根据正式业务记录计算或汇总。',
    completion:
      '上游权威数据完整且计算结果已更新；计算结果本身不会反写业务事实。',
    exception: '返回上游业务记录核对缺失或错误来源，不在计算结果上补造数据。',
  },
})

const CHAIN_EDGE_PRESENTATION = Object.freeze({
  starts_process: '触发流程',
  creates_task: '创建任务',
  calls_domain_command: '调用领域命令',
  requires: '需要前置结果',
  creates_source: '创建来源单据',
  posts_fact: '生成业务事实',
  derives: '形成派生结果',
  reverses: '冲正原影响',
  returns: '退回或回货',
  reworks: '进入返工',
})

function uniqueStrings(values) {
  return [...new Set(asArray(values).filter(Boolean))]
}

function buildChainMermaid(chain, currentRuntimeNodeKey) {
  if (!chain) return ''
  const ids = new Map(chain.nodes.map((node, index) => [node.key, `N${index}`]))
  const lines = ['flowchart LR']
  for (const node of chain.nodes) {
    lines.push(`  ${ids.get(node.key)}["${escapeMermaid(node.label)}"]`)
  }
  for (const edge of chain.edges) {
    lines.push(
      `  ${ids.get(edge.from)} -->|"${escapeMermaid(edge.label)}"| ${ids.get(edge.to)}`
    )
  }
  lines.push(
    '  classDef source_document fill:#e6f4ff,stroke:#1677ff,color:#102a43',
    '  classDef masterdata_lifecycle fill:#f9f0ff,stroke:#722ed1,color:#2d1648',
    '  classDef process_runtime fill:#fff7e6,stroke:#d46b08,color:#452500',
    '  classDef workflow_task fill:#f6ffed,stroke:#389e0d,color:#163300',
    '  classDef fact_ledger fill:#fff1f0,stroke:#cf1322,color:#3d0b0b',
    '  classDef derived_result fill:#f0f5ff,stroke:#2f54eb,color:#061b57',
    '  classDef runtime_current fill:#fffbe6,stroke:#fa8c16,stroke-width:4px,color:#422006'
  )
  for (const node of chain.nodes) {
    const classes = [node.layer]
    if (node.key === currentRuntimeNodeKey) classes.push('runtime_current')
    lines.push(`  class ${ids.get(node.key)} ${classes.join(',')}`)
  }
  return lines.join('\n')
}

function buildBusinessChainOverviewMermaid(overview, chains, currentChainKey) {
  if (!overview) return ''
  const chainByKey = new Map(chains.map((chain) => [chain.key, chain]))
  const ids = new Map(chains.map((chain, index) => [chain.key, `C${index}`]))
  const lines = ['flowchart LR']

  overview.lanes.forEach((lane, laneIndex) => {
    lines.push(`  subgraph L${laneIndex}["${escapeMermaid(lane.label)}"]`)
    lines.push('    direction LR')
    lane.chainKeys.forEach((chainKey) => {
      const chain = chainByKey.get(chainKey)
      lines.push(
        `    ${ids.get(chainKey)}["${escapeMermaid(chain?.label || chainKey)}"]`
      )
    })
    lines.push('  end')
  })

  overview.relations.forEach((relation) => {
    lines.push(
      `  ${ids.get(relation.fromChainKey)} -->|"${escapeMermaid(relation.label)}"| ${ids.get(relation.toChainKey)}`
    )
  })
  lines.push(
    '  classDef primary fill:#f6ffed,stroke:#389e0d,color:#163300',
    '  classDef supporting fill:#e6f4ff,stroke:#1677ff,color:#102a43',
    '  classDef exception fill:#fff2e8,stroke:#d4380d,color:#431407',
    '  classDef rework fill:#f9f0ff,stroke:#722ed1,color:#2d1648',
    '  classDef reversal fill:#fffbe6,stroke:#d48806,color:#3d2b00',
    '  classDef overview_runtime_current fill:#fff7e6,stroke:#fa8c16,stroke-width:4px,color:#452500'
  )
  chains.forEach((chain) => {
    const classes = [chain.kind]
    if (chain.key === currentChainKey) classes.push('overview_runtime_current')
    lines.push(`  class ${ids.get(chain.key)} ${classes.join(',')}`)
  })
  return lines.join('\n')
}

function BusinessChainSelector({ catalog, value, onChange }) {
  const searchProps = useDefinitionSelectSearch()
  const options = useMemo(
    () => buildBusinessChainSelectOptions(catalog),
    [catalog]
  )
  const chainOptionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(catalog, 'chains'),
    [catalog]
  )
  const optionFilter = useCallback(
    (keyword, option) => {
      if (option?.value !== ALL_BUSINESS_CHAINS_KEY) {
        return chainOptionFilter(keyword, option)
      }
      const normalized = normalizeDevFlowDefinitionSearchText(keyword)
      if (!normalized) return true
      const overviewText = normalizeDevFlowDefinitionSearchText(
        [
          catalog.businessChainOverview.label,
          catalog.businessChainOverview.summary,
          '全部业务链 总链 总图 设计总图',
        ].join(' ')
      )
      return normalized
        .split(/\s+/u)
        .every((term) => overviewText.includes(term))
    },
    [catalog.businessChainOverview, chainOptionFilter]
  )
  return (
    <div className="erp-dev-flow-chain-selector">
      <label htmlFor="dev-flow-chain-select">切换业务流程</label>
      <Select
        allowClear={false}
        placeholder="切换业务流程"
        id="dev-flow-chain-select"
        aria-label="切换业务流程"
        showSearch
        virtual={false}
        {...searchProps}
        classNames={DEFINITION_SELECT_CLASS_NAMES}
        filterOption={optionFilter}
        notFoundContent="没有匹配的业务链"
        value={value}
        options={options}
        optionRender={renderDefinitionSelectOption}
        onChange={onChange}
      />

    </div>
  )
}

function useBusinessChainRuntime(catalog, taskId, selectedTask) {
  const association = getDevFlowStateTaskRuntimeAssociation(selectedTask)
  const runtime = useRuntimeContext(taskId, association)
  const runtimeProcessKey = cleanText(
    runtime.context?.process_instance?.process_key
  )
  const matchingChain = runtimeProcessKey
    ? catalog.businessChains.find((item) =>
        item.nodes.some((candidate) =>
          candidate.processKeys.includes(runtimeProcessKey)
        )
      )
    : null
  return { runtime, runtimeProcessKey, matchingChain }
}

function BusinessChainOverviewView({
  catalog,
  taskId,
  selectedTask,
  onSelectChain,
  onOpenView,
}) {
  const overview = catalog.businessChainOverview
  const { runtime, matchingChain } = useBusinessChainRuntime(catalog, taskId, selectedTask)
  const mermaid = useMemo(
    () => buildBusinessChainOverviewMermaid(overview, catalog.businessChains, matchingChain?.key),
    [catalog.businessChains, matchingChain?.key, overview]
  )
  return (
    <div className="erp-dev-flow-view-stack" data-business-chain-overview>
      <TaskFulfillmentGuide
        onExploreStage={onSelectChain}
        businessChains={catalog.businessChains}
        renderTopics={({ onSelectTopic, selectedTopicKey }) => <BusinessChainTopics catalog={catalog} mermaid={mermaid} currentChainKey={matchingChain?.key} selectedTopicKey={selectedTopicKey} onSelectChain={onSelectTopic} />}
      />
      {taskId ? (
        <section
          className="erp-dev-flow-chain-runtime"
          data-runtime-overlay={runtime.status}
        >
          <div className="erp-dev-flow-section-heading">
            <div>
              <Text strong>查看一笔任务现在走到哪里</Text>
              <Text type="secondary">
                按任务名称、任务编号或来源单号查询；总图最多只高亮这笔任务所属的一条业务链。
              </Text>
            </div>
            <Button onClick={() => onOpenView('runtime')}>
              查看完整运行路径
            </Button>
          </div>
          {runtime.status === 'loading' ? (
            <div className="erp-dev-flow-loading">
              <Spin />
              <span>正在定位任务所属业务链…</span>
            </div>
        ) : null}
          {runtime.status === 'error' ? (
            <Alert
              showIcon
              type="error"
              message="所属业务链定位失败"
              description={runtime.error}
            />
        ) : null}
          {runtime.status === 'unlinked' ? (
            <Alert
              showIcon
              type="info"
              message="当前任务没有正式流程运行记录"
              description="页面不会根据任务标题或相似名称猜测它属于哪条业务链。"
            />
        ) : null}
          {runtime.status === 'ready' ? (
            <div className="erp-dev-flow-runtime-proof">
              {matchingChain ? (
                <Tag color="orange">当前实例所属链：{matchingChain.label}</Tag>
            ) : (
              <Tag>当前流程未登记到业务总图</Tag>
            )}
              <dl>
                <div>
                  <dt>流程</dt>
                  <dd>{getProcessLabel(runtime.context.process_instance)}</dd>
                </div>
                <div>
                  <dt>来源单号</dt>
                  <dd>{runtime.context.source?.no || '未声明'}</dd>
                </div>
                <div>
                  <dt>查询时间</dt>
                  <dd>{formatQueryTime(runtime.queriedAt)}</dd>
                </div>
              </dl>
              <strong>
                只证明定位到所属链；尚未证明上下游完成或业务事实已落账
              </strong>
              <details className="erp-dev-flow-developer-details">
                <summary>查看查询边界与开发者信息</summary>
                <dl>
                  <div>
                    <dt>数据来源</dt>
                    <dd>
                      <code>workflow.get_task_process_context</code>
                    </dd>
                  </div>
                  <div>
                    <dt>流程实例 ID</dt>
                    <dd>
                      <KeyValue
                        value={String(runtime.context.process_instance.id)}
                      />
                    </dd>
                  </div>
                </dl>
              </details>
            </div>
        ) : null}
        </section>
      ) : null}

    </div>
  )
}

function BusinessChainView({
  catalog,
  chain,
  node,
  taskId,
  selectedTask,
  onSelectChain,
  onSelectNode,
  onOpenView,
}) {
  const [searchParams] = useSearchParams()
  const returningToTopics = searchParams.get(QUERY_KEYS.roleTab) === 'topics'
  const technicalRef = useRef(null)
  const [technicalOpen, setTechnicalOpen] = useState(false)
  const roleSteps = useMemo(
    () => buildDevBusinessChainRoleGuide(catalog, chain.key),
    [catalog, chain.key]
  )
  const { runtime, runtimeProcessKey, matchingChain } = useBusinessChainRuntime(
    catalog,
    taskId,
    selectedTask
  )
  const currentRuntimeNode = chain?.nodes.find((item) =>
    item.processKeys.includes(runtimeProcessKey)
  )
  const relations = chain.edges.filter(
    (edge) => edge.from === node.key || edge.to === node.key
  )
  const outgoingRelations = chain.edges.filter((edge) => edge.from === node.key)
  const mermaid = useMemo(
    () => buildChainMermaid(chain, currentRuntimeNode?.key),
    [chain, currentRuntimeNode?.key]
  )
  const flowByKey = useMemo(
    () => new Map(catalog.flows.map((flow) => [flow.key, flow])),
    [catalog.flows]
  )
  const processByKey = useMemo(
    () =>
      new Map(
        catalog.processDefinitions.map((definition) => [
          definition.key,
          definition,
        ])
      ),
    [catalog.processDefinitions]
  )
  const nodeProjection = useMemo(
    () =>
      buildDevBusinessChainProjection({
        catalog,
        chainKey: chain.key,
        nodeKey: node.key,
      }),
    [catalog, chain.key, node.key]
  )
  const layer = CHAIN_LAYER_PRESENTATION[node.layer]
  const nodePurpose =
    outgoingRelations.map((edge) => edge.label).join('；') ||
    node.summary ||
    '这个步骤负责承接当前业务结果，详细规则以对应业务对象为准。'
  const actionOutcomes = describeDevBusinessChainNode(catalog, chain, node)
  const responsibilityCopy =
    describeDevBusinessChainResponsibility(nodeProjection.responsibility) ||
    '当前正式合同未定义'
  const exceptionCopy = uniqueStrings(
    nodeProjection.scenarios
      .filter((scenario) => scenario.kind !== 'happy_path')
      .map((scenario) => scenario.label)
  ).join('、')

  return (
    <div className="erp-dev-flow-view-stack">

      <section className="erp-dev-flow-chain-heading">
        <div>
          <div className="erp-dev-flow-chain-title">
            <Title level={2}>{chain.label}</Title>
            <Button type="link" onClick={() => onSelectChain(ALL_BUSINESS_CHAINS_KEY)}>
              {returningToTopics ? '返回业务目录' : '返回订单全流程'}
            </Button>
          </div>
          <Paragraph>{chain.summary}</Paragraph>

        </div>
        <div className="erp-dev-flow-chain-heading__actions">
          <BusinessChainSelector
            catalog={catalog}
            value={chain.key}
            onChange={onSelectChain}
          />
        </div>
      </section>

      {taskId ? (
        <section
          className="erp-dev-flow-chain-runtime erp-dev-flow-chain-runtime--compact"
          data-runtime-overlay={runtime.status}
        >
          <div className="erp-dev-flow-section-heading">
            <div>
              <Text strong>当前查询任务</Text>
            </div>
            <Button onClick={() => onOpenView('tracking')}>查看任务与异常</Button>
            {runtime.status === 'ready' ? <Button onClick={() => onOpenView('runtime')}>查看已记录路径</Button> : null}
          </div>
          {runtime.status === 'loading' ? (
            <div className="erp-dev-flow-loading">
              <Spin />
              <span>正在读取真实流程位置…</span>
            </div>
        ) : null}
          {runtime.status === 'error' ? (
            <Alert
              showIcon
              type="error"
              message="运行叠加查询失败"
              description={runtime.error}
            />
        ) : null}
          {runtime.status === 'unlinked' ? (
            <Alert
              showIcon
              type="info"
              message="当前任务没有正式流程运行记录"
            />
        ) : null}
          {runtime.status === 'ready' ? (
            <div className="erp-dev-flow-runtime-proof">
              {currentRuntimeNode ? (
                <Tag color="orange">当前实例位于：{currentRuntimeNode.label}</Tag>
            ) : matchingChain ? (
              <Button
                size="small"
                onClick={() => onSelectChain(matchingChain.key)}
              >
                切换到所属业务链：{matchingChain.label}
              </Button>
            ) : (
              <Tag>当前流程未登记到业务链</Tag>
            )}
              <dl>
                <div>
                  <dt>流程</dt>
                  <dd>{getProcessLabel(runtime.context.process_instance)}</dd>
                </div>
                <div>
                  <dt>来源单号</dt>
                  <dd>{runtime.context.source?.no || '未声明'}</dd>
                </div>
                <div>
                  <dt>查询时间</dt>
                  <dd>{formatQueryTime(runtime.queriedAt)}</dd>
                </div>
              </dl>
              <strong>尚未证明业务事实已落账</strong>
              <details className="erp-dev-flow-developer-details">
                <summary>查看查询边界与开发者信息</summary>
                <dl>
                  <div>
                    <dt>数据来源</dt>
                    <dd>
                      <code>workflow.get_task_process_context</code>
                    </dd>
                  </div>
                  <div>
                    <dt>流程实例 ID</dt>
                    <dd>
                      <KeyValue
                        value={String(runtime.context.process_instance.id)}
                      />
                    </dd>
                  </div>
                </dl>
              </details>
            </div>
        ) : null}
        </section>
      ) : null}

      <TaskFulfillmentGuide
        scoped
        steps={roleSteps}
        onExploreNode={(key) => {
          onSelectNode(key)
          setTechnicalOpen(true)
          requestAnimationFrame(() => technicalRef.current?.scrollIntoView({ block: 'start' }))
        }}
      />

      <details
        className="erp-dev-flow-developer-details"
        data-business-chain-technical
        ref={technicalRef}
        open={technicalOpen}
        onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
      >
        <summary>单据、状态与系统衔接</summary>
        <section className="erp-dev-flow-chain-workspace">
          <div className="erp-dev-flow-chain-map">
            <div className="erp-dev-flow-section-heading">
              <div>
                <Text strong>业务对象与关联</Text>
                <Text type="secondary">
                  点击业务对象查看正式动作和状态规则；下图展示关联关系。
                </Text>
              </div>
              <Space wrap className="erp-dev-flow-chain-legend">
                {Object.entries(CHAIN_LAYER_PRESENTATION).map(([key, item]) => (
                  <Tag color={item.color} key={key}>
                    {item.label}
                  </Tag>
              ))}
              </Space>
            </div>
            <ol className="erp-dev-flow-chain-steps" aria-label="业务链分层步骤">
              {chain.nodes.map((item, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={item.key === node.key ? 'is-selected' : ''}
                    aria-current={item.key === node.key ? 'step' : undefined}
                    data-chain-node={item.key}
                    data-chain-layer={item.layer}
                    data-runtime-current={
                    item.key === currentRuntimeNode?.key || undefined
                  }
                    onClick={() => onSelectNode(item.key)}
                  >
                    <span>{index + 1}</span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{CHAIN_LAYER_PRESENTATION[item.layer].label}</small>
                    </span>
                    {item.key === currentRuntimeNode?.key ? (
                      <Tag color="orange">实例所在</Tag>
                  ) : null}
                  </button>
                </li>
            ))}
            </ol>
            <div className="erp-dev-flow-chain-graph erp-dev-docs-markdown">
              <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
            </div>
          </div>
          <aside
            className="erp-dev-flow-node-detail"
            data-selected-chain-node={node.key}
          >
            <div className="erp-dev-flow-node-detail__title">
              <Tag color={layer.color}>{layer.label}</Tag>
              {node.key === currentRuntimeNode?.key ? (
                <Tag color="orange">真实实例所在区段</Tag>
            ) : null}
              <Title level={2}>{node.label}</Title>
            </div>
            <div className="erp-dev-flow-node-answers">
              <section>
                <h3>这一步做什么</h3>
                <p>{nodePurpose}</p>
              </section>
              <section>
                <h3>谁来处理</h3>
                <p>{responsibilityCopy}</p>
              </section>
              <section>
                <h3>怎样算完成</h3>
                <p>按所选动作分别核对；拒绝与冲正是独立分支。</p>
                <ul>
                  {actionOutcomes.map((outcome) => (
                    <li key={outcome.key}>
                      <strong>{outcome.label}</strong>
                      {outcome.condition ? `（${outcome.condition}）` : ''}：
                      {outcome.preconditions.length
                      ? `前提：${outcome.preconditions.join('；')}；结果：`
                      : ''}
                      {outcome.results.join('；') ||
                      '核对对应领域结果，本动作不直接改变业务状态。'}
                    </li>
                ))}
                </ul>
              </section>
              <section>
                <h3>异常时怎么办</h3>
                <p>
                  {exceptionCopy
                  ? `只执行已登记的${exceptionCopy}场景；未登记组合不生成数据。`
                  : layer.exception}
                </p>
              </section>
            </div>
            <div className="erp-dev-flow-node-actions">
              {node.layer === 'workflow_task' ? (
                <Button type="primary" onClick={() => onOpenView('workflow')}>
                  查看责任与任务
                </Button>
            ) : null}
              {node.processDefinitionKeys.map((key) => (
                <Button
                  type="primary"
                  key={key}
                  onClick={() =>
                  onOpenView('runtime', { [QUERY_KEYS.process]: key })
                }
                >
                  查看 {processByKey.get(key)?.label || key}
                </Button>
            ))}
              {node.factKeys.map((key) => (
                <Button
                  type="primary"
                  key={key}
                  onClick={() => onOpenView('facts', { [QUERY_KEYS.fact]: key })}
                >
                  查看{' '}
                  {catalog.factDefinitions.find((fact) => fact.factKey === key)
                  ?.label || key}
                </Button>
            ))}
              {node.machineKeys.map((key) => (
                <Button
                  key={key}
                  onClick={() =>
                  onOpenView('states', {
                    [QUERY_KEYS.flow]: key,
                    [QUERY_KEYS.state]: null,
                  })
                }
                >
                  查看 {flowByKey.get(key)?.label || key}状态规则
                </Button>
            ))}
            </div>
            <section className="erp-dev-flow-node-relations">
              <h3>这一步与哪些步骤相连</h3>
              {relations.length > 0 ? (
                <ul>
                  {relations.map((edge) => {
                  const peerKey = edge.from === node.key ? edge.to : edge.from
                  const peer = chain.nodes.find((item) => item.key === peerKey)
                  return (
                    <li key={edge.key}>
                      <Tag>{CHAIN_EDGE_PRESENTATION[edge.kind]}</Tag>
                      <strong>{edge.label}</strong>
                      <span>
                        {edge.from === node.key ? '流向' : '来自'}：
                        {peer?.label || peerKey}
                      </span>
                      <details>
                        <summary>查看为什么不能直接算业务完成</summary>
                        <p>{edge.factBoundary}</p>
                        <EvidenceDisclosure value={edge} label="查看关系证据" />
                      </details>
                    </li>
                  )
                })}
                </ul>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前节点没有直接关系"
              />
            )}
            </section>
            <details className="erp-dev-flow-node-technical">
              <summary>查看开发者信息</summary>
              <dl>
                <div>
                  <dt>内部分类</dt>
                  <dd>{layer.technicalLabel}</dd>
                </div>
                <div>
                  <dt>稳定 key</dt>
                  <dd>
                    <KeyValue value={node.key} />
                  </dd>
                </div>
              </dl>
              <EvidenceDisclosure value={node} label="查看完整节点证据" />
            </details>
          </aside>
        </section>
        <details className="erp-dev-flow-cross-cutting">
          <summary>
            查看其他公共规则与特殊情况（
            {catalog.businessChainCoverage.excludedMachineKeys.length}）
          </summary>
          <dl>
            {catalog.businessChainCoverage.excludedMachineKeys.map((key) => (
              <div key={key}>
                <dt>
                  <KeyValue value={key} />
                </dt>
                <dd>{catalog.businessChainCoverage.exclusionReasons[key]}</dd>
              </div>
          ))}
          </dl>
        </details>
      </details>
    </div>
  )
}

export { useRuntimeContext, BusinessChainOverviewView, BusinessChainView }
