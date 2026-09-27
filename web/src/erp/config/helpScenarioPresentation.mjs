// 仅定义帮助的图形表达与标明的教学示例；正式步骤、完成条件和入口读取 helpScenarios。
export const HELP_OVERVIEW_LAYOUTS = {
  approvals: {
    kind: 'chain',
    exception: {
      from: 's3',
      back: 's1',
      label: '资料不足',
      title: '退回补充依据',
      owner: '来源经办岗位',
    },
  },
  'work-priority': {
    kind: 'path',
  },
  'delivery-progress': {
    kind: 'path',
  },
  customers: {
    kind: 'steps',
  },
  'sales-orders': {
    kind: 'chain',
    exception: {
      from: 's2',
      back: 's1',
      label: '审批退回',
      title: '核对并修正订单',
      owner: '销售',
    },
  },
  shipments: {
    kind: 'chain',
    exception: {
      from: 's4',
      back: 's4',
      label: '条件未满足',
      title: '核对库存、检验与放行',
      owner: '对应责任岗位',
    },
  },
  suppliers: {
    kind: 'steps',
  },
  'accessories-purchase': {
    kind: 'chain',
    exception: {
      from: 's3',
      back: 's3',
      label: '来源或数量不符',
      title: '核对采购单与可收量',
      owner: '采购 / 仓库',
    },
  },
  inbound: {
    kind: 'chain',
    exception: {
      from: 's4',
      back: 's2',
      label: '入库条件未满足',
      title: '核对实收与检验',
      owner: '仓库 / 品质',
    },
  },
  'production-orders': {
    kind: 'chain',
    exception: {
      from: 's2',
      back: 's1',
      label: '资料不完整',
      title: '补齐生产依据',
      owner: '生产',
    },
  },
  'production-materials': {
    kind: 'chain',
    exception: {
      from: 's2',
      back: 's1',
      label: '库存不足或需超领',
      title: '核对需求与库存',
      owner: '生产 / 仓库',
    },
  },
  'finished-goods': {
    kind: 'chain',
    pointMap: [0, 1, 2, 2],
    resultStep: 3,
    exception: {
      from: 's2',
      back: 's2',
      title: '交生产核对差异',
      owner: '生产 ↔ 仓库',
      label: '数量等不符',
      detail: '保留实收情况，交生产核对；处理后回到第 2 步。',
    },
  },
  'production-exceptions': {
    kind: 'chain',
    exception: {
      from: 's2',
      back: 's1',
      label: '依据不足或退回',
      title: '补齐异常依据',
      owner: '对应责任岗位',
    },
  },
  'processing-contracts': {
    kind: 'chain',
    exception: {
      from: 's3',
      back: 's2',
      label: '合同或数量不符',
      title: '核对合同与来源',
      owner: '委外经办岗位',
    },
  },
  'inventory-query': {
    kind: 'path',
  },
  'finance-payments': {
    kind: 'chain',
    steps: [
      {
        id: 's1',
        title: '登记真实收付款',
        owner: '财务',
        detail: '方向、往来方、币种、金额和日期与实际凭据一致。',
        view: 'guide',
        point: 0,
        number: 1,
        roles: ['finance'],
      },
      {
        id: 's2',
        title: '核对核销分配',
        owner: '财务',
        detail: '选择同一往来方和币种的单据，核对逐笔金额及分配合计。',
        view: 'guide',
        point: 1,
        number: 2,
        roles: ['finance'],
      },
      {
        id: 's3',
        title: '按配置审批',
        owner: '当前审批责任人',
        detail: '按当前启用的审批要求办理；审批通过仍不等于核销完成。',
        view: 'guide',
        point: 2,
        number: 3,
        roles: [],
      },
      {
        id: 's4',
        title: '确认过账',
        owner: '获授权经办人',
        detail: '审批等前置条件满足后，使用当前单据允许的过账动作。',
        view: 'guide',
        point: 2,
        number: 4,
        roles: [],
      },
      {
        id: 's5',
        title: '核对剩余余额',
        owner: '财务',
        detail: '过账后逐张核对核销记录与未核销余额，继续对账。',
        view: 'result',
        point: 2,
        number: 5,
        roles: ['finance'],
      },
    ],
    supplementSourceSteps: [3],
    exception: {
      from: 's2',
      back: 's2',
      title: '核对并修正分配',
      owner: '财务',
      label: '分配超额',
      detail: '先修正分配金额，再回到第 2 步重新核对合计和来源余额。',
    },
  },
  receivables: {
    kind: 'steps',
  },
  payables: {
    kind: 'steps',
  },
  invoices: {
    kind: 'steps',
  },
  reconciliation: {
    kind: 'steps',
  },
  'production-scheduling': {
    kind: 'chain',
    exception: {
      from: 's2',
      back: 's2',
      label: '资料、物料或产能不足',
      title: '协调缺口后重新核对',
      owner: 'PMC',
    },
  },
  'quality-inspections': {
    kind: 'chain',
    exception: {
      from: 's3',
      back: 's2',
      label: '判定条件未满足',
      title: '补齐检验依据',
      owner: '品质',
    },
  },
  products: {
    kind: 'steps',
  },
  'material-bom': {
    kind: 'chain',
    pointMap: [0, 1, 2, 2],
    resultStep: 3,
    exception: {
      from: 's2',
      back: 's2',
      title: '返回用料明细核对',
      owner: '工程',
      label: '用量有疑问',
      detail: '回到用料明细核对单位、用量和损耗，核对清楚后继续第 2 步。',
    },
  },
  processes: {
    kind: 'steps',
  },
  'employee-access': {
    kind: 'steps',
  },
  'audit-logs': {
    kind: 'path',
  },
}

