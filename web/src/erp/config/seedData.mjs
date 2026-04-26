import { appDefinitions } from './appRegistry.mjs'
import { businessNavigationSections } from './businessModules.mjs'

export const STATUS_LABELS = {
  source_grounded: '已按真源收口',
  seeded: '已落入口',
  deferred: '本轮 deferred',
}

export const STATUS_STYLES = {
  source_grounded:
    'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]',
  seeded:
    'border-sky-200 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]',
  deferred:
    'border-slate-200 bg-slate-50 text-slate-600 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]',
}

export const bootstrapChange = {
  slug: 'plush-erp-bootstrap-init',
  repoPath: 'docs/changes/plush-erp-bootstrap-init.md',
  updatedAt: '2026-04-21',
}

export const portMatrix = appDefinitions.map((app) => ({
  ...app,
  entryType: app.kind === 'desktop' ? '桌面后台' : '角色移动端',
}))

export const environmentCards = [
  {
    label: '桌面后台入口',
    value: '5175',
    detail:
      '桌面后台继续保持一个入口，直接承载流程、真源、打印和帮助中心，不再保留桌面角色切换与角色工作台入口。',
  },
  {
    label: '移动端端口矩阵',
    value: '5186 - 5193',
    detail:
      '老板 5186、业务 5187、采购 5188、生产 5189、仓库 5190、财务 5191、PMC 5192、品质 5193，方便后续分别绑定域名。',
  },
  {
    label: '共享后端 / 数据库',
    value: '8200 / 192.168.0.106:5432/plush_erp',
    detail:
      '桌面后台和多移动端仍然共享同一套业务真源、接口层和文档体系，不拆第二套后端服务。',
  },
]

export const plannedModules = [
  {
    key: 'customer-style',
    title: '客户 / 款式立项',
    status: 'source_grounded',
    owner: '业务 + 管理层',
    summary:
      '已从生产订单总表截图、材料 Excel 和加工合同中确认“客户 / 订单编号 / 产品订单编号 / 款式编号 / 产品编号”至少是四层编码，当前不能再混成一个字段。',
  },
  {
    key: 'bom-materials',
    title: '材料 BOM / 主料 / 辅材 / 包材',
    status: 'source_grounded',
    owner: '业务 + 采购',
    summary:
      '两份材料分析 Excel 已确认 BOM 明细、采购汇总、色卡和作业指导书四层资料结构；辅材 / 包材采购表已确认是独立导入源，不应混进主料明细。',
  },
  {
    key: 'processing-contract',
    title: '加工合同 / 委外下单',
    status: 'source_grounded',
    owner: '采购 + 财务',
    summary:
      '加工合同 PDF、委外加工汇总表和加工厂商资料已确认合同头、合同行、结算条款、供应商主档和附件快照层次。',
  },
  {
    key: 'production-schedule',
    title: '生产排单 / 跟进 / 延期 / 返工 / 异常',
    status: 'source_grounded',
    owner: 'PMC + 生产 / 厂长',
    summary:
      '正式汇报版 PDF 第 4 - 7 页和生产订单总表截图已经能支撑排单、齐套、延期、返工和异常中心的首批信息架构。',
  },
  {
    key: 'warehouse',
    title: '仓库收发 / 成品入库 / 待出货',
    status: 'source_grounded',
    owner: '仓库 + 品质',
    summary:
      '流程图已明确主辅料到仓 IQC、包装材料到仓、最终包装、成品仓和发货放行节点，扩展硬件链路 / PDA 明确 deferred。',
  },
  {
    key: 'finance',
    title: '对账 / 结算 / 应收应付',
    status: 'source_grounded',
    owner: '财务',
    summary:
      '合同 PDF 已明确对账周期和付款条款，加工 / 辅包材 Excel 已给出金额、单价和下单人字段，足以定义结算入口但还不足以硬建正式账务表。',
  },
  {
    key: 'help-docs',
    title: '帮助中心 / 文档中心',
    status: 'seeded',
    owner: '实施 / 产品',
    summary:
      '本轮会把流程、字段真源、数据模型、导入映射，以及“桌面单后台 + 移动端按端口访问”的口径同步到帮助中心与正式文档。',
  },
  {
    key: 'print-center',
    title: '模板打印中心',
    status: 'source_grounded',
    owner: '采购 + 业务 + 财务',
    summary:
      '当前只保留辅料采购合同、委外加工合同两套正式模板；业务页负责带值打开，打印中心保留默认样例和模板核对入口。',
  },
  {
    key: 'mobile-topology',
    title: '移动端多端口',
    status: 'seeded',
    owner: '全部角色',
    summary:
      '同一仓库内新增 8 个角色移动端端口，按端口直接访问各角色页面，但继续共享 common / ui / api。',
  },
]

export const phaseFlow = [
  {
    key: 'project-order',
    title: '客户 / 款式立项',
    owner: '业务 -> 老板',
    summary:
      '从客户订单、款式编号、产品编号、产品订单编号和交期承诺开始收口。当前真源显示至少有四套编号体系，必须分别保留，不再混成单一“产品编号”。',
    outputs: [
      '客户简称',
      '订单编号',
      '产品订单编号',
      '款式编号',
      '产品编号',
      '交期 / 出货日',
    ],
    mobileActions: ['缺资料提醒', '客户确认节点', '催合同 / 催料', '交期预警'],
    sources: [
      'Weixin 生产订单总表截图：客户、订单编号、客户订单号、产品编号、产品名称、出货日期、业务人员。',
      '26029 / 26204 材料分析明细表：款式编号、产品名称、订单编号、数量、设计师。',
      '9.3 加工合同 PDF：产品订单编号、产品编号、产品名称、回货日期。',
    ],
  },
  {
    key: 'bom',
    title: '材料 BOM / 主料 / 辅材 / 包材',
    owner: '业务 + 采购',
    summary:
      '主料 BOM 来自材料分析明细表，辅材 / 包材来自独立采购汇总表，色卡和作业指导书是辅助资料层。当前不能把主料、辅材、包材导入到同一张原始表里。',
    outputs: [
      'BOM 头',
      'BOM 行',
      '主料采购汇总',
      '辅材 / 包材采购清单',
      '色卡 / 作业指导书附件',
    ],
    mobileActions: ['缺料确认', '辅包材确认', '最近版本查看', '待补资料回传'],
    sources: [
      '26029# 夜樱烬色材料明细 Excel：物料名称、厂商料号、规格、组装部位、单位用量、总用量、加工程序。',
      '26204# 抱抱猴子材料明细 Excel：材料类别、颜色、损耗%、总用量、加工方式。',
      '辅材、包材 成慧怡.xlsx：产品订单编号、材料品名、采购数量、单价、下单人。',
    ],
  },
  {
    key: 'outsourcing',
    title: '加工合同 / 委外下单',
    owner: '采购 + 财务',
    summary:
      '加工合同 PDF 是正式打印快照，委外加工汇总表是历史台账 / 导入源，加工商资料表是 partner 主档候选。合同快照和主档字段必须分开保存。',
    outputs: [
      '加工合同头',
      '加工合同行',
      '加工厂 partner 主档',
      '合同条款快照',
      '纸样 / 图片附件',
    ],
    mobileActions: ['催合同', '单价确认', '加工厂回签', '结算节点提醒'],
    sources: [
      '9.3 加工合同 PDF：合同编号、加工方、委托单位、回货日期、工序名称、委托加工数量、委托加工金额、结算方式。',
      '加工 成慧怡.xlsx：委外加工订单号、加工项目、厂家名称、工序类别、单价、数量、加工金额。',
      '加工厂商资料 sheet：厂家简称、厂家全称、加工工序、联系人、开票与银行信息。',
    ],
  },
  {
    key: 'production',
    title: '生产排单 / 跟进 / 延期 / 返工 / 异常',
    owner: 'PMC + 生产经理 / 厂长',
    summary:
      '正式汇报版 PDF 第 4 页已给出主流程，第 7 页给出 PMC 与生产经理桌面 / 手机端示意。当前要先按“齐套 -> 排产 -> 延期 -> 返工 -> 异常”落页面，不去假装扩展硬件链路已就位。',
    outputs: ['生产单 / 排单', '进度日志', '延期原因', '返工记录', '异常中心'],
    mobileActions: ['今日排产', '进度回填', '延期原因', '返工 / 异常上报'],
    sources: [
      'plush_factory_formal_report_v3_mobile.pdf 第 4 页：PMC 全流程跟进、生产经理决定车缝 / 手工 / 内外发。',
      'plush_factory_formal_report_v3_mobile.pdf 第 7 页：PMC 在制订单 / 待补齐资料 / 外发延期 / 异常任务，生产经理待决策排单 / 返工异常。',
      'Weixin 生产订单总表截图：订单数量、损头版、生产数量、未出货数、类别、单价。',
    ],
  },
  {
    key: 'warehouse',
    title: '仓库收发 / 成品入库 / 待出货',
    owner: '仓库 + 品质',
    summary:
      '材料与包装到仓、IQC、成品回仓、最终包装和仓库出货单已经在正式汇报版流程图里明确。扩展硬件链路 / PDA 仍在 deferred，当前只落可操作的收发 / 入库 / 待出货视图。',
    outputs: [
      '主辅料到仓记录',
      '包装材料到仓',
      '成品入库',
      '待出货清单',
      '异常件处理',
    ],
    mobileActions: ['收货确认', '备料提醒', '成品入库', '待出货检查'],
    sources: [
      'plush_factory_formal_report_v3_mobile.pdf 第 4 页：主料 / 辅料到仓 IQC、包装材料到仓、最终包装 / 入成品仓、业务确认 / 仓库出货单 / 财务放行 / 发货。',
      'Weixin 生产订单总表截图：出货日期、未出货数、备注。',
    ],
  },
  {
    key: 'settlement',
    title: '对账 / 结算 / 应收应付',
    owner: '财务',
    summary:
      '当前真源还不足以硬建完整账务模型，但已足够定义结算单入口、合同金额快照、加工费 / 辅包材费用对账和异常费用提醒。',
    outputs: ['结算单入口', '加工费对账', '辅材 / 包材费用汇总', '应付提醒'],
    mobileActions: ['待对账', '待付款', '异常费用', '结算提醒'],
    sources: [
      '9.3 加工合同 PDF：次月开始对账、每月 15 号前完成对账、次月支付货款。',
      '加工 成慧怡.xlsx：加工金额公式列。',
      '辅材、包材 成慧怡.xlsx：采购金额公式列与下单人 / 联系电话。',
    ],
  },
  {
    key: 'print-output',
    title: '模板打印 / 对外留档',
    owner: '业务 + 采购 + 财务',
    summary:
      '采购合同和加工合同已经有真实打印或报表样本，当前从对应业务页带值打开，打印中心保留默认样例核对入口。',
    outputs: [
      '辅料采购合同',
      '委外加工合同',
      '材料分析汇总表',
      '加工分析汇总表',
      '生产订单总表',
    ],
    mobileActions: ['仅查看打印口径与角色边界，不在手机端编辑模板'],
    sources: [
      '模板-材料与加工合同.xlsx：C类辅料合同、B类加工合同、材料分析汇总表-修改、加工分析汇总表-修改。',
      '9.3加工合同-子淳.pdf：验证委外加工合同的实际打印观感与条款区。',
      'Weixin 生产订单总表截图：验证生产报表字段和高亮列。',
    ],
  },
]

