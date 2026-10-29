import { BUSINESS_RULES } from '../../../../scripts/qa/lib/business-rule-catalog.mjs'

// This is a navigation projection over registered chains, not another chain or ledger.
export const FINANCE_RELATIONS_TOPIC_KEY = 'finance_relations'
export const FINANCE_RULES = Object.freeze([
  {
    key: 'sources',
    label: '来源与金额',
    ruleIds: ['purchase-payable-source', 'consistency-money'],
    facts: [
      [
        '销售应收与发票',
        '真实出货后按冻结来源生成；财务放行、订单批准与协同完成都不能替代实际出货。',
      ],
      [
        '采购应付',
        '按已入库行、确认单价与订单结算快照生成草稿；来源缺失或冲突时拒绝，重复请求复用原草稿；财务确认后独立过账。',
      ],
      [
        '委外加工费',
        '普通回货须已过账且质量合格或让步接收；工序委外按合同全部有效工序的验收结果与冻结金额形成应付。',
      ],
      [
        '首款与分期款',
        '可以先收付，待真实应收应付形成后抵扣；不因此提前生成账款。',
      ],
      ['金额精度', '金额按六位小数精确计算和保存，超出范围时拒绝。'],
      ['单价与缺值', '单价为空时金额也为空；清空单价同步清空金额，不把未知金额补成零。'],
    ],
    sourceRefs: [
      'server/internal/biz/operational_fact_finance_source.go',
      'server/internal/data/finance_payment_balance_repo.go',
    ],
  },
  {
    key: 'adjustments',
    label: '采购差额',
    ruleIds: ['purchase-payable-source', 'finance-atomicity'],
    facts: [
      [
        '尚未生成应付',
        '首次生成时纳入已有退货和数量差异；已经纳入原应付的来源不重复列为待调整。',
      ],
      [
        '应付为草稿',
        '先取消冻结来源的应付草稿，再办理退货或数量调整，之后重新生成草稿。',
      ],
      [
        '应付已过账或结清',
        '仓库按库存规则过账来源，财务另行确认差额；原应付金额保留，不因库存变化自动重算账款。',
      ],
      [
        '差额方向',
        '原入库确认单价乘以本次增减数量；退货调减，数量增加调增，移库或批次修正不产生账款差额。',
      ],
      [
        '核销与恢复',
        '调减超过未核销余额时，先撤销足额核销记录。冲回调整前须解除后续依赖，真实退款另行登记、审批和过账。',
      ],
    ],
    sourceRefs: [
      'server/internal/data/finance_source_adjustment_repo.go',
      'server/internal/data/finance_source_adjustment_repo_test.go',
    ],
  },
  {
    key: 'terms',
    label: '月结到期日',
    ruleIds: ['consistency-dates'],
    facts: [
      [
        '月结',
        '业务发生所在中国自然月的月末同一本地时刻，加约定的正整数天数；持久化为 UTC。',
      ],
      ['现结', '约定天数固定为 0，在业务发生时到期。'],
      ['冻结快照', '从订单读取已冻结的账期，不跟随客户或供应商默认值变化。'],
      [
        '历史修正',
        '迁移先生成可审查差异，实际应用按目标库迁移流程确认；不能静默重算所有历史记录。',
      ],
    ],
    sourceRefs: ['server/internal/biz/operational_fact_finance_source.go'],
  },
  {
    key: 'statement',
    label: '期间对账',
    ruleIds: ['finance-period-statement'],
    facts: [
      ['范围', '单一往来方、单一币种及指定中国日期期间。'],
      ['时间口径', '按入账、冲回时间读取期初、本期增减、逐笔余额和期末。'],
      ['资金口径', '包括首款与预收预付；核销只是分配，不重复记为资金增减。'],
      [
        '余额区别',
        '往来净余额和单笔账款未核销余额分别判断；不等于银行对账，不补造未录入的期初余额。',
      ],
    ],
    sourceRefs: [
      'server/internal/data/finance_statement_repo.go',
      'server/internal/data/finance_statement_repo_test.go',
    ],
  },
  {
    key: 'corrections',
    label: '取消、冲销与退款',
    ruleIds: ['finance-atomicity'],
    facts: [
      ['抵扣有误', '撤销完整核销记录，恢复款项可用余额；不会发生实际退款。'],
      [
        '收付款登记有误',
        '冲销原收付款并保留反向记录；更正后的新款项重新审批。',
      ],
      [
        '真实退款',
        '关联原款，保持同一往来方和币种，重新审批，执行时重核可退余额。',
      ],
      [
        '结清后重开',
        '核销或调整被冲回、或采购来源调增后，由后端重算未结余额。',
      ],
      [
        '已完成单笔核对',
        '可取消并保留原完成人与时间；应收、应付、发票不据此开放通用结清后取消。',
      ],
      ['提交边界', '核销不得超过当前可用余额，提交时由服务端重新核对；取消或冲销失败整体回滚，不保留部分成功。'],
    ],
    sourceRefs: [
      'server/internal/data/finance_payment_balance_repo.go',
      'server/internal/data/finance_fact_cancel_audit_postgres_test.go',
    ],
  },
  {
    key: 'permissions',
    label: '责任与凭据',
    ruleIds: ['finance-atomicity', 'finance-read-trace'],
    facts: [
      ['登记与审批', '财务登记真实收付，授权责任池审批；登记人与审批人分离。'],
      ['执行', '审批通过仍由具备执行权限的岗位显式过账。'],
      [
        '查看',
        '账款按应收、应付、发票、对账分别授权；收付款和相关记录另需收付款读取权限。',
      ],
      [
        '凭据与审计',
        '附件跟随所属收付款权限；取消、调整与冲销保留操作者、原因及反向关联。',
      ],
    ],
    sourceRefs: [
      'server/internal/biz/finance_fact_access.go',
      'server/internal/biz/finance_payment.go',
      'server/internal/service/jsonrpc_attachment_finance_access_test.go',
    ],
  },
])

