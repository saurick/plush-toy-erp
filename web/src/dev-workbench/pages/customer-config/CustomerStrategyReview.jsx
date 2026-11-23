import { useMemo, useState } from 'react'
import { Button, Tag, Typography } from 'antd'
import AppModal from '@/common/components/modal/AppModal'
import { MermaidDiagram } from '@/common/components/diagram/MermaidDiagram.jsx'
import { buildBusinessFlowMermaid } from '@/common/components/diagram/mermaidGraph.mjs'
import { customerPackageTraceForItem } from '../../../../../config/schemas/customerPackageFieldTrace.mjs'
import { buildRuntimeProcessSelection } from '../../config/devFlowStateCatalog.mjs'
import { WorkbenchNotice, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
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

export default function CustomerStrategyReview({ summary, onOpenReference, disabled = false }) {
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
  const current = choices.find((choice) => choice.value === selectedKey)
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
      tools={onOpenReference ? (
        <Button disabled={disabled} onClick={onOpenReference}>其他草案与通用审批规则</Button>
      ) : null}
    >
      <WorkbenchSection flat headingLevel={3} title="发布候选流程" description="发布候选 · 未核验目标">
        {flows.length ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="发布候选流程">
              <thead><tr><th scope="col">流程</th><th scope="col">选择的变体</th><th scope="col">操作</th></tr></thead>
              <tbody>
                {flows.map((choice) => (
                  <tr key={choice.value}>
                    <th scope="row">
                      {choice.label}
                      <div className="erp-dev-customer-field-ref">流程 <code>{choice.selection.processKey}</code></div>
                    </th>
                    <td>
                      <code>{choice.selection.variantKey}</code>
                      <div className="erp-dev-customer-field-ref">版本 <code>{choice.selection.processVersion}</code> · 业务来源 <code>{choice.selection.businessRefType}</code></div>
                      {!choice.selection.canonicalProcessDefinition ? <Text type="danger">此流程选择未匹配登记定义</Text> : null}
                    </td>
                    <td>
                      <Button size="small" disabled={disabled} onClick={() => select(choice.value)}>
                        查看{choice.label}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Text type="secondary">暂无发布候选流程</Text>}
      </WorkbenchSection>
      <WorkbenchSection flat headingLevel={3} title="策略草案" description="仅供评审">
        {policies.length ? (
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="流程策略草案">
              <thead><tr><th scope="col">策略</th><th scope="col">状态与用途</th><th scope="col">操作</th></tr></thead>
              <tbody>
                {policies.map((choice) => (
                  <tr key={choice.value}>
                    <th scope="row">
                      {choice.label}
                      <div className="erp-dev-customer-field-ref">策略标识 <code>{choice.policy.key}</code></div>
                    </th>
                    <td>
                      <div className="erp-dev-customer-field-ref">状态 <code>{choice.policy.status}</code></div>
                      {choice.policy.guardrail}
                    </td>
                    <td>
                      <Button size="small" disabled={disabled} onClick={() => select(choice.value)}>
                        查看{choice.label}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Text type="secondary">暂无流程策略草案</Text>}
      </WorkbenchSection>
      <AppModal
        title={current?.label}
        open={Boolean(current)}
        width={1080}
        rootClassName="erp-dev-tool-page erp-dev-customer-dialog"
        onCancel={() => select('')}
        footer={null}
        destroyOnHidden
      >
        {current ? (
          <div aria-label="当前流程或策略">
            <Tag>{scopeLabel}</Tag>
            {current.policy ? (
              <PolicyDeclarationDiagram key={current.value} policy={current.policy} />
            ) : current.selection.canonicalProcessDefinition ? (
              <>
                <Text type="secondary">图为产品登记的流程定义。目标环境的审批条件、负责人和在途实例需另行核对。</Text>
                <ProcessDefinitionCard key={current.value} definition={current.selection.canonicalProcessDefinition} />
              </>
            ) : <WorkbenchNotice tone="warning" title="此流程选择未匹配登记定义" description="请在工作区配置中核对流程、变体、版本和业务来源。" />}
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
          </div>
        ) : null}
      </AppModal>
    </WorkbenchSection>
  )
}
