import {
  createCustomer,
  createMaterial,
  createProcess,
  createProduct,
  createProductSKU,
  createSupplier,
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
    summary:
      '维护客户交易主体和联系人；订单、出货、库存和财务记录请到对应业务页面处理。',
  },
  suppliers: {
    title: '供应商档案',
    ownerType: 'SUPPLIER',
    entityKey: 'supplier',
    recordKey: 'suppliers',
    list: listSuppliers,
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
    summary:
      '维护供应商和加工厂交易主体；采购入库、质检、库存和财务记录请到对应业务页面处理。',
  },
  materials: {
    title: '材料档案',
    recordKey: 'materials',
    list: listMaterials,
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
    summary:
      '维护材料基础资料；采购订单、库存余额、来料质检和物料清单用量请到对应业务页面处理。',
  },
  processes: {
    title: '加工环节',
    recordKey: 'processes',
    list: listProcesses,
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
    summary:
      '维护少量可复用加工环节，用于委外订单选择和后续质检提示；默认展示车缝在手工前，但不管理完整工艺路线、排程、报工、质检结果或库存记录。',
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
    summary:
      '维护产品基础信息；产品规格（SKU）、物料清单（BOM）、订单、库存和出货记录请到对应业务页面处理。',
  },
  product_skus: {
    title: '产品档案',
    recordKey: 'product_skus',
    list: listProductSKUs,
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
    summary:
      '维护产品规格（SKU）及其所属产品；订单、库存、物料清单和出货记录请到对应业务页面处理。',
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
    return '可搜索：产品编号、名称、内部款号、客户款号'
  }
  if (type === 'product_skus') {
    return '可搜索：规格编号、条码、客户规格编号、颜色、色号、尺码、包装版本'
  }
  if (type === 'customers') {
    return '可搜索：编号、名称、简称、付款方式'
  }
  if (type === 'suppliers') {
    return '可搜索：编号、名称、简称'
  }
  return getRecordSearchPlaceholder(type)
}

export function needsUnitDictionary(type = '') {
  return ['materials', 'products', 'product_skus'].includes(type)
}
