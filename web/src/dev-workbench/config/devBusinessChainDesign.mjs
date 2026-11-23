import { DIAGRAM_NODE_TYPES, DIAGRAM_DOMAINS } from '../../common/components/diagram/diagramSemantics.mjs'
import { groupBusinessChainOptions } from './devBusinessChainCatalog.mjs'
import {
  describeDevBusinessChainStep,
  describeDevBusinessChainResponsibility,
} from './devBusinessChainProjection.mjs'
import {
  isBusinessChainStep,
  businessChainPathKind,
} from './devBusinessChainDesignView.mjs'
import {
  appendBusinessProcessNodes,
  appendBusinessStateSteps,
} from './devBusinessChainExploration.mjs'
import {
  appendGranularBusinessSteps,
  appendFinanceDocumentBranches,
  appendPaymentAllocationBranches,
} from './devBusinessChainGranularity.mjs'
import {
  governBusinessChainNodes,
  businessChainRoleLabel,
  buildBusinessChainNodeEntries,
} from './devBusinessChainNodeCatalog.mjs'
import { parseBusinessChainMap } from './devBusinessChainMap.mjs'
import { CHAIN_READING_LAYERS, businessChainSourceEdgeKind } from './devBusinessChainReading.mjs'

export { CHAIN_DESIGN_NODE_SIZE } from './devBusinessChainDesignView.mjs'

export const CHAIN_CONNECTION_LABELS = Object.freeze({
  source: '当前起点',
  known: '此方向有衔接规则',
  blocked: '不能直连',
  unknown: '连接规则待核对',
})

export const CHAIN_DESIGN_TYPES = Object.freeze(Object.fromEntries(
  ['task', 'business_action', 'document', 'record', 'master', 'group', 'result', 'rule', 'system'].map((key) => [key, DIAGRAM_NODE_TYPES[key]])
))
export const CHAIN_DESIGN_DOMAINS = Object.freeze(Object.fromEntries(
  Object.entries(DIAGRAM_DOMAINS).map(([key, value]) => [key, value.label])
))
const CHAIN_DOMAINS = {
  sales_to_production: 'sales',
  purchase_to_inventory: 'purchase',
  production_to_inventory: 'production',
  outsourcing_to_inventory: 'purchase',
  delivery_to_settlement: 'delivery',
  finance_payment_and_reversal: 'finance',
  inventory_adjustment: 'inventory',
  production_exception: 'production',
  purchase_quality_disposition: 'purchase',
  outsourcing_quality_disposition: 'purchase',
  purchase_posting_corrections: 'purchase',
}
// These are presentation distinctions within the existing layers, not new business objects.
const NODE_DOMAINS = {
  effective_bom: 'engineering',
  material_request: 'engineering',
  generated_purchase_order: 'purchase',
  stock_reservation: 'inventory',
  production_order: 'production',
  packaging_confirmation: 'production',
  packaging_execution: 'production',
}
const DOCUMENT_RECORDS = new Set([
  'purchase_payable_draft',
  'outsourcing_payable_draft',
  'receivable_draft',
  'inventory_operation',
  'shipment_draft',
  'purchase_disposition',
  'outsourcing_disposition',
  'purchase_return_correction',
  'purchase_adjustment_correction',
])
const SOURCE_RESULTS = new Set([
  'production_exception_rejected',
  'production_exception_over_issue',
  'production_exception_execution',
])
const LAYER_TYPES = {
  source_document: 'document',
  workflow_task: 'task',
  process_runtime: 'group',
  masterdata_lifecycle: 'master',
  fact_ledger: 'record',
  derived_result: 'result',
}
const unique = (items) => [...new Set(items)]
const objectId = (key) => `node:${key}`
const actionId = (key) => `step:${key}`
const pairKey = (from, to) => JSON.stringify([from, to])

