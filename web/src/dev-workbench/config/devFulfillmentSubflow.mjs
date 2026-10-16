import { getRoleDisplayName } from '../../erp/utils/roleKeys.mjs'
import { fulfillmentStepMatchesRole } from '../../erp/utils/workflowFulfillment.mjs'
import { getFulfillmentSubstepCopy } from './devFulfillmentPresentation.mjs'

const escapeLabel = (value) => String(value)
  .replaceAll('&', '#amp;')
  .replaceAll('"', '#quot;')
  .replaceAll('<', '#lt;')
  .replaceAll('>', '#gt;')
  .replaceAll('\n', ' ')

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

export function buildSubflowMermaid(flow, { role = 'all', compact = false, direction = 'TB' } = {}) {
  const ids = new Map(flow.nodes.map((node, index) => [node.key, `N${index}`]))
  if (ids.size !== flow.nodes.length) throw new Error('Duplicate subflow nodes')
  const lines = ['---', 'config:', '  flowchart:', '    nodeSpacing: 24', '    rankSpacing: 28', '---', `flowchart ${direction === 'LR' ? 'LR' : 'TB'}`]
  for (const node of flow.nodes) {
    const label = compact ? getFulfillmentSubstepCopy(node) : node.label
    const owner = compact && node.role ? `<br/>${escapeLabel(node.role)}` : ''
    lines.push(`  ${ids.get(node.key)}["${escapeLabel(label)}${owner}"]`)
    if (role !== 'all' && fulfillmentStepMatchesRole(node, role)) {
      lines.push(`  class ${ids.get(node.key)} fulfillmentRoleMatch`)
    }
  }
  for (const edge of flow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error('Unknown subflow edge endpoint')
    lines.push(`  ${ids.get(edge.from)} -->${edge.label ? `|"${escapeLabel(edge.label)}"|` : ''} ${ids.get(edge.to)}`)
  }
  return {
    chart: lines.join('\n'),
    nodes: flow.nodes.map((node) => ({ id: ids.get(node.key), key: node.key, label: node.label })),
  }
}