export const FINANCE_RELATION_GROUPS = Object.freeze([
  {
    key: 'sales',
    label: '销售与首款',
    chainKey: 'sales_to_production',
    nodeKey: 'sales_order',
    rule: 'sources',
    summary: '付款约定进入订单快照；真实首款独立收取，之后抵扣同订单账款。',
  },
  {
    key: 'purchase',
    label: '采购、仓库与应付',
    chainKey: 'purchase_to_inventory',
    nodeKey: 'purchase_payable',
    rule: 'adjustments',
    summary: '入库与价格形成应付来源；退货和数量差额由财务另行确认。',
  },
  {
    key: 'outsourcing',
    label: '质检、委外与加工费',
    chainKey: 'outsourcing_to_inventory',
    nodeKey: 'outsourcing_payable',
    rule: 'sources',
    summary: '普通回货按质量结果；工序委外按合同有效工序验收与冻结金额结算。',
  },
  {
    key: 'shipment',
    label: '出货、应收与发票',
    chainKey: 'delivery_to_settlement',
    nodeKey: 'receivable',
    rule: 'sources',
    summary: '放行与实际出货分别判断；真实出货后才能生成应收与业务发票。',
  },
  {
    key: 'payments',
    label: '收付款、核销与退款',
    chainKey: 'finance_payment_and_reversal',
    nodeKey: 'finance_payment',
    rule: 'corrections',
    summary: '审批、实际过账、核销和退款分别留存；纠错不抹除原记录。',
  },
])

export function financeRule(key) {
  return FINANCE_RULES.find((item) => item.key === key) || FINANCE_RULES[0]
}

export function financeRuleEvidence(key) {
  const rule = financeRule(key)
  return BUSINESS_RULES.filter((item) => rule.ruleIds.includes(item.id))
}

