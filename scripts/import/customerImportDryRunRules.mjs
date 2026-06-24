export const ALLOWED_ACTIONS = new Set([
  'create',
  'update',
  'skip',
  'defer',
  'forbidden',
  'review',
])
export const ALLOWED_SEVERITIES = new Set(['block', 'defer', 'review', 'warning'])

export const SOURCE_REQUIRED_FIELDS = [
  'sourceId',
  'sourceType',
  'sourceKind',
  'moduleKey',
  'domain',
  'fields',
]

export const DOMAIN_TARGETS = new Map([
  ['customers', 'customers'],
  ['suppliers', 'suppliers'],
  ['contacts', 'contacts'],
  ['sales_orders', 'sales_orders'],
  ['sales_order_items', 'sales_order_items'],
  ['products', 'products'],
  ['materials', 'materials'],
  ['units', 'units'],
  ['warehouses', 'warehouses'],
  ['bom', 'bom_headers / bom_items'],
])

export const DEFERRED_DOMAINS = new Map([
  ['product_skus', 'product_skus'],
  ['purchase_orders', 'purchase_orders'],
  ['purchase_order_items', 'purchase_order_items'],
  ['outsourcing', 'outsourcing source documents'],
])

export const FORBIDDEN_DOMAINS = new Map([
  ['shipment', 'shipments'],
  ['shipments', 'shipments'],
  ['shipment_items', 'shipment_items'],
  ['stock_reservations', 'stock_reservations'],
  ['inventory', 'inventory facts'],
  ['inventory_txns', 'inventory_txns'],
  ['inventory_balances', 'inventory_balances'],
  ['inventory_lots', 'inventory_lots'],
  ['finance', 'finance facts'],
  ['ar_ap', 'AR/AP'],
  ['invoice', 'invoice'],
  ['invoices', 'invoice'],
  ['payment', 'payment'],
  ['payments', 'payment'],
  ['finance_reconciliation', 'finance reconciliation'],
])

export const FIELD_FORBIDDEN_RULES = [
  {
    pattern: /shipping[_ -]?released|出货放行/u,
    forbiddenTarget: 'shipped facts',
    boundary: 'shipping_released != shipped',
    reason:
      'shipping_released is a release / permission state, not shipped or inventory deduction.',
  },
  {
    pattern: /(^|[_ -])shipped($|[_ -])|已发货|已出库/u,
    forbiddenTarget: 'shipped facts',
    boundary: 'shipping facts require a future ShipmentUsecase.',
    reason: 'A dry-run source field cannot prove a shipped fact.',
  },
  {
    pattern: /unshipped|未出货|production_qty|生产数量/u,
    forbiddenTarget: 'shipment / production facts',
    boundary: 'sales_order remains a Source Document / Business Commitment.',
    reason:
      'Fulfillment or production quantities cannot create shipment, inventory, or production facts.',
  },
  {
    pattern: /stock[_ -]?reservation|库存预留/u,
    forbiddenTarget: 'stock_reservations',
    boundary: 'stock reservation is a future fact domain.',
    reason: 'Dry-run import cannot create stock reservations.',
  },
  {
    pattern:
      /inventory[_ -]?(txn|transaction|balance|lot)|库存流水|库存余额|库存批次|入库数量|出库数量/u,
    forbiddenTarget: 'inventory_txn / inventory_balance / inventory_lot',
    boundary: 'inventory facts must be written by formal fact usecases.',
    reason: 'Dry-run import cannot create or mutate inventory facts.',
  },
  {
    pattern:
      /(^|[_ -])(ar|ap)($|[_ -])|receivable|payable|invoice|payment|reconciliation|应收|应付|发票|收款|付款|对账/u,
    forbiddenTarget: 'AR/AP / invoice / payment / finance reconciliation',
    boundary: 'finance facts are deferred to future finance review.',
    reason: 'Dry-run import cannot create finance facts.',
  },
]

