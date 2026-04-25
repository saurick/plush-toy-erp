export const TASK_WORKFLOW_STATES = Object.freeze([
  {
    key: 'pending',
    label: '待开始',
    summary: '任务已创建，但前置条件还没齐，暂时不能开工。',
  },
  {
    key: 'ready',
    label: '可执行',
    summary: '上游单据、资料或齐套条件已满足，可以正式开始。',
  },
  {
    key: 'processing',
    label: '处理中',
    summary: '已有责任人接手，当前任务正在推进。',
  },
  {
    key: 'blocked',
    label: '阻塞',
    summary: '被缺料、缺资料、未放行或异常等外部条件卡住。',
  },
  {
    key: 'done',
    label: '已完成',
    summary: '当前任务的完成条件已经达到，可进入下游节点。',
  },
  {
    key: 'rejected',
    label: '已退回',
    summary: '审批、检验或确认动作未通过，需要回退上一责任人。',
  },
  {
    key: 'cancelled',
    label: '已取消',
    summary: '因订单取消、方案切换或需求撤销而失效。',
  },
  {
    key: 'closed',
    label: '已关闭',
    summary: '主链闭环后归档关闭，不再继续推进。',
  },
])

export const BUSINESS_WORKFLOW_STATES = Object.freeze([
  {
    key: 'project_pending',
    label: '立项待确认',
    summary: '客户、编号、交期和资料前置条件正在收口。',
  },
  {
    key: 'project_approved',
    label: '立项已放行',
    summary: '已通过老板或管理层审批，允许进入资料与采购准备。',
  },
  {
    key: 'engineering_preparing',
    label: '资料准备中',
    summary: 'BOM、色卡、作业指导书和包装要求正在补齐。',
  },
  {
    key: 'material_preparing',
    label: '齐套准备中',
    summary: '主料、辅包材、委外和关键资料仍在确认或催办。',
  },
  {
    key: 'production_ready',
    label: '待排产',
    summary: '齐套条件已满足，等待生产经理做排单决策。',
  },
  {
    key: 'production_processing',
    label: '生产中',
    summary: '已进入裁切、车缝、手工、组装或外发执行。',
  },
  {
    key: 'qc_pending',
    label: '待检验',
    summary: '待做 IQC、过程检验、返工复检或出货前质量确认。',
  },
  {
    key: 'iqc_pending',
    label: 'IQC 待检',
    summary: '采购到货或入库通知已形成，等待品质做来料检验。',
  },
  {
    key: 'qc_failed',
    label: '质检不合格',
    summary:
      '来料、回货或成品检验未通过，等待责任角色处理退货、返工、补做或让步接收。',
  },
  {
    key: 'warehouse_processing',
    label: '待入库 / 待出货',
    summary: '仓库正在做回仓、入库、备货和待出货准备。',
  },
  {
    key: 'warehouse_inbound_pending',
    label: '待确认入库',
    summary: 'IQC 已放行，等待仓库确认入库数量、库位和经手人。',
  },
  {
    key: 'inbound_done',
    label: '已入库',
    summary: '仓库已确认入库事实；库存余额和库存流水后续按专表评审落地。',
  },
  {
    key: 'shipment_pending',
    label: '待出货',
    summary: '成品已入库或放行，等待出货准备、装箱、唛头和出库确认。',
  },
  {
    key: 'shipping_released',
    label: '已放行待出库',
    summary: '业务确认和财务放行已完成，等待仓库出库执行。',
  },
  {
    key: 'shipped',
    label: '已出货',
    summary: '出库事实已形成，可进入对账和结算链路。',
  },
  {
    key: 'reconciling',
    label: '对账中',
    summary: '加工费、辅包材费用和异常费用正在核对。',
  },
  {
    key: 'settled',
    label: '已结算',
    summary: '当前订单或批次对应的结算义务已经闭环。',
  },
  {
    key: 'blocked',
    label: '业务阻塞',
    summary: '主链被缺料、延期、未放行、数量差异或异常问题卡住。',
  },
  {
    key: 'cancelled',
    label: '业务取消',
    summary: '订单或批次被整体取消，不再继续推进。',
  },
  {
    key: 'closed',
    label: '业务归档',
    summary: '主链已完成并归档，保留历史快照与追溯记录。',
  },
])

