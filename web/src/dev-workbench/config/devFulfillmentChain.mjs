import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentOverview, getFulfillmentStageContext } from './devFulfillmentPresentation.mjs'

const flow = catalog.fulfillment_flow
const phases = buildFulfillmentOverview(flow)
const main = phases.filter((phase) => phase.key !== 'unclassified').flatMap((phase) => phase.stages)

export function buildFulfillmentChain() {
  return {
    phases: phases.map((phase) => ({ ...phase, entries: [...phase.stages, ...phase.branches].sort((a, b) => a.number - b.number) })),
    readingEdges: main.slice(1).map((entry, index) => ({ from: main[index].step.stage, to: entry.step.stage })),
    conditionalEdges: phases.flatMap((phase) => phase.branches.map(({ step }) => ({ from: getFulfillmentStageContext(flow, step.stage).related[0].step.stage, to: step.stage }))),
    independent: catalog.exception_guides.filter((item) => !item.entry_stages.length),
  }
}

export const fulfillmentChainColumns = (width) => width >= 650 ? 6 : width >= 440 ? 3 : 2

const point = (rect) => ({ ...rect, cx: rect.x + rect.width / 2, right: rect.x + rect.width, bottom: rect.y + rect.height })

// Rectangles are measured from the rendered grid; paths never infer execution progress.
export function buildFulfillmentChainWires(model, geometry) {
  const { width = 0, height = 0, stages = {} } = geometry
  const paths = []
  if (!width || !height) return { paths }
  const boxes = new Map(Object.entries(stages).filter(([, rect]) => rect.width && rect.height).map(([key, rect]) => [key, point(rect)]))
  const add = (key, d, kind = 'main', extra = {}) => paths.push({ key, d, kind, ...extra })
  for (const edge of model.readingEdges) {
    const a = boxes.get(edge.from)
    const b = boxes.get(edge.to)
    if (!a || !b) continue
    const sameRow = Math.abs(a.y - b.y) < 8 && b.x > a.x
    const endX = sameRow ? b.x : width - 5
    const centerY = a.y + Math.min(31, a.height / 2)
    const crossed = [...boxes.values()].filter((box) => box.x >= a.right && box.right <= endX && box.y < centerY && box.bottom > a.y)
    const y = Math.min(centerY, ...crossed.map((box) => box.y - 8))
    const d = sameRow ? `M ${a.right} ${y} H ${b.x - 3}`
      : `M ${a.right} ${y} H ${width - 5} V ${b.y - 8} H ${b.cx} V ${b.y - 3}`
    add(`${edge.from}:${edge.to}`, d, 'main', { from: edge.from, to: edge.to })
  }
  for (const edge of model.conditionalEdges) {
    const a = boxes.get(edge.from)
    const b = boxes.get(edge.to)
    if (a && b) {
      const startY = a.y + Math.min(29, a.height / 2)
      const endY = b.y + Math.min(29, b.height / 2)
      const d = b.x > a.right ? `M ${a.right} ${startY} H ${b.x - 8} V ${endY} H ${b.x - 3}`
        : `M ${a.cx} ${a.y} V ${a.y - 8} H 3 V ${endY} H ${b.x - 3}`
      add(`conditional:${edge.to}`, d, 'main', { conditional: true, from: edge.from, to: edge.to })
    }
  }
  return { paths }
}