export const HELP_VISUAL_EXAMPLES = {
  'finished-goods': {
    title: '成品入库',
    description: '核对完工报告与实物，确认入库后再检查库存。',
    entry: '生产记录',
    points: [
      ['找到待入库报告', '核对产品、规格和报告数量，先确认是本次要收的货。'],
      ['核对仓库、批次与实收', '有差异先交生产核对，处理后回到原报告继续。'],
      ['确认后检查结果', '使用“确认成品入库”，再核对入库状态和库存变化。'],
    ],
    boundary: '提交完工报告时，库存还没有增加。',
    before: '240',
    after: '340',
    unit: '件',
    delta: '+100',
    resultTitle: '库存余额 · 示例',
    resultRows: [
      ['本次成品入库', '100 件'],
      ['来源完工报告', 'PF-DEMO-001'],
      ['应看到的记录', '已入库，可查来源'],
    ],
    exceptionTitle: '实收与报告不一致',
    exceptionTo: '生产',
    exceptionBack: '原完工报告',
    exceptionRows: [
      ['报告数量', '100 件'],
      ['实际点收', '80 件'],
    ],
    exceptionNote:
      '先保留 80 件的实收情况，交生产核对差异；不要为了通过校验把实收改成 100。',
    exceptionResume:
      '来源核对完成后，重新核对仓库、批次和数量，再按当前允许的动作办理。',
  },
  'finance-payments': {
    title: '收付款与核销',
    description: '一笔收付款分配到哪些单据，核对清楚再按流程办理。',
    entry: '收付款与核销',
    points: [
      ['先核对真实收付款', '方向、往来方、币种和金额，与实际凭据一致。'],
      [
        '把金额分配到对应单据',
        '每笔不超过来源未核销金额，合计不超过本次收付款。',
      ],
      [
        '按当前审批和过账流程办理',
        '审批通过后仍须确认过账，完成后核对每张单据的余额。',
      ],
    ],
    boundary: '保存或审批通过，不代表已经完成核销。',
    before: '1,500',
    after: '500',
    unit: '元',
    delta: '−1,000',
    resultTitle: '应收未核销合计 · 示例',
    resultRows: [
      ['AR-DEMO-001', '1,000 − 600 = 400 元'],
      ['AR-DEMO-002', '500 − 400 = 100 元'],
      ['本次收款核销', '1,000 元'],
    ],
    exceptionTitle: '分配金额超过本次收款',
    exceptionTo: '财务核对',
    exceptionBack: '核销分配',
    exceptionRows: [
      ['本次收款', '1,000 元'],
      ['分配合计', '1,200 元'],
    ],
    exceptionNote:
      '先修正分配金额，再核对每张单据的未核销余额。不能混入其他客户或币种的单据。',
    exceptionResume: '切换方向、往来方或币种后，要重新选择单据并分配金额。',
  },
  'material-bom': {
    title: 'BOM 部位用料',
    description: '同一材料的各个部位集中核对，确认用量和生效版本。',
    entry: '物料清单',
    points: [
      ['先确定产品与版本', '本次用料属于哪个产品、哪一版，先核对清楚。'],
      [
        '同一材料，看各部位用量',
        '材料只选一次；逐项核对单位、单件用量和损耗。',
      ],
      ['启用正确的版本', '核对完成后激活版本，新生产订单按生效版本继续办理。'],
    ],
    boundary: 'BOM 变更不会改写已发布订单冻结的需求。',
    before: '草稿',
    after: '已生效',
    resultTitle: '版本状态 · 示例',
    resultRows: [
      ['产品', '示例公仔 · 18 cm'],
      ['材料组织', '同料部位连续填写'],
      ['后续使用', '新生产订单读取生效版本'],
    ],
    exceptionTitle: '部位用量或单位有疑问',
    exceptionTo: '工程核对',
    exceptionBack: '用料明细',
    exceptionRows: [
      ['需要核对', '单位 / 单件用量 / 损耗'],
      ['当前处理', '核对清楚后再启用'],
    ],
    exceptionNote:
      '先核对工程资料与实际单位，不把不确定的用量直接交给生产使用。',
    exceptionResume:
      '已有生产订单按各自冻结的资料核对，不因修改 BOM 就认为旧订单也已改变。',
  },
  'inventory-query': {
    title: '查库存',
    description: '先定位品项，再分清余额、已预留和可用量。',
    entry: '库存台账',
    points: [
      ['找到要查的品项', '按品项和仓库查询；批次可以选择“全部批次”。'],
      ['看清还能用多少', '同时核对库存余额、已预留与可用量。'],
      ['有疑问就追查来源', '查看相关库存变动，沿来源单据核对本次数量。'],
    ],
    boundary: '查询与查看来源都不会改变库存。',
    before: '340',
    after: '260',
    unit: '件',
    delta: '预留 80',
    resultTitle: '库存口径 · 示例',
    resultRows: [
      ['库存余额', '340 件'],
      ['已预留', '80 件'],
      ['可用量', '260 件'],
    ],
    exceptionTitle: '没有找到对应库存',
    exceptionTo: '仓库核对',
    exceptionBack: '查询条件',
    exceptionRows: [
      ['先检查', '品项与仓库是否选对'],
      ['再检查', '批次筛选是否过窄'],
    ],
    exceptionNote:
      '清除不必要的筛选，再核对品项编码与仓库。查不到记录不能直接当作库存为零。',
    exceptionResume:
      '找到记录后核对余额、预留、可用量和相关来源，再反馈给需要用料的岗位。',
  },
}

