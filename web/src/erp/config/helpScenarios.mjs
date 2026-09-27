import { getBusinessUsabilityEntry } from './businessUsabilityCatalog.mjs'
import { filterRoleHelpPriorities } from './roleHelpContent.mjs'

const step = (title, owner, roles, description) => ({
  title,
  owner,
  roles,
  description,
})

// 页内办理说明是操作文字的来源；这里只补充流程节点标题和责任岗位。
function pageScenario(pageKey, nodes) {
  const entry = getBusinessUsabilityEntry(pageKey)
  const blocked = entry.items.find((item) => item.type === 'disabled')
  return {
    key: pageKey,
    steps: nodes.map(([title, owner, roles], index) =>
      step(title, owner, roles, entry.flowSteps[index])
    ),
    completion: entry.completion,
    handoff: entry.handoff,
    exception: {
      trigger: blocked?.explanation || entry.boundary,
      action:
        '保留来源单号和页面提示，联系对应责任岗位核对；条件满足后回到同一记录继续办理。结果不确定时先刷新核对，避免重复提交。',
    },
  }
}

const businessScenarios = {
  '/erp/sales/project-orders/sales-orders': pageScenario('sales-orders', [
    ['核对订单内容', '销售', ['sales']],
    ['提交并等待审批', '销售 / 审批岗位', ['sales', 'boss']],
    [
      '核对生效与交接',
      'PMC / 工程 / 生产',
      ['pmc', 'engineering', 'production'],
    ],
    ['跟进实际交付', '仓库 / 财务', ['warehouse', 'finance']],
  ]),
  '/erp/purchase/material-bom': pageScenario('material-bom', [
    ['建立产品与用料', '工程', ['engineering']],
    ['核对用量与损耗', '工程', ['engineering']],
    ['启用正确版本', '工程', ['engineering']],
    ['交给生产使用', '生产', ['production']],
  ]),
  '/erp/purchase/accessories': pageScenario('accessories-purchase', [
    ['核对采购内容', '采购', ['purchase']],
    ['提交并等待审批', '采购 / 审批岗位', ['purchase', 'boss']],
    ['跟催并登记到货', '采购 / 仓库', ['purchase', 'warehouse']],
    [
      '检验、入库与交接',
      '品质 / 仓库 / 财务',
      ['quality', 'warehouse', 'finance'],
    ],
  ]),
  '/erp/warehouse/inbound': pageScenario('inbound', [
    ['从采购单登记到货', '仓库', ['warehouse']],
    ['核对实收与批次', '仓库', ['warehouse']],
    ['需要时完成检验', '品质', ['quality']],
    ['确认材料入库', '仓库', ['warehouse']],
  ]),
  '/erp/production/quality-inspections': pageScenario('quality-inspections', [
    ['按来源发起检验', '来源经办岗位', ['purchase', 'production', 'warehouse']],
    ['核对数量与检查项', '品质', ['quality']],
    ['完成检查与判定', '品质', ['quality']],
    ['交回来源岗位', '来源经办岗位', ['purchase', 'production', 'warehouse']],
  ]),
  '/erp/purchase/processing-contracts': pageScenario('processing-contracts', [
    ['准备加工合同', '委外经办岗位', ['production']],
    ['提交并确认合同', '委外经办岗位', ['production']],
    ['分别办理发料与回货', '生产 / 仓库', ['production', 'warehouse']],
    [
      '检验后继续办理',
      '品质 / 仓库 / 财务',
      ['quality', 'warehouse', 'finance'],
    ],
  ]),
  '/erp/production/orders': pageScenario('production-orders', [
    ['核对生产来源', '生产', ['production']],
    ['发布并交 PMC 排程', '生产 / PMC', ['production', 'pmc']],
    ['推进工序与检验', '生产 / 品质', ['production', 'quality']],
    ['完工后交仓库入库', '生产 / 仓库', ['production', 'warehouse']],
  ]),
  '/erp/warehouse/shipments': pageScenario('shipments', [
    ['准备出货草稿', '出货经办岗位', ['sales', 'warehouse']],
    ['需要时完成检验', '品质', ['quality']],
    ['等待财务放行', '财务', ['finance']],
    ['确认实际出货', '仓库', ['warehouse']],
  ]),
}

