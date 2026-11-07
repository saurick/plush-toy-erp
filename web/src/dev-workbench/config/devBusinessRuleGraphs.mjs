// Read-only diagrams project the selected rule; they never define executable transitions.
export function buildMasterLifecycleGraph(rule) {
  return {
    direction: 'LR',
    nodes: [
      { key: 'active', label: '启用', summary: rule.condition },
      { key: 'inactive', label: '停用', summary: rule.effect },
      { key: 'history', label: '历史引用保留', summary: rule.recovery },
    ],
    edges: [
      {
        from: 'active',
        to: 'inactive',
        label: '停用',
        condition: `${rule.condition} 受阻时：${rule.blocked}`,
      },
      {
        from: 'inactive',
        to: 'active',
        label: '重新启用',
        condition: rule.recovery,
      },
      {
        from: 'inactive',
        to: 'history',
        label: '保留历史',
        condition: rule.effect,
        kind: 'reference',
      },
    ],
  }
}

export function buildFactRuleGraph(fact) {
  return {
    direction: 'LR',
    nodes: [
      { key: 'source', label: '来源单据', summary: fact.sourceDocument },
      { key: 'fact', label: fact.label, summary: fact.occurrenceCondition },
      { key: 'voucher', label: '结果凭证', summary: fact.voucher },
      { key: 'impact', label: '业务影响', summary: fact.businessImpact },
      { key: 'correction', label: '纠正方式', summary: fact.correction },
    ],
    edges: [
      {
        from: 'source',
        to: 'fact',
        label: '满足生效条件',
        condition: fact.occurrenceCondition,
      },
      {
        from: 'fact',
        to: 'voucher',
        label: '保留凭证',
        condition: fact.voucher,
      },
      {
        from: 'fact',
        to: 'impact',
        label: '业务影响',
        condition: fact.businessImpact,
      },
      {
        from: 'fact',
        to: 'correction',
        label: '按所属规则纠正',
        condition: fact.correction,
        branch: true,
      },
    ],
  }
}

export function buildActionRelationGraph(action) {
  return {
    direction: 'LR',
    nodes: [
      { key: 'input', label: '上游输入', summary: action.input },
      { key: 'action', label: action.label, summary: action.condition },
      { key: 'result', label: '下游结果', summary: action.result },
    ],
    edges: [
      {
        from: 'input',
        to: 'action',
        label: '输入与条件',
        condition: [action.input, action.condition].filter(Boolean).join('；'),
      },
      {
        from: 'action',
        to: 'result',
        label: '办理结果',
        condition: action.result,
      },
    ],
  }
}
