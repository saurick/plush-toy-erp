import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { Button, Empty } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import { useLocation, useSearchParams } from 'react-router-dom'
import { normalizeFulfillmentRole } from '@/erp/utils/workflowFulfillment.mjs'
import { buildDevBusinessChainTopics } from '../../config/devBusinessChainProjection.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import AppSelect from '@/common/components/select/AppSelect'
import { EvidenceDisclosure } from './FlowStateShared.jsx'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import BusinessTopicDetails, { BusinessTopicVerification } from './BusinessTopicDetails.jsx'
import './businessChainTopics.css'

export default function BusinessChainTopics({
  catalog,
  currentChainKey,
  onSelectChain,
  selectedTopicKey,
  onExploreChain,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const mapKey = searchParams.get(queryKeys.roleMap)
  const mapOpen = Boolean(mapKey)
  const picked = searchParams.get(
    mapOpen ? queryKeys.roleMapNode : queryKeys.roleTopicNode
  )
  const updateReading = useCallback(
    (patch) =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { state: location.state }
      ),
    [setSearchParams, location.state]
  )
  const mapOpener = useRef(null)
  const restoreMapFocus = useRef(false)
  const role = normalizeFulfillmentRole(searchParams.get(queryKeys.role))
  const lanes = useMemo(
    () => buildDevBusinessChainTopics(catalog, role),
    [catalog, role]
  )
  const chainByKey = useMemo(
    () => new Map(catalog.businessChains.map((chain) => [chain.key, chain])),
    [catalog.businessChains]
  )
  const available = lanes.flatMap((lane) => lane.topics)
  const topic =
    selectedTopicKey === ''
      ? null
      : available.find(({ chain }) => chain.key === selectedTopicKey)?.chain ||
        available[0]?.chain
  const focus = chainByKey.get(mapKey) || topic || catalog.businessChains[0]
  useEffect(() => {
    if (selectedTopicKey && selectedTopicKey !== topic?.key) {
      updateReading({
        [queryKeys.roleTopic]: topic?.key || '',
        [queryKeys.roleTopicNode]: null,
      })
    }
  }, [selectedTopicKey, topic?.key, updateReading])
  useEffect(() => {
    if (!mapOpen && restoreMapFocus.current) {
      restoreMapFocus.current = false
      mapOpener.current?.focus({ preventScroll: true })
    }
  }, [mapOpen])
  const map = useMemo(() => {
    const edges = catalog.businessChainOverview.relations
      .filter(
        (edge) =>
          edge.fromChainKey === focus.key || edge.toChainKey === focus.key
      )
      .map((edge) => ({
        ...edge,
        from: edge.fromChainKey,
        to: edge.toChainKey,
      }))
    const keys = new Set([
      focus.key,
      ...edges.flatMap((edge) => [edge.from, edge.to]),
    ])
    return {
      entryNodeKeys: [focus.key],
      nodes: catalog.businessChains
        .filter((chain) => keys.has(chain.key))
        .map((chain) => ({
          key: chain.key,
          label: chain.label,
          summary: chain.summary,
          layer: 'topic',
        })),
      edges,
    }
  }, [catalog, focus.key])
  const topicDiagram = useMemo(() => topic && ({
    ...topic,
    nodes: topic.nodes.map((node) => ({
      ...node,
      role_keys: [...new Set(topic.steps
        .filter((step) => step.fromNodeKey === node.key || step.toNodeKey === node.key)
        .flatMap((step) => step.responsibility.ownerPoolKeys))],
    })),
  }), [topic])
  const graph = mapOpen ? map : topicDiagram
  const node =
    graph?.nodes.find((item) => item.key === picked) ||
    graph?.nodes.find(
      (item) => item.key === (mapOpen ? focus.key : topic?.entryNodeKeys?.[0])
    ) ||
    graph?.nodes[0]
  const closeMap = () => {
    restoreMapFocus.current = true
    updateReading({ [queryKeys.roleMap]: null, [queryKeys.roleMapNode]: null })
  }
  const selectNode = (key) => updateReading(
    mapOpen
      ? { [queryKeys.roleMapNode]: key }
      : {
          [queryKeys.roleTopic]: topic.key,
          [queryKeys.roleTopicNode]: key,
        }
  )
  return (
    <div className="erp-dev-chain-topics" data-business-chain-topics>
      <h3 className="erp-dev-chain-topics__print-title">
        {mapOpen ? '系统衔接图' : topic?.label}
      </h3>
      {mapOpen ? (
        <div className="erp-dev-fulfillment-guide__detail-title">
          <Button icon={<LeftOutlined aria-hidden />} onClick={closeMap}>
            返回{topic ? ` ${topic.label}` : '业务专题'}
          </Button>
          <h3>系统衔接图</h3>
        </div>
      ) : null}
      <div className="erp-dev-chain-topics__toolbar">
        <AppSelect
          aria-label={mapOpen ? '关注专题' : '选择业务专题'}
          label={mapOpen ? '关注专题' : '业务专题'}
          showSearch
          optionFilterProp="label"
          virtual={false}
          allowClear={!mapOpen}
          value={mapOpen ? focus.key : topic?.key}
          onChange={(key) => {
            if (mapOpen) {
              updateReading({
                [queryKeys.roleMap]: key,
                [queryKeys.roleMapNode]: null,
              })
            } else onSelectChain(key)
          }}
          options={
            mapOpen
              ? catalog.businessChains.map((chain) => ({
                  value: chain.key,
                  label: chain.label,
                }))
              : lanes.map((lane) => ({
                  label: lane.label,
                  options: lane.topics.map(({ chain }) => ({
                    value: chain.key,
                    label: chain.label,
                  })),
                }))
          }
        />
        {!mapOpen ? (
          <Button
            ref={mapOpener}
            type="link"
            onClick={() => {
              updateReading({
                [queryKeys.roleMap]:
                  topic?.key || catalog.businessChains[0].key,
                [queryKeys.roleMapNode]: null,
              })
            }}
          >
            系统衔接图
          </Button>
        ) : null}
      </div>
      {graph ? (
        <section
          className="erp-dev-chain-topics__diagram"
          data-topic-diagram={mapOpen ? 'system' : topic.key}
          data-business-chain-system={mapOpen || undefined}
        >
          {mapOpen ? (
            <p className="erp-dev-fulfillment-guide__hint">
              当前专题与直接上下游。
            </p>
          ) : (
            <p className="erp-dev-chain-topics__summary">{topic.summary}</p>
          )}
          <div className="erp-dev-chain-topics__reading">
            <BusinessFlowDiagram
              key={mapOpen ? `system:${focus.key}` : topic.key}
              flow={graph}
              label={mapOpen ? '系统衔接图' : `${topic.label}关系图`}
              selectedKey={node?.key}
              onSelect={selectNode}
              role={role}
              relationships
              runtimeKey={mapOpen ? currentChainKey : undefined}
            />
            {mapOpen ? (
              <div className="erp-dev-fulfillment-guide__focus" aria-live="polite">
                <strong>{node.label}</strong>
                <p>
                  {node.summary ||
                    topic?.edges
                      .filter((edge) => edge.from === node.key)
                      .map((edge) => edge.condition || edge.label)
                      .join('；') ||
                    '本分支结果'}
                </p>
                <Button
                  type="link"
                  onClick={() => {
                    onSelectChain(node.key)
                  }}
                >
                  查看此专题
                </Button>
              </div>
            ) : (
              <BusinessTopicDetails
                topic={topic}
                node={node}
                onSelect={selectNode}
                onExploreChain={onExploreChain}
              />
            )}
          </div>
          {!mapOpen ? <BusinessTopicVerification topic={topic} /> : null}
          <EvidenceDisclosure
            value={mapOpen ? catalog.businessChainOverview : topic}
            label="查看图示来源"
          />
        </section>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            available.length ? '请选择业务专题' : '该岗位暂无关联专题'
          }
        />
      )}
    </div>
  )
}
