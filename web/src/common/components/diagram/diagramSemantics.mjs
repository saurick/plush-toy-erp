// Presentation vocabulary only; callers retain ownership of business state and relations.
export const DIAGRAM_NODE_TYPES = Object.freeze({
  task: '协同任务',
  business_action: '业务动作',
  document: '业务单据',
  record: '业务记录',
  master: '基础资料',
  group: '流程分组',
  result: '业务结果',
  rule: '接入条件',
  system: '系统处理',
  account: '账号',
  role: '岗位',
  scope: '数据范围',
  permission: '业务权限',
})

export const DIAGRAM_DOMAINS = Object.freeze({
  sales: { label: '销售', color: '#2884be' },
  engineering: { label: '工程', color: '#6870c7' },
  purchase: { label: '采购', color: '#318a9f' },
  quality: { label: '品质', color: '#a16bb5' },
  inventory: { label: '库存', color: '#46886b' },
  production: { label: '生产', color: '#b27948' },
  delivery: { label: '出货', color: '#a8758c' },
  finance: { label: '财务', color: '#a28a34' },
})

const layerTypes = {
  source_document: 'document',
  masterdata_lifecycle: 'master',
  process_runtime: 'group',
  workflow_task: 'task',
  fact_ledger: 'record',
  derived_result: 'result',
  topic: 'group',
}

export function diagramNodeType(node) {
  if (node.diagramType) {
    if (!Object.hasOwn(DIAGRAM_NODE_TYPES, node.diagramType)) {
      throw new Error(`Unknown diagram node type: ${node.diagramType}`)
    }
    return node.diagramType
  }
  // A state or an ordered step needs its name/number, not a repeated type icon.
  return layerTypes[node.kind || node.layer] || null
}

export function diagramIconLabel(label, type) {
  if (!type) return label
  if (!Object.hasOwn(DIAGRAM_NODE_TYPES, type)) {
    throw new Error(`Unknown diagram icon: ${type}`)
  }
  return `fa:fa-erp-${type.replaceAll('_', '-')} ${label}`
}

export function diagramDomainStyle(domain) {
  return DIAGRAM_DOMAINS[domain]
    ? { '--chain-domain': DIAGRAM_DOMAINS[domain].color }
    : undefined
}
