import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentExceptionPath, fulfillmentRoleOptions } from '../../erp/utils/workflowFulfillment.mjs'

const roleNames = new Map(fulfillmentRoleOptions.map((option) => [option.value, option.label]))
export function resolveFulfillmentExceptionOrigin(guide, requestedStage, previousStage) {
  if (requestedStage && !guide.entry_stages.includes(requestedStage)) return { stage: null, invalid: true }
  const key = requestedStage || (guide.entry_stages.includes(previousStage) ? previousStage : guide.entry_stages[0])
  return { stage: catalog.fulfillment_flow.find((step) => step.stage === key) || null, invalid: false }
}

function stageNode(stage, key, marker) {
  const number = catalog.fulfillment_flow.indexOf(stage) + 1
  return {
    key,
    kind: 'main',
    stage: stage.stage,
    label: `${marker} · ${number} ${stage.label}`,
    role: stage.role,
    role_keys: stage.role_keys,
    result: stage.result,
  }
}

export function buildFulfillmentExceptionGraph(guide, { planKey, originStage, previousStage } = {}) {
  const { plan, steps } = fulfillmentExceptionPath(guide, planKey)
  const origin = resolveFulfillmentExceptionOrigin(guide, originStage, previousStage)
  if (origin.invalid) return { invalid: true, plan, steps, origin: null, nodes: [], edges: [] }
  const policy = plan.continuation
  if (!guide.diagram || !policy) throw new Error(`Missing exception diagram: ${guide.key}/${plan.key}`)
  if (!origin.stage && !guide.diagram.external_entry) throw new Error(`Missing exception origin: ${guide.key}`)
  const external = guide.diagram.external_entry
  const entry = origin.stage ? stageNode(origin.stage, 'main:entry', '分出') : {
    key: 'main:entry',
    kind: 'external',
    label: external.label,
    role_keys: external.role_keys,
    role: external.role_keys.map((key) => roleNames.get(key)).join(' / '),
    result: guide.source,
  }
  const nodes = [entry, ...steps]
  const edges = [{ from: entry.key, to: steps[0].key, label: guide.diagram.branch_label }]
  let reentryStage = null
  let returnStage = null
  if (policy.reentry) {
    reentryStage = catalog.fulfillment_flow.find((step) => step.stage === policy.reentry.stage)
    if (!reentryStage || !steps.some((step) => step.key === policy.reentry.before_step)) throw new Error(`Invalid reentry: ${guide.key}/${plan.key}`)
    nodes.push(stageNode(reentryStage, 'main:reentry', '重新进入'))
  }
  for (let index = 1; index < steps.length; index += 1) {
    const from = steps[index - 1].key
    const to = steps[index].key
    if (policy.reentry?.before_step === to) {
      edges.push({ from, to: 'main:reentry', label: policy.reentry.label, kind: 'return' }, { from: 'main:reentry', to })
      if (policy.original_terminal) {
        nodes.push({ key: 'end:original', kind: 'terminal', label: policy.original_terminal, result: plan.closure, role_keys: [] })
        edges.push({ from, to: 'end:original', label: '原批' })
      }
    } else edges.push({ from, to })
  }
  if (policy.kind === 'stop') {
    nodes.push({ key: 'end:result', kind: 'terminal', label: policy.label, result: plan.closure, role_keys: [] })
    edges.push({ from: steps.at(-1).key, to: 'end:result' })
  } else if (policy.kind === 'return') {
    if (policy.target === 'external') {
      nodes.push({ ...entry, key: 'main:return', label: `接回 · ${policy.target_label}` })
    } else {
      const stage = policy.target === 'origin' ? origin.stage?.stage
        : policy.target === 'next' ? catalog.fulfillment_flow[catalog.fulfillment_flow.indexOf(origin.stage) + 1]?.stage : policy.target
      returnStage = catalog.fulfillment_flow.find((step) => step.stage === stage)
      if (!returnStage) throw new Error(`Invalid return: ${guide.key}/${plan.key}`)
      nodes.push(stageNode(returnStage, 'main:return', policy.target === 'next' ? '继续主链' : '接回'))
    }
    edges.push({ from: steps.at(-1).key, to: 'main:return', label: policy.label, kind: 'return' })
  } else throw new Error(`Unknown exception outcome: ${guide.key}/${plan.key}`)
  const split = policy.reentry ? steps.findIndex((step) => step.key === policy.reentry.before_step) : steps.length
  return { invalid: false, guide, plan, steps, branchSteps: steps.slice(0, split), nodes, edges, origin: origin.stage, returnStage, reentryStage }
}