export const fieldTruthRows = [
  {
    field: '客户',
    source: 'Weixin 生产订单总表截图',
    sourceField: '客户',
    truthType: '业务快照',
    target: '订单 / 生产单头快照，后续关联 partner.customer',
    stability: '中',
    note: '当前只有客户简称或代号（如 MY、ZC），尚不足以直接固化客户主档编码体系。',
  },
  {
    field: '款式编号',
    source: '26029 / 26204 材料分析明细表',
    sourceField: '产品编号（26029# / 26204#）',
    truthType: '主数据候选',
    target: 'style 主档 / BOM 头',
    stability: '高',
    note: '当前最像款式主档编号，应与生产订单截图中的产品编号 / SKU 分开。',
  },
  {
    field: '产品编号 / SKU',
    source: '加工合同 PDF、生产订单总表截图',
    sourceField: '产品编号（24594 / 25481 等）',
    truthType: '业务快照',
    target: '订单行 / 生产单行快照',
    stability: '中',
    note: '与款式编号不是一套编号；现阶段不宜和 style_no 合并。',
  },
  {
    field: '产品订单编号',
    source: '加工合同 PDF、加工汇总表、材料明细表、生产订单截图',
    sourceField: '产品订单编号 / 订单编号 / 客户订单号',
    truthType: '业务快照',
    target: '订单头 / 订单行引用字段',
    stability: '低',
    note: '当前出现 PT240801、WL260102、XH260401、MY250804 等多套口径，需后续继续梳理关系。',
  },
  {
    field: '产品名称',
    source: '材料明细、加工合同、生产订单截图',
    sourceField: '产品名称',
    truthType: '主数据 + 快照并存',
    target: 'style 主档名称 + 订单 / 合同快照名称',
    stability: '中',
    note: '存在“夜樱烬色”“抱抱猴子-黑色”“万圣节衣服套装”等不同层级，需拆 style_name 与 line_name。',
  },
  {
    field: '颜色',
    source: '26204 材料分析明细表、生产订单总表截图',
    sourceField: '颜色 / 本色',
    truthType: '业务快照',
    target: 'style variant / 订单行快照',
    stability: '中',
    note: '部分来源单独列颜色，部分来源把颜色写进产品名称，当前不宜强制必填。',
  },
  {
    field: '数量',
    source: '材料分析明细表、加工合同、加工汇总表、生产订单总表截图',
    sourceField: '数量 / 委托加工数量 / 订单数量 / 生产数量',
    truthType: '业务字段',
    target: '订单数量、合同数量、生产数量分别落表',
    stability: '高',
    note: '数量语义不同，必须拆成 order_qty / contract_qty / planned_qty / unshipped_qty。',
  },
  {
    field: '损耗',
    source: '材料分析明细表',
    sourceField: '损耗% / 总用量含损耗 10%',
    truthType: 'BOM 业务字段',
    target: 'bom_line.loss_rate / loss_note',
    stability: '中',
    note: '有些模板把损耗写成固定 10% 标题，有些是独立列，导入需兼容两种口径。',
  },
  {
    field: '单价',
    source: '加工合同 PDF、加工汇总表、辅材 / 包材采购表、生产订单总表截图',
    sourceField: '单价',
    truthType: '业务字段',
    target: '加工单价、采购单价、订单快照单价分别落表',
    stability: '中',
    note: '不能只保留一个裸 unit_price；至少要区分 processing_unit_price、material_unit_price、order_unit_price。',
  },
  {
    field: '加工费',
    source: '加工合同 PDF、加工 成慧怡.xlsx',
    sourceField: '委托加工金额 / 加工金额',
    truthType: '合同 / 结算快照',
    target: 'processing_contract_line.amount_snapshot / settlement_line.amount',
    stability: '高',
    note: '金额由单价 * 数量得出，但合同打印与导入都要保留快照值。',
  },
  {
    field: '主料',
    source: '材料分析明细表 / 汇总表',
    sourceField: '物料名称 / 厂商料号 / 规格 / 组装部位 / 总用量',
    truthType: 'BOM + 采购派生',
    target: 'material master + bom_line + material_purchase_snapshot',
    stability: '高',
    note: '当前材料明细是正式真源之一，不能被辅材 / 包材采购表覆盖。',
  },
  {
    field: '辅材 / 包材',
    source: '辅材、包材 成慧怡.xlsx',
    sourceField: '材料品名 / 厂商料号 / 规格 / 采购数量',
    truthType: '采购业务快照',
    target: 'material master(category=辅材/包材) + purchase snapshot',
    stability: '中',
    note: '模板中“厂商料号”列实际经常填供应商名称，需在导入层清洗和映射。',
  },
  {
    field: '交期 / 回货日期',
    source: '加工合同 PDF、正式汇报版 PDF',
    sourceField: '回货日期 / 审核生产资料后推进',
    truthType: '业务字段',
    target: 'contract.promised_return_date / production milestone',
    stability: '中',
    note: '合同是加工厂回货时间，不等于客户出货日期，不能混用。',
  },
  {
    field: '出货日期',
    source: 'Weixin 生产订单总表截图',
    sourceField: '出货日期',
    truthType: '订单 / 发货快照',
    target: 'order_line.ship_date_snapshot / shipment plan',
    stability: '中',
    note: '当前只在生产总表中看到，尚缺真实出货单或仓库单据样本。',
  },
  {
    field: '图片 / 附件',
    source: '加工合同 PDF、材料汇总 / 作业指导书、生产订单总表截图',
    sourceField: '合同附件图片 / Excel 内嵌图片 / 图片列',
    truthType: '附件快照',
    target: 'attachment 表 + 订单 / 合同关联',
    stability: '中',
    note: '图片列与合同附件不能直接塞进主表，必须单独建 attachment 关系表。',
  },
  {
    field: '备注',
    source: '合同、材料 Excel、辅材 / 包材采购表、生产订单总表截图',
    sourceField: '备注',
    truthType: '业务快照',
    target: '各业务表 remark / memo 字段',
    stability: '高',
    note: '备注会跨模块出现，但必须按单据类型分别保存，不能收成单一公共备注。',
  },
  {
    field: '结算相关金额',
    source: '加工合同 PDF、加工汇总表、辅材 / 包材采购表',
    sourceField: '委托加工金额 / 加工金额 / 金额公式列',
    truthType: '合同 / 结算快照',
    target: 'settlement 单头单行',
    stability: '中',
    note: '金额来源明确，但当前缺少正式结算单或对账单样本，因此先停在结算入口和快照字段。',
  },
]

export const pendingFieldTruthRows = [
  {
    field: '客户主档全称 / 对账主体',
    reason: '当前只有客户简称或代号，没有完整客户主档样本。',
  },
  {
    field: '订单编号 vs 产品订单编号 vs 客户订单号 的层级关系',
    reason:
      '不同文件使用不同命名，且编码格式不一致，当前还不能稳定收口为单一键模型。',
  },
  {
    field: '产品名称 vs 款式名称 vs 部件名称',
    reason:
      '材料分析表、加工合同和作业指导书分别使用整款名称、颜色款名称和部件名称。',
  },
  {
    field: '颜色是否独立为 variant 维度',
    reason:
      '部分来源单独列颜色，部分来源写进名称；需要更多订单 / BOM 样本确认。',
  },
  {
    field: '供应商主档里的开户地址 / 开票点数 / 对接人电话是否作为正式字段',
    reason:
      '加工厂商资料表格式较脏，且包含敏感字段，当前只适合文档设计，不宜直接入表。',
  },
]

