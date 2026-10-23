import React, { useMemo, useState } from 'react'
import { Button, Drawer, Empty } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { Markdown, MermaidDiagram } from '@/common/components/markdown'
import { normalizeFulfillmentRole } from '@/erp/utils/workflowFulfillment.mjs'
import {
  buildDevBusinessChainTopics,
  buildChainMermaid,
} from '../../config/devBusinessChainProjection.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import AppSelect from '@/common/components/select/AppSelect'
import { EvidenceDisclosure } from './FlowStateShared.jsx'
import './businessChainTopics.css'

export default function BusinessChainTopics({
  catalog,
  mermaid,
  onSelectChain,
  selectedTopicKey,
  onExploreChain,
}) {
  const [searchParams] = useSearchParams()
  const [mapOpen, setMapOpen] = useState(false)
  const role = normalizeFulfillmentRole(searchParams.get(queryKeys.role))
  const lanes = useMemo(
    () => buildDevBusinessChainTopics(catalog, role),
    [catalog, role]
  )
  const count = lanes.reduce((sum, lane) => sum + lane.topics.length, 0)
  const chainByKey = useMemo(
    () => new Map(catalog.businessChains.map((chain) => [chain.key, chain])),
    [catalog.businessChains]
  )

  const topic = selectedTopicKey === '' ? null :
    lanes
      .flatMap((lane) => lane.topics)
      .find(({ chain }) => chain.key === selectedTopicKey)?.chain ||
    lanes[0]?.topics[0]?.chain
  const [picked, setPicked] = useState(null)
  const node =
    topic?.nodes.find((item) => item.key === picked) || topic?.nodes[0]
  const chart = useMemo(
    () => buildChainMermaid(topic, null, { compact: true }),
    [topic]
  )
  const nodes =
    topic?.nodes.map((item, index) => ({
      id: `N${index}`,
      key: item.key,
      label: item.label,
    })) || []
  return (
    <div className="erp-dev-chain-topics" data-business-chain-topics>
      <h3 className="erp-dev-chain-topics__print-title">{topic?.label}</h3>
      <div className="erp-dev-chain-topics__toolbar">
        <AppSelect
          aria-label="选择业务专题"
          label="业务专题"
          showSearch
          optionFilterProp="label"
          value={topic?.key}
          onChange={(key) => {
            setPicked(null)
            onSelectChain(key)
          }}
          virtual={false}
          options={lanes.map((lane) => ({
            label: lane.label,
            options: lane.topics.map(({ chain }) => ({
              value: chain.key,
              label: chain.label,
            })),
          }))}
        />
        <Button type="link" onClick={() => setMapOpen(true)}>
          系统衔接图
        </Button>
      </div>
      {!topic ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={count === 0 ? '该岗位暂无关联专题' : '请选择业务专题'}
        />
      ) : (
        <section
          className="erp-dev-chain-topics__diagram"
          data-topic-diagram={topic.key}
        >
          <MermaidDiagram
            chart={chart}
            label={`${topic.label}流程图`}
            toolbar="compact"
            initialZoom={1}
            nativeSize
            interactiveNodes={nodes}
            selectedNodeId={nodes.find((item) => item.key === node.key)?.id}
            onNodeSelect={(id) =>
              setPicked(nodes.find((item) => item.id === id)?.key)
            }
            showSourceOnError={false}
          />
          <div className="erp-dev-fulfillment-guide__focus" aria-live="polite">
            <strong>{node.label}</strong>
            <p>
              {node.summary ||
                topic.edges
                  .filter((edge) => edge.from === node.key)
                  .map((edge) => edge.label)
                  .join('；') ||
                '本分支结果'}
            </p>
            {onExploreChain ? (
              <Button
                type="link"
                size="small"
                onClick={() => onExploreChain(topic.key)}
              >
                查看单据状态与规则
              </Button>
            ) : null}
          </div>
        </section>
      )}
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
