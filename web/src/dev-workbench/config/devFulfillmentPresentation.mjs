import { fulfillmentExceptionPath, fulfillmentStepMatchesRole } from '../../erp/utils/workflowFulfillment.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentExceptionGraph } from './devFulfillmentExceptionGraph.mjs'

const STAGE_COPY = Object.freeze({
  sales_order: ['接单与用料审批', '工程 / 审批'],
  customer_advance: ['客户首款与分期', '按订单约定'],
  purchasing: ['采购', ''],
  supplier_advance: ['采购 / 委外首付', '按合同约定'],
  purchase_count: ['到货点数', ''],
  incoming_quality: ['来料检验与入库', ''],
  cutting_issue: ['发料外发裁片', ''],
  cutting_return: ['裁片回货点数', ''],
  cutting_quality: ['裁片颜色 / 尺寸检验', ''],
  sewing_execute: ['安排车缝', '本厂 / 委外'],
  shell_quality: ['皮套检验', ''],
  handwork_execute: ['安排手工', '本厂 / 委外'],
  finished_inbound: ['正式成品入库', ''],
  finished_quality: ['成品质检关口', '按工艺及订单'],
  packaging: ['查货与包装', ''],
  shipment: ['放行与实际发货', ''],
  financial_settlement: ['尾款、对账与结清', ''],
})

const PHASES = Object.freeze([
  { key: 'preparation', label: '接单与备料', stages: ['sales_order', 'purchasing', 'purchase_count', 'incoming_quality'], branches: ['customer_advance', 'supplier_advance'] },
  { key: 'production', label: '加工生产', stages: ['cutting_issue', 'cutting_return', 'cutting_quality', 'sewing_execute', 'shell_quality', 'handwork_execute'], branches: [] },
  { key: 'delivery', label: '入库与交付', stages: ['finished_inbound', 'finished_quality', 'packaging', 'shipment', 'financial_settlement'], branches: [] },
])

const RELATED_STAGES = Object.freeze({
  sales_order: [['customer_advance', '约定客户首款时']],
  purchasing: [['supplier_advance', '约定采购预付款时']],
  customer_advance: [['sales_order', '订单约定'], ['shipment', '发货前收款'], ['financial_settlement', '出货后抵扣']],
  supplier_advance: [['purchasing', '采购约定'], ['cutting_issue', '裁片合同'], ['sewing_execute', '车缝委外'], ['handwork_execute', '手工委外'], ['financial_settlement', '后续抵扣']],
  cutting_issue: [['supplier_advance', '合同约定首付款时']],
  sewing_execute: [['supplier_advance', '合同约定首付款时']],
  handwork_execute: [['supplier_advance', '合同约定首付款时']],
  shipment: [['customer_advance', '约定发货前收款时']],
  financial_settlement: [['customer_advance', '预收款来源'], ['supplier_advance', '预付款来源']],
})

export function getFulfillmentStageCopy(step) {
  const [label, hint] = STAGE_COPY[step.stage] || [step.label, step.branch ? '条件分支' : '']
  return { label, hint }
}

// These groups locate the existing stages; they do not add execution edges.
export function buildFulfillmentOverview(steps) {
  const entries = new Map(steps.map((step, index) => [step.stage, { step, number: index + 1, ...getFulfillmentStageCopy(step) }]))
  return PHASES.map((phase) => ({
    key: phase.key,
    label: phase.label,
    stages: phase.stages.map((key) => entries.get(key)).filter(Boolean),
    branches: phase.branches.map((key) => entries.get(key)).filter(Boolean),
  }))
}

export function getFulfillmentStageContext(steps, stage) {
  const main = PHASES.flatMap((phase) => phase.stages).map((key) => steps.find((step) => step.stage === key)).filter(Boolean)
  const index = main.findIndex((step) => step.stage === stage)
  return {
    previous: index > 0 ? main[index - 1] : null,
    next: index >= 0 && index < main.length - 1 ? main[index + 1] : null,
    related: (RELATED_STAGES[stage] || []).flatMap(([key, label]) => {
      const step = steps.find((item) => item.stage === key)
      return step ? [{ step, label }] : []
    }),
  }
}

export function selectFulfillmentSubstep(flow, requestedKey, role) {
  return flow.nodes.find((node) => node.key === requestedKey)
    || flow.nodes.find((node) => fulfillmentStepMatchesRole(node, role))
    || flow.nodes[0]
}

