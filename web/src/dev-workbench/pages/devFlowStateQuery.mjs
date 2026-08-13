export const DEV_FLOW_STATE_QUERY_KEYS = Object.freeze({
  view: 'view',
  chain: 'chain',
  node: 'node',
  flow: 'flow',
  state: 'state',
  process: 'process',
  fact: 'fact',
  taskId: 'task_id',
})

export const DEV_FLOW_STATE_DEFAULT_VIEW = 'chain'
export const DEV_FLOW_STATE_OVERVIEW_CHAIN_KEY = 'all'

export const DEV_FLOW_STATE_VIEW_SELECTION_QUERY_KEYS = Object.freeze({
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
  ]),
})

export const DEV_FLOW_STATE_SELECTION_QUERY_KEYS = Object.freeze([
  DEV_FLOW_STATE_QUERY_KEYS.chain,
  DEV_FLOW_STATE_QUERY_KEYS.node,
  DEV_FLOW_STATE_QUERY_KEYS.flow,
  DEV_FLOW_STATE_QUERY_KEYS.state,
  DEV_FLOW_STATE_QUERY_KEYS.process,
  DEV_FLOW_STATE_QUERY_KEYS.fact,
])

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '')

export function canonicalizeDevFlowStateSearchParams(value) {
  const current = new URLSearchParams(value)
  const keys = [...new Set(current.keys())]
  if (keys.some((key) => current.getAll(key).length > 1)) {
    return { searchParams: current, changed: false }
  }

  const view =
    cleanText(current.get(DEV_FLOW_STATE_QUERY_KEYS.view)) ||
    DEV_FLOW_STATE_DEFAULT_VIEW
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
