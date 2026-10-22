import React, { useMemo, useState } from 'react'
import { Button, Drawer, Empty } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { Markdown } from '@/common/components/markdown'
import { fulfillmentRoleOptions, normalizeFulfillmentRole } from '@/erp/utils/workflowFulfillment.mjs'
import { buildDevBusinessChainTopics } from '../../config/devBusinessChainProjection.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import { EvidenceDisclosure } from './FlowStateShared.jsx'
import './businessChainTopics.css'

function describeRoleDuties(roleName, steps) {
  const labels = [...new Set(steps.filter((step) => step.stages?.length).map((step) => step.label))]
  return labels.length
    ? `${roleName}：${labels.slice(0, 2).join('、')}${steps.length > 2 ? `等 ${steps.length} 个环节` : ''}`
    : `${roleName}参与 ${steps.length} 个办理环节`
}

export default function BusinessChainTopics({ catalog, mermaid, currentChainKey, onSelectChain, selectedTopicKey }) {
  const [searchParams] = useSearchParams()
  const [mapOpen, setMapOpen] = useState(false)
  const role = normalizeFulfillmentRole(searchParams.get(queryKeys.role))
  const roleName = fulfillmentRoleOptions.find((item) => item.value === role).label
  const lanes = useMemo(() => buildDevBusinessChainTopics(catalog, role), [catalog, role])
  const count = lanes.reduce((sum, lane) => sum + lane.topics.length, 0)
  const chainByKey = useMemo(() => new Map(catalog.businessChains.map((chain) => [chain.key, chain])), [catalog.businessChains])

  return (
    <div className="erp-dev-chain-topics" data-business-chain-topics>
      <div className="erp-dev-chain-topics__toolbar">
        <p role="status">{role === 'all' ? `全部 ${count} 条业务流程` : `${roleName}参与 ${count} 条业务流程`}</p>
        <div className="erp-dev-chain-topics__actions">
          <Button onClick={() => setMapOpen(true)}>系统衔接图</Button>
        </div>
      </div>
      {count === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未登记该岗位的业务职责，可切换全部岗位查看。" /> : null}
      {lanes.map((lane) => (
        <section key={lane.key} className="erp-dev-chain-topics__group" aria-label={lane.label}>
          <h3>{lane.label}</h3>
          <ul>
            {lane.topics.map(({ chain, matchingSteps }) => (
              <li key={chain.key}>
                <button type="button" data-overview-chain={chain.key} aria-pressed={selectedTopicKey === chain.key} aria-label={`查看业务链：${chain.label}`} onClick={() => onSelectChain(chain.key)}>
                  <strong>{chain.label}</strong>
                  {role !== 'all' ? <span>{describeRoleDuties(roleName, matchingSteps)}</span> : null}
                  {chain.key === currentChainKey ? <small>当前任务所属流程</small> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Drawer title="系统衔接图" width={1120} open={mapOpen} onClose={() => setMapOpen(false)} rootClassName="erp-dev-chain-topics-drawer">
        <div className="erp-dev-flow-state-page erp-dev-chain-topics__system" data-business-chain-system>
          <p>查看业务流程之间的关联；具体办理岗位和完成条件从业务目录进入。</p>
          {mapOpen ? <div className="erp-dev-flow-overview-graph erp-dev-docs-markdown"><Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} /></div> : null}
          <details className="erp-dev-flow-overview-relations">
            <summary>逐条查看衔接关系（{catalog.businessChainOverview.relations.length}）</summary>
            <ul>{catalog.businessChainOverview.relations.map((relation) => (
              <li key={relation.key} data-overview-relation={relation.key}>
                <strong>{relation.label}</strong>
                <span>{chainByKey.get(relation.fromChainKey).label} → {chainByKey.get(relation.toChainKey).label}</span>
              </li>
            ))}
            </ul>
          </details>
          <EvidenceDisclosure value={catalog.businessChainOverview} label="查看业务总图证据" />
        </div>
      </Drawer>
    </div>
  )
}