function domainFor(node, chain) {
  if (NODE_DOMAINS[node.key]) return NODE_DOMAINS[node.key]
  if (node.machineKeys.includes('fact.production_wip_batch')) {
    return 'production'
  }
  if (node.machineKeys.some((key) => key.includes('quality_inspection'))) {
    return 'quality'
  }
  if (node.machineKeys.some((key) => key.startsWith('fact.inventory'))) {
    return 'inventory'
  }
  if (node.machineKeys.some((key) => key.startsWith('fact.finance'))) {
    return 'finance'
  }
  return CHAIN_DOMAINS[chain.key]
}

export function buildBusinessChainDesignLibrary(catalog) {
  const nodes = []
  const relations = []
  const bypasses = new Map()
  for (const chain of catalog.businessChains) {
    const objects = new Map()
    for (const node of chain.nodes) {
      const related = chain.steps.filter((step) =>
        [step.fromNodeKey, step.toNodeKey].includes(node.key)
      )
      const type = DOCUMENT_RECORDS.has(node.key)
        ? 'document'
        : SOURCE_RESULTS.has(node.key)
          ? 'result'
          : LAYER_TYPES[node.layer]
      if (!type || !CHAIN_DOMAINS[chain.key]) {
        throw new Error(
          `Unclassified chain design node: ${chain.key}/${node.key}`
        )
      }
      const item = {
        id: objectId(node.key),
        label: node.label,
        type,
        domain: domainFor(node, chain),
        chainKey: chain.key,
        chainLabel: chain.label,
        source: node,
        terminal: node.terminal,
        entry: chain.entryNodeKeys.includes(node.key),
        roles: unique(
          related.flatMap((step) => step.responsibility.ownerPoolKeys)
        ),
        machineKeys:
          node.layer === 'workflow_task' ? ['workflow.task'] : node.machineKeys,
        steps: related,
      }
      objects.set(node.key, item)
      nodes.push(item)
    }
    for (const step of chain.steps) {
      const edge = chain.edges.find((item) => item.key === step.edgeKey)
      if (!edge) throw new Error(`Missing chain design edge: ${step.key}`)
      const from = objects.get(step.fromNodeKey)
      const to = objects.get(step.toNodeKey)
      const task = from.type === 'task'
      const system =
        !task &&
        (['system', 'derived'].includes(step.responsibility.mode) ||
          edge.kind === 'creates_task')
      const roles = step.responsibility.ownerPoolKeys
      const roleDomain =
        roles.length === 1
          ? { warehouse: 'inventory', engineering_data: 'engineering' }[
              roles[0]
            ] || roles[0]
          : null
      const id = actionId(step.key)
      nodes.push({
        id,
        label: step.label,
        type: system ? 'system' : 'business_action',
        domain: CHAIN_DESIGN_DOMAINS[roleDomain] ? roleDomain : to.domain,
        chainKey: chain.key,
        chainLabel: chain.label,
        source: step,
        roles,
        machineKeys: unique([
          ...(task ? ['workflow.task'] : []),
          ...[
            ...step.preconditionStateRefs,
            ...step.stateTransitionRefs,
            ...step.resultStateRefs,
          ].map((ref) => ref.machineKey),
        ]),
        input: from.label,
        output: to.label,
        steps: [step],
      })
      const evidence = {
        step,
        chainLabel: chain.label,
        ...describeDevBusinessChainStep(catalog, step),
        responsibility: describeDevBusinessChainResponsibility(
          step.responsibility
        ),
        guards: unique(
          step.stateTransitionRefs.flatMap((ref) => {
            const flow = catalog.flows.find(
              (item) => item.key === ref.machineKey
            )
            const transition = flow?.transitions.find(
              (item) => item.key === ref.transitionKey
            )
            return transition?.guard ? [transition.guard] : []
          })
        ),
      }
      const kind = businessChainSourceEdgeKind(chain, edge)
      relations.push(
        {
          from: from.id,
          to: id,
          kind,
          dependency: edge.kind === 'requires',
          evidence,
        },
        {
          from: id,
          to: to.id,
          kind,
          dependency: edge.kind === 'requires',
          evidence,
        }
      )
      bypasses.set(pairKey(from.id, to.id), id)
    }
  }
  appendBusinessStateSteps(catalog, nodes, relations)
  appendGranularBusinessSteps(catalog, nodes, relations)
  appendFinanceDocumentBranches(catalog, nodes, relations)
  appendPaymentAllocationBranches(catalog, nodes, relations)
  appendBusinessProcessNodes(catalog, nodes, relations)
  governBusinessChainNodes(catalog, nodes)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  if (byId.size !== nodes.length) {
    throw new Error('Duplicate chain design node identity')
  }
  for (const edge of relations) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from.processNode || !to.processNode) continue
    if (to.rejectionCommand || (from.rejectionCommand && to.terminal)) edge.kind = 'exception'
    const detail = to.atomicEvidence
    edge.evidence = {
      ...detail,
      guards: unique([...edge.evidence.guards, ...detail.guards]),
    }
  }
  // A step-to-step relation is a projection through a registered shared object.
  // Keep its source path so the UI can explain the handoff, not infer chronology.
  // A registered process entry is the concrete continuation of its source submission.
  for (const node of nodes.filter(
    (item) =>
      item.splitInto &&
      item.splitMode === 'branches' &&
      item.id.startsWith('step:')
  )) {
    const children = node.splitInto.map((id) => byId.get(id))
    if (
      !children.length ||
      !children.every(
        (child) =>
          child.processNode &&
          child.entry &&
          child.source.type === 'domain_command'
      )
    ) {
      continue
    }
    const source = relations.find((edge) => edge.to === node.id)
    if (source) {
      for (const child of children) relations.push({ ...source, to: child.id })
    }
  }
  for (const node of nodes.filter(
    (item) =>
      item.id.startsWith('step:') &&
      item.type === 'business_action' &&
      !item.splitInto &&
      item.source.key.includes(':starts_process:')
  )) {
    for (const id of node.relatedNodeIds || []) {
      const task = byId.get(id)
      if (task.processNode && task.entry && task.type === 'task') {
        const source = relations.find((edge) => edge.from === node.id)
        relations.push({ ...source, from: node.id, to: id })
      }
    }
  }
  const paymentEntry = nodes.find(
    (node) => node.processNode?.nodeKey === 'finance_payment_approval'
  )
  for (const node of nodes.filter(
    (item) => item.conceptKey === 'submit_finance_payment'
  )) {
    relations.push({
      from: node.id,
      to: paymentEntry.id,
      kind: 'known',
      evidence: node.atomicEvidence,
    })
  }
  // A terminal business result follows the single registered command for its step.
  // The collapsed step itself is absent from the explorable graph.
  for (const edge of [...relations]) {
    const step = byId.get(edge.from)
    const result = byId.get(edge.to)
    if (!result.terminal || result.type !== 'result' || step.splitInto?.length !== 1 ||
      step.source.toNodeKey !== result.source.key) continue
    const command = byId.get(step.splitInto[0])
    if (command.processNode && command.source.type === 'domain_command') {
      relations.push({ ...edge, from: command.id })
    }
  }
  const canonical = (id) => byId.get(id).representedBy || id
  const explorationRelations = [
    ...new Map(
      relations
        .map((edge) => ({
          ...edge,
          from: canonical(edge.from),
          to: canonical(edge.to),
        }))
        .filter((edge) => edge.from !== edge.to)
        .map((edge) => [pairKey(edge.from, edge.to), edge])
    ).values(),
  ]
  const stepRelations = []
  for (const edge of explorationRelations) {
    if (
      isBusinessChainStep(byId.get(edge.from)) &&
      isBusinessChainStep(byId.get(edge.to))
    ) {
      stepRelations.push(edge)
    }
  }
  for (const first of explorationRelations) {
    if (
      !isBusinessChainStep(byId.get(first.from)) ||
      isBusinessChainStep(byId.get(first.to))
    ) {
      continue
    }
    for (const second of explorationRelations.filter(
      (edge) => edge.from === first.to
    )) {
      if (
        first.from === second.to ||
        !isBusinessChainStep(byId.get(second.to))
      ) {
        continue
      }
      stepRelations.push({
        from: first.from,
        to: second.to,
        kind: businessChainPathKind([first.kind, second.kind]),
        dependency: first.dependency || second.dependency,
        paths: [[first, second]],
        evidence: { ...second.evidence, via: byId.get(first.to).label },
      })
    }
  }
  const chains = catalog.businessChains.map(({ key, label }) => ({
    value: key,
    label,
  }))
  const chainOptionGroups = groupBusinessChainOptions(catalog.businessChainOverview, chains)
  return {
    nodes,
    salesAcceptanceVariants: catalog.processDefinitions.filter((definition) => definition.processKey === 'sales_order_acceptance'),
    overview: catalog.businessChainOverview,
    chainDefinitions: new Map(catalog.businessChains.map((chain) => [chain.key, chain])),
    entries: buildBusinessChainNodeEntries(nodes),
    byId,
    relations,
    explorationRelations,
    stepRelations,
    byPair: new Map(
      [...relations, ...explorationRelations, ...stepRelations].map((edge) => [
        pairKey(edge.from, edge.to),
        edge,
      ])
    ),
    bypasses,
    chains,
    chainOptionGroups,
    roles: unique(nodes.flatMap((node) => node.roles)).map((key) => ({
      value: key,
      label: businessChainRoleLabel(catalog, key),
    })),
  }
}

