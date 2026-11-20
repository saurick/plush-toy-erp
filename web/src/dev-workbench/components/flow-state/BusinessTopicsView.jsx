import React from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import BusinessChainTopics from './BusinessChainTopics.jsx'
import { buildDevFlowExplorerLocation } from '../../pages/devFlowExplorerNavigation.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as keys } from '../../pages/devFlowStateQuery.mjs'

export default function BusinessTopicsView({ catalog, currentChainKey, onOpenView }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const selectTopic = (key) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    next.set(keys.roleTopic, key ?? '')
    ;[
      keys.roleTopicNode, keys.roleTopicStep, keys.roleMap, keys.roleMapNode,
      keys.roleTopicPanel, keys.roleTopicBatch,
      keys.relationAction, keys.financeTopic, keys.financeStep,
      keys.financeStage, keys.financeChange, keys.financeRule, keys.financeFact,
    ].forEach((name) => next.delete(name))
    return next
  }, { state: location.state })

  return (
    <section aria-label="专项链路阅读">
      <BusinessChainTopics
        catalog={catalog}
        currentChainKey={currentChainKey}
        selectedTopicKey={searchParams.get(keys.roleTopic)}
        onSelectChain={selectTopic}
        onOpenView={onOpenView}
        onOpenExplorer={(chainKey, nodeKey, opener) => {
          const { pathname, search, hash, state } = location
          navigate({ pathname, search, hash }, {
            replace: true,
            state: {
              ...state,
              flowRestoreFrame: {
                pathname,
                search: search.replace(/^\?/u, ''),
                scroll: window.scrollY,
                focus: (opener.getAttribute('aria-label') || opener.textContent).trim(),
                taskScoped: false,
              },
            },
          })
          navigate(buildDevFlowExplorerLocation(chainKey, nodeKey))
        }}
        onExploreChain={(key, nodeKey) => onOpenView('states', {
          [keys.chain]: key,
          [keys.node]: nodeKey || null,
        })}
      />
    </section>
  )
}