export const FIELD_DEFER_RULES = [
  {
    pattern: /product[_ -]?sku|sku|颜色|尺寸|包装版本/u,
    target: 'product_skus',
    reason:
      'SKU, color, size, or packaging version fields are deferred and cannot create product_skus in this dry-run.',
  },
  {
    pattern: /purchase[_ -]?order|采购单|采购订单/u,
    target: 'purchase_orders',
    reason:
      'Purchase order source documents are deferred and cannot be created in this dry-run.',
  },
]

export const CUSTOMER_ALIASES = {
  code: [
    'code',
    'customer_code',
    'customerCode',
    'document_no',
    'documentNo',
    '客户编号',
    '客户代码',
  ],
  name: ['name', 'title', 'customer_name', 'customerName', 'customer', '客户', '客户名称'],
  display: ['displayName', 'display_name', 'display', '简称'],
}

export const SUPPLIER_ALIASES = {
  code: [
    'code',
    'supplier_code',
    'supplierCode',
    'document_no',
    'documentNo',
    '供应商编号',
    '供应商代码',
  ],
  name: [
    'name',
    'title',
    'supplier_name',
    'supplierName',
    'factory_name',
    'factoryName',
    '供应商',
    '供应商名称',
    '加工厂',
    '厂家名称',
  ],
  display: ['shortName', 'short_name', 'displayName', 'display_name', '简称'],
}

export const PRODUCT_ALIASES = {
  code: [
    'code',
    'product_code',
    'productCode',
    'product_no',
    'productNo',
    'document_no',
    'documentNo',
    '产品编号',
    '产品资料编号',
  ],
  name: ['name', 'title', 'product_name', 'productName', 'item_name', 'itemName', '产品名称', '品名'],
}

export const MATERIAL_ALIASES = {
  code: [
    'code',
    'material_code',
    'materialCode',
    'material_no',
    'materialNo',
    'document_no',
    'documentNo',
    '物料编号',
    '材料编号',
  ],
  name: ['name', 'title', 'material_name', 'materialName', 'item_name', 'itemName', '材料品名', '物料名称'],
}

export const UNIT_ALIASES = {
  code: ['code', 'unit_code', 'unitCode', 'unit', '单位'],
  name: ['name', 'unit_name', 'unitName', 'unit', '单位'],
}

export const WAREHOUSE_ALIASES = {
  code: ['code', 'warehouse_code', 'warehouseCode', 'warehouse_no', 'warehouseNo', '仓库编号'],
  name: [
    'name',
    'warehouse_name',
    'warehouseName',
    'warehouse',
    'warehouse_location',
    '仓库',
    '仓库位置',
    '货位',
  ],
}

export const SALES_ORDER_ALIASES = {
  orderNo: ['order_no', 'orderNo', 'document_no', 'documentNo', '订单编号'],
  customerId: ['customer_id', 'customerId'],
  customerCode: ['customer_code', 'customerCode', 'customer_no', 'customerNo', '客户编号'],
  customerName: ['customer_name', 'customerName', 'customer', '客户', '客户名称'],
  orderDate: ['order_date', 'orderDate', 'document_date', 'documentDate', '订单日期'],
  expectedShipDate: [
    'expected_ship_date',
    'expectedShipDate',
    'due_date',
    'dueDate',
    'shipping_date',
    'shippingDate',
    '交期',
    '出货日期',
  ],
}

export const SALES_ORDER_ITEM_ALIASES = {
  productId: ['product_id', 'productId'],
  productCode: ['product_code', 'productCode', 'product_no', 'productNo', '产品编号'],
  productName: ['product_name', 'productName', 'item_name', 'itemName', '产品名称'],
  unitId: ['unit_id', 'unitId'],
  unitCode: ['unit_code', 'unitCode', 'unit', '单位'],
  quantity: ['ordered_quantity', 'orderedQuantity', 'quantity', 'qty', '数量'],
}
