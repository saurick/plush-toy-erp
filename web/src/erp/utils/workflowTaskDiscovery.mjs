import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'

export { catalog as workflowTaskDiscoveryCatalog }
export const DISCOVERY_FILTER_KEYS = Object.freeze(['stageKey', 'assignee'])
export const DISCOVERY_REQUEST_KEYS = Object.freeze({ moduleKey: 'module_key', chainKey: 'chain_key', stageKey: 'stage_key', assignee: 'assignee' })

export function normalizeTaskDiscoveryFilters(value = {}, { includeStage = false, includeClassification = false } = {}) {
  const result = {}
  for (const key of Object.keys(DISCOVERY_REQUEST_KEYS)) {
    const candidate = String(value[key] || '')
    const choices = key === 'stageKey' && includeStage ? catalog.stages : includeClassification ? { moduleKey: catalog.modules, chainKey: catalog.chains }[key] : null
    if (choices?.some((entry) => entry.key === candidate) || (key === 'assignee' && (candidate === 'unassigned' || /^[1-9]\d*$/u.test(candidate) && Number.isSafeInteger(Number(candidate))))) result[key] = candidate
  }
  return result
}

export function taskDiscoveryRequest(filters = {}, options = {}) {
  return Object.fromEntries(Object.entries(normalizeTaskDiscoveryFilters(filters, options)).map(([key, value]) => [DISCOVERY_REQUEST_KEYS[key], value]))
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
    assignee: `办理人：${selected === 'unassigned' ? '岗位待领取' : people.find((person) => String(person.id) === selected)?.name || '已指定人员'}`,
  }[key] }))
}