export const sourceReadiness = {
  received: [
    {
      type: 'PDF',
      name: '9.3加工合同-子淳.pdf',
      intendedFor: '加工合同头、合同行、条款快照、结算方式和附件映射。',
      facts: [
        '合同头明确包含合同编号、加工方名称、委托单位、委托人、联系电话、回货日期。',
        '合同行明确包含产品订单编号、产品编号、产品名称、工序名称、工序类别、单价、数量、金额。',
        '合同正文明确存在延期违约条款和月度对账 / 次月付款规则。',
      ],
    },
    {
      type: 'Excel',
      name: '模板-材料与加工合同.xlsx',
      intendedFor: '统一打印模板母版、汇总表口径和合同条款区。',
      facts: [
        '一个文件内同时包含 C类辅料合同、B类加工合同、材料分析明细 / 汇总、加工分析汇总、厂商主档候选。',
        'C类辅料合同与 B类加工合同都通过 VLOOKUP 把汇总表和厂商资料映射进打印合同头，说明模板打印与主数据快照必须分层。',
        '材料 / 加工汇总表保留公式缓存值和多数量带宽列，适合先做固定打印预览和口径说明。',
      ],
    },
    {
      type: 'Excel',
      name: '26029#夜樱烬色才料明细表2026-1-19.xlsx',
      intendedFor: '主料 BOM 明细、采购汇总、色卡和作业指导书拆分。',
      facts: [
        '材料分析明细表以款式编号 26029# 为头，列出物料名称、厂商料号、规格、组装部位、单位用量、总用量和加工程序。',
        '材料分析汇总表是从明细表派生出的采购汇总，不应反过来覆盖 BOM 真源。',
        'Sheet1 是作业指导书，说明后续需要 attachment / SOP 文档层。',
      ],
    },
    {
      type: 'Excel',
      name: '26204#抱抱猴子材料明细表2026-4-10.xlsx',
      intendedFor: '带颜色 / 损耗率 / 加工方式的 BOM 变体样本。',
      facts: [
        '表头比 26029 模板多出材料类别、颜色、片数和损耗%，说明 BOM 模板并非单一固定格式。',
        '总用量是公式缓存值，导入层必须兼容 data_only 值与公式源。',
        '备注里出现“共 25251# 纸样 / 色卡”，说明附件与共享纸样关系需要单独设计。',
      ],
    },
    {
      type: 'Excel',
      name: '加工 成慧怡.xlsx',
      intendedFor: '委外加工导入草案和加工厂 partner 主档设计。',
      facts: [
        '委外加工汇总表已确认委外加工订单号、工序、厂家、工序类别、单价、数量、金额、下单人和联系电话。',
        '加工厂商资料表已给出厂家简称 / 全称、加工工序、联系人、开票和银行信息。',
        '厂商资料格式较脏且含敏感字段，当前只能作为主档候选来源，不能直接入正式 schema。',
      ],
    },
    {
      type: 'Excel',
      name: '辅材、包材 成慧怡.xlsx',
      intendedFor: '辅材 / 包材采购导入草案。',
      facts: [
        '当前模板以产品订单编号开头，后接材料品名、规格、采购数量、单价、下单人和联系电话。',
        '“厂商料号”列在样本里大量承载的是供应商名称，说明原模板口径并不稳定。',
        '金额列依赖公式缓存值，且与备注列存在表头不整齐问题，导入必须增加清洗规则。',
      ],
    },
    {
      type: 'PDF',
      name: 'plush_factory_formal_report_v3_mobile.pdf',
      intendedFor: '桌面单后台与移动端端口信息架构。',
      facts: [
        '第 4 页给出老板视角总览流程：审核、采购、外发、品质、包装、出货。',
        '第 5 - 7 页明确业务、老板、PMC、生产经理的桌面 + 手机端示意。',
        '第 8 页提到扩展硬件联动场景，但本轮统一标记 deferred。',
      ],
    },
    {
      type: 'PNG',
      name: 'Weixin Image_20260420164444_2155_288.png',
      intendedFor: '生产订单总表字段命名和桌面 / 手机端信息优先级。',
      facts: [
        '截图已确认字段：下单日期、客户、订单编号、客户订单号、产品编号、产品名称、颜色、订单数量、损头版、生产数量、出货日期、未出货数、业务人员、图片、类别、单价、备注。',
        '这是一张生产订单总表而不是简单看板图片，应视为正式字段样本。',
      ],
    },
    {
      type: 'JPEG',
      name: 'Weixin Image_20260421153105_2272_288.jpeg',
      intendedFor: '辅料采购合同实拍校对和打印观感确认。',
      facts: [
        '实拍图与模板母版的 C类辅料合同结构一致，说明合同头、明细表、条款区和签字区当前版式稳定。',
        '实拍图再次确认“采购订单号 / 产品订单编号 / 产品编号 / 材料品名 / 厂商料号 / 采购数量 / 采购金额”是一张合同快照表，而不是纯主数据页面。',
      ],
    },
  ],
  pending: [
    '更多客户订单 / 出货单 / 仓库单据样本，用来确认订单号和客户订单号关系。',
    '更多加工合同 PDF，确认下单日期字段是否一直是当前数值格式。',
    '更多 BOM / 辅材 / 包材 Excel，确认材料类别、颜色和金额列的稳定口径。',
    '正式结算单或对账单样本，用来决定 settlement 表是否可本轮落库。',
    '扩展硬件链路 / PDA 真实流程样本；在拿到前继续保持 deferred。',
  ],
}

