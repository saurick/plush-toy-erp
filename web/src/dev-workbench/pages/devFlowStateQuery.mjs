import { DEV_BUSINESS_RULES_ROUTE, DEV_BUSINESS_TOPICS_ROUTE, DEV_STATUS_FLOWS_ROUTE } from '../config/devRoutes.mjs'

export const DEV_BUSINESS_RULE_VIEWS = Object.freeze(['states', 'processes', 'facts', 'finance_rules'])

export function resolveDevFlowViewRoute(view, { topics = false } = {}) {
  if (DEV_BUSINESS_RULE_VIEWS.includes(view)) return DEV_BUSINESS_RULES_ROUTE
  return topics && view === 'chain' ? DEV_BUSINESS_TOPICS_ROUTE : DEV_STATUS_FLOWS_ROUTE
}

export const DEV_FLOW_STATE_QUERY_KEYS = Object.freeze({
  view: 'view',
  chain: 'chain',
  node: 'node',
  flow: 'flow',
  state: 'state',
  ruleAction: 'rule_action',
  process: 'process',
  fact: 'fact',
  financeFact: 'finance_fact_id',
  financeRule: 'finance_rule',
  financeTopic: 'finance_topic',
  financeStep: 'finance_step',
  financeStage: 'finance_stage',
  financeChange: 'finance_change',
  taskId: 'task_id',
  taskFilter: 'task_filter',
  taskGroup: 'task_stage',
  role: 'flow_role',
  relationMachine: 'flow_object',
  relationPermission: 'flow_permission',
  relationAction: 'flow_action',
  roleStage: 'flow_stage',
  roleSubstep: 'flow_substep',
  roleTab: 'flow_tab',
  roleTopic: 'flow_topic',
  roleTopicNode: 'flow_topic_node',
  roleTopicStep: 'flow_topic_step',
  roleMap: 'flow_map',
  roleMapNode: 'flow_map_node',
  exception: 'flow_exception',
  exceptionDecision: 'flow_decision',
  exceptionStep: 'flow_exception_step',
  exceptionOrigin: 'flow_exception_origin',
})

export const DEV_FLOW_RELATION_FILTER_KEYS = Object.freeze({
  role: DEV_FLOW_STATE_QUERY_KEYS.role,
  machine: DEV_FLOW_STATE_QUERY_KEYS.relationMachine,
  permission: DEV_FLOW_STATE_QUERY_KEYS.relationPermission,
})

export function readDevFlowRelationFilters(searchParams) {
  return Object.fromEntries(Object.entries(DEV_FLOW_RELATION_FILTER_KEYS).map(([key, query]) => [key, searchParams.get(query) || 'all']))
}

export function patchDevFlowRelationFilters(searchParams, patch) {
  const next = new URLSearchParams(searchParams)
  for (const [key, value] of Object.entries(patch)) {
    if (!value || value === 'all') next.delete(DEV_FLOW_RELATION_FILTER_KEYS[key])
    else next.set(DEV_FLOW_RELATION_FILTER_KEYS[key], value)
  }
  next.delete(DEV_FLOW_STATE_QUERY_KEYS.relationAction)
  return next
}

export const DEV_FLOW_STATE_DEFAULT_VIEW = 'chain'
export const DEV_FLOW_STATE_OVERVIEW_CHAIN_KEY = 'all'

export function buildDevFlowSurfaceLocation(searchParams, { topics = false, topicKey } = {}) {
  const next = new URLSearchParams()
  for (const key of Object.values(DEV_FLOW_RELATION_FILTER_KEYS)) {
    if (searchParams.has(key)) next.set(key, searchParams.get(key))
  }
  if (topics && topicKey !== undefined) next.set(DEV_FLOW_STATE_QUERY_KEYS.roleTopic, topicKey)
  return {
    pathname: topics ? DEV_BUSINESS_TOPICS_ROUTE : DEV_STATUS_FLOWS_ROUTE,
    search: next.toString() ? `?${next}` : '',
  }
}

export const DEV_FLOW_STATE_VIEW_SELECTION_QUERY_KEYS = Object.freeze({
  finance_records: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
  ]),
  finance_rules: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
  ]),
  processes: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
    DEV_FLOW_STATE_QUERY_KEYS.process,
  ]),
  tracking: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
  ]),
  chain: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
  ]),
  workflow: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
  ]),
  runtime: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
    DEV_FLOW_STATE_QUERY_KEYS.process,
  ]),
  facts: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
    DEV_FLOW_STATE_QUERY_KEYS.fact,
  ]),
  states: Object.freeze([
    DEV_FLOW_STATE_QUERY_KEYS.chain,
    DEV_FLOW_STATE_QUERY_KEYS.node,
    DEV_FLOW_STATE_QUERY_KEYS.flow,
    DEV_FLOW_STATE_QUERY_KEYS.state,
    DEV_FLOW_STATE_QUERY_KEYS.ruleAction,
  ]),
})

export const DEV_FLOW_STATE_SELECTION_QUERY_KEYS = Object.freeze([
  DEV_FLOW_STATE_QUERY_KEYS.chain,
  DEV_FLOW_STATE_QUERY_KEYS.node,
  DEV_FLOW_STATE_QUERY_KEYS.flow,
  DEV_FLOW_STATE_QUERY_KEYS.state,
  DEV_FLOW_STATE_QUERY_KEYS.ruleAction,
  DEV_FLOW_STATE_QUERY_KEYS.process,
  DEV_FLOW_STATE_QUERY_KEYS.fact,
])

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '')

export function canonicalizeDevFlowStateSearchParams(value, { defaultView = DEV_FLOW_STATE_DEFAULT_VIEW } = {}) {
  const current = new URLSearchParams(value)
  const keys = [...new Set(current.keys())]
  if (keys.some((key) => current.getAll(key).length > 1)) {
    return { searchParams: current, changed: false }
  }

  const view =
    cleanText(current.get(DEV_FLOW_STATE_QUERY_KEYS.view)) ||
    defaultView
  const allowedSelectionKeys = DEV_FLOW_STATE_VIEW_SELECTION_QUERY_KEYS[view]
  if (!allowedSelectionKeys) {
    return { searchParams: current, changed: false }
  }

  const next = new URLSearchParams(current)
  for (const key of DEV_FLOW_STATE_SELECTION_QUERY_KEYS) {
    if (!allowedSelectionKeys.includes(key)) next.delete(key)
  }
  if (
    cleanText(next.get(DEV_FLOW_STATE_QUERY_KEYS.chain)) ===
    DEV_FLOW_STATE_OVERVIEW_CHAIN_KEY
  ) {
    next.delete(DEV_FLOW_STATE_QUERY_KEYS.node)
  }

  return {
    searchParams: next,
    changed: next.toString() !== current.toString(),
  }
}
