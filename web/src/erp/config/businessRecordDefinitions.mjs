import { getRoleDisplayName, normalizeRoleKey } from '../utils/roleKeys.mjs'

export const BUSINESS_ROLE_OPTIONS = Object.freeze([
  { key: 'boss', label: '老板 / 管理层' },
  { key: 'sales', label: '业务' },
  { key: 'purchase', label: '采购' },
  { key: 'pmc', label: 'PMC' },
  { key: 'production', label: '生产经理' },
  { key: 'warehouse', label: '仓库' },
  { key: 'quality', label: '品质' },
  { key: 'finance', label: '财务' },
])

const officialRoleLabelMap = new Map(
  BUSINESS_ROLE_OPTIONS.map((role) => [role.key, role.label])
)

export const roleLabelMap = Object.freeze({
  get(roleKey) {
    const normalized = normalizeRoleKey(roleKey)
    return officialRoleLabelMap.get(normalized) || getRoleDisplayName(roleKey)
  },
})

const DEFAULT_OWNER_BY_SECTION = Object.freeze({
  sales: 'sales',
  purchase: 'purchase',
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
  'quality-inspections': 'qc_pending',
  reconciliation: 'reconciling',
  payables: 'reconciling',
  receivables: 'reconciling',
  invoices: 'reconciling',
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
  'quality-inspections': {
    itemTitle: '检验明细',
    itemFields: [
      {
        key: 'item_name',
        label: '检验项目',
        placeholder: '外观、尺寸、针距、包装等',
      },
      { key: 'material_name', label: '不良项' },
      { key: 'quantity', label: '数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'spec', label: '备注' },
    ],
    formFields: [
      { key: 'document_no', label: '检验单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源单号' },
      { key: 'title', label: '检验事项', required: true },
      { key: 'supplier_name', label: '供应商 / 加工厂' },
      { key: 'customer_name', label: '客户' },
      { key: 'style_no', label: '款式编号' },
      { key: 'product_no', label: '产品编号' },
      { key: 'product_name', label: '产品名称' },
      { key: 'material_name', label: '物料 / 成品' },
      { key: 'quantity', label: '检验数量', type: 'number' },
      { key: 'unit', label: '单位' },
      { key: 'document_date', label: '检验日期', type: 'date' },
      { key: 'due_date', label: '要求完成日期', type: 'date' },
      {
        key: 'payload.qc_type',
        label: '检验类型',
        options: [
          { label: 'IQC 来料检验', value: 'iqc' },
          { label: '委外回货检验', value: 'outsource_return' },
          { label: '成品抽检', value: 'finished_goods' },
          { label: '返工复检', value: 'rework_recheck' },
        ],
      },
      {
        key: 'payload.qc_result',
        label: '检验结果',
        options: [
          { label: '待检', value: 'pending' },
          { label: '合格', value: 'passed' },
          { label: '不合格', value: 'failed' },
          { label: '让步接收', value: 'concession' },
        ],
      },
      { key: 'payload.defect_qty', label: '不良数量', type: 'number' },
      { key: 'payload.defect_reason', label: '不良原因' },
      {
        key: 'payload.rework_required',
        label: '是否返工',
        options: [
          { label: '否', value: 'no' },
          { label: '是', value: 'yes' },
        ],
      },
      {
        key: 'payload.release_decision',
        label: '放行决策',
        options: [
          { label: '待定', value: 'pending' },
          { label: '放行', value: 'released' },
          { label: '退回', value: 'returned' },
          { label: '返工后复检', value: 'rework_recheck' },
        ],
      },
    ],
    tableColumns: [
      { key: 'document_no', label: '检验单号', width: 150 },
      { key: 'source_no', label: '来源单号', width: 150 },
      { key: 'payload.qc_type', label: '检验类型', width: 140 },
      { key: 'payload.qc_result', label: '检验结果', width: 120 },
      { key: 'supplier_name', label: '供应商 / 加工厂', width: 160 },
      { key: 'customer_name', label: '客户', width: 140 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'material_name', label: '物料 / 成品', width: 180 },
      { key: 'quantity', label: '检验数量', width: 100 },
      { key: 'payload.defect_qty', label: '不良数量', width: 100 },
      { key: 'payload.release_decision', label: '放行决策', width: 130 },
      { key: 'due_date', label: '要求完成日期', width: 140 },
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
  receivables: {
    summaryMetric: 'amount',
    itemTitle: '应收明细',
    itemFields: [
      {
        key: 'item_name',
        label: '应收事项',
        placeholder: '出货批次、产品或费用项',
      },
      { key: 'quantity', label: '数量', type: 'number' },
      { key: 'unit_price', label: '单价', type: 'number' },
      { key: 'amount', label: '应收金额', type: 'number' },
      { key: 'spec', label: '异常 / 结算备注' },
    ],
    formFields: [
      { key: 'document_no', label: '应收单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源出货 / 对账单' },
      { key: 'title', label: '应收事项', required: true },
      { key: 'customer_name', label: '客户', required: true },
      { key: 'product_name', label: '产品名称' },
      { key: 'quantity', label: '数量', type: 'number' },
      { key: 'amount', label: '应收金额', type: 'number' },
      { key: 'document_date', label: '登记日期', type: 'date' },
      { key: 'due_date', label: '收款到期日期', type: 'date' },
      { key: 'payload.tax_rate', label: '税率', type: 'number' },
      { key: 'payload.tax_amount', label: '税额', type: 'number' },
      {
        key: 'payload.amount_without_tax',
        label: '不含税金额',
        type: 'number',
      },
      {
        key: 'payload.amount_with_tax',
        label: '含税金额',
        type: 'number',
      },
      { key: 'payload.received_amount', label: '已收金额', type: 'number' },
      {
        key: 'payload.receivable_status',
        label: '收款状态',
        options: [
          { label: '待收款', value: 'pending' },
          { label: '部分收款', value: 'partial' },
          { label: '已收款', value: 'received' },
          { label: '异常', value: 'exception' },
        ],
      },
      {
        key: 'payload.invoice_status',
        label: '开票状态',
        options: [
          { label: '未开票', value: 'not_invoiced' },
          { label: '部分开票', value: 'partial' },
          { label: '已开票', value: 'invoiced' },
        ],
      },
      { key: 'payload.settlement_note', label: '结算备注' },
    ],
    tableColumns: [
      { key: 'document_no', label: '应收单号', width: 150 },
      { key: 'source_no', label: '来源单号', width: 150 },
      { key: 'customer_name', label: '客户', width: 150 },
      { key: 'product_name', label: '产品名称', width: 180 },
      { key: 'quantity', label: '数量', width: 100 },
      { key: 'amount', label: '应收金额', width: 110 },
      { key: 'payload.received_amount', label: '已收金额', width: 110 },
      { key: 'payload.receivable_status', label: '收款状态', width: 120 },
      { key: 'payload.invoice_status', label: '开票状态', width: 120 },
      { key: 'due_date', label: '收款到期日期', width: 140 },
    ],
  },
  invoices: {
    summaryMetric: 'amount',
    itemTitle: '发票明细',
    itemFields: [
      {
        key: 'item_name',
        label: '发票项目',
        placeholder: '货物、加工费、辅材费或服务项',
      },
      { key: 'quantity', label: '数量', type: 'number' },
      { key: 'unit_price', label: '单价', type: 'number' },
      { key: 'amount', label: '金额', type: 'number' },
      { key: 'spec', label: '备注' },
    ],
    formFields: [
      { key: 'document_no', label: '登记单号', placeholder: '留空自动生成' },
      { key: 'source_no', label: '来源应收 / 应付 / 对账单' },
      { key: 'title', label: '发票登记事项', required: true },
      { key: 'customer_name', label: '客户' },
      { key: 'supplier_name', label: '供应商 / 加工厂' },
      { key: 'amount', label: '发票金额', type: 'number' },
      { key: 'document_date', label: '登记日期', type: 'date' },
      { key: 'due_date', label: '处理到期日期', type: 'date' },
      { key: 'payload.invoice_no', label: '发票号' },
      {
        key: 'payload.invoice_type',
        label: '发票类型',
        options: [
          { label: '增值税专用发票', value: 'vat_special' },
          { label: '增值税普通发票', value: 'vat_normal' },
          { label: '其他', value: 'other' },
        ],
      },
      { key: 'payload.tax_rate', label: '税率', type: 'number' },
      { key: 'payload.tax_amount', label: '税额', type: 'number' },
      {
        key: 'payload.amount_without_tax',
        label: '不含税金额',
        type: 'number',
      },
      {
        key: 'payload.amount_with_tax',
        label: '含税金额',
        type: 'number',
      },
      {
        key: 'payload.invoice_direction',
        label: '发票方向',
        options: [
          { label: '销项', value: 'sales' },
          { label: '进项', value: 'purchase' },
        ],
      },
      {
        key: 'payload.invoice_status',
        label: '发票状态',
        options: [
          { label: '待开 / 待收', value: 'pending' },
          { label: '已开票', value: 'issued' },
          { label: '已收票', value: 'received' },
          { label: '已作废', value: 'voided' },
        ],
      },
      { key: 'payload.issue_date', label: '开票日期', type: 'date' },
      { key: 'payload.receive_date', label: '收票日期', type: 'date' },
    ],
    tableColumns: [
      { key: 'document_no', label: '登记单号', width: 150 },
      { key: 'payload.invoice_no', label: '发票号', width: 160 },
      { key: 'payload.invoice_direction', label: '方向', width: 90 },
      { key: 'payload.invoice_type', label: '发票类型', width: 140 },
      { key: 'customer_name', label: '客户', width: 150 },
      { key: 'supplier_name', label: '供应商 / 加工厂', width: 160 },
      { key: 'amount', label: '发票金额', width: 110 },
      { key: 'payload.tax_amount', label: '税额', width: 100 },
      { key: 'payload.invoice_status', label: '状态', width: 110 },
      { key: 'payload.issue_date', label: '开票日期', width: 130 },
      { key: 'payload.receive_date', label: '收票日期', width: 130 },
    ],
  },
})

export function getDefaultOwnerRole(moduleItem = {}) {
  if (moduleItem.key === 'production-progress') return 'production'
  if (moduleItem.key === 'production-exceptions') return 'production'
  if (moduleItem.key === 'quality-inspections') return 'quality'
  return DEFAULT_OWNER_BY_SECTION[moduleItem.sectionKey] || 'sales'
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
