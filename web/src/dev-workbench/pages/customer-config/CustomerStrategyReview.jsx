import { useMemo, useState } from 'react'
import { Button, Tag, Typography } from 'antd'
import Select from '@/common/components/select/AppSelect'
import { MermaidDiagram } from '@/common/components/markdown'
import { buildBusinessFlowMermaid } from '@/common/components/markdown/mermaidGraph.mjs'
import { customerPackageTraceForItem } from '../../../../../config/schemas/customerPackageFieldTrace.mjs'
import { buildRuntimeProcessSelection } from '../../config/devFlowStateCatalog.mjs'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { WorkbenchNotice, WorkbenchSection, WorkbenchToolbar } from '../../components/WorkbenchPattern.jsx'
import { ProcessDefinitionCard } from '../../components/flow-state/RuntimeView.jsx'
import { CustomerConfigTrace } from './CustomerConfigTrace.jsx'

const { Text } = Typography

function PolicyDeclarationDiagram({ policy }) {
  const [selectedNode, setSelectedNode] = useState(undefined)
  const graph = useMemo(() => buildBusinessFlowMermaid({
    direction: 'LR',
    nodes: policy.ruleItems.flatMap((item) => [
      { key: `${item.key}-trigger`, label: item.triggerLabel, summary: item.note || policy.guardrail },
      { key: `${item.key}-result`, label: item.resultLabel, summary: policy.guardrail },
    ]),
    edges: policy.ruleItems.map((item) => ({ from: `${item.key}-trigger`, to: `${item.key}-result` })),
  }), [policy])
  return (
    <>
      {policy.ruleItems.length > 0 ? (
        <MermaidDiagram
          chart={graph.chart}
          label={`${policy.label}草案图`}
          interactiveNodes={graph.nodes}
          selectedNodeId={selectedNode}
          onNodeSelect={setSelectedNode}
          showSourceOnError={false}
        />
      ) : <Text>这个草案没有声明条件或结果。</Text>}
      <Text type="secondary">{policy.guardrail}</Text>
    </>
  )
}

export default function CustomerStrategyReview({ summary }) {
  const [selectedKey, select] = useState('')
  const { flows, policies } = useMemo(() => {
    const flows = summary.runtimeProcessSelections.map((item, index) => {
      const selection = buildRuntimeProcessSelection(item, summary.customerKey, summary.sourcePath)
      return {
        value: `flow:${selection.key}:${index}`,
        label: selection.canonicalProcessDefinition?.label || `未匹配流程选择 ${index + 1}`,
        selection,
        index,
      }
    })
    const policies = summary.processPolicies.map((policy, index) => ({
      value: `policy:${policy.key}`,
      label: policy.label,
      policy,
      index,
    }))
    return { flows, policies }
  }, [summary])
  const choices = [...policies, ...flows]
  const current = choices.find((choice) => choice.value === selectedKey) || choices[0]
  const scopeLabel = current?.policy
    ? current.policy.status === 'preview_only' ? '仅预览 · 不执行' : '草案状态待核对'
    : '发布候选 · 未核验目标'
  const traceKey = current?.policy ? 'processPolicies' : 'runtimeProcessSelections'

  return (
    <WorkbenchSection
      flat
      className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      title="本包的流程与策略"
      description={`${summary.runtimeProcessSelections.length} 项流程选择 · ${summary.processPolicies.length} 条策略草案`}
    >
      <WorkbenchToolbar role="group" aria-label="流程策略草案">
        <Text strong>策略草案</Text>
        {policies.length ? policies.map((choice) => (
          <Button
            key={choice.value}
            size="small"
            type={current.value === choice.value ? 'primary' : 'default'}
            aria-pressed={current.value === choice.value}
            onClick={() => select(choice.value)}
          >
            {choice.label}
          </Button>
        )) : <Text type="secondary">暂无流程策略草案</Text>}
      </WorkbenchToolbar>
      <WorkbenchToolbar role="group" aria-label="发布候选流程">
        <Text strong>发布候选流程</Text>
        {flows.length ? (
          <Select
            className="erp-dev-customer-strategy-select"
            aria-label="查看发布候选流程"
            allowClear={false /* 不可清空：图解需对应一个客户包中的流程或策略。 */}
            virtual={false}
            placeholder="选择流程查看定义"
            value={current.selection ? current.value : null}
            options={flows}
            onChange={select}
          />
        ) : <Text type="secondary">暂无发布候选流程</Text>}
      </WorkbenchToolbar>
      {current ? (
        <WorkbenchSection
          flat
          headingLevel={3}
          aria-label="当前流程或策略"
          title={current.label}
          description={(
            <>
              <Tag>{scopeLabel}</Tag>
              {current.policy ? <Text type="secondary">{current.policy.ruleCountLabel}</Text> : null}
            </>
          )}
        >
          {current.policy ? (
            <PolicyDeclarationDiagram key={current.value} policy={current.policy} />
          ) : current.selection.canonicalProcessDefinition ? (
            <>
              <Text type="secondary">图为所选产品流程定义。目标环境的审批条件、负责人和在途实例需另行核对。</Text>
              <ProcessDefinitionCard key={current.value} definition={current.selection.canonicalProcessDefinition} />
            </>
          ) : (
            <WorkbenchNotice tone="warning" title="此流程选择未匹配登记定义" description="请在工作区配置中核对流程、变体、版本和业务来源。" />
          )}
          <DevStaticGuidance key={`trace:${current.value}`} title="当前条目的来源与清单">
            <CustomerConfigTrace
              sourcePath={summary.sourcePath}
              fieldPath={`${traceKey}[${current.index}]`}
              trace={customerPackageTraceForItem(traceKey, current.index)}
              declaration={current.policy ? {
                key: current.policy.key,
                status: current.policy.status,
                rules: current.policy.ruleItems.map((item) => item.declaration),
              } : current.selection.definition}
            />
          </DevStaticGuidance>
        </WorkbenchSection>
      ) : null}
    </WorkbenchSection>
  )
}