const roleWorkbenches = [
  {
    key: 'boss',
    title: '老板 / 管理层',
    label: '经营驾驶舱',
    summary:
      '老板在桌面后台看全局经营风险和审批，在移动端只看异常、交期和待结算，不做复杂录入。',
    defaultPath: '/erp/roles/boss',
    allowedNavKeys: [
      'workspace-home',
      'global-dashboard',
      'business-dashboard',
      'flow-overview',
      'source-readiness',
      'print-center',
      'mobile-workbenches',
      'help-center',
      'doc-system-init',
      'doc-operation-playbook',
      'doc-field-truth',
      'doc-data-model',
      'doc-import-mapping',
      'doc-mobile-roles',
      'doc-print-templates',
      'changes',
    ],
    desktopFocus: [
      '经营总览',
      '待审核资料 / 合同',
      '高风险订单',
      '待结算 / 待放行',
    ],
    mobileFocus: ['交期风险', '异常订单', '未完成数量', '待结算', '本周重点'],
    desktopMenuPreview: [
      '角色首页：老板工作台',
      '业务看板：经营总览、风险、结算提醒',
      '真源与打印：资料与字段真源、模板打印中心',
      '帮助中心：流程总览、系统初始化、数据模型、老板审批口径',
    ],
    desktopHighlights: [
      {
        label: '待审核',
        value: '5 项',
        note: '来自正式汇报版 V3 第 6 页老板面板样例。',
      },
      {
        label: '延期预警',
        value: '6 单',
        note: '桌面端优先暴露交期风险，不让老板翻明细表找问题。',
      },
      {
        label: '异常订单',
        value: '8 单',
        note: '高风险订单按主料缺料 / 裁片延期 / 客户验货风险排序。',
      },
      {
        label: '本周出货',
        value: '9 单',
        note: '与生产订单总表里的出货日期、未出货数字段对齐。',
      },
    ],
    desktopQueues: [
      {
        title: '老板首页待办',
        items: [
          '审核订单 + 包装材料打单表后，才放行采购与生产资料。',
          '查看高风险订单和未出货数，不再靠群消息追单。',
          '确认异常费用和待结算加工费节点。',
        ],
      },
      {
        title: '帮助中心优先看',
        items: [
          '先看流程图第 4 页，确认“审核 -> 采购 -> 外发 -> 品质 -> 包装 -> 出货”主线。',
          '再看字段真源，避免把款式编号、产品编号和订单号混用。',
        ],
      },
    ],
    firstWave: [
      '老板角色首页',
      '高风险订单列表',
      '延期 / 待结算提醒',
      '角色化帮助中心',
    ],
    pending: ['利润明细口径', '经营报表 drill-down', '跨角色审批流'],
    helpFocus: [
      '老板审批的是订单、包装材料打单表和生产资料，不是直接改 BOM。',
      '桌面后台保留一个入口，角色差异通过菜单与首页配置控制。',
      '扩展硬件链路引用自汇报样例，但本轮明确 deferred。',
    ],
    sourceRefs: [
      'plush_factory_formal_report_v3_mobile.pdf 第 4 - 6 页',
      'Weixin 生产订单总表截图',
      '9.3 加工合同 PDF 的回货日期和结算条款',
    ],
    mobileHighlights: [
      {
        label: '待审核',
        value: '5 项',
        note: '来源于正式汇报 PDF 的老板手机端示意。',
      },
      { label: '延期预警', value: '6 单', note: '优先暴露交期风险。' },
      {
        label: '异常订单',
        value: '8 单',
        note: '聚焦缺料 / 延误 / 客户验货风险。',
      },
      {
        label: '本周出货',
        value: '9 单',
        note: '对应生产订单总表的发货节点。',
      },
    ],
    mobileSections: [
      {
        title: '今日盯住的风险',
        items: ['主料缺料', '裁片延期', '客户验货风险', '待结算加工费'],
      },
      {
        title: '老板手机端动作',
        items: [
          '查看高风险订单',
          '审批异常费用',
          '确认发货放行',
          '点开本周重点',
        ],
      },
    ],
    mobileTaskFlow: [
      '打开老板移动端先看待审核 / 延期预警 / 异常订单 / 本周出货。',
      '点进高风险订单只看摘要，不做复杂录入。',
      '需要追责或协调时回到桌面后台处理。',
    ],
    mobileDeferred: [
      '不做复杂经营分析配置。',
      '不在手机端处理硬件联动验货。',
      '不在手机端维护利润口径。',
    ],
  },
  {
    key: 'business',
    title: '业务',
    label: '前台总控',
    summary:
      '业务是客户 / 款式 / 材料 / 合同 / 交期总入口，桌面负责结构化维护，移动端负责催办和风险确认。',
    defaultPath: '/erp/roles/business',
    allowedNavKeys: [
      'workspace-home',
      'flow-overview',
      'source-readiness',
      'print-center',
      'mobile-workbenches',
      'help-center',
      'doc-system-init',
      'doc-operation-playbook',
      'doc-field-truth',
      'doc-import-mapping',
      'doc-mobile-roles',
      'doc-print-templates',
      'changes',
    ],
    desktopFocus: [
      '客户 / 款式立项',
      '包装材料打单',
      '客户验货要求',
      '出货确认',
      '交期预警',
    ],
    mobileFocus: ['客户 / 款式', '缺资料', '催料', '催合同', '交期预警'],
    desktopMenuPreview: [
      '角色首页：业务工作台',
      '真源与打印：资料准备、模板打印中心',
      '帮助中心：流程总览、编号体系、字段真源、deferred 边界',
    ],
    desktopHighlights: [
      {
        label: '待跟进',
        value: '6 条',
        note: '来源于正式汇报 PDF 第 5 页业务工作台样例。',
      },
      {
        label: '缺资料',
        value: '4 条',
        note: '优先提醒缺包装材料打单表或客户验货要求。',
      },
      {
        label: '待出货',
        value: '3 条',
        note: '与生产订单总表里的出货日期 / 未出货数联动设计。',
      },
      {
        label: '验货提醒',
        value: '2 条',
        note: '保留客户验货提醒，但不假装已有移动现场上传。',
      },
    ],
    desktopQueues: [
      {
        title: '业务首页待办',
        items: [
          '创建包装材料打单表。',
          '补齐客户验货要求。',
          '输入出货信息并同步到仓库 / 财务。',
        ],
      },
      {
        title: '字段风险提醒',
        items: [
          '订单编号、产品订单编号、客户订单号当前不能混用。',
          '产品名称、款式名称和部件名称要分层保存。',
        ],
      },
    ],
    firstWave: ['角色首页', '款式 / 编号真源提示', '资料缺口清单', '催办入口'],
    pending: ['客户消息同步', '完整 BOM 编辑', '现场上传'],
    helpFocus: [
      '业务先看字段真源文档，再做款式 / 合同 / 出货跟进。',
      '业务移动端只做催办和风险确认，不做完整 BOM 录入。',
      '包装材料打单来自老板审批链，不是独立旁路。',
    ],
    sourceRefs: [
      'plush_factory_formal_report_v3_mobile.pdf 第 5 页',
      'Weixin 生产订单总表截图',
      '26029 / 26204 材料 Excel 表头',
    ],
    mobileHighlights: [
      {
        label: '今日重点',
        value: '缺资料 / 催料 / 出货',
        note: '业务手机端优先级来自正式汇报 PDF 第 5 页。',
      },
      {
        label: '创建动作',
        value: '包装材料打单表',
        note: '业务需要直接发起包装材料打单。',
      },
      {
        label: '催办动作',
        value: '催合同 / 催料',
        note: '不在手机端维护完整 BOM。',
      },
      {
        label: '风险动作',
        value: '验货 / 交期预警',
        note: '客户验货要求和交期提醒必须同页呈现。',
      },
    ],
    mobileSections: [
      {
        title: '手机端看板',
        items: ['今日重点', '缺资料清单', '客户确认节点', '交期预警'],
      },
      {
        title: '手机端快捷操作',
        items: ['催合同', '催辅料', '输入出货信息', '回填异常备注'],
      },
    ],
    mobileTaskFlow: [
      '先确认客户 / 款式 / 交期是否齐全。',
      '缺资料就发起催办，不在手机端改完整 BOM。',
      '包装材料打单和出货信息回到共享真源，不做独立旁路表。',
    ],
    mobileDeferred: [
      '不在手机端维护完整 BOM。',
      '不做现场上传和图片识别。',
      '不拆第二套业务后端。',
    ],
  },
  {
    key: 'pmc',
    title: 'PMC',
    label: '齐套与调度中枢',
    summary:
      'PMC 负责齐套判断、交期推进、异常分发和催办，不直接替代老板审批、生产执行或财务放行。',
    defaultPath: '/erp/roles/pmc',
    allowedNavKeys: [
      'workspace-home',
      'global-dashboard',
      'business-dashboard',
      'flow-overview',
      'source-readiness',
      'print-center',
      'mobile-workbenches',
      'help-center',
      'help-operation-flow-overview',
      'help-operation-guide',
      'help-role-collaboration-guide',
      'help-role-page-document-matrix',
      'help-task-document-mapping',
      'help-workflow-status-guide',
      'help-mobile-role-guide',
      'help-exception-handling-guide',
      'changes',
    ],
    desktopFocus: [
      '齐套判断',
      '排单推进',
      '延期预警',
      '异常分发',
      '回货 / 到料跟催',
    ],
    mobileFocus: ['齐套提醒', '催办', '排单推进', '延期跟进', '异常分发'],
    desktopMenuPreview: [
      '角色首页：PMC 工作台',
      '任务看板：按阻塞、即将超期和异常分发排序',
      '帮助中心：任务 / 单据映射表、状态字典、异常处理',
    ],
    desktopHighlights: [
      {
        label: '待齐套',
        value: '7 单',
        note: '优先看主料、辅包材、回签和关键资料是否都齐。',
      },
      {
        label: '待排单',
        value: '4 单',
        note: '齐套条件满足后再交给生产经理做执行决策。',
      },
      {
        label: '延期预警',
        value: '5 单',
        note: 'PMC 先看可能失交期的批次，不等老板来追问。',
      },
      {
        label: '异常分发',
        value: '6 条',
        note: '把异常回给采购、品质、生产或业务，不把问题压在自己名下。',
      },
    ],
    desktopQueues: [
      {
        title: 'PMC 首页待办',
        items: [
          '确认当前订单是否满足可排单条件。',
          '催采购、催回签、催回货、催资料缺口闭环。',
          '把延期、返工和异常明确分发到责任角色。',
        ],
      },
      {
        title: '当前边界',
        items: [
          'PMC 不是老板审批替身，也不是生产经理执行替身。',
          '当前不做复杂产能算法，只先把齐套和推进关系收口。',
        ],
      },
    ],
    firstWave: ['角色首页', '齐套卡片', '延期预警', '异常分发入口'],
    pending: ['自动催办策略', '复杂排产算法', '跨批次资源平衡'],
    helpFocus: [
      'PMC 先看任务 / 单据映射表，不要把任务池误解成业务真源。',
      'PMC 负责推进和分发，不直接写客户前置资料或财务结算。',
      '阻塞原因优先挂在统一状态字典，不在各页各写一套中文状态。',
    ],
    sourceRefs: [
      'plush_factory_formal_report_v3_mobile.pdf 第 4、7 页',
      'Weixin 生产订单总表截图',
      '任务 / 单据映射表',
    ],
    mobileHighlights: [
      {
        label: '待齐套',
        value: '主料 / 辅包材 / 回签',
        note: '先定位是哪一个上游环节还没满足可排条件。',
      },
      {
        label: '催办',
        value: '采购 / 品质 / 业务 / 生产',
        note: 'PMC 手机端先做推进和提醒，不做复杂录入。',
      },
      {
        label: '排单推进',
        value: 'ready -> processing',
        note: '任务状态和业务状态需要同时对齐。',
      },
      {
        label: '异常分发',
        value: 'blocked / rejected',
        note: '异常必须回给责任角色，不允许留空。',
      },
    ],
    mobileSections: [
      {
        title: '手机端看板',
        items: ['待齐套批次', '即将延期订单', '今日催办', '待分发异常'],
      },
      {
        title: '手机端快捷操作',
        items: ['确认可排', '催采购', '催回签', '分发异常'],
      },
    ],
    mobileTaskFlow: [
      '先看哪张单还不满足 ready 条件。',
      '再决定是继续催办还是转给生产经理排单。',
      '遇到 blocked 或 rejected 时，立即分发到责任角色并保留原因。',
    ],
    mobileDeferred: [
      '不在手机端维护复杂排产算法。',
      '不在手机端改客户前置资料。',
      '不把 PMC 端扩成独立业务后台。',
    ],
  },
  {
    key: 'purchasing',
    title: '采购',
    label: '到料与回签',
    summary:
      '采购桌面端聚焦主料 / 辅料 / 包材需求和加工厂回签，移动端聚焦缺料、到料和单价确认。',
    defaultPath: '/erp/roles/purchasing',
    allowedNavKeys: [
      'workspace-home',
      'flow-overview',
      'source-readiness',
      'print-center',
      'mobile-workbenches',
      'help-center',
      'doc-system-init',
      'doc-field-truth',
      'doc-data-model',
      'doc-import-mapping',
      'doc-mobile-roles',
      'doc-print-templates',
    ],
    desktopFocus: [
      '主料需求',
      '辅材 / 包材采购',
      '加工合同',
      '供应商回签',
      '到料 / IQC',
    ],
    mobileFocus: ['缺料', '到料', '单价确认', '回签', '辅材包材确认'],
    desktopMenuPreview: [
      '角色首页：采购工作台',
      '真源与打印：材料 Excel / 加工汇总 / 辅包材汇总、模板打印中心',
      '帮助中心：字段真源、数据模型、导入映射',
    ],
    desktopHighlights: [
      {
        label: '主料真源',
        value: '材料分析明细表',
        note: '主料数量和损耗来自 BOM 明细，不从辅包材表反推。',
      },
      {
        label: '辅包材真源',
        value: '辅材、包材采购表',
        note: '是独立采购导入源，字段要单独清洗。',
      },
      {
        label: '加工单价',
        value: '加工汇总表',
        note: '委外加工订单号、工序类别、单价、数量、金额已明确。',
      },
      {
        label: '到料节点',
        value: '仓库 + 品质 IQC',
        note: '来自正式汇报 PDF 第 4 页流程图。',
      },
    ],
    desktopQueues: [
      {
        title: '采购首页待办',
        items: [
          '建立主料采购表 / 辅料采购表并跟催。',
          '确认加工厂联系人、回签和开票信息。',
          '跟进包装材料到仓并回传 IQC 状态。',
        ],
      },
      {
        title: '导入风险提醒',
        items: [
          '辅包材模板里“厂商料号”列经常实际承载供应商名称。',
          '金额列依赖公式缓存值，导入时要优先取 data_only。',
        ],
      },
    ],
    firstWave: [
      '角色首页',
      '缺料 / 到料卡片',
      '加工合同节点',
      '辅包材确认入口',
    ],
    pending: ['自动比价', '供应商绩效', '到料硬件联动'],
    helpFocus: [
      '采购真源分三类：主料 BOM、辅包材采购、加工合同 / 加工商主档。',
      '供应商联系人和银行字段含敏感信息，本轮只停在文档设计。',
      '到料硬件联动继续 deferred。',
    ],
    sourceRefs: [
      '加工 成慧怡.xlsx',
      '辅材、包材 成慧怡.xlsx',
      'plush_factory_formal_report_v3_mobile.pdf 第 4 页',
    ],
    mobileHighlights: [
      {
        label: '缺料',
        value: '主料 / 辅材 / 包材',
        note: '采购移动端先看缺料而不是看全量台账。',
      },
      { label: '到料', value: '仓库 + IQC', note: '材料到仓后才算真正闭环。' },
      {
        label: '单价确认',
        value: '加工 / 辅包材',
        note: '单价不能混成一个字段。',
      },
      {
        label: '回签',
        value: '合同 / 供应商',
        note: '采购端追踪加工厂回签和包装材料供应商回复。',
      },
    ],
    mobileSections: [
      {
        title: '手机端待办',
        items: ['缺料清单', '到料确认', '单价确认', '加工厂回签'],
      },
      {
        title: '手机端提醒',
        items: ['辅材 / 包材确认', 'IQC 回执', '异常费用预警'],
      },
    ],
    mobileTaskFlow: [
      '先确认需求来自主料 BOM、辅包材采购表还是加工合同。',
      '在手机端只确认状态与催办，不编辑复杂导入模板。',
      '到料 / IQC / 回签结果回写共享真源。',
    ],
    mobileDeferred: [
      '不做自动比价。',
      '不做供应商到料硬件联动。',
      '不把银行敏感字段暴露到移动端。',
    ],
  },
  {
    key: 'production',
    title: '生产 / 厂长',
    label: '排产与异常',
    summary:
      '生产桌面端负责排单、返工和异常中心，移动端负责今日排产、进度回填和延期原因。',
    defaultPath: '/erp/roles/production',
    allowedNavKeys: [
      'workspace-home',
      'flow-overview',
      'source-readiness',
      'print-center',
      'mobile-workbenches',
      'help-center',
      'doc-operation-playbook',
      'doc-mobile-roles',
      'doc-print-templates',
    ],
    desktopFocus: [
      '今日排产',
      '延期原因',
      '返工',
      '异常中心',
      '外发 / 本厂分流',
    ],
    mobileFocus: ['今日排产', '进度回填', '延期原因', '返工', '异常'],
    desktopMenuPreview: [
      '角色首页：生产工作台',
      '排产 / 返工 / 异常中心',
      '帮助中心：deferred 场景和现场职责边界',
    ],
    desktopHighlights: [
      {
        label: '待决策排单',
        value: '3 条',
        note: '来源于正式汇报 PDF 第 7 页生产经理面板。',
      },
      {
        label: '待补齐手工',
        value: '4 条',
        note: '说明手工工序与车缝工序需要分开跟进。',
      },
      {
        label: '返工任务',
        value: '6 条',
        note: '返工不能只算备注，需要单独日志入口。',
      },
      {
        label: '品质异常',
        value: '6 条',
        note: '品质异常与返工应并列展示，而不是藏在备注里。',
      },
    ],
    desktopQueues: [
      {
        title: '生产首页待办',
        items: [
          '决定车缝 / 手工 / 内外发去向。',
          '跟踪今日排产、延期原因和返工状态。',
          '把异常交给品质 / PMC / 业务共同闭环。',
        ],
      },
      {
        title: '当前边界',
        items: [
          '扩展硬件链路和工时采集继续 deferred。',
          '生产端先做进度日志，不抢跑复杂排产引擎。',
        ],
      },
    ],
    firstWave: ['角色首页', '排产卡片', '进度回填', '返工 / 异常列表'],
    pending: ['工序硬件联动', '现场质检', '工时采集'],
    helpFocus: [
      'PMC 全流程跟进，生产经理负责车缝 / 手工 / 内外发决策。',
      '返工和异常要单独成日志，不继续沉到备注。',
      '扩展硬件链路来自汇报样例，但本轮不做。',
    ],
    sourceRefs: [
      'plush_factory_formal_report_v3_mobile.pdf 第 4 页 / 第 7 页',
      'Weixin 生产订单总表截图',
    ],
    mobileHighlights: [
      {
        label: '今日排产',
        value: '车缝 / 手工',
        note: '移动端先看排产，不直接改复杂计划。',
      },
      {
        label: '进度回填',
        value: '开工 / 完工 / 延期',
        note: '进度回填是首批真动作。',
      },
      { label: '返工', value: '独立入口', note: '返工不是补在备注里。' },
      {
        label: '异常',
        value: '品质 / 交期',
        note: '异常中心与品质问题并列暴露。',
      },
    ],
    mobileSections: [
      {
        title: '手机端现场动作',
        items: ['回填今日进度', '填写延期原因', '提交返工记录', '查看异常列表'],
      },
      {
        title: '手机端风险',
        items: ['外发返厂延期', '手工未补齐', '裁片问题', '品质异常'],
      },
    ],
    mobileTaskFlow: [
      '先看今日排产和待决策排单。',
      '在现场回填开工 / 完工 / 延期原因。',
      '返工 / 异常直接进日志，不做硬件联动回填。',
    ],
    mobileDeferred: [
      '扩展硬件链路 deferred。',
      '不做 PDA 工时采集。',
      '不做复杂排产编辑。',
    ],
  },
  {
    key: 'warehouse',
    title: '仓库',
    label: '收发与备货',
    summary:
      '仓库桌面端看主辅料到仓、包装材料到仓、成品入库和待出货，移动端只做收货 / 备料 / 入库 / 异常件处理。',
    defaultPath: '/erp/roles/warehouse',
    allowedNavKeys: [
      'workspace-home',
      'flow-overview',
      'source-readiness',
      'print-center',
      'mobile-workbenches',
      'help-center',
      'doc-operation-playbook',
      'doc-mobile-roles',
      'doc-print-templates',
    ],
    desktopFocus: [
      '主辅料到仓',
      '包装材料到仓',
      '成品入库',
      '待出货',
      '异常件处理',
    ],
    mobileFocus: ['收货', '备料', '成品入库', '待出货', '异常件处理'],
    desktopMenuPreview: [
      '角色首页：仓库工作台',
      '收货 / 备料 / 成品入库 / 待出货',
      '帮助中心：扩展硬件链路 deferred 边界',
    ],
    desktopHighlights: [
      {
        label: '主辅料到仓',
        value: '仓库 + IQC',
        note: '来源于正式汇报 PDF 第 4 页主线流程。',
      },
      {
        label: '包装材料到仓',
        value: '独立支线',
        note: '包装材料不是顺带字段，有单独下单 / 到仓 / 质检 / 领用路径。',
      },
      {
        label: '成品回仓',
        value: '入成品仓',
        note: '车缝 / 手工完成后都要回仓并检验。',
      },
      {
        label: '出货放行',
        value: '业务 + 财务 + 仓库',
        note: '发货前需要业务确认、仓库出货单和财务放行。',
      },
    ],
    desktopQueues: [
      {
        title: '仓库首页待办',
        items: [
          '确认主辅料到仓和包装材料到仓。',
          '执行最终包装并入成品仓。',
          '跟进待出货和异常件处理。',
        ],
      },
      {
        title: '当前边界',
        items: [
          '硬件化入库 / PDA 继续 deferred。',
          '先用移动端做轻量确认，不做复杂库位策略。',
        ],
      },
    ],
    firstWave: ['角色首页', '收货 / 入库清单', '待出货清单', '异常件入口'],
    pending: ['硬件化入库', 'PDA 打包', '库位策略'],
    helpFocus: [
      '包装材料存在独立支线，不能忽略。',
      '收货、入库、待出货先按视图和日志落地，不做硬件化登记。',
      '发货放行是业务 + 财务 + 仓库协作节点。',
    ],
    sourceRefs: [
      'plush_factory_formal_report_v3_mobile.pdf 第 4 页',
      'Weixin 生产订单总表截图',
    ],
    mobileHighlights: [
      {
        label: '收货',
        value: '主料 / 包材',
        note: '材料和包装材料分两条线到仓。',
      },
      {
        label: '备料',
        value: '最终包装前置',
        note: '包装材料到仓后再进入领用。',
      },
      {
        label: '入库',
        value: '成品回仓',
        note: '车缝 / 手工完成后统一入成品仓。',
      },
      {
        label: '待出货',
        value: '业务确认 / 财务放行',
        note: '不是仓库单点动作。',
      },
    ],
    mobileSections: [
      {
        title: '手机端现场动作',
        items: ['确认收货', '确认备料', '确认成品入库', '处理异常件'],
      },
      {
        title: '手机端提醒',
        items: ['包装材料到仓', '待出货检查', '缺件反馈', '财务未放行提醒'],
      },
    ],
    mobileTaskFlow: [
      '先确认到仓和 IQC 结果。',
      '再处理备料、包装和成品入库。',
      '待出货时只做确认和异常反馈，不做硬件化登记。',
    ],
    mobileDeferred: [
      '扩展硬件链路 deferred。',
      'PDA 打包 deferred。',
      '不做复杂库位调整。',
    ],
  },
  {
    key: 'quality',
    title: '品质',
    label: '检验与放行',
    summary:
      '品质负责 IQC、过程检验、返工复检和放行 / 退回结论，手机端优先承接检验反馈和异常闭环。',
    defaultPath: '/erp/roles/quality',
    allowedNavKeys: [
      'workspace-home',
      'flow-overview',
      'source-readiness',
      'mobile-workbenches',
      'help-center',
      'help-operation-flow-overview',
      'help-role-collaboration-guide',
      'help-task-document-mapping',
      'help-workflow-status-guide',
      'help-mobile-role-guide',
      'help-exception-handling-guide',
      'changes',
    ],
    desktopFocus: ['IQC', '过程检验', '返工复检', '放行 / 退回', '异常闭环'],
    mobileFocus: ['IQC', '过程检验', '返工复检', '放行反馈', '退回反馈'],
    desktopMenuPreview: [
      '角色首页：品质检验工作台',
      '异常中心：返工、复检和放行 / 退回结论',
      '帮助中心：异常处理、状态字典和手机端角色流程',
    ],
    desktopHighlights: [
      {
        label: '待检批次',
        value: '6 批',
        note: '包括主辅料到仓 IQC 和成品回仓待检。',
      },
      {
        label: '待复检',
        value: '3 批',
        note: '返工闭环后必须重新送检，不靠口头确认。',
      },
      {
        label: '待放行',
        value: '4 批',
        note: '放行与退回都必须形成明确结论。',
      },
      {
        label: '异常闭环',
        value: '2 批',
        note: '异常件要回写给仓库、PMC 和生产经理。',
      },
    ],
    desktopQueues: [
      {
        title: '品质首页待办',
        items: [
          '确认到仓批次是否允许入库。',
          '确认返工后是否通过复检。',
          '把放行 / 退回结论同步给仓库、PMC 和生产。',
        ],
      },
      {
        title: '当前边界',
        items: [
          '当前不做图片识别、自动判级或硬件采集。',
          '品质结论是业务事实，但不替仓库做实物流转执行。',
        ],
      },
    ],
    firstWave: ['角色首页', '待检批次列表', '返工复检入口', '放行 / 退回反馈'],
    pending: ['缺陷代码库', '自动采样规则', '质检报表'],
    helpFocus: [
      '品质动作优先从入库通知 / 检验 / 入库和异常中心进入。',
      '退回不是结束，必须保留 rejected 原因并触发返工或回退链。',
      '放行结果要回给仓库、PMC 和业务，不单独停在品质手机端。',
    ],
    sourceRefs: [
      'plush_factory_formal_report_v3_mobile.pdf 第 4 页',
      '任务 / 单据映射表',
      '异常 / 返工 / 延期处理',
    ],
    mobileHighlights: [
      {
        label: 'IQC',
        value: '主辅料 / 包材 / 回货',
        note: '到仓后先给出是否允许入库的结论。',
      },
      {
        label: '过程检验',
        value: '异常批次',
        note: '过程异常必须回到统一异常链，不留在聊天里。',
      },
      {
        label: '返工复检',
        value: 'rejected -> processing',
        note: '返工后重新送检，状态要重新流转。',
      },
      {
        label: '放行 / 退回',
        value: 'done / rejected',
        note: '放行和退回都要明确记录理由。',
      },
    ],
    mobileSections: [
      {
        title: '手机端看板',
        items: ['待检批次', '待复检', '待放行', '异常件'],
      },
      {
        title: '手机端快捷操作',
        items: ['给出 IQC 结果', '发起退回', '确认复检通过', '同步放行'],
      },
    ],
    mobileTaskFlow: [
      '先确认当前批次属于待检、复检还是放行确认。',
      '给出 done 或 rejected 结论时必须带上原因。',
      '品质结论形成后，立即同步给仓库、PMC 和生产。',
    ],
    mobileDeferred: [
      '不做图片识别和自动判级。',
      '不在手机端维护复杂质量报表。',
      '不把品质端扩成独立库存系统。',
    ],
  },
  {
    key: 'finance',
    title: '财务',
    label: '对账与结算',
    summary:
      '财务桌面端负责加工费、辅包材费用、放行和结算提醒，移动端聚焦待对账、待付款和异常费用。',
    defaultPath: '/erp/roles/finance',
    allowedNavKeys: [
      'workspace-home',
      'source-readiness',
      'print-center',
      'mobile-workbenches',
      'help-center',
      'doc-field-truth',
      'doc-data-model',
      'doc-import-mapping',
      'doc-mobile-roles',
      'doc-print-templates',
      'changes',
    ],
    desktopFocus: [
      '加工费对账',
      '辅材 / 包材费用',
      '待付款',
      '异常费用',
      '发货放行',
    ],
    mobileFocus: ['待对账', '待付款', '异常费用', '结算提醒'],
    desktopMenuPreview: [
      '角色首页：财务工作台',
      '字段真源 / 数据模型 / 导入映射',
      '帮助中心：结算节点和 deferred 边界',
    ],
    desktopHighlights: [
      {
        label: '对账周期',
        value: '每月 15 号前',
        note: '来自加工合同 PDF 的结算方式条款。',
      },
      {
        label: '付款节点',
        value: '次月付款',
        note: '合同明确“对完账后，次月支付货款”。',
      },
      {
        label: '加工金额',
        value: '单价 * 数量',
        note: '加工汇总表与合同 PDF 都保留金额快照。',
      },
      {
        label: '辅包材金额',
        value: '公式缓存值',
        note: '辅包材 Excel 金额列依赖公式缓存，导入要兼容 data_only。',
      },
    ],
    desktopQueues: [
      {
        title: '财务首页待办',
        items: [
          '跟进加工费对账和待付款。',
          '核对辅材 / 包材金额和异常费用。',
          '配合仓库完成发货放行。',
        ],
      },
      {
        title: '当前边界',
        items: [
          '票据识别和自动账龄还没开始做。',
          '当前没有正式结算单样本，因此只做入口和文档，不急着建完整账务表。',
        ],
      },
    ],
    firstWave: ['角色首页', '对账提醒', '待付款清单', '异常费用入口'],
    pending: ['票据识别', '自动账龄', '流水匹配'],
    helpFocus: [
      '结算条款当前真源来自加工合同 PDF，而不是聊天说明。',
      '单价和金额要区分加工、材料、订单三种语义。',
      '正式结算单样本到位前不急着落完整账务 schema。',
    ],
    sourceRefs: [
      '9.3 加工合同 PDF',
      '加工 成慧怡.xlsx',
      '辅材、包材 成慧怡.xlsx',
    ],
    mobileHighlights: [
      { label: '待对账', value: '加工费 / 辅包材', note: '先看待对账事项。' },
      { label: '待付款', value: '次月付款', note: '与合同条款对齐。' },
      {
        label: '异常费用',
        value: '单独提醒',
        note: '异常费用不再藏在备注里。',
      },
      {
        label: '结算提醒',
        value: '每月 15 号前',
        note: '月度对账规则来自合同真源。',
      },
    ],
    mobileSections: [
      {
        title: '手机端待办',
        items: ['确认待对账', '确认待付款', '查看异常费用', '确认放行状态'],
      },
      {
        title: '手机端提醒',
        items: ['加工金额异常', '辅包材金额异常', '未回签合同', '待结算提醒'],
      },
    ],
    mobileTaskFlow: [
      '先看待对账和待付款。',
      '异常费用和未回签合同直接提醒，不做票据识别。',
      '需要深入核对时回桌面后台看快照和导入映射。',
    ],
    mobileDeferred: [
      '票据识别 deferred。',
      '不做银行流水匹配。',
      '不在手机端做复杂利润报表。',
    ],
  },
]

