import React, { useEffect, useMemo, useState } from 'react'
import { Button } from 'antd'
import AppSelect from '@/common/components/select/AppSelect.jsx'
import SlidingTabList from '@/common/components/navigation/SlidingTabList.jsx'
import { WorkbenchFacts } from '../WorkbenchPattern.jsx'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import {
  businessChainApprovalReading,
  describeBusinessChainReading,
  businessChainRelationLayer,
  CHAIN_READING_LAYERS,
} from '../../config/devBusinessChainReading.mjs'

export function ChainPurposeDetails({ catalog, chainKey, onRelation }) {
  const { chain, inputs, outputs, handoffs } = describeBusinessChainReading(catalog, chainKey)
  return (
    <div className="erp-chain-reading-details">
      <strong>用途与交接</strong>
      <p>{chain.summary}</p>
      <WorkbenchFacts items={[
        { label: '从什么开始', value: inputs.map((node) => node.label).join('、') },
        { label: '交出什么结果', value: outputs.map((node) => node.label).join('、') },
      ]}
      />
      {handoffs.length ? (
        <section aria-label="交给哪些链路">
          <strong>交给哪些链路</strong>
          {handoffs.map((relation) => (
            <div className="erp-chain-design__state-transition" key={relation.key}>
              <Button onClick={() => onRelation(relation)}>
                {catalog.businessChains.find((item) => item.key === relation.toChainKey).label}
              </Button>
              <p>{relation.label}</p>
            </div>
          ))}
        </section>
      ) : <p>当前目录未登记后续跨链接点；不表示可以任意连接。</p>}
      <details>
        <summary>流程地图与实际进度有什么区别？</summary>
        <p>地图说明规则、分支与交接；某笔业务可能按行、按批并行推进，实际经过以任务、单据和事实记录为准。</p>
        <p>责任、放行条件和事实结果是规则边界；展开节点不改变业务规则。链路放在同一张图上，不单独证明业务覆盖完整。</p>
      </details>
    </div>
  )
}

export function ChainHandoffDetails({ catalog, relation, onNavigate }) {
  const source = catalog.businessChains.find((chain) => chain.key === relation.fromChainKey)
  const target = describeBusinessChainReading(catalog, relation.toChainKey)
  const layer = CHAIN_READING_LAYERS.find((item) => item.value === businessChainRelationLayer(relation))
  return (
    <div className="erp-chain-reading-details">
      <strong>{source.label} → {target.chain.label}</strong>
      <WorkbenchFacts items={[
        { label: '关系类型', value: layer.label },
        { label: '交接与条件', value: relation.label },
        { label: '目标入口', value: target.inputs.map((node) => node.label).join('、') },
      ]}
      />
      <p>{target.chain.summary}</p>
      <p className="erp-chain-design__muted">当前接点登记到链路，未登记精确步骤；进入后不自动选中某一步。</p>
      <Button type="primary" onClick={() => onNavigate(relation.toChainKey)}>进入目标链</Button>
    </div>
  )
}

export function ChainApprovalDetails({ library, choices, onHighlight }) {
  const [choiceKey, setChoiceKey] = useState(choices[0].key)
  const choice = choices.find((item) => item.key === choiceKey) || choices[0]
  const [outcomeKey, setOutcomeKey] = useState(choice.outcomes[0]?.key)
  const reading = useMemo(() => businessChainApprovalReading(library, choice, outcomeKey), [library, choice, outcomeKey])
  useEffect(() => {
    onHighlight(reading.nodeIds)
    return () => onHighlight(null)
  }, [onHighlight, reading])
  return (
    <div className="erp-chain-reading-details">
      {choices.length > 1 ? (
        <AppSelect
          aria-label="查看哪项审批"
          value={choice.key}
          allowClear={false /* 不可清空：路径预览必须选定一项已登记审批。 */}
          options={choices.map((item) => ({ value: item.key, label: item.approval.label }))}
          onChange={(key) => { setChoiceKey(key); setOutcomeKey(null) }}
        />
      ) : <strong>{choice.approval.label}</strong>}
      <SlidingTabList
        aria-label="审批结果路径"
        value={reading.outcome?.key}
        options={choice.outcomes.map((item) => ({ value: item.key, label: `查看${item.label}路径` }))}
        onChange={setOutcomeKey}
      />
      <BusinessFlowDiagram
        relationships
        flow={reading.graph}
        label={`${choice.approval.label}所选结果路径`}
        selectedKey={reading.outcome?.key}
        legend="只读查看所选审批结果的登记路径；任务结束与后续库存、出货、财务事实分别确认。"
      />
    </div>
  )
}
