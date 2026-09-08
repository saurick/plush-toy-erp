import {
  createCustomer,
  createMaterial,
  createProcess,
  createProduct,
  createProductSKU,
  createSupplier,
  listAllCustomers,
  listAllMaterials,
  listAllProcesses,
  listAllProducts,
  listAllProductSKUs,
  listAllSuppliers,
  listCustomers,
  listMaterials,
  listProcesses,
  listProducts,
  listProductSKUs,
  listSuppliers,
  saveCustomerWithContacts,
  saveSupplierWithContacts,
  setCustomerActive,
  setMaterialActive,
  setProcessActive,
  setProductActive,
  setProductSKUActive,
  setSupplierActive,
  updateCustomer,
  updateMaterial,
  updateProcess,
  updateProduct,
  updateProductSKU,
  updateSupplier,
} from '../../api/masterDataOrderApi.mjs'

export const DEFAULT_PLUSH_PROCESS_NAMES = ['查货', '车缝', '手工', '包装']

export const DEFAULT_PLUSH_PROCESS_CATEGORIES = [
  '查货',
  '车缝',
  '手工',
  '包装',
  '裁片',
  '裁片质检',
  '刀模',
  '印刷',
  '贴合',
]

export const MASTER_DATA_PAGE_CONFIG = Object.freeze({
  customers: {
    title: '客户档案',
    ownerType: 'CUSTOMER',
    entityKey: 'customer',
    recordKey: 'customers',
    list: listCustomers,
    listAll: listAllCustomers,
    create: createCustomer,
    update: updateCustomer,
    saveWithContacts: saveCustomerWithContacts,
    setActive: setCustomerActive,
    permissions: {
      read: 'customer.read',
      create: 'customer.create',
      update: 'customer.update',
      disable: 'customer.disable',
      contactCreate: 'contact.create',
      contactUpdate: 'contact.update',
      contactDisable: 'contact.disable',
      contactPrimary: 'contact.set_primary',
    },
    entityLabel: '客户',
    draftCodePrefix: 'CUS',
    formBoundary: '只维护交易主体资料，不在此写订单、库存或财务记录。',
  },
  suppliers: {
    title: '供应商与加工厂',
    createTitleLabel: '供应商或加工厂',
    ownerType: 'SUPPLIER',
    entityKey: 'supplier',
    recordKey: 'suppliers',
    list: listSuppliers,
    listAll: listAllSuppliers,
    create: createSupplier,
    update: updateSupplier,
    saveWithContacts: saveSupplierWithContacts,
    setActive: setSupplierActive,
    permissions: {
      read: 'supplier.read',
      create: 'supplier.create',
      update: 'supplier.update',
      disable: 'supplier.disable',
      contactCreate: 'contact.create',
      contactUpdate: 'contact.update',
      contactDisable: 'contact.disable',
      contactPrimary: 'contact.set_primary',
    },
    entityLabel: '供应商',
    draftCodePrefix: 'SUP',
    formBoundary: '只维护交易主体资料，不在此写采购、库存、质检或财务记录。',
  },
  materials: {
    title: '材料档案',
    recordKey: 'materials',
    list: listMaterials,
    listAll: listAllMaterials,
    create: createMaterial,
    update: updateMaterial,
    setActive: setMaterialActive,
    permissions: {
      read: 'material.read',
      create: 'material.create',
      update: 'material.update',
      disable: 'material.disable',
    },
    entityLabel: '材料',
    draftCodePrefix: 'MAT',
    formBoundary:
      '这里只维护材料基础资料，不办理采购、库存、质检或物料清单用量。',
  },
  processes: {
    title: '加工环节',
    recordKey: 'processes',
    list: listProcesses,
    listAll: listAllProcesses,
    create: createProcess,
    update: updateProcess,
    setActive: setProcessActive,
    permissions: {
      read: 'process.read',
      create: 'process.create',
      update: 'process.update',
      disable: 'process.disable',
    },
    entityLabel: '加工环节',
    draftCodePrefix: 'PROC',
    formBoundary:
      '只维护委外订单和后续质检可引用的标准加工环节；排序只影响列表展示，不定义前后工序。需质检只是工序属性标记，不在此生成委外订单、生产任务、库存记录或质检判定。',
    initialValues: {
      outsourcing_enabled: true,
      inhouse_enabled: false,
      quality_required: false,
      sort_order: 0,
    },
  },
  products: {
    title: '产品档案',
    recordKey: 'products',
    list: listProducts,
    listAll: listAllProducts,
    create: createProduct,
    update: updateProduct,
    setActive: setProductActive,
    permissions: {
      read: 'product.read',
      create: 'product.create',
      update: 'product.update',
      disable: 'product.disable',
    },
    entityLabel: '产品',
    createTitleLabel: '产品',
    draftCodePrefix: 'PRD',
    formBoundary:
      '这里只维护产品基础信息，不办理订单、库存、物料清单、生产或出货业务。',
  },
  product_skus: {
    title: '产品档案',
    recordKey: 'product_skus',
    list: listProductSKUs,
    listAll: listAllProductSKUs,
    create: createProductSKU,
    update: updateProductSKU,
    setActive: setProductSKUActive,
    permissions: {
      read: 'product_sku.read',
      create: 'product_sku.create',
      update: 'product_sku.update',
      disable: 'product_sku.disable',
    },
    entityLabel: '产品规格',
    createTitleLabel: '产品规格',
    draftCodeField: 'sku_code',
    draftCodePrefix: 'SKU',
    formBoundary:
      '这里只维护产品规格，不办理订单、库存、物料清单、生产或出货业务。',
  },
})

export function getRecordCode(record, type = '') {
  const source = record || {}
  return type === 'product_skus' ? source.sku_code : source.code
}

export function getRecordName(record, type = '') {
  const source = record || {}
  if (type === 'product_skus') {
    return source.sku_name || source.customer_sku || source.barcode || ''
  }
  return source.name
}

export function getRecordSearchPlaceholder(type = '') {
  if (type === 'materials') {
    return '搜索材料'
  }
  if (type === 'processes') {
    return '搜索环节'
  }
  if (type === 'products') {
    return '搜索产品'
  }
  if (type === 'product_skus') {
    return '搜索产品规格'
  }
  if (type === 'customers') {
    return '搜索客户'
  }
  if (type === 'suppliers') {
    return '搜索供应商'
  }
  return '搜索记录'
}

export function getRecordSearchHint(type = '') {
  if (type === 'materials') {
    return '可搜索：编号、名称、分类、规格、颜色'
  }
  if (type === 'processes') {
    return '可搜索：环节编号、名称、类别、备注'
  }
  if (type === 'products') {
    return '可搜索：产品编号、中英文名称、内部款号、客户款号、HS 编码'
  }
  if (type === 'product_skus') {
    return '可搜索：规格编号、条码、客户规格编号、颜色、色号、尺码、包装版本'
  }
  if (type === 'customers') {
    return '可搜索：编号、名称、简称、付款方式、国家或地区'
  }
  if (type === 'suppliers') {
    return '可搜索：编号、名称、简称、地址、付款方式'
  }
  return getRecordSearchPlaceholder(type)
}

export function needsUnitDictionary(type = '') {
  return ['materials', 'products', 'product_skus'].includes(type)
}
