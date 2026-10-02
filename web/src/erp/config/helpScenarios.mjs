import {
  BUSINESS_USABILITY_CATALOG,
  getBusinessUsabilityEntry,
} from './businessUsabilityCatalog.mjs'
import { ENGINEERING_MATERIAL_HELP } from './engineeringMaterialHelp.mjs'
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
    pageKey,
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
    pageScenario('production-exceptions', [
      ['核对异常来源', '生产 / 品质', ['production', 'quality']],
      ['提交并等待审批', '经办 / 审批岗位', ['production', 'boss']],
      ['核对执行结果', '生产', ['production']],
    ]),
  ],
  '/erp/production/scheduling': [
    pageScenario('production-scheduling', [
      ['找到排产待办', 'PMC', ['pmc']],
      ['核对可执行条件', 'PMC', ['pmc']],
      ['确认并交接生产', 'PMC / 生产', ['pmc', 'production']],
    ]),
  ],
}

function masterScenario(key, owner, role) {
  return pageScenario(key, [
    ['查找已有资料', owner, [role]],
    ['核对并保存资料', owner, [role]],
    ['交给业务引用', owner, [role]],
  ])
}

const masterScenarios = {
  '/erp/master/partners/customers': masterScenario(
    'customers',
    '销售',
    'sales'
  ),
  '/erp/master/partners/suppliers': masterScenario(
    'suppliers',
    '采购',
    'purchase'
  ),
  '/erp/master/products': masterScenario('products', '工程', 'engineering'),
  '/erp/master/materials': masterScenario(
    'materials',
    '工程 / 采购 / 仓库',
    'engineering'
  ),
  '/erp/engineering/processes': masterScenario(
    'processes',
    '工程',
    'engineering'
  ),
}

function financeScenario(key) {
  return pageScenario(key, [
    ['核对业务来源', '财务', ['finance']],
    ['核对金额与往来方', '财务', ['finance']],
    ['办理并确认结果', '财务', ['finance']],
  ])
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
  '/erp/finance/receivables': financeScenario('receivables'),
  '/erp/finance/payables': financeScenario('payables'),
  '/erp/finance/invoices': financeScenario('invoices'),
  '/erp/finance/reconciliation': financeScenario('reconciliation'),
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
  const page = BUSINESS_USABILITY_CATALOG.find((entry) => entry.path === path)
  if (page) {
    return [
      pageScenario(
        page.key,
        page.flowSteps.map((_, index) => [
          ['核对来源与准备', '核对资料与条件', '办理并核对结果', '确认交接'][
            index
          ] || '继续核对',
          guide.label,
          [guide.key],
        ])
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
      ...BUSINESS_USABILITY_CATALOG.filter((page) =>
        access.allowedMenuPaths?.includes(page.path)
      ).flatMap((page) => {
        const priority = {
          title: page.title,
          description: page.task,
          path: page.path,
          actionLabel: `打开${page.title}`,
          available: true,
        }
        return scenariosForPriority(guide, priority).map((scenario) => ({
          ...priority,
          ...scenario,
          pageKey: page.key,
        }))
      }),
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
  const scenes = filterRoleHelpPriorities(
    { ...guide, priorities },
    access
  ).flatMap((priority) =>
    scenariosForPriority(guide, priority).map((scenario) => ({
      ...priority,
      ...scenario,
      pageKey:
        scenario.pageKey ||
        BUSINESS_USABILITY_CATALOG.find((entry) => entry.path === priority.path)
          ?.key ||
        '',
    }))
  )
  if (ENGINEERING_MATERIAL_HELP.roleHelpKeys.includes(guide.key)) {
    const path = ['boss', 'finance'].includes(guide.key)
      ? '/erp/task-board'
      : guide.key === 'purchase'
        ? '/erp/purchase/accessories'
        : ENGINEERING_MATERIAL_HELP.path
    const [entry] = filterRoleHelpPriorities(
      {
        priorities: [
          {
            title: ENGINEERING_MATERIAL_HELP.title,
            description: ENGINEERING_MATERIAL_HELP.task,
            path,
            actionLabel: ['boss', 'finance'].includes(guide.key)
              ? '打开审核待办'
              : guide.key === 'purchase'
                ? '打开采购订单'
                : '打开销售订单用料',
          },
        ],
      },
      access
    )
    scenes.push({
      ...entry,
      ...pageScenario(ENGINEERING_MATERIAL_HELP.key, [
        ['核对用料并提交', '工程', ['engineering']],
        ['老板审核', '老板', ['boss']],
        ['财务批准并生成采购', '另一位财务审核人', ['finance']],
        ['采购核对生成订单', '采购', ['purchase']],
      ]),
      exception: {
        trigger: ENGINEERING_MATERIAL_HELP.items.find(
          (item) => item.key === 'prerequisites'
        ).explanation,
        action:
          ENGINEERING_MATERIAL_HELP.items.find(
            (item) => item.key === 'rejection'
          ).explanation +
          ENGINEERING_MATERIAL_HELP.items.find(
            (item) => item.key === 'uncertain-result'
          ).explanation +
          ENGINEERING_MATERIAL_HELP.items.find(
            (item) => item.key === 'uncertain-result'
          ).effect,
      },
    })
  }
  // 岗位优先事项保留原顺序；补充同岗位章节，菜单权限只决定办理入口是否可用。
  const coveredPaths = new Set(scenes.map((scene) => scene.path))
  for (const page of BUSINESS_USABILITY_CATALOG) {
    if (
      coveredPaths.has(page.path) ||
      !page.roleHelpKeys.includes(guide.key)
    ) {
      continue
    }
    const [priority] = filterRoleHelpPriorities(
      {
        priorities: [{
          title: page.title,
          description: page.task,
          path: page.path,
          actionLabel: `打开${page.title}`,
        }],
      },
      access
    )
    scenes.push(
      ...scenariosForPriority(guide, priority).map((scenario) => ({
        ...priority,
        ...scenario,
        pageKey: page.key,
      }))
    )
  }
  return scenes
}

export function resolveHelpScenario(scenarios, requestedKey = '') {
  return (
    scenarios.find((scenario) => scenario.key === requestedKey) ||
    scenarios.find((scenario) => scenario.available) ||
    scenarios[0] ||
    null
  )
}
