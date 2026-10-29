import { WorkflowTaskDiscoveryCatalog as tasks } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { isWorkflowBusinessChainException } from '../../erp/utils/workflowBusinessChain.mjs'
import { buildDevBusinessChainTopics } from '../config/devBusinessChainProjection.mjs'
import { normalizeFulfillmentRole } from '../../erp/utils/workflowFulfillment.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as keys } from './devFlowStateQuery.mjs'

export const FLOW_READING_CONTEXT_KEYS = [
  keys.financeFact,
  keys.financeRule,
  keys.financeTopic,
  keys.financeStep,
  keys.financeStage,
  keys.financeChange,
  keys.roleStage,
  keys.roleSubstep,
  keys.relationAction,
  keys.roleTab,
  keys.roleTopic,
  keys.roleTopicNode,
  keys.roleMap,
  keys.roleMapNode,
  keys.exception,
  keys.exceptionOrigin,
  keys.exceptionDecision,
  keys.exceptionStep,
]

// Main tabs share the reading position; task status/group and selected rule
// objects belong to their own view. A changed context invalidates old objects.
export function restoreDevFlowPrimaryContext(previous, current, { independentKeys = [] } = {}) {
  const next = new URLSearchParams(previous)
  const shared = [...FLOW_READING_CONTEXT_KEYS, keys.chain, keys.node, keys.role, keys.relationMachine, keys.relationPermission]
    .filter((key) => !independentKeys.includes(key))
  const contextValue = (params, key) => key === keys.chain ? params.get(key) || 'all' : params.get(key)
  const changed = shared.some((key) => contextValue(next, key) !== contextValue(current, key))
  for (const key of shared) {
    if (current.has(key)) next.set(key, current.get(key))
    else next.delete(key)
  }
  if (changed) [keys.flow, keys.state, keys.ruleAction, keys.process, keys.fact].forEach((key) => next.delete(key))
  return { searchParams: next, changed }
}

export function resolveDevFlowViewContext({
  catalog,
  searchParams,
  task,
  taskScoped = false,
  topics = false,
}) {
  let chainKey = null
  let nodeKey = null
  if (taskScoped && searchParams.get(keys.taskId)) {
    if (!task || String(task.id) !== searchParams.get(keys.taskId)) return null
    const stage = task.discovery?.stage_key
    const definitions = isWorkflowBusinessChainException(task)
      ? tasks.exception_guides.filter((item) => item.stages.includes(stage))
      : tasks.fulfillment_flow.filter((item) => item.stages.includes(stage))
    const matches = [...new Set(definitions.map((item) => item.business_chain))]
    if (matches.length !== 1) return null
    ;[chainKey] = matches
  } else if (
    searchParams.get(keys.chain) &&
    searchParams.get(keys.chain) !== 'all'
  ) {
    chainKey = searchParams.get(keys.chain)
    nodeKey = searchParams.get(keys.node)
  } else if (searchParams.get(keys.exception)) {
    chainKey = tasks.exception_guides.find(
      (item) => item.key === searchParams.get(keys.exception)
    )?.business_chain
  } else if (topics) {
    const topicKey = searchParams.has(keys.roleTopic)
      ? searchParams.get(keys.roleTopic)
      : buildDevBusinessChainTopics(
          catalog,
          normalizeFulfillmentRole(searchParams.get(keys.role))
        ).flatMap((lane) => lane.topics)[0]?.chain.key
    chainKey =
      searchParams.get(keys.roleMapNode) ||
      searchParams.get(keys.roleMap) ||
      topicKey
    nodeKey = searchParams.get(keys.roleMap)
      ? null
      : searchParams.get(keys.roleTopicNode)
  } else {
    chainKey = tasks.fulfillment_flow.find(
      (item) => item.stage === searchParams.get(keys.roleStage)
    )?.business_chain
  }
  const chain = catalog.businessChains.find((item) => item.key === chainKey)
  if (!chain || (nodeKey && !chain.nodes.some((item) => item.key === nodeKey))) {
    return null
  }
  return { chainKey: chain.key, nodeKey: nodeKey || '' }
}

export function getDevTaskReadingSelection(task) {
  const stage = task?.discovery?.stage_key
  if (!stage) return null
  const clear = Object.fromEntries(
    FLOW_READING_CONTEXT_KEYS.map((key) => [key, null])
  )
  if (isWorkflowBusinessChainException(task)) {
    const matches = tasks.exception_guides.filter((guide) =>
      guide.stages.includes(stage)
    )
    return {
      ...clear,
      [keys.chain]: 'all',
      [keys.roleTab]: 'exceptions',
      [keys.exception]: matches.length === 1 ? matches[0].key : null,
    }
  }
  const matches = tasks.fulfillment_flow.filter((step) =>
    step.stages.includes(stage)
  )
  return matches.length === 1
    ? { ...clear, [keys.chain]: 'all', [keys.roleStage]: matches[0].stage }
    : null
}