// These lanes describe the approved reading order. Every card resolves to an
// existing chain node; the overview does not register a new business chain.
export const FINANCE_OVERVIEW_LANES = Object.freeze([
  {
    key: 'sales',
    label: '销售与出货',
    nodes: [
      {
        key: 'sales-order',
        readingStep: 1,
        label: '销售订单',
        summary: '付款约定与首款',
        topic: 'sales',
        chainKey: 'sales_to_production',
        nodeKey: 'sales_order',
      },
      {
        key: 'sales-shipped',
        readingStep: 1,
        label: '真实出货',
        summary: '放行后显式发货',
        topic: 'shipment',
        chainKey: 'delivery_to_settlement',
        nodeKey: 'shipped',
      },
      {
        key: 'sales-receivable',
        readingStep: 2,
        label: '应收／发票',
        summary: '来源与金额冻结',
        topic: 'shipment',
        chainKey: 'delivery_to_settlement',
        nodeKey: 'receivable',
        financial: true,
      },
      {
        key: 'sales-allocation',
        readingStep: 3,
        label: '收款与核销',
        summary: '同客户、同币种',
        topic: 'payments',
        chainKey: 'finance_payment_and_reversal',
        nodeKey: 'finance_allocation',
        financial: true,
      },
    ],
  },
  {
    key: 'purchase',
    label: '采购与仓库',
    nodes: [
      {
        key: 'purchase-order',
        readingStep: 0,
        label: '采购订单',
        summary: '确认单价与账期',
        topic: 'purchase',
        chainKey: 'purchase_to_inventory',
        nodeKey: 'purchase_order',
      },
      {
        key: 'purchase-inbound',
        readingStep: 1,
        label: '质检与入库',
        summary: '已入库行形成来源',
        topic: 'purchase',
        chainKey: 'purchase_to_inventory',
        nodeKey: 'purchase_lot',
        relatedNodeKeys: ['purchase_quality'],
      },
      {
        key: 'purchase-payable',
        readingStep: 2,
        label: '采购应付',
        summary: '财务确认并过账',
        topic: 'purchase',
        chainKey: 'purchase_to_inventory',
        nodeKey: 'purchase_payable',
        financial: true,
      },
      {
        key: 'purchase-allocation',
        readingStep: 3,
        label: '付款与核销',
        summary: '差额另行确认',
        topic: 'payments',
        chainKey: 'finance_payment_and_reversal',
        nodeKey: 'finance_allocation',
        financial: true,
      },
    ],
  },
  {
    key: 'outsourcing',
    label: '委外与生产',
    nodes: [
      {
        key: 'outsourcing-order',
        readingStep: 0,
        label: '委外合同',
        summary: '加工费与付款约定',
        topic: 'outsourcing',
        chainKey: 'outsourcing_to_inventory',
        nodeKey: 'outsourcing_order',
      },
      {
        key: 'outsourcing-acceptance',
        readingStep: 1,
        label: '回货／工序验收',
        summary: '按合同类型判断',
        topic: 'outsourcing',
        chainKey: 'outsourcing_to_inventory',
        nodeKey: 'outsourcing_stage',
        relatedNodeKeys: ['outsourcing_return', 'outsourcing_quality'],
      },
      {
        key: 'outsourcing-payable',
        readingStep: 2,
        label: '委外应付',
        summary: '冻结合同金额',
        topic: 'outsourcing',
        chainKey: 'outsourcing_to_inventory',
        nodeKey: 'outsourcing_payable',
        financial: true,
      },
      {
        key: 'outsourcing-allocation',
        readingStep: 3,
        label: '付款与抵扣',
        summary: '关联原合同首款',
        topic: 'payments',
        chainKey: 'finance_payment_and_reversal',
        nodeKey: 'finance_allocation',
        financial: true,
      },
    ],
  },
])

export const FINANCE_TOPIC_KEYS = Object.freeze([
  ...FINANCE_RELATION_GROUPS.map(({ key }) => key),
  'terms',
  'permissions',
])

