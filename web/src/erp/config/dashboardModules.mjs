// 单对象入口用于协同任务来源解析；业务看板表格用下面的对象族分组。
export const dashboardModules = Object.freeze([
  {
    key: 'customers',
    title: '客户档案',
    path: '/erp/master/partners/customers',
  },
  {
    key: 'suppliers',
    title: '供应商档案',
    path: '/erp/master/partners/suppliers',
  },
  {
    key: 'sales-orders',
    title: '销售订单',
    path: '/erp/sales/project-orders/sales-orders',
  },
])

export const DASHBOARD_TRUTH_KINDS = Object.freeze({
  MASTER_DATA: 'master-data',
  SOURCE_DOCUMENT: 'source-document',
  BUSINESS_FACT: 'business-fact',
  COLLABORATION: 'collaboration',
})

function dashboardSource(key, label, path, truthKind) {
  return Object.freeze({ key, label, path, truthKind })
}

export const dashboardHealthModules = Object.freeze([
  {
    key: 'partner-master',
    title: '客户/供应商',
    sources: Object.freeze([
      dashboardSource(
        'customers',
        '客户',
        '/erp/master/partners/customers',
        DASHBOARD_TRUTH_KINDS.MASTER_DATA
      ),
      dashboardSource(
        'suppliers',
        '供应商',
        '/erp/master/partners/suppliers',
        DASHBOARD_TRUTH_KINDS.MASTER_DATA
      ),
    ]),
  },
  {
    key: 'product-engineering',
    title: '产品/BOM',
    sources: Object.freeze([
      dashboardSource(
        'products',
        '产品',
        '/erp/master/products',
        DASHBOARD_TRUTH_KINDS.MASTER_DATA
      ),
      dashboardSource(
        'material-bom',
        'BOM',
        '/erp/purchase/material-bom',
        DASHBOARD_TRUTH_KINDS.MASTER_DATA
      ),
    ]),
  },
  {
    key: 'sales-orders',
    title: '销售订单',
    sources: Object.freeze([
      dashboardSource(
        'sales-orders',
        '销售订单',
        '/erp/sales/project-orders/sales-orders',
        DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT
      ),
    ]),
  },
  {
    key: 'purchase-inbound',
    title: '采购/入库',
    sources: Object.freeze([
      dashboardSource(
        'accessories-purchase',
        '采购订单',
        '/erp/purchase/accessories',
        DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT
      ),
      dashboardSource(
        'inbound',
        '采购入库',
        '/erp/warehouse/inbound',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
    ]),
  },
  {
    key: 'quality-inventory',
    title: '质检/库存',
    sources: Object.freeze([
      dashboardSource(
        'quality-inspections',
        '质量检验',
        '/erp/production/quality-inspections',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
      dashboardSource(
        'inventory',
        '库存台账',
        '/erp/warehouse/inventory',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
    ]),
  },
  {
    key: 'shipment-outbound',
    title: '出货/出库',
    sources: Object.freeze([
      dashboardSource(
        'shipping-release',
        '出货放行',
        '/erp/warehouse/shipping-release',
        DASHBOARD_TRUTH_KINDS.COLLABORATION
      ),
      dashboardSource(
        'outbound',
        '出货单',
        '/erp/warehouse/shipments',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
    ]),
  },
  {
    key: 'production-outsourcing',
    title: '生产/委外',
    sources: Object.freeze([
      dashboardSource(
        'production-orders',
        '生产订单',
        '/erp/production/orders',
        DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT
      ),
      dashboardSource(
        'production-scheduling',
        '生产排程',
        '/erp/production/scheduling',
        DASHBOARD_TRUTH_KINDS.COLLABORATION
      ),
      dashboardSource(
        'production-progress',
        '生产记录',
        '/erp/production/progress',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
      dashboardSource(
        'production-exceptions',
        '生产异常',
        '/erp/production/exceptions',
        DASHBOARD_TRUTH_KINDS.COLLABORATION
      ),
      dashboardSource(
        'processing-contracts',
        '委外订单',
        '/erp/purchase/processing-contracts',
        DASHBOARD_TRUTH_KINDS.SOURCE_DOCUMENT
      ),
    ]),
  },
  {
    key: 'finance-facts',
    title: '财务记录',
    sources: Object.freeze([
      dashboardSource(
        'reconciliation',
        '对账记录',
        '/erp/finance/reconciliation',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
      dashboardSource(
        'payables',
        '应付记录',
        '/erp/finance/payables',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
      dashboardSource(
        'receivables',
        '应收记录',
        '/erp/finance/receivables',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
      dashboardSource(
        'invoices',
        '发票记录',
        '/erp/finance/invoices',
        DASHBOARD_TRUTH_KINDS.BUSINESS_FACT
      ),
    ]),
  },
])
