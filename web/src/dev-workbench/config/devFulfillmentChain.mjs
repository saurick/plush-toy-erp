import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentOverview, getFulfillmentStageContext } from './devFulfillmentPresentation.mjs'
import { buildFulfillmentExceptionGraph } from './devFulfillmentExceptionGraph.mjs'

const flow = catalog.fulfillment_flow
const phases = buildFulfillmentOverview(flow)
const main = phases.flatMap((phase) => phase.stages)

export function buildFulfillmentChain({ exceptionKey, planKey, originStage, previousStage } = {}) {
  const guide = catalog.exception_guides.find((item) => item.key === exceptionKey)
  const exception = !exceptionKey ? null : !guide ? { invalid: true, reason: '未登记的异常来源' }
    : planKey && !guide.plans.some((plan) => plan.key === planKey) ? { invalid: true, reason: '处理方案不属于当前异常来源' }
    : buildFulfillmentExceptionGraph(guide, { planKey, originStage, previousStage })
  if (exception && !exception.invalid) {
    exception.resume = exception.reentryStage || exception.returnStage
    exception.terminal = exception.nodes.find((node) => node.kind === 'terminal') || null
    exception.repeat = exception.reentryStage && exception.returnStage
      ? flow.slice(flow.indexOf(exception.reentryStage), flow.indexOf(exception.returnStage) + 1).map((stage) => stage.stage) : []
  }
  return {
    phases: phases.map((phase) => ({ ...phase, entries: [...phase.stages, ...phase.branches].sort((a, b) => a.number - b.number) })),
    readingEdges: main.slice(1).map((entry, index) => ({ from: main[index].step.stage, to: entry.step.stage })),
    conditionalEdges: phases.flatMap((phase) => phase.branches.map(({ step }) => ({ from: getFulfillmentStageContext(flow, step.stage).related[0].step.stage, to: step.stage }))),
    independent: catalog.exception_guides.filter((item) => !item.entry_stages.length),
    exception,
  }
}

export const fulfillmentChainColumns = (width) => width >= 650 ? 6 : width >= 440 ? 3 : 2

export function fulfillmentChainInsertion(entries, selectedStage, columns) {
  const index = entries.findIndex(({ step }) => step.stage === selectedStage)
  return index < 0 ? -1 : Math.min(entries.length - 1, (Math.floor(index / columns) + 1) * columns - 1)
}

const round = (value) => Math.round(value * 10) / 10
const point = (rect) => ({ ...rect, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, right: rect.x + rect.width, bottom: rect.y + rect.height })
const clamp = (value, low, high) => Math.max(low, Math.min(value, high))

