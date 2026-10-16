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
    .filter(Boolean).map((stage) => ({ key: stage.key, label: stage.label, pathLabel: [stage.group, stage.label].filter(Boolean).join(' · '), href: `/erp/task-board?stage_key=${encodeURIComponent(stage.key)}` }))
}

export function fulfillmentExceptionPath(guide, planKey) {
  const plan = guide.plans.find((item) => item.key === planKey) || guide.plans[0]
  const steps = [
    ...guide.steps,
    ...(guide.approval ? [{ key: 'approval', label: guide.approval.label, role: guide.approval.role, role_keys: guide.approval.role_keys, result: guide.approval.condition }] : []),
    ...plan.steps,
  ].map((step) => ({ ...step, role: step.role || step.role_keys.map((key) => getRoleDisplayName(key)).join(' / ') }))
  return { plan, steps }
}

export function selectFulfillmentExceptionGuide(key, role) {
  return catalog.exception_guides.find((item) => item.key === key)
    || catalog.exception_guides.find((guide) => guide.plans.some((plan) => fulfillmentExceptionPath(guide, plan.key).steps.some((step) => fulfillmentStepMatchesRole(step, role))))
    || catalog.exception_guides[0]
}
