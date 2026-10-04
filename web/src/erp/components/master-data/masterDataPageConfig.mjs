import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
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
      read: PermissionCode.CUSTOMER_READ,
      create: PermissionCode.CUSTOMER_CREATE,
      update: PermissionCode.CUSTOMER_UPDATE,
      disable: PermissionCode.CUSTOMER_DISABLE,
      contactCreate: PermissionCode.CONTACT_CREATE,
      contactUpdate: PermissionCode.CONTACT_UPDATE,
      contactDisable: PermissionCode.CONTACT_DISABLE,
      contactPrimary: PermissionCode.CONTACT_SET_PRIMARY,
    },
    entityLabel: '客户',
    draftCodePrefix: 'CUS',
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
      read: PermissionCode.SUPPLIER_READ,
      create: PermissionCode.SUPPLIER_CREATE,
      update: PermissionCode.SUPPLIER_UPDATE,
      disable: PermissionCode.SUPPLIER_DISABLE,
      contactCreate: PermissionCode.CONTACT_CREATE,
      contactUpdate: PermissionCode.CONTACT_UPDATE,
      contactDisable: PermissionCode.CONTACT_DISABLE,
      contactPrimary: PermissionCode.CONTACT_SET_PRIMARY,
    },
    entityLabel: '供应商',
    draftCodePrefix: 'SUP',
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
      read: PermissionCode.MATERIAL_READ,
      create: PermissionCode.MATERIAL_CREATE,
      update: PermissionCode.MATERIAL_UPDATE,
      disable: PermissionCode.MATERIAL_DISABLE,
    },
    entityLabel: '材料',
    draftCodePrefix: 'MAT',
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
      read: PermissionCode.PROCESS_READ,
      create: PermissionCode.PROCESS_CREATE,
      update: PermissionCode.PROCESS_UPDATE,
      disable: PermissionCode.PROCESS_DISABLE,
    },
    entityLabel: '加工环节',
    draftCodePrefix: 'PROC',
    initialValues: {
      outsourcing_enabled: true,
      inhouse_enabled: false,
      quality_required: false,
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
      read: PermissionCode.PRODUCT_READ,
      create: PermissionCode.PRODUCT_CREATE,
      update: PermissionCode.PRODUCT_UPDATE,
      disable: PermissionCode.PRODUCT_DISABLE,
    },
    entityLabel: '产品',
    createTitleLabel: '产品',
    draftCodePrefix: 'PRD',
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
      read: PermissionCode.PRODUCT_SKU_READ,
      create: PermissionCode.PRODUCT_SKU_CREATE,
      update: PermissionCode.PRODUCT_SKU_UPDATE,
      disable: PermissionCode.PRODUCT_SKU_DISABLE,
    },
    entityLabel: '产品规格',
    createTitleLabel: '产品规格',
    draftCodeField: 'sku_code',
    draftCodePrefix: 'SKU',
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
    return '可搜索：编号、名称、厂商、料号、分类、规格、颜色'
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