// Rectangles are measured from the rendered grid; paths never infer execution progress.
export function buildFulfillmentChainWires(model, geometry) {
  const { width = 0, height = 0, stages = {}, exceptionEntries = {}, lane, workHeight = 74, terminalHeight = 40 } = geometry
  const paths = []
  const labels = []
  if (!width || !height) return { paths, labels, placement: null }
  const boxes = new Map(Object.entries(stages).filter(([, rect]) => rect.width && rect.height).map(([key, rect]) => [key, point(rect)]))
  const add = (key, d, kind = 'main', extra = {}) => paths.push({ key, d, kind, ...extra })
  const label = (key, text, x, y) => {
    const labelWidth = Math.min(width - 20, Math.max(68, text.length * 12 + 24))
    labels.push({ key, text, x: round(clamp(x - labelWidth / 2, 10, width - labelWidth - 10)), y: round(y), width: labelWidth })
  }
  const exception = model.exception && !model.exception.invalid ? model.exception : null
  for (const edge of model.readingEdges) {
    const a = boxes.get(edge.from)
    const b = boxes.get(edge.to)
    if (!a || !b) continue
    const kind = exception?.repeat.includes(edge.from) && exception.repeat.includes(edge.to) ? 'repeat' : 'main'
    const d = Math.abs(a.y - b.y) < 8 && b.x > a.x ? `M ${a.right} ${a.y + 31} H ${b.x - 3}`
      : Math.abs(a.x - b.x) < 8 && b.y > a.bottom ? `M ${a.cx} ${a.bottom} V ${b.y - 3}`
        : `M ${a.right} ${a.y + 31} H ${width - 5} V ${b.y - 8} H ${b.cx} V ${b.y - 3}`
    add(`${edge.from}:${edge.to}`, d, kind)
  }
  for (const edge of model.conditionalEdges) {
    const a = boxes.get(edge.from)
    const b = boxes.get(edge.to)
    if (a && b) add(`conditional:${edge.to}`, `M ${a.cx} ${a.bottom} V ${b.y - 10} H ${b.cx} V ${b.y - 3}`, 'main', { conditional: true })
  }
  if (!exception?.origin || !lane || !boxes.has(exception.origin.stage)) return { paths, labels, placement: null }
  const source = boxes.get(exception.origin.stage)
  const branchSource = exceptionEntries[exception.origin.stage] ? point(exceptionEntries[exception.origin.stage]) : source
  const workWidth = Math.min(244, lane.width * (exception.terminal ? 0.5 : 0.65))
  const terminalWidth = Math.min(152, lane.width * 0.32)
  const leftMax = exception.terminal ? lane.width - workWidth - terminalWidth - 24 : lane.width - workWidth - 4
  const left = clamp(source.cx - lane.x - workWidth / 2, 4, leftMax)
  const a = point({ x: lane.x + left, y: lane.y + 80, width: workWidth, height: workHeight })
  const placement = { left: round(left), width: round(workWidth), terminalWidth: round(terminalWidth) }
  add('exception-out', `M ${branchSource.cx} ${branchSource.bottom + 3} V ${a.y - 20} H ${a.cx} V ${a.y - 3}`, 'branch', { from: exception.origin.stage })
  label('branch-condition', exception.guide.diagram.branch_label, source.cx + 32, a.y - 38)
  const target = exception.resume && boxes.get(exception.resume.stage)
  if (target) {
    let d
    const policy = exception.plan.continuation
    const text = policy.reentry?.label || policy.label
    if (flow.indexOf(exception.resume) < flow.indexOf(exception.origin)) {
      let rowTop = target.y
      let rowBottom = target.bottom
      for (let pass = 0; pass < boxes.size; pass += 1) {
        for (const box of boxes.values()) {
          if (box.y < rowBottom && box.bottom > rowTop) {
            rowTop = Math.min(rowTop, box.y)
            rowBottom = Math.max(rowBottom, box.bottom)
          }
        }
      }
      d = `M ${a.x} ${a.cy} H 7 V ${rowBottom + 6} H ${target.cx - 14} V ${target.bottom + 3}`
      if (!exception.reentryStage) label('return-condition', text, Math.max(72, a.x / 2), a.cy - 30)
    } else if (target.y > a.bottom) {
      d = `M ${a.right} ${a.cy} H ${width - 17} V ${target.y - 9} H ${target.cx} V ${target.y - 3}`
      label('return-condition', text, width / 2, a.bottom + 6)
    } else {
      const right = Math.min(width - 14, Math.max(a.right + 24, target.cx + 28))
      d = `M ${a.right} ${a.cy} H ${right} V ${target.bottom + 6} H ${target.cx + 14} V ${target.bottom + 3}`
      label('return-condition', text, width / 2, a.bottom + 6)
    }
    add('exception-return', d, 'branch', { to: exception.resume.stage, reentry: Boolean(exception.reentryStage) })
  }
  if (exception.terminal) {
    const terminal = point({ x: lane.x + lane.width - terminalWidth - 4, y: lane.y + 97, width: terminalWidth, height: terminalHeight })
    add('exception-terminal', `M ${a.right} ${a.cy} H ${(a.right + terminal.x) / 2} V ${terminal.cy} H ${terminal.x - 3}`, 'branch', { terminal: exception.terminal.key })
  }
  return { paths, labels, placement }
}
