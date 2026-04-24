export const BUSINESS_ROLE_OPTIONS = Object.freeze([
  { key: 'boss', label: '老板 / 管理层' },
  { key: 'merchandiser', label: '业务 / 跟单' },
  { key: 'purchasing', label: '采购' },
  { key: 'pmc', label: 'PMC' },
  { key: 'production', label: '生产经理' },
  { key: 'warehouse', label: '仓库' },
  { key: 'quality', label: '品质' },
  { key: 'finance', label: '财务' },
])

export const roleLabelMap = new Map(
  BUSINESS_ROLE_OPTIONS.map((role) => [role.key, role.label])
)

const DEFAULT_OWNER_BY_SECTION = Object.freeze({
  sales: 'merchandiser',
  purchase: 'purchasing',
  production: 'pmc',
  warehouse: 'warehouse',
  finance: 'finance',
})

const DEFAULT_BUSINESS_STATUS_BY_MODULE = Object.freeze({
  'project-orders': 'project_pending',
  'material-bom': 'engineering_preparing',
  'accessories-purchase': 'material_preparing',
  'processing-contracts': 'material_preparing',
  inbound: 'qc_pending',
  inventory: 'warehouse_processing',
  'shipping-release': 'shipping_released',
  outbound: 'shipped',
  'production-scheduling': 'production_ready',
  'production-progress': 'production_processing',
  'production-exceptions': 'blocked',
  reconciliation: 'reconciling',
  payables: 'reconciling',
})

const COMMON_FORM_FIELDS = Object.freeze([
  { key: 'document_no', label: '单据号', placeholder: '留空自动生成' },
  { key: 'title', label: '记录标题', required: true },
  { key: 'source_no', label: '来源单号' },
  { key: 'customer_name', label: '客户' },
  { key: 'supplier_name', label: '供应商 / 加工厂' },
  { key: 'style_no', label: '款式编号' },
  { key: 'product_no', label: '产品编号' },
  { key: 'product_name', label: '产品名称' },
  { key: 'material_name', label: '物料 / 事项' },
  { key: 'warehouse_location', label: '仓库 / 位置' },
  { key: 'quantity', label: '数量', type: 'number' },
  { key: 'unit', label: '单位' },
  { key: 'amount', label: '金额', type: 'number' },
  { key: 'document_date', label: '单据日期', type: 'date' },
  { key: 'due_date', label: '计划日期 / 交期', type: 'date' },
])

const COMMON_TABLE_COLUMNS = Object.freeze([
  { key: 'document_no', label: '单据号', width: 150 },
  { key: 'title', label: '标题', width: 180 },
  { key: 'source_no', label: '来源单号', width: 140 },
  { key: 'customer_name', label: '客户', width: 150 },
  { key: 'supplier_name', label: '供应商 / 加工厂', width: 160 },
  { key: 'product_name', label: '产品名称', width: 170 },
  { key: 'material_name', label: '物料 / 事项', width: 170 },
  { key: 'quantity', label: '数量', width: 100 },
  { key: 'amount', label: '金额', width: 110 },
  { key: 'due_date', label: '计划日期 / 交期', width: 140 },
])

const COMMON_ITEM_FIELDS = Object.freeze([
  { key: 'item_name', label: '事项 / 品名', placeholder: '请输入明细事项' },
  { key: 'material_name', label: '物料 / 成品' },
  { key: 'spec', label: '规格' },
  { key: 'quantity', label: '数量', type: 'number' },
  { key: 'unit', label: '单位' },
  { key: 'unit_price', label: '单价', type: 'number' },
  { key: 'amount', label: '金额', type: 'number' },
])
const CREATED_AT_DATE_FILTER_OPTION = Object.freeze({
  key: 'created_at',
  label: '创建日期',
})

function buildDateFilterOptions(formFields = []) {
  const seen = new Set()
  const options = formFields
    .filter((field) => field.type === 'date' && field.key)
    .map((field) => ({ key: field.key, label: field.label }))
    .filter((option) => {
      if (seen.has(option.key)) return false
      seen.add(option.key)
      return true
    })
  return options.length > 0 ? options : [CREATED_AT_DATE_FILTER_OPTION]
}

