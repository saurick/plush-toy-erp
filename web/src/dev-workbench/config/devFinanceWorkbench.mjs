import { BUSINESS_RULES } from '../../../../scripts/qa/lib/business-rule-catalog.mjs'

// This is a navigation projection over registered chains, not another chain or ledger.
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
        '先取消冻结来源的应付草稿，再办理采购退货或入库调整，之后重新生成草稿。入库调整含移库与批次修正。',
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
  terms: [
    ['订单结算快照', '冻结结算方式与天数', '按订单冻结的结算方式与天数计算，默认值变化不重算已有账款。'],
    ['账款到期日', '月结按月末加约定天数', '月结以业务发生所在中国自然月的月末为基准；实际到期时间取服务端冻结记录。'],
    ['入账与冲回记录', '按入账、冲回时间取数', '各笔记录按入账、冲回时间归入指定中国日期期间。'],
    ['期间对账', '核对期初、本期和期末', '按往来方和币种核对期间余额，核销不重复计入收付款金额。'],
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
      '审批责任以生效客户配置和流程冻结结果为准。审批通过后，由财务显式过账。',
      '审批通过',
    ],
    [
      '财务执行或纠错',
      '独立权限与审计',
      '具备执行权限的岗位办理过账。调整、冲销和退款保留原因及关联记录。',
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

export const PURCHASE_FINANCE_STAGES = [
  { value: 'none', label: '尚未生成' },
  { value: 'draft', label: '草稿' },
  { value: 'posted', label: '已过账或结清' },
]

export const PURCHASE_FINANCE_CHANGES = [
  { value: 'return', label: '采购退货' },
  { value: 'increase', label: '数量调增' },
  { value: 'transfer', label: '移库或批次修正' },
]

// A step's optional third item labels the condition for moving to the next step.
export function purchaseFinanceScenario(stage, change) {
  const stageOption = PURCHASE_FINANCE_STAGES.find(
    (option) => option.value === stage
  )
  const source = PURCHASE_FINANCE_CHANGES.find(
    (option) => option.value === change
  )
  if (!stageOption || !source) return null

  const selection = { stageLabel: stageOption.label, changeLabel: source.label }
  const stockOnly = change === 'transfer'
  const sourceStep = stockOnly ? '过账库存修正' : `${source.label}过账`
  const sourceNote = stockOnly
    ? '仓库通过采购入库调整修正库存位置或批次，计价仍按原有效数量和确认单价。'
    : `仓库按库存规则办理${source.label}并过账，正式来源保留本次数量变化。`

  if (stage === 'draft') {
    return {
      ...selection,
      title: `先取消应付草稿，再办理${stockOnly ? '库存修正' : source.label}`,
      steps: [
        ['应付草稿', '原应付草稿已冻结入库来源和金额。'],
        ['取消应付草稿', '财务先取消冻结来源的草稿，原快照和取消原因留存。'],
        [sourceStep, sourceNote],
        [
          '重新生成草稿',
          stockOnly
            ? '修正库存后，按有效入库数量和原确认单价重新生成应付草稿。'
            : `按${source.label}后的净来源和原确认单价重新生成应付草稿。`,
        ],
      ],
      responsibility: `财务取消并重新生成应付草稿，仓库过账${stockOnly ? '库存修正' : source.label}。`,
      impact: stockOnly
        ? '库存位置或批次更新，重建草稿沿用原有效数量及确认单价。'
        : '重新生成的草稿按净来源计价，财务确认后独立过账。',
    }
  }
  if (stage === 'none') {
    return {
      ...selection,
      title: stockOnly ? '库存修正后，首次应付按原计价' : '首次应付纳入净来源',
      steps: [
        ['已过账入库', '首次应付取正式已入库行的有效数量与确认单价。'],
        [sourceStep, sourceNote],
        stockOnly
          ? [
              '库存位置或批次更新',
              '修正结果归库存记录，首次应付按原有效入库数量计价。',
            ]
          : ['形成净来源金额', '按有效入库、退货和数量调整形成首次计价来源。'],
        ['生成应付草稿', '按有效来源与确认单价生成草稿，财务确认后独立过账。'],
      ],
      responsibility: `仓库过账${stockOnly ? '库存修正' : source.label}，财务按有效来源生成应付。`,
      impact: stockOnly
        ? '首次应付按有效入库数量和确认单价计价。'
        : '首次应付已包含本次数量变化。',
    }
  }
  if (stockOnly) {
    return {
      ...selection,
      title: '修正库存位置或批次，账款差额为零',
      steps: [
        ['已过账入库', '已过账的入库记录提供本次库存修正的来源。'],
        [sourceStep, sourceNote],
        ['库存位置或批次更新', '新位置或批次通过库存调整记录追溯。'],
        [
          '账款差额为零',
          '本次修正后的有效数量和确认单价相同，账款按原记录查询。',
        ],
      ],
      responsibility: '仓库办理采购入库调整。',
      impact: '库存位置或批次更新，账款、核销与资金取各自原记录。',
    }
  }
  return change === 'increase'
    ? {
        ...selection,
        title: '追加调增，可重新打开已结清应付',
        steps: [
          ['数量调增已过账', sourceNote],
          ['采购待调整', '已过账的调增进入原应付的待确认来源。'],
          [
            '核对来源与重复',
            '服务端按原确认单价与新增数量重算，同一来源仅确认一次。',
            '本次差额尚未确认',
          ],
          [
            '财务确认调增',
            '财务确认差额后增加未结余额，已结清应付可重新打开。',
          ],
        ],
        responsibility: '仓库过账数量调增，财务确认账款差额。',
        impact: '增加未结余额。调增余额已使用时，冲回前先解除后续依赖。',
      }
    : {
        ...selection,
        title: '调减前核对未核销余额',
        steps: [
          ['采购退货已过账', sourceNote],
          ['采购待调整', '已过账的退货进入原应付的待确认来源。'],
          [
            '核对核销依赖',
            '调减金额超过未核销余额时，先撤销足额核销记录。',
            '未核销余额足够',
          ],
          [
            '财务确认调减',
            '财务对原应付追加调减记录。真实资金退回另建退款单。',
          ],
        ],
        responsibility: '仓库过账采购退货，财务确认账款差额。',
        impact: '追加调减记录。发生资金退回时单独登记退款。',
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