const finishedGoods = {
  key: 'finished-goods',
  title: '完工报告与成品入库',
  description: '生产报告完工，仓库核对实收后确认入库。',
  steps: [
    step(
      '提交完工报告',
      '生产',
      ['production'],
      '从生产来源提交完工报告，核对产品、数量和当前状态；提交后交给仓库核对。'
    ),
    step(
      '核对实收与批次',
      '仓库',
      ['warehouse'],
      '在生产记录中选择待入库完工报告，核对实收数量、仓库和批次。存在差异时先交生产核对。'
    ),
    step(
      '确认成品入库',
      '仓库',
      ['warehouse'],
      '实收与来源核对清楚、入库条件满足后，使用当前记录提供的确认入库动作。'
    ),
    step(
      '核对入库结果',
      '仓库',
      ['warehouse'],
      '重新查看入库状态和库存变化，确认本次数量已经正式入库，再反馈给生产和 PMC。'
    ),
  ],
  completion:
    '成品入库记录和正式库存变化可查；生产提交完工报告本身不代表成品已经入库。',
  handoff: '生产把完工报告交给仓库；仓库把实际入库结果反馈给生产和 PMC。',
  exception: {
    trigger: '实收数量、产品、仓库或批次与完工报告不一致。',
    action:
      '暂缓确认入库，记录差异并交生产核对；处理后回到同一报告重新核对。结果不确定时先刷新查看入库记录。',
  },
}

const inventoryEntry = getBusinessUsabilityEntry('inventory')
const supportingScenarios = {
  '/erp/production/progress': [
    {
      key: 'production-materials',
      title: '按生产来源办理领料',
      description: '核对生产物料需求和可用库存，再确认实际领料。',
      roles: ['production'],
      steps: [
        step(
          '核对物料需求',
          '生产',
          ['production'],
          '打开来源生产订单，核对物料需求、已领数量和当前可领数量。'
        ),
        step(
          '核对仓库与数量',
          '生产 / 仓库',
          ['production', 'warehouse'],
          '按实际使用核对材料、单位、仓库、批次和领料数量；库存不足或超领时先处理对应条件。'
        ),
        step(
          '确认领料结果',
          '生产',
          ['production'],
          '使用页面提供的领料动作，完成后回生产记录和库存变动核对本次数量。'
        ),
      ],
      completion:
        '来源生产订单、领料数量和正式库存变动可查，草稿或任务完成不代表领料已确认。',
      handoff:
        '物料缺口交 PMC / 采购协调，仓库核对实际发出材料，生产按领料结果继续作业。',
      exception: {
        trigger: '库存不足、来源不符或需要超领。',
        action:
          '停止本次确认，核对需求和已领数量；超领按异常申请办理，条件满足后再回来源领料。',
      },
    },
    finishedGoods,
  ],
  '/erp/warehouse/inventory': [
    {
      key: 'inventory-query',
      steps: [
        step(
          '找到对应库存',
          '查询岗位',
          ['warehouse', 'pmc', 'purchase', 'production'],
          inventoryEntry.flowSteps[0]
        ),
        step(
          '核对可用量与来源',
          '查询岗位',
          ['warehouse', 'pmc', 'purchase', 'production'],
          inventoryEntry.flowSteps[1]
        ),
        step(
          '反馈库存情况',
          '仓库 / PMC',
          ['warehouse', 'pmc'],
          '把对应物料或产品、仓库、单位、批次和可用量反馈给需要安排采购、生产或出货的岗位。'
        ),
      ],
      completion:
        '已经定位对应库存，能区分账面数量、已预留和可用量，并找到来源变动。',
      handoff: inventoryEntry.handoff,
      exception: {
        trigger: '数量与实物不一致，或找不到对应来源。',
        action:
          '先核对仓库、单位、批次和来源是否一致，保留差异交仓库负责人核查。查询结果本身不会调整库存。',
      },
    },
  ],
  '/erp/production/exceptions': [
    {
      key: 'production-exceptions',
      steps: [
        step(
          '核对异常来源',
          '生产 / 品质',
          ['production', 'quality'],
          '核对受影响的生产批次、数量和原因，明确是报废、在制让步还是超领申请。'
        ),
        step(
          '提交并等待审批',
          '经办 / 审批岗位',
          ['production', 'boss'],
          '补齐来源和理由后，按页面提供的动作提交申请；审批未通过前暂停受影响的办理。'
        ),
        step(
          '核对执行结果',
          '生产',
          ['production'],
          '按当前审批结果和可用动作执行，回到来源生产记录核对受影响数量与状态。'
        ),
      ],
      completion:
        '异常来源、原因、审批和执行结果可查，受影响数量与来源记录一致。',
      handoff:
        '质量判定交品质，缺料与计划安排交 PMC / 采购，生产按正式结果继续办理。',
      exception: {
        trigger: '来源不明确、审批退回或执行结果无法核对。',
        action:
          '停止继续推进受影响数量，保留原因和来源记录；由责任岗位补齐依据后重新核对。',
      },
    },
  ],
  '/erp/production/scheduling': [
    {
      key: 'production-scheduling',
      steps: [
        step(
          '找到排产待办',
          'PMC',
          ['pmc'],
          '打开生产订单发布后生成的排产确认事项，核对来源订单和交期。'
        ),
        step(
          '核对可执行条件',
          'PMC',
          ['pmc'],
          '核对工程资料、物料需求、可用库存、采购到料和生产安排。'
        ),
        step(
          '确认并交接生产',
          'PMC / 生产',
          ['pmc', 'production'],
          '条件满足后按当前待办完成排产确认，核对计划、责任人和预计日期。'
        ),
      ],
      completion:
        '排产结论、计划、责任人和预计日期可查；排产确认不会代替领料或完工。',
      handoff: '可执行安排交生产；缺料交采购，资料交工程，交期变化反馈销售。',
      exception: {
        trigger: '资料、物料或产能无法支持当前交期。',
        action:
          '记录缺口、影响订单、责任岗位和处理日期，协调后重新核对，不把风险订单标成可执行。',
      },
    },
  ],
}

