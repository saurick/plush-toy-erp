export const STATUS_LABELS = {
  seeded: '已初始化',
  awaiting_files: '待资料接入',
  deferred: '本轮暂缓',
}

export const STATUS_STYLES = {
  seeded:
    'border-emerald-300/30 bg-emerald-300/12 text-emerald-100 shadow-[0_0_0_1px_rgba(110,231,183,0.12)]',
  awaiting_files:
    'border-amber-300/30 bg-amber-300/12 text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.12)]',
  deferred:
    'border-slate-300/20 bg-slate-300/10 text-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]',
}

export const bootstrapChange = {
  slug: 'plush-erp-bootstrap-init',
  repoPath: 'docs/changes/plush-erp-bootstrap-init.md',
  updatedAt: '2026-04-20',
}

export const environmentCards = [
  {
    label: '前端开发端口',
    value: '5175',
    detail: '与 trade-erp 的 5173 隔离，方便并行联调。',
  },
  {
    label: '后端 HTTP 端口',
    value: '8200',
    detail: '本轮统一以 8200 作为 plush ERP 的默认服务入口。',
  },
  {
    label: '数据库宿主端口',
    value: '5435',
    detail: '避开 trade-erp 常用端口，作为本项目 compose 默认映射。',
  },
]

export const plannedModules = [
  {
    key: 'customer-style',
    title: '客户 / 款式立项',
    status: 'seeded',
    owner: '业务跟单',
    summary: '先收口客户、款式编号、打样状态和交期承诺，作为全链路起点。',
  },
  {
    key: 'bom-materials',
    title: '材料 BOM / 用量拆解',
    status: 'awaiting_files',
    owner: '业务跟单 + 采购',
    summary: '等待更多材料明细 Excel 后接入正式导入和联动校验。',
  },
  {
    key: 'processing-contract',
    title: '加工合同 / 委外下单',
    status: 'awaiting_files',
    owner: '采购 / 财务',
    summary: '已先预留入口，等更多合同模板与字段口径后再落打印和保存链路。',
  },
  {
    key: 'production-schedule',
    title: '生产排单 / 车间跟进',
    status: 'seeded',
    owner: '生产 / 厂长',
    summary: '先把排产、延误、返工和出货节点放进初始化工作台。',
  },
  {
    key: 'accessories',
    title: '辅材 / 包材协同',
    status: 'awaiting_files',
    owner: '采购 / 仓库',
    summary: '辅材、包材模板先记入资料清单，待文件齐备后补导入与成本口径。',
  },
  {
    key: 'warehouse',
    title: '仓库收发 / 成品入库',
    status: 'seeded',
    owner: '仓库',
    summary: '先初始化收货、备料、成品入库和异常登记的工作台视图。',
  },
  {
    key: 'finance',
    title: '对账 / 结算 / 应收应付',
    status: 'seeded',
    owner: '财务',
    summary: '先提供对账节点、款项确认与资料缺口面板，不引入外贸结汇模型。',
  },
  {
    key: 'help-docs',
    title: '帮助中心 / 文档中心',
    status: 'seeded',
    owner: '实施 / 运维',
    summary: '本轮已经在项目内初始化流程页、帮助页、文档页和 changes slug。',
  },
  {
    key: 'mobile',
    title: '移动端角色工作台',
    status: 'seeded',
    owner: '全部角色',
    summary: '同仓库内提供响应式移动端工作台，不单独拆第二个项目。',
  },
  {
    key: 'photo-scan',
    title: '拍照扫码',
    status: 'deferred',
    owner: '仓库 / 生产',
    summary: '用户已明确本轮不做，只保留后续接入说明和占位入口。',
  },
]

