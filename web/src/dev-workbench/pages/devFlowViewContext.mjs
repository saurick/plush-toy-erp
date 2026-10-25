import { WorkflowTaskDiscoveryCatalog as tasks } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { isWorkflowBusinessChainException } from '../../erp/utils/workflowBusinessChain.mjs'
import { buildDevBusinessChainTopics } from '../config/devBusinessChainProjection.mjs'
import { normalizeFulfillmentRole } from '../../erp/utils/workflowFulfillment.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as keys } from './devFlowStateQuery.mjs'

export const FLOW_READING_CONTEXT_KEYS = [
  keys.roleStage,
  keys.roleSubstep,
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

export function resolveDevFlowViewContext({
  catalog,
  searchParams,
  task,
  taskScoped = false,
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
  } else if (searchParams.get(keys.roleTab) === 'topics') {
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