// Short labels explain the step; only the selected step's condition is shown.
export const FINANCE_TOPIC_STEPS = Object.freeze({
  purchase: [
    [
      '采购订单',
      '确认价格与结算条件',
      '采购价格和结算快照须完整；付款约定本身不产生应付或实际付款。',
    ],
    [
      '质检与入库',
      '以已入库行为来源',
      '检验通过只确认品质；仓库另行入账，财务仅按已入库行生成应付来源。',
    ],
    [
      '采购应付',
      '财务确认后独立过账',
      '应付冻结来源与金额；仓库退货或数量调整不直接改写已过账应付，差额由财务另行确认。',
    ],
    [
      '付款与核销',
      '核对往来方与币种',
      '付款和核销分别留存；错配可撤销核销恢复余额，实际退款另行登记。',
    ],
  ],
  sales: [
    [
      '客户默认条件',
      '新建时带入',
      '客户默认条件用于新建带值；默认值变化不重算已有订单与账款。',
    ],
    [
      '订单付款快照',
      '保存业务约定',
      '以订单冻结的付款方式与天数为准，首款和分期按约定办理。',
    ],
    [
      '实际收款并审批',
      '财务显式过账',
      '尚未出货时可登记真实收到的首款，不因此提前生成应收。',
    ],
    [
      '同订单抵扣',
      '真实应收形成后',
      '首款保留可用余额，真实应收形成后按同订单、同客户、同币种核销。',
    ],
  ],
  shipment: [
    ['财务放行', '核对放行条件', '财务放行只表示允许出货，不能替代实际发货。'],
    [
      '实际出货',
      '显式完成真实发货',
      '出货前的包装、质检与协同任务完成都不能代替真实出货事实。',
    ],
    [
      '应收／业务发票',
      '按出货来源生成',
      '实际出货后按冻结来源生成；业务发票登记不代表税控开票完成。',
    ],
    [
      '收款与核销',
      '余额归零才结清',
      '收付款、核销和应收分别留存；开票不等于已收到货款。',
    ],
  ],
  outsourcing: [
    [
      '委外合同',
      '冻结价格与账期',
      '加工费、付款约定及应付金额由正式合同与验收来源决定。',
    ],
    [
      '回货或工序验收',
      '真实事实达到条件',
      '普通回货须已过账且质量合格或让步接收；工序委外须全部有效明细对应工序验收完成且数量足够。',
    ],
    [
      '生成应付草稿',
      '同合同避免重复',
      '按满足条件的来源与冻结合同金额生成，财务确认后独立过账。',
    ],
    [
      '付款与首款抵扣',
      '财务确认并核销',
      '首款可先支付，应付形成后抵扣；普通排产、领料与完工不自动生成应付。',
    ],
  ],
  payments: [
    [
      '登记真实收付',
      '关联订单或账款',
      '收付款登记真实资金，首款与账款可先独立记录。',
    ],
    [
      '审批通过',
      '不代替实际过账',
      '审批责任以生效配置与流程冻结结果为准，登记人与审批人分离。',
    ],
    [
      '财务显式过账',
      '首款保留可用余额',
      '审批通过仍需具备执行权限的岗位过账，实际退款另建退款单。',
    ],
    [
      '核销到来源',
      '往来方、币种匹配',
      '核销只分配款项；抵扣有误时撤销核销，恢复余额，不产生实际资金流。',
    ],
  ],
  permissions: [
    [
      '业务提供来源',
      '订单与收发事实',
      '业务岗位维护来源，协同任务完成不代替财务事实生效。',
    ],
    [
      '财务登记凭据',
      '附件跟随收付款',
      '附件读取遵循所属收付款与操作者权限，工作台不绕过授权。',
    ],
    [
      '授权岗位审批',
      '登记与审批分离',
      '审批责任以生效客户配置和流程冻结结果为准。',
    ],
    [
      '财务执行或纠错',
      '独立权限与审计',
      '审批通过后仍须显式过账；调整、冲销和退款保留原因及关联记录。',
    ],
  ],
})