export const phaseFlow = [
  {
    key: 'phase-1',
    title: '客户与款式立项',
    owner: '业务跟单',
    summary:
      '从客户需求、款式编号、交期和版本开始，为后续材料、合同与排单统一入口。',
    outputs: ['客户档案', '款式编号', '打样状态', '承诺交期'],
    mobileActions: ['查看今日待跟单款式', '回填客户确认节点', '同步催样备注'],
  },
  {
    key: 'phase-2',
    title: 'BOM / 材料拆解',
    owner: '业务跟单 + 采购',
    summary:
      '把主料、辅料、包材和工艺拆成可维护的资料层，后续 Excel 导入会挂在这里。',
    outputs: ['材料明细', '损耗口径', '辅材包材清单', '采购准备'],
    mobileActions: ['核对缺料提醒', '提交待补资料', '快速查看最近版本'],
  },
  {
    key: 'phase-3',
    title: '加工合同 / 委外下单',
    owner: '采购 / 财务',
    summary: '先收口合同模板、单价、加工单位和付款节点，暂不落正式打印引擎。',
    outputs: ['加工合同', '委外单价', '对账节点', '合同附件位'],
    mobileActions: ['合同到期提醒', '补录供应商回签', '查看应付节点'],
  },
  {
    key: 'phase-4',
    title: '生产排单 / 进度跟催',
    owner: '生产 / 厂长',
    summary: '围绕车间排产、延误、返工、交接班和成品节点建立首批工作台。',
    outputs: ['生产单', '日排程', '延期预警', '返工跟进'],
    mobileActions: ['更新生产进度', '拍照留档入口占位', '记录异常原因'],
  },
  {
    key: 'phase-5',
    title: '仓库收发 / 成品入库',
    owner: '仓库',
    summary: '先初始化收货、备料、完工入库和出货前备货的视图，不做扫码。',
    outputs: ['入库记录', '缺件提醒', '成品备货', '收发日报'],
    mobileActions: ['确认收货', '标记待补料', '查看今日待出货'],
  },
  {
    key: 'phase-6',
    title: '对账 / 结算 / 经营复盘',
    owner: '财务 / 管理层',
    summary: '把加工费、辅料、包材、应收应付和异常成本先放进统一复盘页。',
    outputs: ['应收应付面板', '加工费对账', '毛利复盘占位', '资料闭环提醒'],
    mobileActions: ['确认对账节点', '查看逾期提醒', '审批异常费用'],
  },
]

export const roleWorkbenches = [
  {
    key: 'boss',
    title: '老板 / 管理层',
    label: '经营驾驶舱',
    summary: '看总体交期、异常、回款和本周重点，不进入细项录入。',
    desktopFocus: ['经营看板', '延期预警', '应收应付摘要', '异常事件列表'],
    mobileFocus: ['今日逾期款式', '高风险订单提醒', '待确认费用', '日报摘要'],
    firstWave: [
      '经营总览卡片',
      '延期 / 缺料 / 待结算提醒',
      '项目初始化边界说明',
    ],
    pending: ['利润明细口径', '跨角色审批流', '消息推送'],
  },
  {
    key: 'merchandiser',
    title: '业务跟单',
    label: '前台总控',
    summary: '负责客户、款式、交期、材料版本和加工跟单，是链路总入口。',
    desktopFocus: ['客户与款式', 'BOM 版本', '加工合同跟进', '交期面板'],
    mobileFocus: [
      '催样与催料提醒',
      '客户确认节点',
      '今日待推进款式',
      '异常备注',
    ],
    firstWave: ['款式状态看板', '材料资料缺口面板', '合同 / Excel 待接入清单'],
    pending: ['Excel 正式导入', '客户消息同步', '拍照上传'],
  },
  {
    key: 'production',
    title: '生产 / 厂长',
    label: '排产与进度',
    summary: '负责生产单、车间进度、延期原因和返工处理。',
    desktopFocus: ['排单总览', '车间状态', '延期原因', '返工跟踪'],
    mobileFocus: ['开工 / 完工打点', '异常上报', '班组交接', '今日待办'],
    firstWave: ['排产面板', '进度回填', '异常原因模板'],
    pending: ['扫码工序流转', '工时采集', '拍照质检'],
  },
  {
    key: 'purchasing',
    title: '采购 / 辅料',
    label: '到料与合同',
    summary: '负责主料、辅材、包材和加工厂对接，重点是缺料与合同节点。',
    desktopFocus: ['材料准备', '辅材包材', '加工合同', '到料提醒'],
    mobileFocus: ['供应商催料', '合同回签确认', '缺料提醒', '价格确认'],
    firstWave: ['资料缺口清单', '合同节点卡片', '辅料 / 包材待导入面板'],
    pending: ['供应商主档', '自动比价', '收货联动'],
  },
  {
    key: 'warehouse',
    title: '仓库 / 收发',
    label: '收货与备货',
    summary: '负责收货、备料、完工入库与出货前点检，本轮不做扫码。',
    desktopFocus: ['待收货', '待入库', '备货提醒', '异常登记'],
    mobileFocus: ['收货确认', '缺件反馈', '待出货点检', '库位备注'],
    firstWave: ['仓库工作台', '今日收发汇总', '移动端点检卡片'],
    pending: ['扫码入库', '库位策略', 'PDA 打包'],
  },
  {
    key: 'finance',
    title: '财务 / 对账',
    label: '结算与复盘',
    summary:
      '关注加工费、辅材、包材、往来款和异常费用，先做节点管理不做票据自动识别。',
    desktopFocus: ['加工费对账', '辅材 / 包材结算', '应收应付', '异常费用'],
    mobileFocus: ['待确认对账', '逾期应收提醒', '异常费用审批', '日报复盘'],
    firstWave: ['结算节点清单', '应收应付摘要', '待补原始单据提醒'],
    pending: ['票据识别', '自动账龄', '银行流水匹配'],
  },
]