export function assessBusinessChainConnection(library, from, to) {
  if (!library.byId.has(from) || !library.byId.has(to)) {
    throw new Error('Unknown chain design node')
  }
  if (from === to) {
    return {
      status: 'blocked',
      reason: '同一个节点不能连接到自己。状态内的变化请查看“状态”。',
    }
  }
  const relation = library.byPair.get(pairKey(from, to))
  if (relation) {
    return {
      status: 'known',
      reason: '现有链路登记了这个方向；仍须满足对应动作的接入条件。',
      relation,
    }
  }
  const action = library.bypasses.get(pairKey(from, to))
  if (action) {
    return {
      status: 'blocked',
      reason: `这两个对象之间需要“${library.byId.get(action).label}”动作，不能省略动作直接连通。`,
      action,
    }
  }
  if (library.byId.get(from).terminal) {
    return {
      status: 'blocked',
      reason:
        '此节点是当前链路明确登记的终止结果，不能把它作为继续办理的起点。',
    }
  }
  return {
    status: 'unknown',
    reason:
      '当前链路目录没有登记这个接点，尚不能判断是否允许。可保留无方向的参考线，待核对具体业务动作与条件。',
  }
}

export const emptyBusinessChainDraft = () => ({
  nodes: [],
  edges: [],
})

