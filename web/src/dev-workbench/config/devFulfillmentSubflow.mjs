import { getRoleDisplayName } from '../../erp/utils/roleKeys.mjs'

function resolveDetail(step, reference) {
  if (reference === 'result' || reference === 'exception') {
    const text = step[reference]
    if (text) return [{ label: reference === 'result' ? '完成条件与结果' : '异常处理', text }]
  }
  const [kind, position] = reference.split(':')
  const index = Number(position)
  if (!/^\d+$/u.test(position || '')) throw new Error(`Invalid subflow detail: ${reference}`)
  if (kind === 'handoff' && step.handoffs?.[index]) return [{ label: '办理与交接', text: step.handoffs[index] }]
  const approval = step.approvals?.[index]
  if (approval) {
    if (kind === 'approval') {
      return [
        { label: approval.label, text: approval.condition },
        { label: '通过', text: approval.passed },
        { label: '未通过', text: approval.rejected },
      ]
    }
    if (kind === 'approval_passed') return [{ label: `${approval.label} · 通过`, text: approval.passed }]
    if (kind === 'approval_rejected') return [{ label: `${approval.label} · 未通过`, text: approval.rejected }]
  }
  throw new Error(`Unknown subflow detail: ${step.stage}/${reference}`)
}

export function buildFulfillmentSubflow(step) {
  if (!step.subflow) return null
  return {
    direction: 'LR',
    summary: step.subflow.summary,
    nodes: step.subflow.nodes.map((node) => ({
      ...node,
      role: node.role_keys?.map(getRoleDisplayName).join(' / ') || (/审批/u.test(node.label) ? '按有效配置分派' : ''),
      details: node.detail_refs.flatMap((reference) => resolveDetail(step, reference).map((detail) => ({ ...detail, reference }))),
      exception: node.detail_refs.includes('exception'),
    })),
    edges: step.subflow.edges,
  }
}