export const documentationCards = [
  {
    key: 'system-init',
    title: '系统初始化说明',
    path: '/erp/docs/system-init',
    summary:
      '说明本轮到底初始化了什么、明确不做什么，以及后续如何接合同和 Excel。',
  },
  {
    key: 'operation-playbook',
    title: '毛绒 ERP 首批流程草案',
    path: '/erp/docs/operation-playbook',
    summary: '把本项目的业务主链路、人话版流程和交接节点先沉淀成正式文档。',
  },
  {
    key: 'mobile-roles',
    title: '移动端角色初始化',
    path: '/erp/docs/mobile-roles',
    summary: '列清各角色在手机端第一批该看到什么、先做什么、哪些还只是占位。',
  },
]

export const helpCenterSections = [
  {
    title: '先读这三个入口',
    items: [
      '初始化看板：确认已放进项目的模块、端口和边界。',
      '流程总览：先看“谁接谁、资料往哪走、哪一段还缺源文件”。',
      '资料准备：确认目前已收到哪些合同 / Excel，哪些还在等。',
    ],
  },
  {
    title: '本轮明确不做',
    items: [
      '拍照扫码、条码枪、PDA 或图片识别。',
      '正式 Excel 导入、合同打印模板和 PDF 定位填充。',
      '细颗粒审批流、经营利润口径和自动通知。',
    ],
  },
  {
    title: '后续接资料的挂点',
    items: [
      '材料 BOM / 用量：接更多材料明细 Excel。',
      '加工合同：接更多合同模板和字段口径。',
      '辅材 / 包材：接采购模板与结算模板。',
      '移动端验收：等更多真实页面或 PDF 再继续收口。',
    ],
  },
]