const roleWorkbenchIndex = Object.fromEntries(
  roleWorkbenches.map((role) => [role.key, role])
)

export { roleWorkbenches }

export function getRoleWorkbench(roleKey) {
  return roleWorkbenchIndex[roleKey] || null
}

const commonHelpSections = [
  {
    title: '后台与移动端访问方式',
    items: [
      '桌面后台固定使用一个入口，不再保留角色切换、角色首页或角色入口菜单。',
      '八个移动端角色按端口直接访问，角色差异放在各自移动端页面里体现。',
      '桌面与移动端继续共享同一个后端 8200、同一套字段真源和同一套文档。',
    ],
  },
  {
    title: '先读这三个入口',
    items: [
      '流程总览：先确认主链路是不是“客户 / 款式 -> BOM -> 加工合同 -> 生产 -> 仓库 -> 结算”。',
      '字段真源：先看编号体系、数量、单价、交期和附件分别来自哪里。',
      '导入映射：确认 Excel / PDF 落在哪张业务表，再决定是否需要建表。',
    ],
  },
  {
    title: '模板打印先分三类',
    items: [
      '合同类：辅料采购合同、委外加工合同，都是正式业务快照和留档单据。',
      '汇总类：材料分析汇总表、加工分析汇总表，属于主料 / 工序分析派生打印。',
      '报表类：生产订单总表是经营 / 生产快照视图，不要误当成主数据维护页。',
    ],
  },
  {
    title: '本轮明确 deferred',
    items: [
      '扩展硬件链路、条码枪、PDA、图片识别。',
      '正式票据识别、自动比价、复杂排产引擎。',
      '把未确认字段直接硬塞进 Ent schema。',
    ],
  },
]