const MODULE_OVERRIDES = Object.freeze({
  'project-orders': {
    summaryMetric: 'amount',
    itemTitle: '产品 / 颜色明细',
    itemFields: [
      {
        key: 'item_name',
        label: '产品 / 颜色',
        placeholder: '产品、颜色或款式分行',
      },
      { key: 'spec', label: '规格 / 类别' },
      { key: 'quantity', label: '数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'amount', label: '金额', type: 'number' },
    ],
    formFields: [
      { key: 'document_no', label: '订单编号', placeholder: '留空自动生成' },
      { key: 'customer_name', label: '客户', required: true },
      { key: 'title', label: '款式 / 项目名称', required: true },
      { key: 'source_no', label: '客户订单号' },
      { key: 'style_no', label: '款式编号' },
      { key: 'product_no', label: '产品编号' },
      { key: 'product_name', label: '产品名称' },
      { key: 'quantity', label: '订单数量', type: 'number' },
      { key: 'due_date', label: '出货日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '订单编号', width: 150 },
      { key: 'customer_name', label: '客户', width: 150 },
      { key: 'source_no', label: '客户订单号', width: 150 },
      { key: 'style_no', label: '款式编号', width: 130 },
      { key: 'product_no', label: '产品编号', width: 130 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'quantity', label: '订单数量', width: 100 },
      { key: 'due_date', label: '出货日期', width: 130 },
    ],
  },
  'material-bom': {
    itemTitle: 'BOM 明细',
    itemFields: [
      {
        key: 'material_name',
        label: '物料名称',
        placeholder: '主料、辅料或包装材料',
      },
      { key: 'spec', label: '规格 / 颜色' },
      { key: 'quantity', label: '用量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'supplier_name', label: '建议供应商' },
    ],
    formFields: [
      { key: 'document_no', label: 'BOM 编号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源订单' },
      { key: 'title', label: 'BOM 标题', required: true },
      { key: 'style_no', label: '款式编号' },
      { key: 'product_name', label: '产品名称' },
      { key: 'material_name', label: '主料 / 物料名称', required: true },
      { key: 'quantity', label: '总用量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'supplier_name', label: '建议供应商' },
    ],
    tableColumns: [
      { key: 'document_no', label: 'BOM 编号', width: 140 },
      { key: 'source_no', label: '来源订单', width: 150 },
      { key: 'style_no', label: '款式编号', width: 130 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'material_name', label: '主料 / 物料', width: 180 },
      { key: 'quantity', label: '总用量', width: 100 },
      { key: 'unit', label: '单位', width: 90 },
      { key: 'supplier_name', label: '建议供应商', width: 160 },
    ],
  },
  'accessories-purchase': {
    summaryMetric: 'amount',
    itemTitle: '采购明细',
    itemFields: [
      {
        key: 'material_name',
        label: '材料品名',
        placeholder: '辅材 / 包材名称',
      },
      { key: 'spec', label: '规格' },
      { key: 'quantity', label: '采购数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'unit_price', label: '单价', type: 'number' },
      { key: 'amount', label: '金额', type: 'number' },
      { key: 'supplier_name', label: '供应商' },
    ],
    formFields: [
      { key: 'document_no', label: '采购单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源订单 / BOM' },
      { key: 'title', label: '采购事项', required: true },
      { key: 'supplier_name', label: '供应商', required: true },
      { key: 'material_name', label: '辅材 / 包材' },
      { key: 'quantity', label: '采购数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'amount', label: '采购金额', type: 'number' },
      { key: 'due_date', label: '到料日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '采购单号', width: 150 },
      { key: 'source_no', label: '来源订单', width: 150 },
      { key: 'supplier_name', label: '供应商', width: 160 },
      { key: 'material_name', label: '辅材 / 包材', width: 180 },
      { key: 'quantity', label: '采购数量', width: 100 },
      { key: 'amount', label: '采购金额', width: 110 },
      { key: 'due_date', label: '到料日期', width: 130 },
    ],
  },
  'processing-contracts': {
    summaryMetric: 'amount',
    itemTitle: '加工明细',
    itemFields: [
      {
        key: 'item_name',
        label: '工序名称',
        placeholder: '车缝、手工、包装等',
      },
      { key: 'spec', label: '工序类别' },
      { key: 'quantity', label: '委托数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'unit_price', label: '单价', type: 'number' },
      { key: 'amount', label: '加工金额', type: 'number' },
      { key: 'supplier_name', label: '加工厂' },
    ],
    formFields: [
      { key: 'document_no', label: '加工合同号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源订单' },
      { key: 'title', label: '加工合同标题', required: true },
      { key: 'supplier_name', label: '加工厂', required: true },
      { key: 'product_no', label: '产品编号' },
      { key: 'product_name', label: '产品名称' },
      { key: 'quantity', label: '委外数量', type: 'number' },
      { key: 'amount', label: '加工金额', type: 'number' },
      { key: 'due_date', label: '返厂 / 交付日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '加工合同号', width: 160 },
      { key: 'source_no', label: '来源订单', width: 150 },
      { key: 'supplier_name', label: '加工厂', width: 150 },
      { key: 'product_no', label: '产品编号', width: 130 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'quantity', label: '委外数量', width: 100 },
      { key: 'amount', label: '加工金额', width: 110 },
      { key: 'due_date', label: '交付日期', width: 130 },
    ],
  },
  inbound: {
    itemTitle: '入库 / 检验明细',
    itemFields: [
      {
        key: 'material_name',
        label: '物料 / 成品',
        placeholder: '到仓物料或成品',
      },
      { key: 'spec', label: '规格' },
      { key: 'quantity', label: '入库数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'warehouse_location', label: '仓位' },
      { key: 'item_name', label: '检验结果 / 备注' },
    ],
    formFields: [
      { key: 'document_no', label: '入库通知号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源采购 / 合同' },
      { key: 'title', label: '入库事项', required: true },
      { key: 'supplier_name', label: '供应商 / 加工厂' },
      { key: 'material_name', label: '物料 / 成品' },
      { key: 'quantity', label: '入库数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'warehouse_location', label: '入库仓位' },
      { key: 'document_date', label: '通知日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '入库通知号', width: 150 },
      { key: 'source_no', label: '来源单号', width: 150 },
      { key: 'supplier_name', label: '供应商 / 加工厂', width: 160 },
      { key: 'material_name', label: '物料 / 成品', width: 180 },
      { key: 'quantity', label: '入库数量', width: 100 },
      { key: 'warehouse_location', label: '入库仓位', width: 160 },
      { key: 'document_date', label: '通知日期', width: 130 },
    ],
  },
  inventory: {
    itemTitle: '库存明细',
    itemFields: [
      {
        key: 'material_name',
        label: '物料 / 成品',
        placeholder: '库存物料或成品',
      },
      { key: 'spec', label: '规格' },
      { key: 'quantity', label: '库存数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'warehouse_location', label: '仓库 / 位置' },
    ],
    formFields: [
      { key: 'document_no', label: '库存记录号', placeholder: '留空自动生成' },
      { key: 'title', label: '库存标题', required: true },
      { key: 'material_name', label: '物料 / 成品', required: true },
      { key: 'product_no', label: '产品编号' },
      { key: 'quantity', label: '库存数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'warehouse_location', label: '仓库 / 位置' },
      { key: 'due_date', label: '预警日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '库存记录号', width: 150 },
      { key: 'material_name', label: '物料 / 成品', width: 180 },
      { key: 'product_no', label: '产品编号', width: 130 },
      { key: 'quantity', label: '库存数量', width: 100 },
      { key: 'unit', label: '单位', width: 90 },
      { key: 'warehouse_location', label: '仓库 / 位置', width: 180 },
      { key: 'due_date', label: '预警日期', width: 130 },
    ],
  },
  'shipping-release': {
    itemTitle: '待出货明细',
    itemFields: [
      {
        key: 'item_name',
        label: '产品 / 批次',
        placeholder: '产品、批次或箱号',
      },
      { key: 'spec', label: '规格 / 包装' },
      { key: 'quantity', label: '待出货数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'warehouse_location', label: '出货仓位' },
    ],
    formFields: [
      { key: 'document_no', label: '放行单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源订单 / 批次' },
      { key: 'title', label: '放行事项', required: true },
      { key: 'customer_name', label: '客户' },
      { key: 'product_name', label: '产品名称' },
      { key: 'quantity', label: '待出货数量', type: 'number' },
      { key: 'warehouse_location', label: '出货仓位' },
      { key: 'due_date', label: '计划出货日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '放行单号', width: 150 },
      { key: 'source_no', label: '来源订单', width: 150 },
      { key: 'customer_name', label: '客户', width: 150 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'quantity', label: '待出货数量', width: 110 },
      { key: 'warehouse_location', label: '出货仓位', width: 160 },
      { key: 'due_date', label: '计划出货日期', width: 140 },
    ],
  },
  outbound: {
    itemTitle: '出库明细',
    itemFields: [
      { key: 'item_name', label: '产品 / 物料', placeholder: '出库产品或物料' },
      { key: 'spec', label: '规格 / 批次' },
      { key: 'quantity', label: '出库数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'warehouse_location', label: '出库仓位' },
    ],
    formFields: [
      { key: 'document_no', label: '出库单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源放行单' },
      { key: 'title', label: '出库事项', required: true },
      { key: 'customer_name', label: '客户' },
      { key: 'product_name', label: '产品名称' },
      { key: 'quantity', label: '出库数量', type: 'number' },
      { key: 'warehouse_location', label: '出库仓位' },
      { key: 'document_date', label: '出库日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '出库单号', width: 150 },
      { key: 'source_no', label: '来源放行单', width: 150 },
      { key: 'customer_name', label: '客户', width: 150 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'quantity', label: '出库数量', width: 100 },
      { key: 'warehouse_location', label: '出库仓位', width: 160 },
      { key: 'document_date', label: '出库日期', width: 130 },
    ],
  },
  'production-scheduling': {
    itemTitle: '排产明细',
    itemFields: [
      {
        key: 'item_name',
        label: '工序 / 班组',
        placeholder: '裁切、车缝、手工或包装',
      },
      { key: 'quantity', label: '计划数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'supplier_name', label: '车间 / 加工厂' },
      { key: 'spec', label: '备注' },
    ],
    formFields: [
      { key: 'document_no', label: '排单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源订单' },
      { key: 'title', label: '排产事项', required: true },
      { key: 'product_name', label: '产品名称' },
      { key: 'quantity', label: '排产数量', type: 'number' },
      { key: 'supplier_name', label: '车间 / 加工厂' },
      { key: 'document_date', label: '排产日期', type: 'date' },
      { key: 'due_date', label: '计划完成日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '排单号', width: 140 },
      { key: 'source_no', label: '来源订单', width: 150 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'quantity', label: '排产数量', width: 100 },
      { key: 'supplier_name', label: '车间 / 加工厂', width: 160 },
      { key: 'document_date', label: '排产日期', width: 130 },
      { key: 'due_date', label: '计划完成日期', width: 140 },
    ],
  },
  'production-progress': {
    itemTitle: '进度明细',
    itemFields: [
      {
        key: 'item_name',
        label: '工序 / 节点',
        placeholder: '当前工序或进度节点',
      },
      { key: 'quantity', label: '完成数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'supplier_name', label: '车间 / 加工厂' },
      { key: 'spec', label: '进度备注' },
    ],
    formFields: [
      { key: 'document_no', label: '进度记录号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源排单 / 订单' },
      { key: 'title', label: '进度事项', required: true },
      { key: 'product_name', label: '产品名称' },
      { key: 'quantity', label: '完成数量', type: 'number' },
      { key: 'supplier_name', label: '车间 / 加工厂' },
      { key: 'document_date', label: '回填日期', type: 'date' },
      { key: 'due_date', label: '下一节点日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '进度记录号', width: 150 },
      { key: 'source_no', label: '来源单号', width: 150 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'quantity', label: '完成数量', width: 100 },
      { key: 'supplier_name', label: '车间 / 加工厂', width: 160 },
      { key: 'document_date', label: '回填日期', width: 130 },
      { key: 'due_date', label: '下一节点日期', width: 140 },
    ],
  },
  'production-exceptions': {
    itemTitle: '异常明细',
    itemFields: [
      {
        key: 'item_name',
        label: '异常事项',
        placeholder: '延期、返工、缺件或品质异常',
      },
      { key: 'material_name', label: '异常类型' },
      { key: 'quantity', label: '影响数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'supplier_name', label: '责任方' },
      { key: 'spec', label: '处理要求' },
    ],
    formFields: [
      { key: 'document_no', label: '异常单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源订单 / 排单' },
      { key: 'title', label: '异常事项', required: true },
      { key: 'product_name', label: '产品名称' },
      { key: 'material_name', label: '异常类型' },
      { key: 'quantity', label: '影响数量', type: 'number' },
      { key: 'supplier_name', label: '责任车间 / 加工厂' },
      { key: 'due_date', label: '要求处理日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '异常单号', width: 140 },
      { key: 'source_no', label: '来源单号', width: 150 },
      { key: 'title', label: '异常事项', width: 200 },
      { key: 'material_name', label: '异常类型', width: 130 },
      { key: 'quantity', label: '影响数量', width: 100 },
      { key: 'supplier_name', label: '责任方', width: 160 },
      { key: 'due_date', label: '处理日期', width: 130 },
    ],
  },
  reconciliation: {
    summaryMetric: 'amount',
    itemTitle: '对账明细',
    itemFields: [
      {
        key: 'item_name',
        label: '费用项 / 单据',
        placeholder: '加工费、辅材费或异常费用',
      },
      { key: 'supplier_name', label: '结算对象' },
      { key: 'quantity', label: '数量', type: 'number' },
      { key: 'unit_price', label: '单价', type: 'number' },
      { key: 'amount', label: '金额', type: 'number' },
      { key: 'spec', label: '备注' },
    ],
    formFields: [
      { key: 'document_no', label: '对账单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源合同 / 出库' },
      { key: 'title', label: '对账事项', required: true },
      { key: 'supplier_name', label: '结算对象', required: true },
      { key: 'amount', label: '对账金额', type: 'number' },
      { key: 'document_date', label: '对账日期', type: 'date' },
      { key: 'due_date', label: '付款 / 收款日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '对账单号', width: 150 },
      { key: 'source_no', label: '来源单号', width: 150 },
      { key: 'supplier_name', label: '结算对象', width: 170 },
      { key: 'amount', label: '对账金额', width: 110 },
      { key: 'document_date', label: '对账日期', width: 130 },
      { key: 'due_date', label: '付款 / 收款日期', width: 150 },
    ],
  },
  payables: {
    summaryMetric: 'amount',
    itemTitle: '付款提醒明细',
    itemFields: [
      {
        key: 'item_name',
        label: '付款事项',
        placeholder: '待付款来源或费用项',
      },
      { key: 'supplier_name', label: '付款对象' },
      { key: 'amount', label: '待付金额', type: 'number' },
      { key: 'spec', label: '付款备注' },
    ],
    formFields: [
      { key: 'document_no', label: '提醒编号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源对账单' },
      { key: 'title', label: '付款提醒事项', required: true },
      { key: 'supplier_name', label: '付款对象', required: true },
      { key: 'amount', label: '待付金额', type: 'number' },
      { key: 'document_date', label: '登记日期', type: 'date' },
      { key: 'due_date', label: '到期日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '提醒编号', width: 140 },
      { key: 'source_no', label: '来源对账单', width: 150 },
      { key: 'supplier_name', label: '付款对象', width: 170 },
      { key: 'title', label: '提醒事项', width: 200 },
      { key: 'amount', label: '待付金额', width: 110 },
      { key: 'due_date', label: '到期日期', width: 130 },
    ],
  },
})

export function getDefaultOwnerRole(moduleItem = {}) {
  if (moduleItem.key === 'production-progress') return 'production'
  if (moduleItem.key === 'production-exceptions') return 'production'
  return DEFAULT_OWNER_BY_SECTION[moduleItem.sectionKey] || 'merchandiser'
}

export function getDefaultBusinessStatus(moduleItem = {}) {
  return DEFAULT_BUSINESS_STATUS_BY_MODULE[moduleItem.key] || 'project_pending'
}

export function getBusinessRecordDefinition(moduleItem = {}) {
  const override = MODULE_OVERRIDES[moduleItem.key] || {}
  const formFields = override.formFields || COMMON_FORM_FIELDS
  return {
    formFields,
    tableColumns: override.tableColumns || COMMON_TABLE_COLUMNS,
    itemTitle: override.itemTitle || '明细行',
    itemFields: override.itemFields || COMMON_ITEM_FIELDS,
    dateFilterOptions:
      override.dateFilterOptions || buildDateFilterOptions(formFields),
    summaryMetric: override.summaryMetric || 'quantity',
    defaultOwnerRole: getDefaultOwnerRole(moduleItem),
    defaultBusinessStatus: getDefaultBusinessStatus(moduleItem),
  }
}