export function buildFinanceRelationships(catalog) {
  const byKey = new Map(
    catalog.businessChains.map((chain) => [chain.key, chain])
  )
  const resolve = (item) => {
    const chain = byKey.get(item.chainKey)
    const node = chain?.nodes.find((entry) => entry.key === item.nodeKey)
    if (!node) {
      throw new Error(
        `Missing finance relationship source: ${item.chainKey}/${item.nodeKey}`
      )
    }
    return { ...item, chain, node }
  }
  return {
    groups: FINANCE_RELATION_GROUPS.map(resolve),
    lanes: FINANCE_OVERVIEW_LANES.map((lane) => ({
      ...lane,
      nodes: lane.nodes.map((item) => ({
        ...resolve(item),
        description: FINANCE_TOPIC_STEPS[item.topic][item.readingStep][2],
      })),
    })),
  }
}

export function purchaseFinanceScenario(stage, change) {
  if (
    !['none', 'draft', 'posted'].includes(stage) ||
    !['return', 'increase', 'transfer'].includes(change)
  ) {
    return null
  }
  if (change === 'transfer') {
    return {
      title: '没有账款差额',
      steps: ['采购入库', '移库或批次修正', '库存结果更新', '账款保持原值'],
      detail: '数量和确认单价未变化，不进入采购待调整。',
      impact: '库存位置或批次变化；原应付、核销和实际资金保持原记录。',
    }
  }
  if (stage === 'none') {
    return {
      title: '首次应付纳入净来源',
      steps: [
        '已过账入库',
        change === 'increase' ? '数量调增过账' : '采购退货过账',
        '净来源金额',
        '生成应付草稿',
      ],
      detail: '按有效入库、退货及数量调整形成净来源金额，确认后独立过账。',
      impact: '已纳入原应付的差异不再重复列为待调整。',
    }
  }
  if (stage === 'draft') {
    return {
      title: '先取消冻结来源的草稿',
      steps: ['应付草稿', '取消应付草稿', '来源纠错过账', '重新生成草稿'],
      detail: '草稿保留原快照与取消原因；不直接改写其冻结金额。',
      impact: '取消草稿不产生收付款、核销或库存变化。',
    }
  }
  return change === 'increase'
    ? {
        title: '追加调增，可重新打开已结清应付',
        steps: [
          '数量调增已过账',
          '采购待调整',
          '核对来源与重复',
          '财务确认调增',
        ],
        detail: '由后端根据原确认单价与新增数量重算，原应付金额保留。',
        impact: '增加未结余额；调增余额已被使用时，冲回前先解除后续依赖。',
      }
    : {
        title: '调减前核对未核销余额',
        steps: ['采购退货已过账', '采购待调整', '核对核销依赖', '财务确认调减'],
        detail: '调减金额超过未核销余额时，先撤销足额核销记录，再确认差额。',
        impact: '追加调减记录，不自动退款；真实资金退回另建退款单。',
      }
}

// Date-only illustration of the documented China-calendar rule. Actual due_at
// is read from the backend and is never calculated or overwritten by this view.
export function illustrateChinaMonthEnd(date, days) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) ||
    !Number.isSafeInteger(Number(days)) ||
    Number(days) <= 0
  ) {
    return null
  }
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(`${date}T00:00:00+08:00`)
  const monthEnd = new Date(0)
  monthEnd.setUTCFullYear(year, month, 0)
  if (
    !Number.isFinite(parsed.getTime()) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > monthEnd.getUTCDate()
  ) {
    return null
  }
  const due = new Date(monthEnd)
  due.setUTCDate(due.getUTCDate() + Number(days))
  if (!Number.isFinite(due.getTime())) return null
  return {
    monthEnd: monthEnd.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
  }
}