const roleHelpSections = {
  boss: [
    {
      title: '老板只看什么',
      items: [
        '待审核、延期预警、异常订单、本周出货。',
        '高风险订单摘要和待结算提醒。',
        '扩展硬件链路只保留 deferred 说明。',
      ],
    },
  ],
  business: [
    {
      title: '业务先盯什么',
      items: [
        '客户 / 款式 / 交期是否齐全。',
        '包装材料打单表、客户验货要求和出货确认。',
        '订单编号、产品订单编号、客户订单号不要混用。',
      ],
    },
  ],
  purchasing: [
    {
      title: '采购先盯什么',
      items: [
        '主料 BOM、辅包材采购、加工合同是三套不同真源。',
        '金额和单价来自 Excel 公式缓存值时，要带清洗规则。',
        '供应商敏感字段先停在文档层。',
      ],
    },
  ],
  production: [
    {
      title: '生产先盯什么',
      items: [
        '今日排产、延期原因、返工和异常。',
        'PMC 与生产经理职责要分开。',
        '扩展硬件链路继续 deferred。',
      ],
    },
  ],
  pmc: [
    {
      title: 'PMC 先盯什么',
      items: [
        '齐套是否满足、哪张单据还卡着、哪条链路可能延期。',
        '谁该被催办、谁该接异常、哪些批次已可排单。',
        'PMC 负责推进和分发，不替老板审批、不替财务放行。',
      ],
    },
  ],
  warehouse: [
    {
      title: '仓库先盯什么',
      items: [
        '主辅料到仓、包装材料到仓、成品入库、待出货。',
        '发货需要业务确认和财务放行。',
        '扩展硬件链路与 PDA 继续 deferred。',
      ],
    },
  ],
  quality: [
    {
      title: '品质先盯什么',
      items: [
        'IQC、过程检验、返工复检和放行 / 退回结论。',
        '检验结果必须回写给仓库、PMC 和生产，不停留在聊天记录。',
        '品质负责质量结论，不替仓库做入库执行，不替生产改排单。',
      ],
    },
  ],
  finance: [
    {
      title: '财务先盯什么',
      items: [
        '加工费、辅包材费用、待付款和异常费用。',
        '结算条款真源来自合同 PDF。',
        '正式结算单样本没到前，不急着建完整账务表。',
      ],
    },
  ],
}

export function getHelpCenterSections(roleKey) {
  return [
    ...commonHelpSections,
    ...(roleKey ? roleHelpSections[roleKey] || [] : []),
  ]
}

export const helpCenterSections = getHelpCenterSections('boss')

