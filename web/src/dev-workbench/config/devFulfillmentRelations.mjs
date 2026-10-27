import { WorkflowTaskDiscoveryCatalog as tasks } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildDevBusinessChainProjection } from './devBusinessChainProjection.mjs'

const chainStep = (chainKey, stepKey) => ({ chainKey, stepKey })
const transition = (machineKey, transitionKey) => ({
  machineKey,
  transitionKey,
})
const sales = (key) => chainStep('sales_to_production', key)
const purchase = (key) => chainStep('purchase_to_inventory', key)
const production = (key) => chainStep('production_to_inventory', key)
const delivery = (key) => chainStep('delivery_to_settlement', key)
const finance = (key) => chainStep('finance_payment_and_reversal', key)
const wip = (key) => transition('fact.production_wip_batch', key)
const quality = (key) => transition('fact.quality_inspection', key)
const advance = {
  register: [finance('payment_order:starts_process:finance_payment_process')],
  actual: [
    finance('finance_payment_process:calls_domain_command:finance_payment'),
  ],
  balance: [finance('finance_payment:posts_fact:finance_allocation')],
}
const processing = {
  route: [wip('PLANNED->SPLIT')],
  internal: [
    wip('PLANNED->IN_PROGRESS'),
    wip('IN_PROGRESS->WAITING_QUALITY'),
    wip('IN_PROGRESS->ACCEPTED'),
  ],
  issue: [wip('PLANNED->OUTSOURCED')],
  return: [wip('OUTSOURCED->WAITING_QUALITY'), wip('OUTSOURCED->ACCEPTED')],
}
const inspection = {
  inspect: [
    quality('SUBMITTED->PASSED'),
    quality('SUBMITTED->REJECTED'),
    wip('WAITING_QUALITY->ACCEPTED'),
    wip('WAITING_QUALITY->REJECTED'),
  ],
}

// Reading references only: labels, guards, states and permissions resolve from
// the existing contracts. These bindings do not assign work or authorize actions.
export const FULFILLMENT_RELATION_REFS = Object.freeze({
  sales_order: {
    prepare: [sales('sales_order:starts_process:sales_acceptance')],
    order_approval: [
      sales('sales_tasks:calls_domain_command:sales_acceptance'),
    ],
    engineering: [
      transition('source.sales_order_engineering', 'PREPARING->SAMPLING'),
      transition('source.sales_order_engineering', 'SAMPLING->CONFIRMED'),
      transition('source.sales_order_engineering', 'PREPARING->CONFIRMED'),
    ],
    ready: [sales('sales_acceptance:requires:effective_bom')],
    boss_review: [
      transition('source.engineering_material_request', 'SUBMITTED->BOSS_APPROVED'),
      transition('source.engineering_material_request', 'SUBMITTED->REJECTED'),
    ],
    finance_review: [
      transition('source.engineering_material_request', 'BOSS_APPROVED->APPROVED'),
      transition('source.engineering_material_request', 'BOSS_APPROVED->REJECTED'),
    ],
    material_submit: [
      sales('effective_bom:calls_domain_command:material_request'),
    ],
    purchase: [
      sales('material_request:creates_source:generated_purchase_order'),
    ],
    reject_order: [sales('sales_tasks:returns:sales_order')],
  },
  customer_advance: advance,
  purchasing: {
    source: [purchase('purchase_order:starts_process:purchase_approval')],
    approval: [
      purchase('purchase_task:calls_domain_command:purchase_approval'),
    ],
    rejected: [purchase('purchase_task:returns:purchase_rejected')],
  },
  supplier_advance: advance,
  purchase_count: {
    '': [
      purchase('purchase_approval:creates_fact_draft:purchase_receipt'),
      purchase('purchase_order:creates_fact_draft:purchase_receipt'),
      purchase('purchase_receipt:creates_fact_draft:purchase_quality'),
    ],
  },
  incoming_quality: {
    inspect: [
      purchase('purchase_quality:posts_fact:purchase_accepted'),
      quality('SUBMITTED->REJECTED'),
    ],
    inbound: [purchase('purchase_accepted:posts_fact:purchase_lot')],
    exception: [
      chainStep(
        'purchase_quality_disposition',
        'purchase_disposition:returns:vendor_return_result'
      ),
      chainStep(
        'purchase_quality_disposition',
        'purchase_disposition:creates_fact_draft:replacement_receipt'
      ),
    ],
  },
  cutting_issue: {
    create: [sales('effective_bom:creates_source:production_order')],
    release: [production('released_production_order:posts_fact:wip_batch')],
    plan: [wip('PLANNED->SPLIT')],
    issue: [wip('PLANNED->OUTSOURCED')],
  },
  cutting_return: {
    '': [wip('OUTSOURCED->WAITING_QUALITY'), wip('OUTSOURCED->ACCEPTED')],
  },
  cutting_quality: inspection,
  sewing_execute: processing,
  shell_quality: inspection,
  handwork_execute: processing,
  finished_inbound: {
    inbound: [production('wip_batch:posts_fact:production_completion')],
    gate: [production('production_completion:posts_fact:finished_goods_lot')],
  },
  finished_quality: {
    quality: [
      production('finished_goods_lot:requires:finished_quality'),
      quality('SUBMITTED->REJECTED'),
    ],
    passed: [wip('WAITING_QUALITY->ACCEPTED')],
  },
  packaging: {
    version: [production('finished_quality:requires:packaging_confirmation')],
    pack: [production('packaging_confirmation:posts_fact:packaging_execution')],
  },
  shipment: {
    prepare: [
      delivery('shipment_draft:starts_process:shipment_release_process'),
    ],
    approval: [
      delivery('shipment_release_task:calls_domain_command:shipment_release'),
    ],
    actual: [delivery('shipment_release:posts_fact:shipped')],
    blocked: [delivery('shipment_release_task:returns:shipment_rejected')],
  },
  financial_settlement: {
    fact: [
      purchase('purchase_payable_draft:posts_fact:purchase_payable'),
      delivery('receivable_draft:posts_fact:receivable'),
    ],
    offset: [finance('finance_payment:posts_fact:finance_allocation')],
    approval: [
      finance('open_finance_fact:starts_process:finance_payment_process'),
    ],
    actual: [
      finance('finance_payment_process:calls_domain_command:finance_payment'),
    ],
    balance: [finance('finance_allocation:derives:open_finance_fact')],
    settled: [finance('finance_allocation:derives:settled_finance_fact')],
    exception: [
      finance('finance_payment:reverses:open_finance_fact'),
      finance('finance_allocation:reverses:finance_payment'),
    ],
  },
})