function masterScenario(key, owner, role, fields) {
  return {
    key,
    steps: [
      step(
        '查找已有资料',
        owner,
        [role],
        '先搜索已有名称和编码，确认是否已经存在，避免重复建立。'
      ),
      step(
        '核对并保存资料',
        owner,
        [role],
        `按页面必填要求核对${fields}，保存后重新打开确认。`
      ),
      step(
        '交给业务引用',
        owner,
        [role],
        '让后续经办岗位在对应业务单据中选择这份资料，并核对本单带出的内容。'
      ),
    ],
    completion: '资料已保存且当前状态可引用，名称、编码和必要内容可查。',
    handoff: '后续岗位引用同一份资料；本单有差异时仍需在业务单据中核对。',
    exception: {
      trigger: '存在重名、关键信息缺失，或修改会影响正在办理的单据。',
      action:
        '先联系资料负责人确认适用范围，避免重复新建或直接覆盖；补齐后重新核对引用结果。',
    },
  }
}

const masterScenarios = {
  '/erp/master/partners/customers': masterScenario(
    'customers',
    '销售',
    'sales',
    '客户、联系人和默认收货信息'
  ),
  '/erp/master/partners/suppliers': masterScenario(
    'suppliers',
    '采购',
    'purchase',
    '供应商、联系人、付款与开票默认值'
  ),
  '/erp/master/products': masterScenario(
    'products',
    '工程',
    'engineering',
    '产品图样、规格、颜色、尺码和包装信息'
  ),
  '/erp/engineering/processes': masterScenario(
    'processes',
    '工程',
    'engineering',
    '加工环节名称和适用说明'
  ),
}

function financeScenario(key, source, result, handoff) {
  return {
    key,
    steps: [
      step('核对业务来源', '财务', ['finance'], source),
      step(
        '核对金额与往来方',
        '财务',
        ['finance'],
        '核对来源单号、往来方、币种、金额和当前状态，不用手工金额掩盖来源差异。'
      ),
      step('办理并确认结果', '财务', ['finance'], result),
    ],
    completion: result,
    handoff,
    exception: {
      trigger: '往来方、币种、金额或来源无法对应，或办理结果不确定。',
      action:
        '暂停过账或重复提交，保留来源单号和差异；交来源岗位核对，处理后回到原记录刷新确认。',
    },
  }
}

const financeScenarios = {
  '/erp/finance/payments': {
    ...pageScenario('finance-payments', [
      ['登记真实收付款', '财务', ['finance']],
      ['选择同一往来方和币种', '财务', ['finance']],
      ['核对分配并按流程办理', '财务', ['finance']],
      ['按受控方式更正', '财务', ['finance']],
    ]),
    exception: {
      trigger: getBusinessUsabilityEntry('finance-payments').items.find(
        (item) => item.type === 'disabled'
      ).explanation,
      action: getBusinessUsabilityEntry('finance-payments').handoff,
    },
  },
  '/erp/finance/receivables': financeScenario(
    'receivables',
    '从已经实际出货的记录核对应收来源。',
    '应收记录的来源、金额和状态可查；结清以正式收付款核销或红冲结果为准。',
    '出货来源差异交销售 / 仓库核对，收款与核销按正式资金记录继续办理。'
  ),
  '/erp/finance/payables': financeScenario(
    'payables',
    '从已入库采购或合格委外回货核对应付来源。',
    '应付记录的来源、金额和状态可查；结清以正式收付款核销或红冲结果为准。',
    '采购来源交采购 / 仓库核对，委外来源交对应经办岗位核对。'
  ),
  '/erp/finance/invoices': financeScenario(
    'invoices',
    '从已实际出货记录核对本次发票业务来源。',
    '发票业务记录的来源、往来方、金额和状态可查；系统记录不等于税控开票已经完成。',
    '来源差异交销售 / 仓库核对，实际开票结果由财务按业务要求核查。'
  ),
  '/erp/finance/reconciliation': financeScenario(
    'reconciliation',
    '先核对已过账财务记录，明确本次核对的往来方与来源。',
    '按页面提供的登记、确认和单笔核对动作办理，核对结果和差异可查。',
    '发现差异时到对账页面记录，并交来源岗位核对；不直接修改余额掩盖差异。'
  ),
}