const BUSINESS_STATUS_TRANSITION_KEYS = Object.freeze({
  project_pending: ['project_approved', 'blocked', 'cancelled'],
  project_approved: [
    'engineering_preparing',
    'material_preparing',
    'blocked',
    'cancelled',
  ],
  engineering_preparing: ['material_preparing', 'blocked', 'cancelled'],
  material_preparing: [
    'iqc_pending',
    'production_ready',
    'blocked',
    'cancelled',
  ],
  production_ready: ['production_processing', 'blocked', 'cancelled'],
  production_processing: [
    'qc_pending',
    'warehouse_processing',
    'blocked',
    'cancelled',
  ],
  qc_pending: [
    'warehouse_processing',
    'production_processing',
    'blocked',
    'cancelled',
  ],
  iqc_pending: [
    'warehouse_inbound_pending',
    'qc_failed',
    'blocked',
    'cancelled',
  ],
  qc_failed: ['material_preparing', 'iqc_pending', 'blocked', 'cancelled'],
  warehouse_processing: [
    'shipping_released',
    'shipped',
    'blocked',
    'cancelled',
  ],
  warehouse_inbound_pending: ['inbound_done', 'blocked', 'cancelled'],
  inbound_done: [
    'material_preparing',
    'production_ready',
    'shipment_pending',
    'closed',
  ],
  shipment_pending: ['shipped', 'blocked', 'cancelled'],
  shipping_released: ['shipped', 'blocked', 'cancelled'],
  shipped: ['reconciling', 'closed'],
  reconciling: ['settled', 'blocked', 'closed'],
  settled: ['closed'],
  blocked: [
    'material_preparing',
    'production_ready',
    'production_processing',
    'qc_pending',
    'warehouse_processing',
    'shipment_pending',
    'reconciling',
    'cancelled',
  ],
  cancelled: ['closed'],
})

const BUSINESS_STATUS_BY_KEY = new Map(
  BUSINESS_WORKFLOW_STATES.map((state) => [state.key, state])
)

const BUSINESS_STATUS_REASON_REQUIRED_KEYS = new Set(['blocked', 'cancelled'])

export function getBusinessStatusTransitionOptions(currentStatusKey) {
  const transitionKeys = BUSINESS_STATUS_TRANSITION_KEYS[currentStatusKey] || []
  return transitionKeys
    .map((key) => BUSINESS_STATUS_BY_KEY.get(key))
    .filter(Boolean)
    .map((state) => ({
      label: state.label,
      value: state.key,
      summary: state.summary,
    }))
}

export function requiresBusinessStatusReason(statusKey) {
  return BUSINESS_STATUS_REASON_REQUIRED_KEYS.has(statusKey)
}

export const WORKFLOW_PLANNING_PHASES = Object.freeze([
  {
    key: 'source_locked',
    label: '真源已收口',
    summary: '先明确当前唯一真源字段、单据和业务节点。',
  },
  {
    key: 'page_defined',
    label: '页面已收口',
    summary: '菜单、角色入口、帮助中心和工作台卡片范围已确定。',
  },
  {
    key: 'status_defined',
    label: '状态已统一',
    summary: '任务状态、业务状态和阻塞原因已形成统一字典。',
  },
  {
    key: 'schema_v1_ready',
    label: 'Schema v1 已落地',
    summary: 'workflow 和通用业务记录表已通过 Ent + Atlas 生成迁移。',
  },
  {
    key: 'api_v1_ready',
    label: 'API v1 已接通',
    summary:
      'workflow 与 business JSON-RPC 已支持当前表格、弹窗和任务池主路径。',
  },
  {
    key: 'save_link_v1_ready',
    label: '保存链路 v1 已接通',
    summary: '桌面业务页可保存通用业务记录、写状态快照并创建协同任务。',
  },
])