const navItemRegistry = {
  'global-dashboard': {
    key: 'global-dashboard',
    label: '任务看板',
    path: '/erp/dashboard',
    shortLabel: '任务',
    description: '按协同任务状态看待处理、处理中、阻塞、退回和超时任务。',
  },
  'business-dashboard': {
    key: 'business-dashboard',
    label: '业务看板',
    path: '/erp/business-dashboard',
    shortLabel: '业务',
    description: '按业务记录、部门待处理和风险预警看整体运行状态。',
  },
  'flow-overview': {
    key: 'flow-overview',
    label: '流程总览',
    path: '/erp/flows/overview',
    shortLabel: '流程',
    description: '用真实 PDF / Excel / 截图重写毛绒工厂主流程。',
  },
  'source-readiness': {
    key: 'source-readiness',
    label: '资料与字段真源',
    path: '/erp/source-readiness',
    shortLabel: '真源',
    description: '查看已解析原件、确认字段和待确认字段。',
  },
  'mobile-workbenches': {
    key: 'mobile-workbenches',
    label: '移动端端口说明',
    path: '/erp/mobile-workbenches',
    shortLabel: '端口',
    description: '查看 8 个移动端端口、职责分工和共享层设计。',
  },
  'print-center': {
    key: 'print-center',
    label: '模板打印中心',
    path: '/erp/print-center',
    shortLabel: '打印',
    description: '统一查看辅料合同、加工合同、汇总表和生产总表的固定打印模板。',
  },
  'help-operation-flow-overview': {
    key: 'help-operation-flow-overview',
    label: 'ERP 流程图总览',
    path: '/erp/docs/operation-flow-overview',
    shortLabel: '流程',
    description: '按真实 PDF / Excel / 截图查看毛绒 ERP 主流程总览。',
  },
  'help-operation-guide': {
    key: 'help-operation-guide',
    label: 'ERP 操作教程',
    path: '/erp/docs/operation-guide',
    shortLabel: '教程',
    description: '先看总后台、角色后台、手机端任务端和帮助中心该怎么用。',
  },
  'help-role-collaboration-guide': {
    key: 'help-role-collaboration-guide',
    label: '角色协同链路',
    path: '/erp/docs/role-collaboration-guide',
    shortLabel: '协同',
    description: '查看角色之间怎么交接、怎么回退、主链路和子链路怎么分。',
  },
  'help-role-page-document-matrix': {
    key: 'help-role-page-document-matrix',
    label: '角色权限 / 页面 / 单据矩阵',
    path: '/erp/docs/role-page-document-matrix',
    shortLabel: '矩阵',
    description: '一页查看角色边界、正式页面入口和主链路单据流转矩阵。',
  },
  'help-task-document-mapping': {
    key: 'help-task-document-mapping',
    label: '任务 / 单据映射表',
    path: '/erp/docs/task-document-mapping',
    shortLabel: '任务',
    description:
      '收口任务状态、任务来源、处理角色和完成条件，不把任务误判成业务真源。',
  },
  'help-workflow-status-guide': {
    key: 'help-workflow-status-guide',
    label: '任务 / 业务状态字典',
    path: '/erp/docs/workflow-status-guide',
    shortLabel: '状态',
    description:
      '统一任务状态、业务状态和推进阶段，供页面、任务池和后端保存链路继续对线。',
  },
  'help-workflow-schema-draft': {
    key: 'help-workflow-schema-draft',
    label: 'Workflow / Schema 草案',
    path: '/erp/docs/workflow-schema-draft',
    shortLabel: 'Schema',
    description:
      '提供任务协同层和业务状态层的表结构草案与 SQL 样例，只用于校对，不直接作为迁移真源。',
  },
  'help-workflow-usecase-review': {
    key: 'help-workflow-usecase-review',
    label: 'Workflow usecase 评审',
    path: '/erp/docs/workflow-usecase-review',
    shortLabel: 'Usecase',
    description:
      '评审前端 v1 编排和后端 workflow usecase 的边界、迁移优先级、回滚和测试要求。',
  },
  'help-industry-schema-review': {
    key: 'help-industry-schema-review',
    label: '行业专表 Schema 评审',
    path: '/erp/docs/industry-schema-review',
    shortLabel: '专表',
    description:
      '评审 business_records 继续使用边界、行业专表候选、P1 优先评审表和迁移一致性策略。',
  },
  'help-task-flow-v1': {
    key: 'help-task-flow-v1',
    label: '工作流主任务树 v1',
    path: '/erp/docs/task-flow-v1',
    shortLabel: '任务树',
    description:
      '查看 T1 到 T8 的责任角色、触发事件、完成条件、阻塞与超时规则。',
  },
  'help-role-permission-matrix-v1': {
    key: 'help-role-permission-matrix-v1',
    label: '角色权限矩阵 v1',
    path: '/erp/docs/role-permission-matrix-v1',
    shortLabel: '权限',
    description:
      '查看菜单可见、数据范围、审批、催办、移动端处理和配置权限边界。',
  },
  'help-notification-alert-v1': {
    key: 'help-notification-alert-v1',
    label: '通知 / 预警 / 催办 / 升级 v1',
    path: '/erp/docs/notification-alert-v1',
    shortLabel: '预警',
    description: '查看站内通知、页面预警、催办事件和升级规则。',
  },
  'help-finance-v1': {
    key: 'help-finance-v1',
    label: '财务 v1',
    path: '/erp/docs/finance-v1',
    shortLabel: '财务',
    description: '查看应收、应付、发票、对账、税额和收付款状态的 v1 边界。',
  },
  'help-warehouse-quality-v1': {
    key: 'help-warehouse-quality-v1',
    label: '仓库与品质 v1',
    path: '/erp/docs/warehouse-quality-v1',
    shortLabel: '仓质',
    description: '查看收发存、IQC、品质检验、返工复检和放行边界。',
  },
  'help-log-trace-audit-v1': {
    key: 'help-log-trace-audit-v1',
    label: '日志 / 审计 / Trace v1',
    path: '/erp/docs/log-trace-audit-v1',
    shortLabel: '审计',
    description:
      '查看业务事件、任务事件、状态快照和 trace / request_id 的分层关系。',
  },
  'help-desktop-role-guide': {
    key: 'help-desktop-role-guide',
    label: '桌面端角色流程',
    path: '/erp/docs/desktop-role-guide',
    shortLabel: '桌面',
    description: '只收口老板、业务、PMC、生产经理四类桌面端角色流程。',
  },
  'help-mobile-role-guide': {
    key: 'help-mobile-role-guide',
    label: '手机端角色流程',
    path: '/erp/docs/mobile-role-guide',
    shortLabel: '手机',
    description: '按任务分配、任务处理和处理反馈整理手机端角色的流程切片。',
  },
  'help-field-linkage-guide': {
    key: 'help-field-linkage-guide',
    label: 'ERP 字段联动口径',
    path: '/erp/docs/field-linkage-guide',
    shortLabel: '字段',
    description: '查看编号体系、字段真源、导入映射和上下游字段边界。',
  },
  'help-calculation-guide': {
    key: 'help-calculation-guide',
    label: 'ERP 计算口径',
    path: '/erp/docs/calculation-guide',
    shortLabel: '口径',
    description: '查看数量、金额、日期和打印快照字段的统一口径。',
  },
  'help-print-snapshot-guide': {
    key: 'help-print-snapshot-guide',
    label: '打印 / 合同 / 快照口径',
    path: '/erp/docs/print-snapshot-guide',
    shortLabel: '打印',
    description: '查看采购合同、加工合同、打印冻结字段和历史快照边界。',
  },
  'help-exception-handling-guide': {
    key: 'help-exception-handling-guide',
    label: '异常 / 返工 / 延期处理',
    path: '/erp/docs/exception-handling-guide',
    shortLabel: '异常',
    description: '查看异常从谁发起、谁处理、回退到哪一层、怎么关闭。',
  },
  'help-current-boundaries': {
    key: 'help-current-boundaries',
    label: '当前明确不做',
    path: '/erp/docs/current-boundaries',
    shortLabel: '边界',
    description: '把 deferred 能力、未落地边界和校对中的角色拆分单独说明。',
  },
  'qa-acceptance-overview': {
    key: 'qa-acceptance-overview',
    label: '验收结果总览',
    path: '/erp/qa/acceptance-overview',
    shortLabel: '验收',
    description: '汇总当前可执行验收入口、已知盲区和下一步排查路径。',
  },
  'qa-business-chain-debug': {
    key: 'qa-business-chain-debug',
    label: '业务链路调试',
    path: '/erp/qa/business-chain-debug',
    shortLabel: '链路',
    description: '按 6 条 v1 主干闭环、workflow 状态和协同任务排查链路边界。',
  },
  'qa-workflow-task-debug': {
    key: 'qa-workflow-task-debug',
    label: '协同任务调试',
    path: '/erp/qa/workflow-task-debug',
    shortLabel: '任务',
    description:
      '按角色任务池、移动端可见性和 workflow_task_events 排查协同任务。',
  },
  'qa-field-linkage-coverage': {
    key: 'qa-field-linkage-coverage',
    label: '字段联动覆盖',
    path: '/erp/qa/field-linkage-coverage',
    shortLabel: '字段',
    description: '展示字段真源、快照、残值、缺值和打印取值的 latest 覆盖状态。',
  },
  'qa-run-records': {
    key: 'qa-run-records',
    label: '运行记录',
    path: '/erp/qa/run-records',
    shortLabel: '记录',
    description: '统一当前验收命令、运行产物和记录口径。',
  },
  'qa-reports': {
    key: 'qa-reports',
    label: '专项报告',
    path: '/erp/qa/reports',
    shortLabel: '报告',
    description:
      '聚合字段联动、打印快照、workflow 状态、权限边界和错误码同步等专项。',
  },
  'help-center': {
    key: 'help-center',
    label: '帮助中心首页',
    path: '/erp/help-center',
    shortLabel: '帮助',
    description: '旧帮助中心入口，当前统一跳转到 ERP 流程图总览。',
  },
  'doc-system-init': {
    key: 'doc-system-init',
    label: '系统初始化说明',
    path: '/erp/docs/system-init',
    shortLabel: '文档',
    description: '桌面单后台、移动端多端口和共享后端说明。',
  },
  'doc-operation-playbook': {
    key: 'doc-operation-playbook',
    label: '毛绒 ERP 主流程',
    path: '/erp/docs/operation-playbook',
    shortLabel: '文档',
    description: '基于真实资料重写主流程。',
  },
  'doc-field-truth': {
    key: 'doc-field-truth',
    label: '字段真源对照',
    path: '/erp/docs/field-truth',
    shortLabel: '文档',
    description: '确认编号体系、数量、价格、交期和附件的真源。',
  },
  'doc-data-model': {
    key: 'doc-data-model',
    label: '首批正式数据模型',
    path: '/erp/docs/data-model',
    shortLabel: '文档',
    description: '说明为什么当前不能照搬旧外贸模型，以及表设计建议。',
  },
  'doc-import-mapping': {
    key: 'doc-import-mapping',
    label: '导入映射',
    path: '/erp/docs/import-mapping',
    shortLabel: '文档',
    description: '逐个 Excel / PDF 列出标准字段和清洗规则。',
  },
  'doc-mobile-roles': {
    key: 'doc-mobile-roles',
    label: '移动端端口与职责',
    path: '/erp/docs/mobile-roles',
    shortLabel: '文档',
    description: '桌面单后台和 8 个移动端端口的职责边界。',
  },
  'doc-print-templates': {
    key: 'doc-print-templates',
    label: '模板打印与字段口径',
    path: '/erp/docs/print-templates',
    shortLabel: '文档',
    description: '确认打印模板的快照字段、源文件和当前边界。',
  },
  changes: {
    key: 'changes',
    label: '本轮变更记录',
    path: '/erp/changes/current',
    shortLabel: '变更',
    description: '继续把复杂任务写进 changes slug，不回退到聊天补丁。',
  },
  'permission-center': {
    key: 'permission-center',
    label: '权限管理',
    path: '/erp/system/permissions',
    shortLabel: '权限',
    description: '集中管理管理员账号、菜单权限和启用状态。',
  },
}

const documentationNavKeys = [
  'doc-system-init',
  'doc-operation-playbook',
  'doc-field-truth',
  'doc-data-model',
  'doc-import-mapping',
  'doc-mobile-roles',
  'doc-print-templates',
]

export const helpCenterPrimaryNavKeys = [
  'help-operation-flow-overview',
  'help-operation-guide',
  'help-role-collaboration-guide',
  'help-mobile-role-guide',
  'help-task-flow-v1',
  'help-notification-alert-v1',
  'help-finance-v1',
  'help-warehouse-quality-v1',
]

export const helpCenterAdvancedDocKeys = [
  'help-role-page-document-matrix',
  'help-task-document-mapping',
  'help-workflow-status-guide',
  'help-workflow-schema-draft',
  'help-workflow-usecase-review',
  'help-industry-schema-review',
  'help-role-permission-matrix-v1',
  'help-log-trace-audit-v1',
  'help-desktop-role-guide',
  'help-field-linkage-guide',
  'help-calculation-guide',
  'help-print-snapshot-guide',
  'help-exception-handling-guide',
  'help-current-boundaries',
]

