import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import {
  buildFulfillmentOverview,
  getFulfillmentStageContext,
} from './devFulfillmentPresentation.mjs'

const flow = catalog.fulfillment_flow
const phases = buildFulfillmentOverview(flow)
const main = phases
  .filter((phase) => phase.key !== 'unclassified')
  .flatMap((phase) => phase.stages)

export function buildFulfillmentChain() {
  return {
    phases: phases.map((phase) => ({
      ...phase,
      entries: [...phase.stages, ...phase.branches].sort(
        (a, b) => a.number - b.number
      ),
    })),
    readingEdges: main
      .slice(1)
      .map((entry, index) => ({
        from: main[index].step.stage,
        to: entry.step.stage,
      })),
    conditionalEdges: phases.flatMap((phase) =>
      phase.branches.map(({ step }) => ({
        from: getFulfillmentStageContext(flow, step.stage).related[0].step
          .stage,
        to: step.stage,
      }))
    ),
    independent: catalog.exception_guides.filter(
      (item) => !item.entry_stages.length
    ),
  }
}

export function buildFulfillmentPhaseGraph(
  phase,
  model = buildFulfillmentChain(),
  { selectedStage, detailID } = {}
) {
  const keys = new Set(phase.entries.map(({ step }) => step.stage))
  return {
    nodes: phase.entries.map(({ step, number }) => ({
      key: step.stage,
      label: `${number} · ${step.label}`,
      accessibleLabel: `${number} ${step.label}`,
      role_keys: step.role_keys,
      summary: step.description || step.label,
      expanded: selectedStage === step.stage,
      controls: selectedStage === step.stage ? detailID : undefined,
      data: {
        'chain-stage': step.stage,
        'fulfillment-stage': step.stage,
        'stage-card': true,
        selected: selectedStage === step.stage || undefined,
        conditional: step.branch || undefined,
      },
    })),
    edges: [
      ...model.readingEdges
        .filter((edge) => keys.has(edge.from) && keys.has(edge.to))
        .map((edge) => ({ ...edge, label: '阅读顺序' })),
      ...model.conditionalEdges
        .filter((edge) => keys.has(edge.from) && keys.has(edge.to))
        .map((edge) => ({ ...edge, label: '按约定办理', branch: true })),
    ],
  }
}
