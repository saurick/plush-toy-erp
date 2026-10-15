import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { ROLE_DISPLAY_NAMES, getRoleDisplayName } from './roleKeys.mjs'

export const fulfillmentRoleOptions = Object.freeze([
  { value: 'all', label: '全部岗位' },
  ...Object.keys(ROLE_DISPLAY_NAMES).map((value) => ({ value, label: getRoleDisplayName(value) })),
])

export function normalizeFulfillmentRole(value) {
  return fulfillmentRoleOptions.some((option) => option.value === value) ? value : 'all'
}

export function fulfillmentStepMatchesRole(step, role) {
  return role === 'all' || step.role_keys?.includes(role) || false
}

export function fulfillmentTaskLinks(step) {
  return step.stages.map((key) => catalog.stages.find((stage) => stage.key === key))
    .filter(Boolean).map((stage) => ({ key: stage.key, label: stage.label, href: `/erp/task-board?stage_key=${encodeURIComponent(stage.key)}` }))
}