function roleScenario(guide, key) {
  return {
    key,
    steps: guide.workflow.map((description, index) =>
      step(
        ['核对事项与来源', '核对办理依据', '按条件办理', '确认结果与交接'][
          index
        ] || '继续核对',
        guide.label,
        [guide.key],
        description
      )
    ),
    completion: guide.completion,
    handoff: guide.handoff,
    exception: {
      trigger: guide.exception.trigger,
      action: guide.exception.steps.join(''),
    },
  }
}

function workScenario(key, title, owner, role, source, next) {
  return {
    key,
    steps: [
      step('找到需要处理的事项', owner, [role], source),
      step(
        '打开来源核对',
        owner,
        [role],
        '核对来源单号、当前状态、责任岗位和已有记录；没有权限的来源请对应岗位协助核对。'
      ),
      step('跟进下一步', owner, [role], next),
    ],
    completion: `${title}的来源、当前情况、责任岗位和下一步已明确。`,
    handoff: '把具体问题和来源单号交给实际责任岗位，后续结果回到来源页面核对。',
    exception: {
      trigger: '来源无法对应、没有查看权限或责任不明确。',
      action:
        '保留来源单号和页面提示，联系业务负责人核对；页面未提供的业务结果不能根据任务名称推测。',
    },
  }
}

function scenariosForPriority(guide, priority) {
  const { path } = priority
  if (supportingScenarios[path]) {
    return supportingScenarios[path].filter(
      (scenario) => !scenario.roles || scenario.roles.includes(guide.key)
    )
  }
  const business =
    businessScenarios[path] || masterScenarios[path] || financeScenarios[path]
  if (business) return [business]
  if (path === '/erp/system/permissions') {
    return [roleScenario(guide, 'employee-access')]
  }
  if (path === '/erp/task-board' && guide.key === 'boss') {
    return [roleScenario(guide, 'approvals')]
  }
  if (path === '/erp/system/audit-logs') {
    return [
      workScenario(
        'audit-logs',
        '操作记录',
        guide.label,
        guide.key,
        '按时间、操作人和业务对象查找相关操作记录。',
        '查看修改前后的差异，确认账号或设置变更；操作记录只读。'
      ),
    ]
  }
  if (path === '/erp/business-dashboard') {
    return [
      workScenario(
        'delivery-progress',
        '交付进度',
        guide.label,
        guide.key,
        '找到需要跟进的订单，查看交期风险、阶段和已经发生的交付结果。',
        '进入有权限的阶段或来源核对阻塞，协调对应岗位；进度展示本身不会推进单据。'
      ),
    ]
  }
  return [
    workScenario(
      'work-priority',
      '当前工作',
      guide.label,
      guide.key,
      '查看当前岗位的待办、阻塞和到期事项，先找到需要处理的问题。',
      '按事项实际责任协调处理，从当前页面提供的入口进入办理；完成后回来源核对结果。'
    ),
  ]
}

export function getRoleHelpScenarios(guide, access = {}) {
  if (!guide) return []
  if (guide.key === 'generic') {
    return [
      {
        ...roleScenario(guide, 'getting-started'),
        title: '从可见页面开始办事',
        description: guide.headline,
        path: '',
        available: false,
      },
    ]
  }
  // 收付款有独立页内说明，在帮助中可直接选择；不改变岗位首页的优先入口。
  const priorities =
    guide.key === 'finance'
      ? [
          {
            title: '收付款与核销',
            description:
              '登记真实收款或付款，并按同一往来方和币种对多张应收或应付进行核销。',
            path: '/erp/finance/payments',
            actionLabel: '打开收付款与核销',
          },
          ...guide.priorities,
        ]
      : guide.priorities
  return filterRoleHelpPriorities({ ...guide, priorities }, access).flatMap(
    (priority) =>
      scenariosForPriority(guide, priority).map((scenario) => ({
        ...priority,
        ...scenario,
      }))
  )
}

export function resolveHelpScenario(scenarios, requestedKey = '') {
  return (
    scenarios.find((scenario) => scenario.key === requestedKey) ||
    scenarios.find((scenario) => scenario.available) ||
    scenarios[0] ||
    null
  )
}