const qaNavKeys = [
  'qa-acceptance-overview',
  'qa-business-chain-debug',
  'qa-field-linkage-coverage',
  'qa-run-records',
  'qa-reports',
]

export const helpCenterQaDocKeys = qaNavKeys

export const helpCenterNavKeys = helpCenterPrimaryNavKeys

export const documentationCards = documentationNavKeys.map((navKey) => {
  const item = navItemRegistry[navKey]

  return {
    key: item.path.replace('/erp/docs/', ''),
    title: item.label,
    path: item.path,
    summary: item.description,
  }
})

export const helpCenterReadingPath = [
  {
    key: 'operation-guide',
    title: '先看操作教程',
    path: '/erp/docs/operation-guide',
    summary: '先理解总后台、手机端任务端和帮助中心应该怎么用。',
  },
  {
    key: 'operation-flow-overview',
    title: '再看流程总览',
    path: '/erp/docs/operation-flow-overview',
    summary: '确认 6 条 v1 主干闭环分别从哪里开始、到哪里结束。',
  },
  {
    key: 'role-collaboration-guide',
    title: '再看角色协同',
    path: '/erp/docs/role-collaboration-guide',
    summary: '确认谁发起、谁处理、异常时退回给谁。',
  },
  {
    key: 'mobile-role-guide',
    title: '最后看手机端任务',
    path: '/erp/docs/mobile-role-guide',
    summary: '确认手机端只处理任务、阻塞、完成和反馈，不承担复杂录入。',
  },
]

export const helpCenterRoleNavGroups = [
  {
    key: 'boss',
    role: '老板',
    mainWork: '审批、风险关注、延期和财务重点',
    taskSource: 'boss 任务池、高优先级、延期和异常提醒',
    recommendedEntry: 'Dashboard / 老板移动端',
    endpointNote: '桌面看全局，手机端处理审批、关注和异常确认。',
    docs: [navItemRegistry['help-role-collaboration-guide']],
  },
  {
    key: 'business',
    role: '业务',
    mainWork: '订单、客户资料、出货准备和应收前置',
    taskSource: '客户资料、订单交期、包装材料和出货确认任务',
    recommendedEntry: '销售链路 / 业务移动端',
    endpointNote: '手机端接收补资料、催合同、交期预警和出货确认。',
    docs: [
      navItemRegistry['help-operation-guide'],
      navItemRegistry['help-role-collaboration-guide'],
    ],
  },
  {
    key: 'pmc',
    role: 'PMC',
    mainWork: '卡点、超时、阻塞、齐套和关键路径推进',
    taskSource: 'critical_path、blocked、overdue 和齐套推进任务',
    recommendedEntry: 'Dashboard / PMC 移动端',
    endpointNote: '手机端用于催办、异常分发和关键路径反馈。',
    docs: [navItemRegistry['help-notification-alert-v1']],
  },
  {
    key: 'purchasing',
    role: '采购',
    mainWork: '采购到货、补料、合同回签和供应商异常',
    taskSource: '采购任务池、缺料、到货、回签和供应商异常',
    recommendedEntry: '采购/仓储 / 采购移动端',
    endpointNote: '手机端处理到料、补料、单价确认和供应商异常反馈。',
    docs: [
      navItemRegistry['help-task-flow-v1'],
      navItemRegistry['help-warehouse-quality-v1'],
    ],
  },
  {
    key: 'production',
    role: '生产',
    mainWork: '排产、委外、返工和生产进度',
    taskSource: '生产任务池、排产、延期、返工和完工送检',
    recommendedEntry: '生产环节 / 生产移动端',
    endpointNote: '手机端回填处理、阻塞、完成和返工原因。',
    docs: [navItemRegistry['help-task-flow-v1']],
  },
  {
    key: 'warehouse',
    role: '仓库',
    mainWork: '入库、出库、成品入库和库存相关状态',
    taskSource: 'warehouse 任务池、收货、入库、出货和异常件',
    recommendedEntry: '采购/仓储 / 仓库移动端',
    endpointNote: '手机端处理收货、入库、待出货和异常件反馈。',
    docs: [navItemRegistry['help-warehouse-quality-v1']],
  },
  {
    key: 'quality',
    role: '品质',
    mainWork: 'IQC、委外回货检验、成品抽检和返工复检',
    taskSource: 'quality 任务池、IQC、回货检验、抽检和复检',
    recommendedEntry: '生产环节 / 品质移动端',
    endpointNote: '手机端回填通过、退回、返工复检和放行结论。',
    docs: [navItemRegistry['help-warehouse-quality-v1']],
  },
  {
    key: 'finance',
    role: '财务',
    mainWork: '应收、开票、应付、对账和放行反馈',
    taskSource: 'finance 任务池、应收登记、开票、应付和对账',
    recommendedEntry: '财务环节 / 财务移动端',
    endpointNote: '手机端处理对账提醒、待付款、异常费用和结算反馈。',
    docs: [navItemRegistry['help-finance-v1']],
  },
]

export const helpCenterBusinessMainlineGroups = [
  {
    key: 'order-engineering',
    title: '订单到工程',
    initiator: '业务',
    handlers: '老板、工程、PMC',
    nextStep: '工程资料任务',
    exceptionOwner: '业务 + PMC',
    boundary: '老板审批派生已后端化，其余闭环仍前端 v1 编排',
    items: [
      navItemRegistry['help-operation-flow-overview'],
      navItemRegistry['help-role-collaboration-guide'],
    ],
  },
  {
    key: 'purchase-inbound',
    title: '采购到入库',
    initiator: '采购 / 仓库',
    handlers: '品质、仓库',
    nextStep: '入库完成',
    exceptionOwner: '采购 + 品质 + PMC',
    boundary: '无库存余额专表',
    items: [
      navItemRegistry['help-task-flow-v1'],
      navItemRegistry['help-warehouse-quality-v1'],
    ],
  },
  {
    key: 'outsourcing-inbound',
    title: '委外到入库',
    initiator: '生产 / 委外',
    handlers: '品质、仓库',
    nextStep: '入库完成',
    exceptionOwner: '生产 + 品质 + PMC',
    boundary: '无委外专表',
    items: [
      navItemRegistry['help-task-flow-v1'],
      navItemRegistry['help-warehouse-quality-v1'],
    ],
  },
  {
    key: 'production-shipment',
    title: '生产到出货',
    initiator: '生产',
    handlers: '品质、仓库、业务',
    nextStep: '出货完成',
    exceptionOwner: '生产 + 仓库 + PMC',
    boundary: '无库存流水专表',
    items: [
      navItemRegistry['help-task-flow-v1'],
      navItemRegistry['help-warehouse-quality-v1'],
    ],
  },
  {
    key: 'shipment-receivable',
    title: '出货到应收/开票',
    initiator: '仓库 / 业务',
    handlers: '财务',
    nextStep: '对账中',
    exceptionOwner: '业务 + 财务 + 老板',
    boundary: '无财务专表',
    items: [
      navItemRegistry['help-finance-v1'],
      navItemRegistry['help-notification-alert-v1'],
    ],
  },
  {
    key: 'payable-reconciliation',
    title: '采购/委外到应付/对账',
    initiator: '采购 / 委外',
    handlers: '财务',
    nextStep: '已结算',
    exceptionOwner: '采购 + 财务 + 老板',
    boundary: '无付款流水',
    items: [
      navItemRegistry['help-finance-v1'],
      navItemRegistry['help-current-boundaries'],
    ],
  },
]

export const businessMainlineDocGroups = helpCenterBusinessMainlineGroups

export const legacyBusinessMainlineDocGroups = [
  {
    key: 'business-loops',
    title: '业务闭环主线',
    items: [
      navItemRegistry['help-task-flow-v1'],
      navItemRegistry['help-notification-alert-v1'],
      navItemRegistry['help-warehouse-quality-v1'],
      navItemRegistry['help-finance-v1'],
      navItemRegistry['help-log-trace-audit-v1'],
    ],
  },
  {
    key: 'roles-permissions',
    title: '角色与权限',
    items: [
      navItemRegistry['help-role-permission-matrix-v1'],
      navItemRegistry['help-desktop-role-guide'],
      navItemRegistry['help-mobile-role-guide'],
      navItemRegistry['help-role-collaboration-guide'],
      navItemRegistry['help-role-page-document-matrix'],
    ],
  },
  {
    key: 'data-fields',
    title: '数据与字段',
    items: [
      navItemRegistry['doc-field-truth'],
      navItemRegistry['doc-data-model'],
      navItemRegistry['help-field-linkage-guide'],
      navItemRegistry['help-calculation-guide'],
      navItemRegistry['doc-import-mapping'],
    ],
  },
  {
    key: 'print-contracts',
    title: '打印与合同',
    items: [
      navItemRegistry['doc-print-templates'],
      navItemRegistry['help-print-snapshot-guide'],
      navItemRegistry['print-center'],
    ],
  },
  {
    key: 'development-qa',
    title: '开发与验收',
    items: qaNavKeys.map((navKey) => navItemRegistry[navKey]),
  },
]

export const helpCenterNavItems = helpCenterNavKeys.map(
  (navKey) => navItemRegistry[navKey]
)

export const helpCenterPrimaryNavItems = helpCenterPrimaryNavKeys.map(
  (navKey) => navItemRegistry[navKey]
)

export const helpCenterAdvancedDocItems = helpCenterAdvancedDocKeys.map(
  (navKey) => navItemRegistry[navKey]
)

export const qaNavItems = qaNavKeys.map((navKey) => navItemRegistry[navKey])

export const helpCenterQaDocItems = helpCenterQaDocKeys.map(
  (navKey) => navItemRegistry[navKey]
)

export const navigationItemRegistry = navItemRegistry

export function getNavigationSections() {
  return [
    {
      title: '看板中心',
      items: [
        navItemRegistry['global-dashboard'],
        navItemRegistry['business-dashboard'],
      ],
    },
    ...businessNavigationSections,
    {
      title: '单据模板',
      items: [navItemRegistry['print-center']],
    },
    {
      title: '系统管理',
      items: [navItemRegistry['permission-center']],
    },
    {
      title: '帮助中心',
      items: helpCenterNavItems,
    },
    {
      title: '开发与验收',
      items: qaNavItems,
    },
    {
      title: '高级文档',
      items: helpCenterAdvancedDocItems,
    },
  ]
}

export function getMobileDockItems() {
  return [
    navItemRegistry['help-operation-flow-overview'],
    navItemRegistry['help-mobile-role-guide'],
    navItemRegistry['print-center'],
  ].filter(Boolean)
}

export const navigationSections = getNavigationSections()
export const mobileDockItems = getMobileDockItems()