export function buildFulfillmentExceptionDirectory(guides, role, stage) {
  return guides.map((guide) => ({
    guide,
    stages: catalog.fulfillment_flow.filter((step) => step.handling?.guides.includes(guide.key)),
    related: catalog.fulfillment_flow.some((step) => step.stage === stage && step.handling?.guides.includes(guide.key)),
    roleMatch: guide.plans.some((plan) => fulfillmentExceptionPath(guide, plan.key).steps.some((step) => fulfillmentStepMatchesRole(step, role))),
  })).sort((a, b) => Number(b.related) - Number(a.related) || Number(b.roleMatch) - Number(a.roleMatch))
}

// A directory selection has no originating stage. Only an explicit context may
// supply an origin-dependent return; a choice among several plans stays empty.
export function selectFulfillmentException({ guideKey, planKey, originStage, stepKey, role = 'all' }) {
  const guide = catalog.exception_guides.find((item) => item.key === guideKey)
  if (!guide) return { invalid: '未登记的异常类型' }
  if (originStage && !guide.entry_stages.includes(originStage)) return { invalid: '该环节不适用于当前异常类型' }
  if (planKey && !guide.plans.some((item) => item.key === planKey)) return { invalid: '处理方式不属于当前异常类型' }
  const plan = guide.plans.find((item) => item.key === planKey) || (guide.plans.length === 1 ? guide.plans[0] : null)
  const origin = catalog.fulfillment_flow.find((item) => item.stage === originStage) || null
  const related = catalog.fulfillment_flow.filter((item) => item.handling?.guides.includes(guide.key))
  if (!plan) return { guide, plan: null, origin, related, steps: [] }
  const { steps } = fulfillmentExceptionPath(guide, plan.key)
  const graph = buildFulfillmentExceptionGraph(guide, { planKey: plan.key, originStage, overview: true })
  const { target } = plan.continuation
  const returnStage = graph?.returnStage || catalog.fulfillment_flow.find((item) => item.stage === target) || null
  const reentryStage = catalog.fulfillment_flow.find((item) => item.stage === plan.continuation.reentry?.stage) || null
  return {
    guide,
    plan,
    origin,
    related,
    graph,
    steps,
    returnStage,
    reentryStage,
    selected: graph.nodes.find((item) => item.key === stepKey) || steps.find((item) => fulfillmentStepMatchesRole(item, role)) || steps[0],
  }
}

export function getFulfillmentSupplement(step) {
  const references = new Set(step.subflow?.nodes.flatMap((node) => node.detail_refs) || [])
  return {
    handoffs: (step.handoffs || []).filter((_, index) => !references.has(`handoff:${index}`)),
    approvals: (step.approvals || []).filter((_, index) => !references.has(`approval:${index}`)),
    exception: references.has('exception') ? '' : step.exception,
  }
}

const SUBSTEP_COPY = Object.freeze({
  接单与资料准备: '接单准备',
  销售订单审批: '订单审批',
  '工程资料、BOM 与打样': '工程 / BOM / 打样',
  '订单、样品、BOM 就绪': '订单 / 样品 / BOM 齐备',
  工程提交用料: '提交用料',
  老板审核用料: '老板审核用料',
  按厂商生成采购单: '生成采购单',
  取消本次已提交订单: '取消本次已提交订单',
  工程修改并重新提交: '修改后重提',
  登记订单预收款: '登记预收款',
  登记订单预付款: '登记预付款',
  财务办理执行待办: '办理执行待办',
  核对原因后重新申请: '核对后重提',
  保留订单预收余额: '保留预收余额',
  核对采购或委外约定: '核对采购 / 委外约定',
  采购下单与到货跟进: '下单与到货跟进',
  仓库确认材料入库: '确认材料入库',
  安排加工与回货要求: '排期与加工要求',
  仓库核对并实际发料: '核对并实际发料',
  'IQC 检验并记录结论': 'IQC 检验',
  业务提出异常处置方案: '业务提出异常方案',
  生产经理安排车缝: '选择车缝方式',
  生产经理安排手工: '选择手工方式',
  本厂工序办理与交接: '本厂办理与交接',
  回货按整批实点: '回货整批实点',
  仓库清点手工产出: '清点手工产出',
  成品检验与规定关口: '成品检验 / 规定关口',
  业务确认包装版本: '确认包装版本',
  仓库查货与包装: '查货与包装',
  业务准备出货单: '准备出货单',
  业务确认实际发货: '确认实际发货',
  减少库存并形成应收来源: '扣库存 / 应收来源',
  预收预付按订单抵扣: '预收预付抵扣',
  核对余额并跟进尾款: '核对余额 / 跟进尾款',
  财务执行并确认收付: '执行并确认收付',
  核对剩余未结余额: '核对未结余额',
  余额核清后结算结束: '余额核清 / 结束',
})

export const getFulfillmentSubstepCopy = (node) => SUBSTEP_COPY[node.label] || node.label
