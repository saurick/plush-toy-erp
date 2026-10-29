import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { Button, Empty } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import { useLocation, useSearchParams } from 'react-router-dom'
import { normalizeFulfillmentRole } from '@/erp/utils/workflowFulfillment.mjs'
import { buildDevBusinessChainTopics } from '../../config/devBusinessChainProjection.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys, readDevFlowRelationFilters } from '../../pages/devFlowStateQuery.mjs'
import { buildChainActionRelations, relationMatches, relationFiltersActive } from '../../config/devFulfillmentRelations.mjs'
import AppSelect from '@/common/components/select/AppSelect'

import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import BusinessTopicDetails, { BusinessTopicVerification } from './BusinessTopicDetails.jsx'
import BusinessChainStepVerification from './BusinessChainStepVerification.jsx'
import FinanceRelationshipsView from './FinanceRelationshipsView.jsx'
import { FINANCE_RELATIONS_TOPIC_KEY } from '../../config/devFinanceWorkbench.mjs'
import './businessChainTopics.css'

export default function BusinessChainTopics({
  catalog,
  currentChainKey,
  onSelectChain,
  selectedTopicKey,
  filterControls,
  onExploreChain,
  onOpenView,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const mapKey = searchParams.get(queryKeys.roleMap)
  const mapOpen = Boolean(mapKey)
  const financeSelected = selectedTopicKey === FINANCE_RELATIONS_TOPIC_KEY && !mapOpen
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
  const filters = readDevFlowRelationFilters(searchParams)
  const filtered = relationFiltersActive(filters)
  const lanes = buildDevBusinessChainTopics(catalog).map((lane) => ({ ...lane,
    topics: lane.topics.filter(({ chain }) => !filtered || buildChainActionRelations(catalog, chain).some((action) => relationMatches(action, filters))),
  })).filter((lane) => lane.topics.length)
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
    if (selectedTopicKey && selectedTopicKey !== FINANCE_RELATIONS_TOPIC_KEY && selectedTopicKey !== topic?.key) {
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
  const matchingActions = topic ? buildChainActionRelations(catalog, topic).filter((action) => relationMatches(action, filters)) : []
  const matchingNodes = filtered && !mapOpen ? new Set(matchingActions.flatMap((action) => action.nodeKeys)) : null
  const node =
    graph?.nodes.find((item) => item.key === picked && (!matchingNodes || matchingNodes.has(item.key))) ||
    (matchingNodes ? graph?.nodes.find((item) => matchingNodes.has(item.key)) : null) ||
    graph?.nodes.find(
      (item) => item.key === (mapOpen ? focus.key : topic?.entryNodeKeys?.[0])
    ) ||
    graph?.nodes[0]
  const closeMap = () => {
    restoreMapFocus.current = true
    updateReading({ [queryKeys.roleMap]: null, [queryKeys.roleMapNode]: null })
  }
  const selectedStep = !mapOpen && topic?.steps.find((step) =>
    step.key === searchParams.get(queryKeys.roleTopicStep) &&
    step.verificationRuleIds.length > 0 &&
    (step.fromNodeKey === node?.key || step.toNodeKey === node?.key)
  )
  const selectNode = (key) => updateReading(
    mapOpen
      ? { [queryKeys.roleMapNode]: key }
      : {
          [queryKeys.roleTopic]: topic.key,
          [queryKeys.roleTopicNode]: key,
          [queryKeys.roleTopicStep]: null,
        }
  )
  return (
    <div className="erp-dev-chain-topics" data-business-chain-topics>
      <h3 className="erp-dev-chain-topics__print-title">
        {mapOpen ? '系统衔接图' : financeSelected ? '财务关联概览' : topic?.label}
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
          value={mapOpen ? focus.key : financeSelected ? FINANCE_RELATIONS_TOPIC_KEY : topic?.key}
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
              : [{ label: '跨模块关联', options: [{ value: FINANCE_RELATIONS_TOPIC_KEY, label: '财务关联概览' }] }, ...lanes.map((lane) => ({
                  label: lane.label,
                  options: lane.topics.map(({ chain }) => ({
                    value: chain.key,
                    label: chain.label,
                  })),
                }))]
          }
        />
        {filterControls}
        {!mapOpen && !financeSelected ? (
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
      {financeSelected ? <FinanceRelationshipsView catalog={catalog} onOpenView={onOpenView} role={role} filters={filters} /> : graph ? (
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
              matchingKeys={matchingNodes}
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
                {node.key !== topic?.key ? (
                  <Button
                    type="link"
                    onClick={() => {
                      onSelectChain(node.key)
                    }}
                  >
                    查看此专题
                  </Button>
                ) : null}
              </div>
            ) : (
              <BusinessTopicDetails
                topic={topic}
                node={node}
                onSelect={selectNode}
                onExploreChain={onExploreChain}
                selectedStepKey={selectedStep?.key}
                visibleStepKeys={filtered ? new Set(matchingActions.map((action) => action.step.key)) : null}
                onInspectStep={(key) => updateReading({ [queryKeys.roleTopicStep]: key })}
                stepDetails={selectedStep ? <BusinessChainStepVerification
                  key={selectedStep.key}
                  catalog={catalog}
                  topic={topic}
                  step={selectedStep}
                /> : null}
              />
            )}
          </div>
          {!mapOpen ? <BusinessTopicVerification topic={topic} /> : null}

        </section>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            available.length ? '请选择业务专题' : filtered ? '没有同时满足条件的专题，移除筛选可恢复查看' : '该岗位暂无关联专题'
          }
        />
      )}
    </div>
  )
}