const unique = (items) => [...new Set(items.filter(Boolean))]
const requireValue = (value, key) => {
  if (!value) throw new Error(`Unknown fulfillment relation: ${key}`)
  return value
}
export function buildChainActionRelations(catalog, chain) {
  return chain.steps.map((step) => {
    const input = requireValue(
      chain.nodes.find((node) => node.key === step.fromNodeKey),
      step.key
    )
    const result = requireValue(
      chain.nodes.find((node) => node.key === step.toNodeKey),
      step.key
    )
    const changedMachines = unique(
      step.stateTransitionRefs.map((ref) => ref.machineKey)
    )
    const resultMachines = unique(
      step.resultStateRefs.map((ref) => ref.machineKey)
    )
    return {
      key: `${chain.key}/${step.key}`,
      label: step.label,
      chainKey: chain.key,
      step,
      input: input.label,
      result: result.label,
      nodeKeys: [input.key, result.key],
      roleKeys: step.responsibility.ownerPoolKeys,
      responsibilityMode: step.responsibility.mode,
      permissionKeys: step.responsibility.capabilityKeys,
      // Object filtering refers to the action's changed/result object, not an
      // upstream prerequisite belonging to a different action in the stage.
      machineKeys: changedMachines.length
        ? changedMachines
        : resultMachines.length
          ? resultMachines
          : result.machineKeys,
      relatedMachineKeys: unique([
        ...input.machineKeys,
        ...result.machineKeys,
        ...step.preconditionStateRefs.map((ref) => ref.machineKey),
        ...step.resultStateRefs.map((ref) => ref.machineKey),
        ...changedMachines,
      ]),
      transitions: step.stateTransitionRefs.map((ref) => ({
        flow: requireValue(
          catalog.flows.find((flow) => flow.key === ref.machineKey),
          ref.machineKey
        ),
        transition: requireValue(
          catalog.flows
            .find((flow) => flow.key === ref.machineKey)
            ?.transitions.find((item) => item.key === ref.transitionKey),
          `${ref.machineKey}/${ref.transitionKey}`
        ),
      })),
      condition: step.condition,
      sourceRefs: step.sourceRefs,
    }
  })
}

export function buildFulfillmentRelations(catalog) {
  const actions = new Map(
    catalog.businessChains
      .flatMap((chain) => buildChainActionRelations(catalog, chain))
      .map((action) => [action.key, action])
  )
  return tasks.fulfillment_flow.map((stage) => {
    const refs = requireValue(
      FULFILLMENT_RELATION_REFS[stage.stage],
      stage.stage
    )
    return {
      stage,
      actions: Object.entries(refs).flatMap(([substepKey, bindings]) => {
        const substep = substepKey
          ? requireValue(
              stage.subflow?.nodes.find((node) => node.key === substepKey),
              `${stage.stage}/${substepKey}`
            )
          : stage
        return bindings.map((ref) => {
          let action
          if (ref.chainKey) {
            action = requireValue(
              actions.get(`${ref.chainKey}/${ref.stepKey}`),
              `${ref.chainKey}/${ref.stepKey}`
            )
          } else {
            const flow = requireValue(
              catalog.flows.find((item) => item.key === ref.machineKey),
              ref.machineKey
            )
            const rule = requireValue(
              flow.transitions.find((item) => item.key === ref.transitionKey),
              ref.transitionKey
            )
            const stateLabel = (key) =>
              requireValue(
                flow.states.find((item) => item.key === key),
                key
              ).label
            action = {
              key: `${flow.key}/${rule.key}`,
              label: `${substep.label} · ${stateLabel(rule.to)}`,
              chainKey: stage.business_chain,
              input: `${flow.label} · ${stateLabel(rule.from)}`,
              result: `${flow.label} · ${stateLabel(rule.to)}`,
              roleKeys: substep.role_keys || [],
              responsibilityMode: rule.responsibilityMode,
              permissionKeys: rule.permission,
              machineKeys: [flow.key],
              relatedMachineKeys: [flow.key],
              transitions: [{ flow, transition: rule }],
              condition: '',
              sourceRefs: rule.sourceRefs,
            }
          }
          return {
            ...action,
            key: `${stage.stage}/${substepKey}/${action.key}`,
            stageKey: stage.stage,
            substepKey,
          }
        })
      }),
    }
  })
}