export function getHelpScenarioPresentation(scenario, roleKey) {
  const layout = HELP_OVERVIEW_LAYOUTS[scenario.key] || { kind: 'steps' }
  const steps = (layout.steps || scenario.steps).map((item, index) => ({
    ...item,
    id: `s${index + 1}`,
    number: index + 1,
    description: item.description || item.detail,
    point: item.point ?? layout.pointMap?.[index] ?? index,
    view: item.view || (layout.resultStep === index ? 'result' : 'guide'),
  }))
  const initial =
    steps.find(
      (item) => item.view === 'guide' && item.roles.includes(roleKey)
    ) || steps[0]
  const exception = {
    id: 'issue',
    view: 'exception',
    from: initial.id,
    back: initial.id,
    title: '核对异常与恢复条件',
    owner: initial.owner,
    ...layout.exception,
  }
  const back = steps.find((item) => item.id === exception.back)
  return {
    kind: layout.kind,
    steps,
    defaultStep: initial,
    visual: HELP_VISUAL_EXAMPLES[scenario.key] || null,
    exception: { ...exception, point: back.point, backNumber: back.number },
    result: { id: 'result', view: 'result', point: initial.point },
    supplements: (layout.supplementSourceSteps || []).map(
      (index) => scenario.steps[index]
    ),
  }
}