export const sourceReadiness = {
  received: [
    {
      type: 'PDF',
      name: '9.3加工合同-子淳.pdf',
      intendedFor: '加工合同模板识别与字段映射。',
    },
    {
      type: 'Excel',
      name: '26029#夜樱烬色才料明细表2026-1-19.xlsx',
      intendedFor: '材料 BOM / 主料明细导入。',
    },
    {
      type: 'Excel',
      name: '26204#抱抱猴子材料明细表2026-4-10.xlsx',
      intendedFor: '材料 BOM / 主料明细导入。',
    },
    {
      type: 'Excel',
      name: '加工 成慧怡.xlsx',
      intendedFor: '加工费、委外单价或加工节点清单。',
    },
    {
      type: 'Excel',
      name: '辅材、包材 成慧怡.xlsx',
      intendedFor: '辅材 / 包材准备与结算。',
    },
    {
      type: 'PDF',
      name: 'plush_factory_formal_report_v3_mobile.pdf',
      intendedFor: '移动端验收口径与页面参考。',
    },
    {
      type: 'PNG',
      name: 'Weixin Image_20260420164444_2155_288.png',
      intendedFor: '生产订单总表样式、字段命名与移动端信息优先级。',
    },
  ],
  pending: [
    '更多加工合同原件与字段差异样本。',
    '更多材料明细 / 辅材包材 Excel，覆盖不同款式与版本。',
    '角色权限矩阵、岗位职责说明和真实移动端操作顺序。',
    '扫码、拍照、条码或 PDA 场景样本。',
  ],
}

export const navigationSections = [
  {
    title: '初始化总览',
    items: [
      {
        key: 'dashboard',
        label: '初始化看板',
        path: '/erp/dashboard',
        shortLabel: '看板',
        description: '先看模块状态、角色入口和端口边界。',
      },
      {
        key: 'flow-overview',
        label: '流程总览',
        path: '/erp/flows/overview',
        shortLabel: '流程',
        description: '用毛绒 ERP 的主流程替换 trade 的外贸流程。',
      },
      {
        key: 'source-readiness',
        label: '资料准备',
        path: '/erp/source-readiness',
        shortLabel: '资料',
        description: '列出已收到与待补的合同、Excel、PDF 与截图。',
      },
    ],
  },
  {
    title: '角色与移动端',
    items: [
      {
        key: 'mobile-workbenches',
        label: '移动端工作台',
        path: '/erp/mobile-workbenches',
        shortLabel: '移动',
        description: '同仓库内初始化各角色手机端工作台。',
      },
      {
        key: 'role-boss',
        label: '老板 / 管理层',
        path: '/erp/roles/boss',
        shortLabel: '老板',
        description: '经营总览、异常和审批提醒。',
      },
      {
        key: 'role-merchandiser',
        label: '业务跟单',
        path: '/erp/roles/merchandiser',
        shortLabel: '跟单',
        description: '款式、BOM、合同和交期总控。',
      },
      {
        key: 'role-production',
        label: '生产 / 厂长',
        path: '/erp/roles/production',
        shortLabel: '生产',
        description: '排单、进度和延期原因。',
      },
      {
        key: 'role-warehouse',
        label: '仓库 / 收发',
        path: '/erp/roles/warehouse',
        shortLabel: '仓库',
        description: '收货、备料和成品入库。',
      },
      {
        key: 'role-finance',
        label: '财务 / 对账',
        path: '/erp/roles/finance',
        shortLabel: '财务',
        description: '对账、结算和异常费用。',
      },
    ],
  },
  {
    title: '帮助与文档',
    items: [
      {
        key: 'help-center',
        label: '帮助中心',
        path: '/erp/help-center',
        shortLabel: '帮助',
        description: '快速入口、边界说明和后续挂点。',
      },
      ...documentationCards.map((card) => ({
        key: `doc-${card.key}`,
        label: card.title,
        path: card.path,
        shortLabel: '文档',
        description: card.summary,
      })),
      {
        key: 'changes',
        label: '本轮变更记录',
        path: '/erp/changes/current',
        shortLabel: '变更',
        description: '把这次初始化任务沉淀到 changes slug。',
      },
    ],
  },
]

export const mobileDockItems = [
  navigationSections[0].items[0],
  navigationSections[0].items[1],
  navigationSections[1].items[0],
  navigationSections[2].items[0],
]

export function getRoleWorkbench(roleKey) {
  return roleWorkbenches.find((item) => item.key === roleKey) || null
}
