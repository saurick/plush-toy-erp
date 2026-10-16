import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'

export { catalog as workflowTaskDiscoveryCatalog }
export const DISCOVERY_FILTER_KEYS = Object.freeze(['moduleKey', 'chainKey', 'stageKey', 'assignee'])
export const DISCOVERY_REQUEST_KEYS = Object.freeze({ moduleKey: 'module_key', chainKey: 'chain_key', stageKey: 'stage_key', assignee: 'assignee' })

export function normalizeTaskDiscoveryFilters(value = {}) {
  const result = {}
  for (const key of DISCOVERY_FILTER_KEYS) {
    const candidate = String(value[key] || '')
    const values = { moduleKey: catalog.modules, chainKey: catalog.chains, stageKey: catalog.stages }[key]
    if (values?.some((entry) => entry.key === candidate) || (key === 'assignee' && (candidate === 'unassigned' || /^[1-9]\d*$/u.test(candidate) && Number.isSafeInteger(Number(candidate))))) result[key] = candidate
  }
  return result
}

export function taskDiscoveryRequest(filters = {}) {
  return Object.fromEntries(Object.entries(normalizeTaskDiscoveryFilters(filters)).map(([key, value]) => [DISCOVERY_REQUEST_KEYS[key], value]))
}

export function taskStagePath(stageKey) {
  const stage = catalog.stages.find((entry) => entry.key === stageKey)
  if (!stage) return ''
  return `${catalog.chains.find((entry) => entry.key === stage.chain)?.label} / ${stage.group} / ${stage.label}`
}

export function taskDiscoveryFilterLabels(filters = {}, people = []) {
  const value = normalizeTaskDiscoveryFilters(filters)
  return Object.entries(value).map(([key, selected]) => ({ key,
label: {
    moduleKey: `模块：${catalog.modules.find((entry) => entry.key === selected)?.label}`,
    chainKey: `链路：${catalog.chains.find((entry) => entry.key === selected)?.label}`,
    stageKey: `环节：${taskStagePath(selected)}`,
    assignee: `办理人：${selected === 'unassigned' ? '岗位待领取' : people.find((person) => String(person.id) === selected)?.name || '已指定人员'}`,
  }[key] }))
}
