import React from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import BusinessChainTopics from './BusinessChainTopics.jsx'
import BusinessRelationFilters from './BusinessRelationFilters.jsx'
import {
  DEV_FLOW_STATE_QUERY_KEYS as keys,
  readDevFlowRelationFilters,
  patchDevFlowRelationFilters,
} from '../../pages/devFlowStateQuery.mjs'

export default function BusinessTopicsView({ catalog, actions, currentChainKey, onOpenView }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const selectTopic = (key) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    next.set(keys.roleTopic, key ?? '')
    ;[
      keys.roleTopicNode, keys.roleTopicStep, keys.roleMap, keys.roleMapNode,
      keys.relationAction, keys.financeTopic, keys.financeStep,
      keys.financeStage, keys.financeChange, keys.financeRule, keys.financeFact,
    ].forEach((name) => next.delete(name))
    return next
  }, { state: location.state })

  return (
    <section className="erp-dev-fulfillment-guide" aria-label="业务专题阅读">
      <BusinessChainTopics
        catalog={catalog}
        currentChainKey={currentChainKey}
        selectedTopicKey={searchParams.get(keys.roleTopic)}
        onSelectChain={selectTopic}
        filterControls={<BusinessRelationFilters
          catalog={catalog}
          actions={actions}
          filters={readDevFlowRelationFilters(searchParams)}
          onChange={(patch) => setSearchParams((previous) => patchDevFlowRelationFilters(previous, patch), { state: location.state })}
        />}
        onOpenView={onOpenView}
        onExploreChain={(key, nodeKey) => onOpenView('states', {
          [keys.chain]: key,
          [keys.node]: nodeKey || null,
        })}
      />
      <p className="erp-dev-fulfillment-guide__boundary">
        流程示意，非实际进度；任务完成不代替正式业务结果。
      </p>
    </section>
  )
}