export function addBusinessChainDraftEdge(draft, library, from, to) {
  const result = assessBusinessChainConnection(library, from, to)
  if (result.status === 'blocked') return draft
  if (![from, to].every((id) => draft.nodes.some((node) => node.id === id))) {
    return draft
  }
  if (
    draft.edges.some(
      (edge) =>
        (edge.from === from && edge.to === to) ||
        (edge.kind === 'unknown' && edge.from === to && edge.to === from)
    )
  ) {
    return draft
  }
  return {
    ...draft,
    edges: [...draft.edges, { from, to, kind: result.status }],
  }
}

export function parseBusinessChainDraft(raw, library) {
  const draft = JSON.parse(raw)
  if (
    !draft ||
    !Array.isArray(draft.nodes) ||
    !Array.isArray(draft.edges)
  ) {
    throw new Error('Invalid chain design draft')
  }
  const ids = new Set()
  for (const node of draft.nodes) {
    if (
      !library.byId.has(node.id) ||
      ids.has(node.id) ||
      ![node.x, node.y].every(Number.isFinite) ||
      (node.manual !== undefined && typeof node.manual !== 'boolean')
    ) {
      throw new Error('Invalid chain design node')
    }
    ids.add(node.id)
  }
  const pairs = new Set()
  for (const edge of draft.edges) {
    const key =
      edge.kind === 'unknown'
        ? pairKey(...[edge.from, edge.to].sort())
        : pairKey(edge.from, edge.to)
    if (
      !ids.has(edge.from) ||
      !ids.has(edge.to) ||
      pairs.has(key) ||
      !['known', 'unknown'].includes(edge.kind)
    ) {
      throw new Error('Invalid chain design relation')
    }
    const assessment = assessBusinessChainConnection(
      library,
      edge.from,
      edge.to
    )
    if (
      assessment.status === 'blocked' ||
      (edge.kind === 'known' && assessment.status !== 'known')
    ) {
      throw new Error('Outdated chain design relation')
    }
    pairs.add(key)
  }
  const savedRoles = draft.presentation?.highlightedRoles
  const legacyRole = draft.presentation?.role
  // Older saved views stored one role in the browser's working draft.
  const highlightedRoles = savedRoles === undefined && typeof legacyRole === 'string'
    ? legacyRole ? [legacyRole] : []
    : savedRoles
  if (
    draft.presentation &&
    (!['overview', 'mainline', 'all'].includes(draft.presentation.mode) ||
      !Array.isArray(highlightedRoles) ||
      new Set(highlightedRoles).size !== highlightedRoles.length ||
      highlightedRoles.some((key) => typeof key !== 'string' || !key) ||
      (draft.presentation.layout !== undefined && !['flow', 'lanes'].includes(draft.presentation.layout)) ||
      (draft.presentation.direction !== undefined && !['LR', 'TB'].includes(draft.presentation.direction)) ||
      (draft.presentation.salesAcceptanceVariant !== undefined &&
        !library.salesAcceptanceVariants.some(({ key }) => key === draft.presentation.salesAcceptanceVariant)) ||
      (draft.presentation.showBranches !== undefined && typeof draft.presentation.showBranches !== 'boolean') ||
      (draft.presentation.layers !== undefined && (!Array.isArray(draft.presentation.layers) ||
        new Set(draft.presentation.layers).size !== draft.presentation.layers.length ||
        draft.presentation.layers.some((key) => !CHAIN_READING_LAYERS.some((layer) => layer.value === key)))))
  ) {
    throw new Error('Invalid exploration presentation')
  }
  // Store the reading view, never copies of business conditions or state rules.
  return {
    nodes: draft.nodes.map(({ id, x, y, manual }) => ({
      id,
      x,
      y,
      ...(manual ? { manual: true } : {}),
    })),
    edges: draft.edges.map(({ from, to, kind }) => ({ from, to, kind })),
    ...(draft.map
      ? { map: parseBusinessChainMap(draft.map, library, ids) }
      : {}),
    ...(draft.presentation
      ? {
          presentation: {
            mode: draft.presentation.mode,
            highlightedRoles: highlightedRoles.filter((key) => library.roles.some(({ value }) => value === key)),
            ...(draft.presentation.layout ? { layout: draft.presentation.layout } : {}),
            ...(draft.presentation.salesAcceptanceVariant ? { salesAcceptanceVariant: draft.presentation.salesAcceptanceVariant } : {}),
            ...(draft.presentation.direction ? { direction: draft.presentation.direction } : {}),
            ...(draft.presentation.showBranches ? { layers: CHAIN_READING_LAYERS.map(({ value }) => value) } :
              draft.presentation.layers ? { layers: [...draft.presentation.layers] } : {}),
          },
        }
      : {}),
  }
}
