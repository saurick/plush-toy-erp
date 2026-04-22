const docLink = (label, path) => ({ label, path })

const helpLinkRegistry = Object.freeze({
  flow: docLink('ERP 流程图总览', '/erp/docs/operation-flow-overview'),
  operations: docLink('ERP 操作教程', '/erp/docs/operation-guide'),
  field: docLink('ERP 字段联动口径', '/erp/docs/field-linkage-guide'),
  calculation: docLink('ERP 计算口径', '/erp/docs/calculation-guide'),
})

const helpLink = (key) => ({ ...helpLinkRegistry[key] })

const businessSectionMeta = [
  { key: 'master', title: '基础资料' },
  { key: 'sales', title: '销售链路' },
  { key: 'purchase', title: '采购/仓储' },
  { key: 'production', title: '生产环节' },
  { key: 'finance', title: '财务环节' },
]

const businessModules = [
  {
    key: 'partners',
    title: '客户/供应商',
    route: 'master/partners',
    sectionKey: 'master',
    status: 'source_grounded',
    owner: '业务跟单 + 采购 + 财务',
    summary:
      '复用 trade-erp 的主档入口心智，但当前口径只承接客户、加工厂和辅包材供应商三类主体，不把外贸客户字段直接照搬。',
    description:
      '先把客户、加工厂、辅包材供应商放进统一主档页，后续客户/款式立项、加工合同、辅包材采购和结算都从这里复用主体信息。',
    tradeErpAdaptation:
      '沿用 trade-erp “客户/供应商”菜单位置和主档入口，但字段语义改成毛绒工厂的客户、加工厂和辅包材供应商三类主体。',
    currentScope: [
      '统一收客户简称、供应商简称、主体类型、联系人、电话和地址。',
      '兼容客户 / 加工商 / 辅包材供应商三类主体，不再默认只有贸易客户与外贸供应商。',
      '为后续合同快照、结算对象和移动端选择器预留统一入口。',
    ],
    keyFields: [
      '主体类型（客户 / 加工商 / 辅包材供应商）',
      '主体名称 / 简称',
      '联系人 / 联系电话 / 地址',
      '开票与结算口径（当前先保留，不抢跑建正式规则）',
    ],
    upstream: ['生产订单总表截图', '加工厂商资料', '辅材/包材采购表'],
    downstream: ['客户/款式立项', '加工合同/委外下单', '对账/结算'],
    mobileFocus: ['跟单核对客户', '采购确认供应商', '财务核对结算对象'],
    sourceRefs: [
      '加工厂商资料 sheet：厂家简称、厂家全称、联系人、联系电话、地址、开票字段。',
      '生产订单总表截图：客户、跟单业务人员与交期信息。',
      '辅材、包材采购表：供应商、下单人、联系电话等业务快照。',
    ],
    boundaries: [
      '当前不强行生成统一 partner_code，避免编号体系未稳时先落脏规则。',
      '银行卡等敏感信息仍以文档设计为主，本轮不在页面上假装已可维护。',
    ],
    relatedLinks: [helpLink('field'), helpLink('operations')],
  },
  {
    key: 'products',
    title: '产品',
    route: 'master/products',
    sectionKey: 'master',
    status: 'source_grounded',
    owner: '业务跟单 + 采购 + PMC',
    summary:
      '当前产品页不再沿用 trade-erp 的单层产品口径，而是明确区分款式编号、产品编号 / SKU、产品订单编号和订单编号。',
    description:
      '产品页先承接款式、SKU、颜色款和名称快照的分层说明，作为 BOM、加工合同、生产单和仓库收发的共同产品入口。',
    tradeErpAdaptation:
      '保留 trade-erp “产品”独立业务页的结构，但不照搬其单层产品模型，改为毛绒业务需要的款式 / SKU / 颜色款分层。',
    currentScope: [
      '展示款式编号、产品编号 / SKU、颜色和产品名称的分层口径。',
      '明确产品页与客户/款式立项、BOM、加工合同之间的字段关系。',
      '为后续附件、色卡和作业指导书挂接预留产品侧入口。',
    ],
    keyFields: [
      '款式编号（style_no）',
      '产品编号 / SKU',
      '产品名称 / 颜色款',
      '产品订单编号 / 订单编号（快照，不与主档混用）',
    ],
    upstream: ['材料分析明细表', '加工合同 PDF', '生产订单总表截图'],
    downstream: ['材料 BOM', '加工合同/委外下单', '生产排单'],
    mobileFocus: ['跟单核对款式', '采购确认物料归属', '生产查看颜色款'],
    sourceRefs: [
      '26029 / 26204 材料分析表：款式编号、产品名称、颜色、数量。',
      '加工合同 PDF：产品订单编号、产品编号、产品名称。',
      '生产订单总表截图：客户订单号、产品编号、产品名称、类别。',
    ],
    boundaries: [
      '当前不把“款式编号 = SKU”硬并到一个字段里。',
      '正式主档建表仍等更多订单 / 出货样本收稳后再落 Ent schema。',
    ],
    relatedLinks: [helpLink('field'), helpLink('flow')],
  },
  {
    key: 'project-orders',
    title: '客户/款式立项',
    route: 'sales/project-orders',
    sectionKey: 'sales',
    status: 'source_grounded',
    owner: '业务跟单 + 老板',
    summary:
      '这是毛绒 ERP 对 trade-erp “外销前置订单入口”的业务化替代页，先收客户、款式、交期与资料齐套，不把它伪装成外贸外销单。',
    description:
      '客户/款式立项页负责接单、确认编号层级、交期、资料齐套和跟单责任人，是当前主流程的正式起点。',
    tradeErpAdaptation:
      '没有照搬 trade-erp 的“外销”页面名称，而是保留独立订单入口的心智，改造成毛绒工厂的客户/款式立项页。',
    currentScope: [
      '先收客户、订单编号、产品订单编号、款式编号、产品编号和交期。',
      '把缺资料、催合同、包装材料放行等前置动作集中挂在业务立项页。',
      '为生产、采购、仓库和移动端建立统一的订单起点。',
    ],
    keyFields: [
      '客户 / 跟单业务员',
      '订单编号 / 产品订单编号 / 客户订单号',
      '款式编号 / 产品编号 / 产品名称 / 颜色',
      '交期 / 出货日期 / 资料齐套状态',
    ],
    upstream: ['客户/供应商', '产品'],
    downstream: ['材料 BOM', '加工合同/委外下单', '生产排单'],
    mobileFocus: ['缺资料提醒', '客户确认节点', '交期预警'],
    sourceRefs: [
      '生产订单总表截图：客户、订单编号、客户订单号、产品编号、产品名称、出货日期。',
      '材料分析 Excel：款式编号、订单编号、数量、设计师。',
      '正式汇报版 PDF：老板审核包装材料打单表后才放行采购与生产资料。',
    ],
    boundaries: [
      '当前只是业务页骨架，不假装已经具备完整保存链路和状态流转。',
      '外贸“外销”相关字段不会被混入当前订单页。',
    ],
    relatedLinks: [helpLink('flow'), helpLink('operations')],
  },
  {
    key: 'quotations',
    title: '报价单',
    route: 'sales/quotations',
    sectionKey: 'sales',
    status: 'awaiting_confirmation',
    owner: '业务跟单 + 管理层',
    summary:
      '报价单在制造业务里可能仍然需要，但当前真源样本不足以把它定义成主流程来源单，所以先补成独立业务页入口并明确边界。',
    description:
      '报价单页先作为前置商务页面保留，用于承接客户询价、价格确认和资料评估；当前不驱动毛绒 ERP 的正式主流程。',
    tradeErpAdaptation:
      '复用 trade-erp “报价单”属于业务页而不是帮助文档的布局方式，但不沿用其“报价 -> 外销”主链语义。',
    currentScope: [
      '先保留一个正式业务页入口，避免后续再把报价散落在帮助文档或备注里。',
      '把“是否进入客户/款式立项”与“当前样本是否足够建正式字段”明确写清楚。',
      '后续若拿到正式报价样本，可在此页继续接真实字段与模板。',
    ],
    keyFields: [
      '客户名称 / 报价日期',
      '产品 / 款式 / 数量',
      '单价 / 金额 / 备注（当前只保留口径，不抢跑落库）',
    ],
    upstream: ['客户/供应商', '产品'],
    downstream: ['客户/款式立项'],
    mobileFocus: ['跟单前置沟通', '老板确认价格策略'],
    sourceRefs: [
      '当前仅有生产订单总表与合同金额线索，尚缺正式报价单原件。',
      '正式汇报版 PDF 仍以接单、资料审核、采购和生产为主线，未把报价定义成正式主路径。',
    ],
    boundaries: [
      '本页当前是待确认业务页，不把它伪装成已经稳定的正式单据模型。',
      '不会把 trade-erp 的 PI / 外销 / 运输条款字段原样带进来。',
    ],
    relatedLinks: [helpLink('flow'), helpLink('field')],
  },
  {
    key: 'material-bom',
    title: '材料 BOM',
    route: 'purchase/material-bom',
    sectionKey: 'purchase',
    status: 'source_grounded',
    owner: '跟单 + 采购',
    summary:
      '保留 trade-erp 独立业务页的入口方式，但当前主料 BOM 完全以材料分析明细表为真源，不让采购汇总倒灌覆盖。',
    description:
      '材料 BOM 页负责承接主料明细、损耗、组装部位、加工方式和版本信息，是主料采购汇总与加工分析的上游真源。',
    tradeErpAdaptation:
      '没有照搬 trade-erp 的“采购合同 = 物料真源”口径，而是把 BOM 单独抬成一页，避免主料真源继续沉在 Excel 里。',
    currentScope: [
      '先收主料明细、单位用量、总用量含损耗、组装部位和加工程序。',
      '明确材料分析汇总表只是 BOM 派生层，不反向覆盖明细真源。',
      '把色卡、作业指导书和附件视作 BOM 的资料层，不塞进备注兜底。',
    ],
    keyFields: [
      '物料名称 / 厂商料号 / 规格 / 单位',
      '组装部位 / 单位用量 / 损耗 / 总用量',
      '工艺说明 / 色卡 / 作业指导书',
    ],
    upstream: ['客户/款式立项', '产品'],
    downstream: ['辅材/包材采购', '加工合同/委外下单', '打印模板中心'],
    mobileFocus: ['采购看缺料', '跟单核对资料版本'],
    sourceRefs: [
      '26029 材料分析明细：物料名称、规格、组装部位、单位用量、总用量含损耗。',
      '26204 材料分析明细：材料类别、颜色、损耗%、加工方式。',
      '材料分析汇总表：采购派生层，不是反向真源。',
    ],
    boundaries: [
      '当前只补业务页骨架和字段口径，不把 Excel 导入直接写进正式表。',
      '辅材 / 包材不会混到主料 BOM 页里。',
    ],
    relatedLinks: [
      helpLink('field'),
      docLink('模板打印中心', '/erp/print-center'),
    ],
  },
  {
    key: 'accessories-purchase',
    title: '辅材/包材采购',
    route: 'purchase/accessories',
    sectionKey: 'purchase',
    status: 'source_grounded',
    owner: '采购',
    summary:
      '这是对 trade-erp 采购页的业务化拆分：辅材/包材采购保留独立页面，不再和主料 BOM 或加工合同混成一张表。',
    description:
      '辅材/包材采购页承接独立采购表里的材料品名、规格、数量、单价和下单信息，用于包装材料和辅材的下单与跟催。',
    tradeErpAdaptation:
      '延续 trade-erp “采购是独立业务页”的结构，但按毛绒资料拆成辅材/包材采购，与加工合同分开。',
    currentScope: [
      '展示辅材 / 包材采购清单的独立来源和字段口径。',
      '把下单人、联系电话和金额公式列挂到采购快照层。',
      '为包装材料打单、到仓和后续结算保留统一入口。',
    ],
    keyFields: [
      '产品订单编号 / 产品编号 / 产品名称',
      '材料品名 / 厂商料号或供应商名 / 规格 / 单位',
      '采购数量 / 单价 / 金额 / 下单人 / 联系电话',
    ],
    upstream: ['客户/款式立项', '客户/供应商'],
    downstream: ['入库通知/检验/入库', '待付款/应付提醒'],
    mobileFocus: ['缺料确认', '到料提醒', '辅包材确认'],
    sourceRefs: [
      '辅材、包材 成慧怡.xlsx：产品订单编号、材料品名、规格、采购数量、单价、下单人。',
      '正式汇报版 PDF：包装材料独立支线，需要单独下单、到仓、检验和领用。',
    ],
    boundaries: [
      '当前不把厂商料号缺失时的供应商简称强行标准化成主档码。',
      '金额公式列只作为快照口径，不在页面里假装已完成财务核算。',
    ],
    relatedLinks: [
      helpLink('field'),
      docLink('模板打印中心', '/erp/print-center'),
    ],
  },
  {
    key: 'processing-contracts',
    title: '加工合同/委外下单',
    route: 'purchase/processing-contracts',
    sectionKey: 'purchase',
    status: 'source_grounded',
    owner: '采购 + 财务',
    summary:
      '借用 trade-erp “采购合同”属于核心业务页的骨架，但本项目正式承接的是委外加工合同和加工汇总，不是外贸采购合同。',
    description:
      '加工合同/委外下单页承接合同头、合同行、工序类别、单价、数量、金额、回货日期和结算条款，是委外加工和回签的主入口。',
    tradeErpAdaptation:
      '复用 trade-erp “采购合同”菜单层级与单据页心智，但标题、字段和打印口径全部切换到委外加工合同。',
    currentScope: [
      '先收合同编号、加工方、委托单位、工序类别、单价、数量和金额。',
      '合同 PDF 作为正式打印快照，汇总表作为历史台账 / 导入源。',
      '把纸样图片和附件明确为合同附件层，不继续沉在备注里。',
    ],
    keyFields: [
      '合同编号 / 下单日期 / 回货日期',
      '加工方 / 委托单位 / 联系人 / 联系电话',
      '工序名称 / 工序类别 / 单价 / 数量 / 金额 / 备注',
      '结算方式 / 合同条款 / 附图附件',
    ],
    upstream: ['客户/供应商', '产品', '材料 BOM'],
    downstream: ['生产排单', '对账/结算', '打印模板中心'],
    mobileFocus: ['单价确认', '加工厂回签', '结算节点提醒'],
    sourceRefs: [
      '9.3 加工合同 PDF：合同头、合同行、回货日期、结算方式、附件图样。',
      '加工 成慧怡.xlsx：委外加工订单号、加工项目、厂家名称、工序类别、单价、数量、加工金额。',
      '加工厂商资料：厂家简称、厂家全称、联系人、开票字段。',
    ],
    boundaries: [
      '当前不把 trade-erp 的供应商采购字段和当前委外加工字段混成一个模型。',
      '保存链路和打印回填暂未接通，本页先作为正式业务入口和真源说明页。',
    ],
    relatedLinks: [
      docLink('模板打印中心', '/erp/print-center'),
      helpLink('calculation'),
    ],
  },
  {
    key: 'inbound',
    title: '入库通知/检验/入库',
    route: 'warehouse/inbound',
    sectionKey: 'purchase',
    status: 'seeded',
    owner: '仓库 + 品质',
    summary:
      '保留 trade-erp “入库通知/检验/入库”独立业务页的节奏，但当前入口改成主辅料到仓、IQC 和成品回仓三种入库场景的统一页面。',
    description:
      '入库通知/检验/入库页负责挂接主料、辅料、包材和成品的到仓、IQC、检验结论与允许入库节点，是库存真实增加前的检查页。',
    tradeErpAdaptation:
      '直接沿用 trade-erp “入库通知/检验/入库”作为独立业务页的结构，但不再只对应外贸采购到货。',
    currentScope: [
      '统一挂主料到仓、辅包材到仓、成品回仓三类入库通知。',
      '先明确仓库 + 品质 IQC 的流程位置与字段口径。',
      '为后续允许入库、库存增加和异常件处理留统一上游入口。',
    ],
    keyFields: [
      '来源单据 / 到仓日期 / 供应商或车间',
      '物料或成品 / 数量 / 单位',
      'IQC 结果 / 检验备注 / 是否允许入库',
    ],
    upstream: ['辅材/包材采购', '加工合同/委外下单', '生产进度'],
    downstream: ['库存', '待出货/出货放行'],
    mobileFocus: ['收货确认', 'IQC 结果回填', '异常件处理'],
    sourceRefs: [
      '正式汇报版 PDF：主料 / 辅料到仓后经过仓库 + 品质 IQC。',
      '正式汇报版 PDF：车缝 / 手工完成后成品回仓并检验。',
    ],
    boundaries: [
      '当前只是首批业务页与流程口径，不代表已经接通仓储保存链路。',
      '扩展硬件链路、PDA、条码枪继续 deferred，不在本页假装可用。',
    ],
    relatedLinks: [helpLink('flow'), helpLink('operations')],
  },
  {
    key: 'inventory',
    title: '库存',
    route: 'warehouse/inventory',
    sectionKey: 'purchase',
    status: 'seeded',
    owner: '仓库',
    summary:
      '借用 trade-erp “库存”独立查看页的结构，但当前库存口径改成主辅料、包装材料和成品仓的多类型库存，不只是一张发货库存表。',
    description:
      '库存页负责承接允许入库后的库存快照，明确主料、辅包材、成品库存和待出货占用的查看口径。',
    tradeErpAdaptation:
      '保留 trade-erp “库存”必须独立成页的习惯，但库存维度改成毛绒工厂的仓库 / 货位 / 物料类型 / 成品类型。',
    currentScope: [
      '查看主料、辅材、包材和成品的库存占位与可用量。',
      '明确库存是入库、出库、待出货放行的共享中枢。',
      '为后续锁定量、异常件和出货占用预留结构说明。',
    ],
    keyFields: [
      '仓库 / 货位',
      '物料或成品名称 / 规格 / 单位',
      '库存数量 / 待出货占用 / 可用量',
    ],
    upstream: ['入库通知/检验/入库'],
    downstream: ['待出货/出货放行', '出库'],
    mobileFocus: ['查看可用库存', '确认备料', '核对异常件'],
    sourceRefs: [
      '正式汇报版 PDF：到仓、入库、成品仓和发货放行已经明确是同一条库存链路。',
      '生产订单总表截图：未出货数与出货日期需要和库存联动查看。',
    ],
    boundaries: [
      '当前不伪造实时库存算法，只先把页面与字段口径补齐。',
      '不会把 trade-erp 的外销独占库存口径照搬进来。',
    ],
    relatedLinks: [helpLink('field'), helpLink('calculation')],
  },
  {
    key: 'shipping-release',
    title: '待出货/出货放行',
    route: 'warehouse/shipping-release',
    sectionKey: 'purchase',
    status: 'seeded',
    owner: '业务跟单 + 仓库 + 财务',
    summary:
      '这是对 trade-erp “出运明细”业务位置的毛绒化替代页，关注的是待出货、放行和发货前检查，而不是外贸出运单。',
    description:
      '待出货/出货放行页负责在客户确认、仓库出货单和财务放行之间做发货前检查，统一看待出货数量、放行状态和发货准备。',
    tradeErpAdaptation:
      '保留 trade-erp “发货前必须有独立业务页”的结构，但用待出货 / 出货放行替代外贸出运明细。',
    currentScope: [
      '集中展示待出货订单、成品可发状态和发货前检查节点。',
      '把业务确认、仓库出货单和财务放行三方动作挂到同一页。',
      '为后续出库和打印留统一上游入口。',
    ],
    keyFields: [
      '客户 / 订单 / 款式 / 出货日期',
      '待出货数量 / 成品库存 / 放行状态',
      '业务确认 / 仓库确认 / 财务放行',
    ],
    upstream: ['库存', '生产进度'],
    downstream: ['出库', '打印模板中心'],
    mobileFocus: ['待出货检查', '发货前确认', '异常放行提醒'],
    sourceRefs: [
      '正式汇报版 PDF：业务确认 + 仓库出货单 + 财务放行后发货。',
      '生产订单总表截图：出货日期、未出货数。',
    ],
    boundaries: [
      '当前不引入 trade-erp 的外贸运输、港口、发票号字段。',
      '发货单、物流单等正式模板仍以后续样本为准，本页先补流程入口。',
    ],
    relatedLinks: [
      helpLink('flow'),
      docLink('模板打印中心', '/erp/print-center'),
    ],
  },
  {
    key: 'outbound',
    title: '出库',
    route: 'warehouse/outbound',
    sectionKey: 'purchase',
    status: 'seeded',
    owner: '仓库',
    summary:
      '延续 trade-erp “出库”独立业务页的必要性，但当前出库服务的是待出货放行后的仓库发货，不和外贸出运字段耦合。',
    description:
      '出库页负责承接待出货放行后的真实出库动作，明确出库数量、仓位、关联订单和备注，是库存扣减的正式入口。',
    tradeErpAdaptation:
      '直接保留 trade-erp 的“出库”菜单位置和独立页面意义，但字段改成毛绒仓库发货链路。',
    currentScope: [
      '统一挂发货出库、备料出库和异常返还出库的主入口。',
      '为后续库存扣减、待出货闭环和成品仓核对留统一页面。',
      '先补字段和页面，不假装已接通自动库存回滚。',
    ],
    keyFields: [
      '关联订单 / 待出货来源',
      '产品 / 数量 / 仓库 / 货位',
      '出库日期 / 备注 / 经手人',
    ],
    upstream: ['待出货/出货放行', '库存'],
    downstream: ['对账/结算'],
    mobileFocus: ['仓库确认出库', '发货异常上报'],
    sourceRefs: [
      '正式汇报版 PDF：仓库出货单是发货前正式节点之一。',
      '生产订单总表截图：未出货数需要和出库动作联动。',
    ],
    boundaries: [
      '当前不会照搬 trade-erp 的发票号、来源外销号等字段。',
      '库存扣减仍以后续正式保存链路为准，本页先补业务入口和口径。',
    ],
    relatedLinks: [helpLink('flow'), helpLink('calculation')],
  },
  {
    key: 'production-scheduling',
    title: '生产排单',
    route: 'production/scheduling',
    sectionKey: 'production',
    status: 'source_grounded',
    owner: 'PMC + 生产经理',
    summary:
      '这是毛绒 ERP 当前最明确的业务页之一：根据正式汇报版 PDF 已能确认排单、齐套和车缝 / 手工 / 内外发决策入口。',
    description:
      '生产排单页负责承接齐套、排产、车缝 / 手工 / 内外发决策和今日排产，是生产侧的正式业务入口。',
    tradeErpAdaptation:
      '不是 trade-erp 原有菜单的直接照搬，而是沿用“每个主链阶段都应有独立业务页”的结构补齐毛绒生产模块。',
    currentScope: [
      '集中展示待排单订单、齐套状态和生产经理决策节点。',
      '把 PMC 与生产经理的桌面职责落成独立业务页，而不是继续停在汇报图。',
      '为移动端今日排产和进度回填留统一上游入口。',
    ],
    keyFields: [
      '订单 / 款式 / 数量 / 交期',
      '齐套状态 / 排单日期 / 负责人',
      '车缝 / 手工 / 内外发决策',
    ],
    upstream: ['客户/款式立项', '材料 BOM', '加工合同/委外下单'],
    downstream: ['生产进度', '延期/返工/异常', '入库通知/检验/入库'],
    mobileFocus: ['今日排产', '任务分派', '齐套提醒'],
    sourceRefs: [
      '正式汇报版 PDF 第 4 页：PMC 全流程跟单，生产经理决定车缝 / 手工 / 内外发。',
      '正式汇报版 PDF 第 7 页：PMC 看板、生产经理看板。',
    ],
    boundaries: [
      '当前不接工时采集、设备采集或现场硬件链路。',
      '排单页先承接流程和字段，不抢跑到实时产能算法。',
    ],
    relatedLinks: [helpLink('flow'), helpLink('operations')],
  },
  {
    key: 'production-progress',
    title: '生产进度',
    route: 'production/progress',
    sectionKey: 'production',
    status: 'source_grounded',
    owner: 'PMC + 生产',
    summary:
      '借助正式汇报版 PDF 和生产订单总表截图，生产进度页可以先落成真实业务页，而不是继续把“进度回填”埋在移动端口径里。',
    description:
      '生产进度页负责承接在制数量、未出货数、工序进度和进度回填，统一给桌面后台和移动端查看。',
    tradeErpAdaptation:
      '参考 trade-erp 的链路页拆分方式，但实际内容改成毛绒在制进度和未出货跟踪，不引入外贸状态机。',
    currentScope: [
      '先挂在制进度、生产数量、未出货数和回填动作。',
      '把桌面端总览和移动端“今日进度回填”对齐到同一页口径。',
      '为延期、返工和异常页提供统一上游状态。',
    ],
    keyFields: [
      '订单数量 / 生产数量 / 未出货数',
      '当前工序 / 责任人 / 最新回填时间',
      '交期状态 / 是否延期',
    ],
    upstream: ['生产排单'],
    downstream: ['延期/返工/异常', '待出货/出货放行'],
    mobileFocus: ['进度回填', '交期预警', '完工确认'],
    sourceRefs: [
      '生产订单总表截图：订单数量、生产数量、未出货数、单价、类别。',
      '正式汇报版 PDF 第 7 页：PMC / 生产经理移动端重点。',
    ],
    boundaries: [
      '当前进度页先承接信息结构，不伪造实时报工与现场采集。',
      '返工和异常不会继续沉在备注，会拆到独立页承接。',
    ],
    relatedLinks: [helpLink('field'), helpLink('flow')],
  },
  {
    key: 'production-exceptions',
    title: '延期/返工/异常',
    route: 'production/exceptions',
    sectionKey: 'production',
    status: 'source_grounded',
    owner: 'PMC + 生产经理 + 管理层',
    summary:
      '当前真源已经明确返工和异常不能继续沉在备注里，所以独立补一页，避免业务问题没有固定入口。',
    description:
      '延期/返工/异常页承接延期原因、返工记录、异常任务和责任归属，是管理层、PMC 与生产协同的异常中心。',
    tradeErpAdaptation:
      '这是从 trade-erp “业务页必须覆盖关键风控节点”的经验抽出来的新增页，不照搬原有外贸菜单名称。',
    currentScope: [
      '集中挂延期原因、返工记录、异常件和待处理任务。',
      '给老板、PMC、生产经理提供统一异常视图。',
      '为后续统计和移动端异常上报预留正式入口。',
    ],
    keyFields: [
      '异常类型 / 发生时间 / 责任角色',
      '延期原因 / 返工说明 / 当前状态',
      '影响订单 / 款式 / 数量',
    ],
    upstream: ['生产排单', '生产进度'],
    downstream: ['待出货/出货放行', '对账/结算'],
    mobileFocus: ['延期原因上报', '返工确认', '异常任务处理'],
    sourceRefs: [
      '正式汇报版 PDF 第 7 页：外发延期、异常任务、返工异常。',
      '正式汇报版 PDF 第 4 页：老板视角要看延期预警与异常订单。',
    ],
    boundaries: [
      '当前只补页面结构和正式入口，不假装已接通异常工单系统。',
      '不会再把异常长期放在生产备注或聊天记录里。',
    ],
    relatedLinks: [helpLink('operations'), helpLink('flow')],
  },
  {
    key: 'reconciliation',
    title: '对账/结算',
    route: 'finance/reconciliation',
    sectionKey: 'finance',
    status: 'source_grounded',
    owner: '财务',
    summary:
      '当前财务页不沿用 trade-erp “结汇”语义，而是根据加工合同和辅包材金额样本，先落对账/结算这一层更贴合工厂业务的页面。',
    description:
      '对账/结算页承接加工费、辅包材采购金额、对账周期、异常费用和应付确认，是当前毛绒 ERP 财务链的正式入口。',
    tradeErpAdaptation:
      '复用 trade-erp 把财务模块单独拆页的方式，但把“结汇”改成毛绒工厂当前更真实的对账/结算入口。',
    currentScope: [
      '先挂加工费、辅包材费用、对账周期和结算提醒。',
      '把合同里的结算条款和 Excel 里的金额快照收口到同一页。',
      '为后续正式结算单与对账单样本接入留统一入口。',
    ],
    keyFields: [
      '结算对象 / 结算期间',
      '加工费 / 采购金额 / 异常费用',
      '对账状态 / 付款状态 / 备注',
    ],
    upstream: ['加工合同/委外下单', '辅材/包材采购', '出库'],
    downstream: ['待付款/应付提醒'],
    mobileFocus: ['待对账提醒', '异常费用确认', '结算提醒'],
    sourceRefs: [
      '加工合同 PDF：对账周期、结算方式、付款条款。',
      '加工汇总 Excel：加工金额公式列。',
      '辅材、包材采购表：金额、下单人、联系电话。',
    ],
    boundaries: [
      '当前还缺正式对账单 / 结算单样本，不假装账务模型已经完整。',
      '不会把 trade-erp 的结汇、水单认领概念硬套进当前财务页。',
    ],
    relatedLinks: [helpLink('calculation'), helpLink('field')],
  },
  {
    key: 'payables',
    title: '待付款/应付提醒',
    route: 'finance/payables',
    sectionKey: 'finance',
    status: 'seeded',
    owner: '财务 + 管理层',
    summary:
      '参考 trade-erp 财务侧“独立看提醒箱”的用法，补一页待付款/应付提醒，承接毛绒工厂当前最现实的支付关注点。',
    description:
      '待付款/应付提醒页负责汇总加工费、辅包材采购和异常费用的待付款提醒，作为财务移动端和管理层的跟进页。',
    tradeErpAdaptation:
      '没有照搬 trade-erp 的水单认领页，而是保留“财务提醒要独立成页”的结构，改造成当前业务更需要的待付款入口。',
    currentScope: [
      '集中展示待付款、付款节奏和异常费用提醒。',
      '为财务移动端“待付款 / 异常费用 / 结算提醒”补齐桌面端对应页面。',
      '后续若拿到正式付款单样本，可在本页继续细化。',
    ],
    keyFields: [
      '结算对象 / 到期日期 / 待付金额',
      '费用类型 / 优先级 / 当前处理人',
      '异常说明 / 付款备注',
    ],
    upstream: ['对账/结算'],
    downstream: ['打印模板中心'],
    mobileFocus: ['待付款提醒', '异常费用提醒', '老板查看风险'],
    sourceRefs: [
      '正式汇报版 PDF：老板与财务都要看待结算与异常费用。',
      '加工合同条款：次月对账、付款周期。',
      '辅包材与加工汇总金额列：当前待付款提醒的金额来源。',
    ],
    boundaries: [
      '当前没有正式付款审批单样本，本页先作为提醒页，不伪装成完整审批流。',
      '不会引入不属于当前业务的收汇 / 水单认领字段。',
    ],
    relatedLinks: [helpLink('calculation'), helpLink('operations')],
  },
]

export const businessModuleDefinitions = businessModules.map((moduleItem) => {
  const sectionTitle =
    businessSectionMeta.find((section) => section.key === moduleItem.sectionKey)
      ?.title || moduleItem.sectionKey

  return {
    ...moduleItem,
    sectionTitle,
    path: `/erp/${moduleItem.route}`,
    navigationLabel: moduleItem.title,
    navigationDescription: moduleItem.summary,
  }
})

const businessModuleMap = new Map(
  businessModuleDefinitions.map((moduleItem) => [moduleItem.key, moduleItem])
)

export function getBusinessModule(moduleKey) {
  return businessModuleMap.get(moduleKey) || null
}

export function getBusinessNavigationSections() {
  return businessSectionMeta
    .map((section) => ({
      title: section.title,
      items: businessModuleDefinitions
        .filter((moduleItem) => moduleItem.sectionKey === section.key)
        .map((moduleItem) => ({
          key: moduleItem.key,
          label: moduleItem.navigationLabel,
          path: moduleItem.path,
          shortLabel: moduleItem.navigationLabel,
          description: moduleItem.navigationDescription,
        })),
    }))
    .filter((section) => section.items.length > 0)
}

export const businessNavigationSections = getBusinessNavigationSections()
