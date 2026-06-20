import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Button, Form, Popconfirm, Segmented, Space, Tag } from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  CollaborationTaskPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
  getColumnLabel,
} from '../components/business-list/ColumnOrderModal.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import {
  ContactFormList,
  MasterDataFormFields,
  createEmptyContactRow,
  contactRowsForForm,
  mergeTextSuggestionOptions,
  normalizeContactRows,
} from '../components/master-data/MasterDataForm.jsx'
import {
  createCustomer,
  createMaterial,
  createProcess,
  createProduct,
  createProductSKU,
  createSupplier,
  listContactsByOwner,
  listCustomers,
  listMaterials,
  listProcesses,
  listProducts,
  listProductSKUs,
  listSuppliers,
  listUnits,
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
} from '../api/masterDataOrderApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  buildContactParams,
  buildMasterDataParams,
  buildMaterialDraftCode,
  buildPaymentConditionOptions,
  buildSequentialDraftCode,
  buildProcessParams,
  buildProductParams,
  buildProductSKUParams,
  buildTextSelectOptions,
  buildUnitSelectOptions,
  formatUnitDisplayName,
  formatUnixDateTime,
  hasActionPermission,
  inferDefaultUnitID,
  resolvePaymentTermDays,
} from '../utils/masterDataOrderView.mjs'
import {
  applyBusinessColumnSorters,
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import {
  productOption,
  referenceLabel,
  uniqueReferenceOptions,
} from '../utils/referenceSelectOptions.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

const DEFAULT_PLUSH_PROCESS_NAMES = ['查货', '手工', '车缝', '包装']
const DEFAULT_PLUSH_PROCESS_CATEGORIES = [
  '查货',
  '手工',
  '车缝',
  '包装',
  '裁片',
  '裁片质检',
  '刀模',
  '印刷',
  '贴合',
]

const PAGE_CONFIG = Object.freeze({
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
    formBoundary: '只维护交易主体资料，不在此写订单、库存或财务事实。',
    summary:
      '维护客户交易主体和联系人；订单、出货、库存和财务事实在对应业务模块处理。',
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
    formBoundary: '只维护交易主体资料，不在此写采购、库存、质检或财务事实。',
    summary:
      '维护供应商和加工厂交易主体；采购入库、质检、库存和财务事实在对应业务模块处理。',
  },
  materials: {
    title: '材料档案',
    recordKey: 'materials',
    list: listMaterials,
    create: createMaterial,
    update: updateMaterial,
    setActive: setMaterialActive,
    permissions: {
      create: 'material.create',
      update: 'material.update',
      disable: 'material.disable',
    },
    entityLabel: '材料',
    draftCodePrefix: 'MAT',
    formBoundary: '只维护材料主数据，不在此写采购、库存、质检或 BOM 用量。',
    summary:
      '维护材料主数据；采购订单、库存余额、来料质检和 BOM 用量在对应业务模块处理。',
  },
  processes: {
    title: '加工环节',
    recordKey: 'processes',
    list: listProcesses,
    create: createProcess,
    update: updateProcess,
    setActive: setProcessActive,
    permissions: {
      create: 'process.create',
      update: 'process.update',
      disable: 'process.disable',
    },
    entityLabel: '加工环节',
    draftCodePrefix: 'PROC',
    formBoundary:
      '只维护委外订单和后续质检可引用的标准加工环节；需质检只是工序属性标记，不在此生成委外订单、生产任务、库存流水或质检判定。',
    summary:
      '维护少量可复用加工环节，用于委外订单选择和后续质检提示；不管理完整工艺路线、排程、报工、质检结果或库存事实。',
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
      create: 'product.create',
      update: 'product.update',
      disable: 'product.disable',
    },
    entityLabel: '产品',
    createTitleLabel: '产品',
    draftCodePrefix: 'PRD',
    formBoundary:
      '只维护产品基础信息，不在此写订单、库存、BOM、生产或出货事实。',
    summary:
      '维护产品基础信息；产品规格 / SKU、BOM、订单、库存和出货事实在对应业务模块处理。',
  },
  product_skus: {
    title: '产品档案',
    recordKey: 'product_skus',
    list: listProductSKUs,
    create: createProductSKU,
    update: updateProductSKU,
    setActive: setProductSKUActive,
    permissions: {
      create: 'product_sku.create',
      update: 'product_sku.update',
      disable: 'product_sku.disable',
    },
    entityLabel: '产品规格',
    createTitleLabel: '产品规格',
    draftCodeField: 'sku_code',
    draftCodePrefix: 'SKU',
    formBoundary:
      '只维护产品规格主数据，不在此写订单、库存、BOM、生产或出货事实。',
    summary:
      '维护产品规格 / SKU；产品归属使用 product_id，订单、库存、BOM 和出货事实在对应业务模块处理。',
  },
})

const SUPPLIER_TYPE_OPTIONS = Object.freeze([
  { label: '原辅料供应商', value: 'material' },
  { label: '委外加工厂', value: 'outsourcing' },
  { label: '服务供应商', value: 'service' },
  { label: '综合供应商', value: 'mixed' },
])

const SUPPLIER_TYPE_LABELS = Object.freeze(
  Object.fromEntries(
    SUPPLIER_TYPE_OPTIONS.map((item) => [item.value, item.label])
  )
)

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function compareBoolean(a, b) {
  return Number(Boolean(a)) - Number(Boolean(b))
}

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(
      `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
    )
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredColumnOrder(moduleKey, order = []) {
  if (typeof window === 'undefined') {
    return
  }

  const storageKey = `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
  if (!Array.isArray(order) || order.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(order))
}

function getPreferredColumnOrder({
  adminProfile,
  moduleKey,
  columns,
  localOrder,
}) {
  if (Array.isArray(localOrder)) {
    return sanitizeModuleColumnOrder(localOrder, columns)
  }

  const accountOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedAccountOrder = sanitizeModuleColumnOrder(accountOrder, columns)
  if (sanitizedAccountOrder.length > 0) {
    return sanitizedAccountOrder
  }
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function activeTag(active) {
  return active === false ? (
    <Tag color="red">停用</Tag>
  ) : (
    <Tag color="green">启用</Tag>
  )
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCSV({ filename, columns, rows }) {
  const header = columns.map((column) => csvEscape(getColumnLabel(column)))
  const body = rows.map((row) =>
    columns.map((column) => {
      const value =
        typeof column.exportValue === 'function'
          ? column.exportValue(row)
          : row?.[column.dataIndex]
      return csvEscape(value)
    })
  )
  const csv = [header, ...body].map((line) => line.join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function getRecordCode(record, type = '') {
  const source = record || {}
  return type === 'product_skus' ? source.sku_code : source.code
}

function getRecordName(record, type = '') {
  const source = record || {}
  if (type === 'product_skus') {
    return source.sku_name || source.customer_sku || source.barcode || ''
  }
  return source.name
}

function getRecordSearchPlaceholder(type = '') {
  if (type === 'materials') {
    return '搜索编号、名称、分类、规格、颜色'
  }
  if (type === 'processes') {
    return '搜索环节编号、名称、类别、备注'
  }
  if (type === 'products') {
    return '搜索产品编号、名称、内部款号、客户款号'
  }
  if (type === 'product_skus') {
    return '搜索 SKU、条码、客户 SKU、颜色、色号、尺码、包装版本'
  }
  if (type === 'customers') {
    return '搜索编号、名称、简称、付款方式'
  }
  return '搜索编号、名称、简称'
}

function needsUnitDictionary(type = '') {
  return ['materials', 'products', 'product_skus'].includes(type)
}

export default function V1MasterDataPage({ type }) {
  const isProductCatalogPage = type === 'product_skus'
  const [productCatalogType, setProductCatalogType] = useState('products')
  const effectiveType = isProductCatalogPage ? productCatalogType : type
  const config = PAGE_CONFIG[effectiveType] || PAGE_CONFIG.customers
  const isProcessDictionaryPage = effectiveType === 'processes'
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [loading, setLoading] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [, setContacts] = useState([])
  const [productReferences, setProductReferences] = useState([])
  const [units, setUnits] = useState([])
  const [unitLoading, setUnitLoading] = useState(false)
  const [recordModalOpen, setRecordModalOpen] = useState(false)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [recordForm] = Form.useForm()
  const moduleKey = config.recordKey
  const supportsContacts = Boolean(config.ownerType)
  const entityLabel = config.entityLabel || '主体'

  const canCreate = hasActionPermission(adminProfile, config.permissions.create)
  const canUpdate = hasActionPermission(adminProfile, config.permissions.update)
  const canDisable = hasActionPermission(
    adminProfile,
    config.permissions.disable
  )
  const canCreateContact = hasActionPermission(
    adminProfile,
    config.permissions.contactCreate
  )
  const canUpdateContact = hasActionPermission(
    adminProfile,
    config.permissions.contactUpdate
  )
  const canDisableContact = hasActionPermission(
    adminProfile,
    config.permissions.contactDisable
  )
  const canSyncContacts =
    canCreateContact && canUpdateContact && canDisableContact
  const showContactForm =
    supportsContacts && canSyncContacts && Boolean(config.saveWithContacts)
  const productOptions = useMemo(
    () => uniqueReferenceOptions(productReferences, productOption),
    [productReferences]
  )
  const unitByID = useMemo(
    () =>
      new Map(
        units
          .map((unit) => [Number(unit?.id || 0), unit])
          .filter(([unitID]) => Number.isFinite(unitID) && unitID > 0)
      ),
    [units]
  )
  const unitOptions = useMemo(() => buildUnitSelectOptions(units), [units])
  const materialCategoryOptions = useMemo(
    () =>
      effectiveType === 'materials'
        ? buildTextSelectOptions(records, 'category')
        : [],
    [effectiveType, records]
  )
  const materialColorOptions = useMemo(
    () =>
      effectiveType === 'materials'
        ? buildTextSelectOptions(records, 'color')
        : [],
    [effectiveType, records]
  )
  const processNameOptions = useMemo(
    () =>
      effectiveType === 'processes'
        ? mergeTextSuggestionOptions(
            DEFAULT_PLUSH_PROCESS_NAMES,
            buildTextSelectOptions(records, 'name')
          )
        : [],
    [effectiveType, records]
  )
  const processCategoryOptions = useMemo(
    () =>
      effectiveType === 'processes'
        ? mergeTextSuggestionOptions(
            DEFAULT_PLUSH_PROCESS_CATEGORIES,
            buildTextSelectOptions(records, 'category')
          )
        : [],
    [effectiveType, records]
  )
  const customerPaymentConditionOptions = useMemo(
    () =>
      effectiveType === 'customers'
        ? buildPaymentConditionOptions(records)
        : [],
    [effectiveType, records]
  )
  const unitDisplay = useCallback(
    (unitID) => formatUnitDisplayName(unitID, unitByID),
    [unitByID]
  )
  const applyCustomerPaymentMethod = useCallback(
    (method) => {
      const termDays = resolvePaymentTermDays(
        method,
        customerPaymentConditionOptions
      )
      if (termDays !== undefined) {
        recordForm.setFieldValue('default_payment_term_days', termDays)
      }
    },
    [customerPaymentConditionOptions, recordForm]
  )

  const loadContacts = useCallback(
    async (record) => {
      if (!supportsContacts || !record?.id) {
        setContacts([])
        return []
      }
      setContactLoading(true)
      try {
        const result = await listContactsByOwner({
          owner_type: config.ownerType,
          owner_id: record.id,
          limit: 100,
        })
        const nextContacts = Array.isArray(result?.contacts)
          ? result.contacts
          : []
        setContacts(nextContacts)
        return nextContacts
      } catch (error) {
        message.error(getActionErrorMessage(error, '加载联系人'))
        setContacts([])
        return []
      } finally {
        setContactLoading(false)
      }
    },
    [config.ownerType, supportsContacts]
  )

  const loadUnits = useCallback(async () => {
    if (!needsUnitDictionary(effectiveType)) {
      setUnits([])
      return true
    }
    setUnitLoading(true)
    try {
      const result = await listUnits({ limit: 500 })
      const nextUnits = Array.isArray(result?.units) ? result.units : []
      setUnits(nextUnits)
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载单位字典'))
      setUnits([])
      return false
    } finally {
      setUnitLoading(false)
    }
  }, [effectiveType])

  const loadProductReferences = useCallback(async () => {
    if (effectiveType !== 'product_skus') {
      setProductReferences([])
      return true
    }
    try {
      const result = await listProducts({ limit: 500, active_only: true })
      setProductReferences(
        Array.isArray(result?.products) ? result.products : []
      )
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载产品字典'))
      setProductReferences([])
      return false
    }
  }, [effectiveType])

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const result = await config.list({
        keyword,
        active_only: activeOnly,
        ...getBusinessPaginationParams(pagination),
      })
      const nextRecords = Array.isArray(result?.[config.recordKey])
        ? result[config.recordKey]
        : []
      setRecords(nextRecords)
      setTotal(Number(result?.total || nextRecords.length || 0))
      setSelectedRecord((current) => {
        if (!current?.id) return null
        return nextRecords.find((item) => item.id === current.id) || null
      })
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, `加载${config.title}`))
      return false
    } finally {
      setLoading(false)
    }
  }, [activeOnly, config, keyword, pagination])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  useEffect(() => {
    loadUnits()
  }, [loadUnits])

  useEffect(() => {
    loadProductReferences()
  }, [loadProductReferences])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRecords)
  }, [loadRecords, outletContext])

  useEffect(() => {
    setSelectedRecord(null)
    setContacts([])
    setEditingRecord(null)
    setProductReferences([])
    setUnits([])
    setRecordModalOpen(false)
    setColumnOrder(null)
    setPagination({ current: 1, pageSize: 20 })
    setKeyword('')
    setActiveOnly(false)
  }, [effectiveType])

  const openCreateRecord = () => {
    setEditingRecord(null)
    setContacts([])
    recordForm.resetFields()
    const createDefaults = {}
    if (config.initialValues) {
      Object.assign(createDefaults, config.initialValues)
    }
    if (config.draftCodePrefix) {
      createDefaults[config.draftCodeField || 'code'] =
        effectiveType === 'materials'
          ? buildMaterialDraftCode(records)
          : buildSequentialDraftCode(records, {
              prefix: config.draftCodePrefix,
              field: config.draftCodeField || 'code',
            })
    }
    if (needsUnitDictionary(effectiveType)) {
      const defaultUnitID = inferDefaultUnitID(records, unitOptions)
      if (defaultUnitID) {
        createDefaults.default_unit_id = defaultUnitID
      }
    }
    if (showContactForm) {
      createDefaults.contacts = [createEmptyContactRow()]
    }
    if (Object.keys(createDefaults).length > 0) {
      recordForm.setFieldsValue(createDefaults)
    }
    setRecordModalOpen(true)
  }

  useEffect(() => {
    if (
      !recordModalOpen ||
      editingRecord?.id ||
      !needsUnitDictionary(effectiveType)
    ) {
      return
    }
    if (recordForm.getFieldValue('default_unit_id')) {
      return
    }
    const defaultUnitID = inferDefaultUnitID(records, unitOptions)
    if (defaultUnitID) {
      recordForm.setFieldsValue({ default_unit_id: defaultUnitID })
    }
  }, [
    editingRecord?.id,
    effectiveType,
    recordForm,
    recordModalOpen,
    records,
    unitOptions,
  ])

  const openEditRecord = async (record) => {
    if (!record?.id) return
    setSelectedRecord(record)
    setEditingRecord(record)
    recordForm.resetFields()
    const recordContacts = showContactForm ? await loadContacts(record) : []
    recordForm.setFieldsValue({
      ...record,
      ...(showContactForm
        ? { contacts: contactRowsForForm(recordContacts) }
        : {}),
    })
    setRecordModalOpen(true)
  }

  const saveRecord = async () => {
    const values = await recordForm.validateFields()
    setSaving(true)
    try {
      const extra = editingRecord?.id ? { id: editingRecord.id } : {}
      const params =
        effectiveType === 'product_skus'
          ? buildProductSKUParams(values, extra)
          : effectiveType === 'products'
            ? buildProductParams(values, extra)
            : effectiveType === 'processes'
              ? buildProcessParams(values, extra)
              : buildMasterDataParams(values, extra)
      const savedData =
        showContactForm && config.saveWithContacts
          ? await config.saveWithContacts({
              ...params,
              contacts: normalizeContactRows(values.contacts).map((row) =>
                buildContactParams(row, row.id ? { id: row.id } : {})
              ),
            })
          : null
      const saved = savedData
        ? savedData?.[config.entityKey]
        : editingRecord?.id
          ? await config.update(params)
          : await config.create(params)
      message.success(editingRecord?.id ? '主数据已更新' : '主数据已创建')
      setRecordModalOpen(false)
      setSelectedRecord(saved || selectedRecord)
      if (Array.isArray(savedData?.contacts)) {
        setContacts(savedData.contacts)
      }
      await loadRecords()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存主数据'))
    } finally {
      setSaving(false)
    }
  }

  const toggleRecordActive = async (record) => {
    setSaving(true)
    try {
      await config.setActive({
        id: record.id,
        active: record.is_active === false,
      })
      message.success(record.is_active === false ? '已启用' : '已停用')
      await loadRecords()
    } catch (error) {
      message.error(getActionErrorMessage(error, '更新启停状态'))
    } finally {
      setSaving(false)
    }
  }

  const persistColumnOrder = useCallback(
    async (nextOrder, columns) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(nextOrder, columns)
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(moduleKey, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: moduleKey,
          order: sanitizedOrder,
        })
        outletContext?.updateAdminERPPreferences?.(erpPreferences)
        message.success(
          sanitizedOrder.length > 0 ? '列顺序已保存' : '列顺序已恢复默认'
        )
      } catch (error) {
        message.warning(
          `${getActionErrorMessage(error, '保存列顺序')}，已保留本地设置`
        )
      } finally {
        setColumnOrderSaving(false)
      }
    },
    [moduleKey, outletContext]
  )

  const recordColumns = useMemo(() => {
    if (effectiveType === 'products') {
      return applyBusinessColumnSorters([
        {
          title: '产品编号',
          exportTitle: '产品编号',
          dataIndex: 'code',
          width: 150,
          sorter: (a, b) => compareText(a?.code, b?.code),
        },
        {
          title: '产品名称',
          exportTitle: '产品名称',
          dataIndex: 'name',
          width: 220,
          sorter: (a, b) => compareText(a?.name, b?.name),
        },
        {
          title: '内部款号',
          exportTitle: '内部款号',
          dataIndex: 'style_no',
          width: 160,
          sorter: (a, b) => compareText(a?.style_no, b?.style_no),
          render: (value) => value || '-',
        },
        {
          title: '客户款号',
          exportTitle: '客户款号',
          dataIndex: 'customer_style_no',
          width: 160,
          sorter: (a, b) =>
            compareText(a?.customer_style_no, b?.customer_style_no),
          render: (value) => value || '-',
        },
        {
          title: '默认单位',
          exportTitle: '默认单位',
          dataIndex: 'default_unit_id',
          width: 130,
          sorter: (a, b) =>
            compareText(
              unitDisplay(a?.default_unit_id),
              unitDisplay(b?.default_unit_id)
            ),
          render: (value) => unitDisplay(value),
          exportValue: (record) => unitDisplay(record?.default_unit_id),
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'is_active',
          width: 90,
          sorter: (a, b) => compareBoolean(a?.is_active, b?.is_active),
          exportValue: (record) =>
            record?.is_active === false ? '停用' : '启用',
          render: activeTag,
        },
        {
          title: '创建时间',
          exportTitle: '创建时间',
          dataIndex: 'created_at',
          width: 160,
          sorter: (a, b) =>
            Number(a?.created_at || 0) - Number(b?.created_at || 0),
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.created_at),
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 160,
          sorter: (a, b) =>
            Number(a?.updated_at || 0) - Number(b?.updated_at || 0),
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.updated_at),
        },
      ])
    }

    if (effectiveType === 'product_skus') {
      return applyBusinessColumnSorters([
        {
          title: '产品',
          exportTitle: '产品',
          dataIndex: 'product_id',
          width: 180,
          sorter: (a, b) =>
            Number(a?.product_id || 0) - Number(b?.product_id || 0),
          render: (value) => referenceLabel(productOptions, value, '产品'),
          exportValue: (record) =>
            referenceLabel(productOptions, record?.product_id, '产品'),
        },
        {
          title: 'SKU 编号',
          exportTitle: 'SKU 编号',
          dataIndex: 'sku_code',
          width: 160,
          sorter: (a, b) => compareText(a?.sku_code, b?.sku_code),
        },
        {
          title: 'SKU 名称',
          exportTitle: 'SKU 名称',
          dataIndex: 'sku_name',
          width: 200,
          sorter: (a, b) => compareText(a?.sku_name, b?.sku_name),
          render: (value) => value || '-',
        },
        {
          title: '条码',
          exportTitle: '条码',
          dataIndex: 'barcode',
          width: 160,
          sorter: (a, b) => compareText(a?.barcode, b?.barcode),
          render: (value) => value || '-',
        },
        {
          title: '客户 SKU',
          exportTitle: '客户 SKU',
          dataIndex: 'customer_sku',
          width: 160,
          sorter: (a, b) => compareText(a?.customer_sku, b?.customer_sku),
          render: (value) => value || '-',
        },
        {
          title: '颜色',
          exportTitle: '颜色',
          dataIndex: 'color',
          width: 120,
          sorter: (a, b) => compareText(a?.color, b?.color),
          render: (value) => value || '-',
        },
        {
          title: '色号',
          exportTitle: '色号',
          dataIndex: 'color_no',
          width: 120,
          sorter: (a, b) => compareText(a?.color_no, b?.color_no),
          render: (value) => value || '-',
        },
        {
          title: '尺码',
          exportTitle: '尺码',
          dataIndex: 'size',
          width: 110,
          sorter: (a, b) => compareText(a?.size, b?.size),
          render: (value) => value || '-',
        },
        {
          title: '包装版本',
          exportTitle: '包装版本',
          dataIndex: 'packaging_version',
          width: 140,
          sorter: (a, b) =>
            compareText(a?.packaging_version, b?.packaging_version),
          render: (value) => value || '-',
        },
        {
          title: '默认单位',
          exportTitle: '默认单位',
          dataIndex: 'default_unit_id',
          width: 130,
          sorter: (a, b) =>
            compareText(
              unitDisplay(a?.default_unit_id),
              unitDisplay(b?.default_unit_id)
            ),
          render: (value) => unitDisplay(value),
          exportValue: (record) => unitDisplay(record?.default_unit_id),
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'is_active',
          width: 90,
          sorter: (a, b) => compareBoolean(a?.is_active, b?.is_active),
          exportValue: (record) =>
            record?.is_active === false ? '停用' : '启用',
          render: activeTag,
        },
        {
          title: '创建时间',
          exportTitle: '创建时间',
          dataIndex: 'created_at',
          width: 160,
          sorter: (a, b) =>
            Number(a?.created_at || 0) - Number(b?.created_at || 0),
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.created_at),
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 160,
          sorter: (a, b) =>
            Number(a?.updated_at || 0) - Number(b?.updated_at || 0),
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.updated_at),
        },
      ])
    }

    if (effectiveType === 'processes') {
      return applyBusinessColumnSorters([
        {
          title: '环节编号',
          exportTitle: '环节编号',
          dataIndex: 'code',
          width: 150,
          sorter: (a, b) => compareText(a?.code, b?.code),
        },
        {
          title: '环节名称',
          exportTitle: '环节名称',
          dataIndex: 'name',
          width: 180,
          sorter: (a, b) => compareText(a?.name, b?.name),
        },
        {
          title: '环节类别',
          exportTitle: '环节类别',
          dataIndex: 'category',
          width: 150,
          sorter: (a, b) => compareText(a?.category, b?.category),
          render: (value) => value || '-',
        },
        {
          title: '可委外',
          exportTitle: '可委外',
          dataIndex: 'outsourcing_enabled',
          width: 100,
          sorter: (a, b) =>
            compareBoolean(a?.outsourcing_enabled, b?.outsourcing_enabled),
          exportValue: (record) =>
            record?.outsourcing_enabled === true ? '是' : '否',
          render: (value) =>
            value === true ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
        },
        {
          title: '可内制',
          exportTitle: '可内制',
          dataIndex: 'inhouse_enabled',
          width: 100,
          sorter: (a, b) =>
            compareBoolean(a?.inhouse_enabled, b?.inhouse_enabled),
          exportValue: (record) =>
            record?.inhouse_enabled === true ? '是' : '否',
          render: (value) =>
            value === true ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
        },
        {
          title: '需质检',
          exportTitle: '需质检',
          dataIndex: 'quality_required',
          width: 100,
          sorter: (a, b) =>
            compareBoolean(a?.quality_required, b?.quality_required),
          exportValue: (record) =>
            record?.quality_required === true ? '是' : '否',
          render: (value) =>
            value === true ? <Tag color="orange">是</Tag> : <Tag>否</Tag>,
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'is_active',
          width: 90,
          sorter: (a, b) => compareBoolean(a?.is_active, b?.is_active),
          exportValue: (record) =>
            record?.is_active === false ? '停用' : '启用',
          render: activeTag,
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 160,
          sorter: (a, b) =>
            Number(a?.updated_at || 0) - Number(b?.updated_at || 0),
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.updated_at),
        },
      ])
    }

    return applyBusinessColumnSorters([
      {
        title: '编号',
        exportTitle: '编号',
        dataIndex: 'code',
        width: 140,
        sorter: (a, b) => compareText(a?.code, b?.code),
      },
      {
        title: '名称',
        exportTitle: '名称',
        dataIndex: 'name',
        width: 220,
        sorter: (a, b) => compareText(a?.name, b?.name),
      },
      ...(effectiveType === 'materials'
        ? []
        : [
            {
              title: '简称',
              exportTitle: '简称',
              dataIndex: 'short_name',
              width: 160,
              sorter: (a, b) => compareText(a?.short_name, b?.short_name),
              render: (value) => value || '-',
            },
          ]),
      ...(effectiveType === 'customers'
        ? [
            {
              title: '付款条件',
              exportTitle: '付款条件',
              dataIndex: 'default_payment_method',
              width: 180,
              sorter: (a, b) =>
                compareText(
                  a?.default_payment_method,
                  b?.default_payment_method
                ),
              render: (value, record) => {
                const termDays = record?.default_payment_term_days
                if (value && termDays != null) {
                  return `${value} / ${termDays}天`
                }
                if (value) {
                  return value
                }
                if (termDays != null) {
                  return `${termDays}天`
                }
                return '-'
              },
              exportValue: (record) => {
                const method = record?.default_payment_method
                const termDays = record?.default_payment_term_days
                if (method && termDays != null) {
                  return `${method} / ${termDays}天`
                }
                return method || (termDays != null ? `${termDays}天` : '')
              },
            },
          ]
        : []),
      ...(effectiveType === 'materials'
        ? [
            {
              title: '分类',
              exportTitle: '分类',
              dataIndex: 'category',
              width: 140,
              sorter: (a, b) => compareText(a?.category, b?.category),
              render: (value) => value || '-',
            },
            {
              title: '规格',
              exportTitle: '规格',
              dataIndex: 'spec',
              width: 180,
              sorter: (a, b) => compareText(a?.spec, b?.spec),
              render: (value) => value || '-',
            },
            {
              title: '颜色',
              exportTitle: '颜色',
              dataIndex: 'color',
              width: 120,
              sorter: (a, b) => compareText(a?.color, b?.color),
              render: (value) => value || '-',
            },
            {
              title: '默认单位',
              exportTitle: '默认单位',
              dataIndex: 'default_unit_id',
              width: 130,
              sorter: (a, b) =>
                compareText(
                  unitDisplay(a?.default_unit_id),
                  unitDisplay(b?.default_unit_id)
                ),
              render: (value) => unitDisplay(value),
              exportValue: (record) => unitDisplay(record?.default_unit_id),
            },
          ]
        : []),
      ...(effectiveType === 'suppliers'
        ? [
            {
              title: '类型',
              exportTitle: '类型',
              dataIndex: 'supplier_type',
              width: 140,
              sorter: (a, b) => compareText(a?.supplier_type, b?.supplier_type),
              render: (value) => SUPPLIER_TYPE_LABELS[value] || value || '-',
              exportValue: (record) =>
                SUPPLIER_TYPE_LABELS[record?.supplier_type] ||
                record?.supplier_type ||
                '',
            },
          ]
        : []),
      ...(effectiveType === 'materials'
        ? []
        : [
            {
              title: '税号',
              exportTitle: '税号',
              dataIndex: 'tax_no',
              width: 180,
              sorter: (a, b) => compareText(a?.tax_no, b?.tax_no),
              render: (value) => value || '-',
            },
          ]),
      {
        title: '状态',
        exportTitle: '状态',
        dataIndex: 'is_active',
        width: 90,
        sorter: (a, b) => compareBoolean(a?.is_active, b?.is_active),
        exportValue: (record) =>
          record?.is_active === false ? '停用' : '启用',
        render: activeTag,
      },
      {
        title: '创建时间',
        exportTitle: '创建时间',
        dataIndex: 'created_at',
        width: 160,
        sorter: (a, b) =>
          Number(a?.created_at || 0) - Number(b?.created_at || 0),
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.created_at),
      },
      {
        title: '更新时间',
        exportTitle: '更新时间',
        dataIndex: 'updated_at',
        width: 160,
        sorter: (a, b) =>
          Number(a?.updated_at || 0) - Number(b?.updated_at || 0),
        render: formatUnixDateTime,
        exportValue: (record) => formatUnixDateTime(record?.updated_at),
      },
    ])
  }, [effectiveType, productOptions, unitDisplay])
  const preferredRecordColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey,
        columns: recordColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, moduleKey, recordColumns]
  )
  const orderedRecordColumns = useMemo(() => {
    const nextColumns = applyModuleColumnOrder(
      recordColumns,
      preferredRecordColumnOrder
    )

    return nextColumns.map((column) => ({
      ...column,
      title: (
        <ColumnOrderHeaderMenu
          column={column}
          columns={recordColumns}
          order={preferredRecordColumnOrder}
          saving={columnOrderSaving}
          onChange={(nextOrder) => persistColumnOrder(nextOrder, recordColumns)}
          onOpenPanel={() => setColumnOrderOpen(true)}
        />
      ),
    }))
  }, [
    columnOrderSaving,
    persistColumnOrder,
    preferredRecordColumnOrder,
    recordColumns,
  ])

  const activeRecordCount = useMemo(
    () => records.filter((record) => record.is_active !== false).length,
    [records]
  )
  const selectedRecordDisplayText = useMemo(() => {
    if (!selectedRecord) return `请先选择一个${entityLabel}`
    return `${getRecordCode(selectedRecord, effectiveType) || selectedRecord.id} / ${
      getRecordName(selectedRecord, effectiveType) || `未命名${entityLabel}`
    }`
  }, [effectiveType, entityLabel, selectedRecord])
  const exportRecords = () => {
    downloadCSV({
      filename: `${effectiveType}-current-results.csv`,
      columns: orderedRecordColumns,
      rows: records,
    })
    message.success('已导出当前结果')
  }
  return (
    <BusinessPageLayout className="erp-v1-master-data-page">
      <PageHeaderCard
        compact
        title={config.title}
        description={config.summary}
        stats={
          isProcessDictionaryPage
            ? []
            : [
                { key: 'total', label: `总${entityLabel}`, value: total },
                { key: 'current', label: '当前结果', value: records.length },
                {
                  key: 'active',
                  label: `启用${entityLabel}`,
                  value: activeRecordCount,
                },
                {
                  key: 'selected',
                  label: `已选${entityLabel}`,
                  value: selectedRecord ? 1 : 0,
                },
              ]
        }
      />

      {isProductCatalogPage ? (
        <Segmented
          aria-label="产品档案视图"
          value={effectiveType}
          onChange={(nextValue) => setProductCatalogType(nextValue)}
          options={[
            { label: '产品基础信息', value: 'products' },
            { label: '产品规格', value: 'product_skus' },
          ]}
        />
      ) : null}

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              placeholder={getRecordSearchPlaceholder(effectiveType)}
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRecords}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              options={[
                { label: `全部${entityLabel}`, value: 'all' },
                { label: `仅看启用${entityLabel}`, value: 'active' },
              ]}
              value={activeOnly ? 'active' : 'all'}
              onChange={(nextValue) => {
                setActiveOnly(nextValue === 'active')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={records.length === 0}
              onClick={exportRecords}
            >
              导出当前结果
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderOpen(true)}
            >
              列顺序
            </ToolbarButton>
          </Space>
        }
        primaryAction={
          canCreate ? (
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              onClick={openCreateRecord}
            >
              新建{entityLabel}
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRecord ? 1 : 0}
          selectedLabel={selectedRecordDisplayText}
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRecord}
            onClick={() => {
              setSelectedRecord(null)
              setContacts([])
            }}
          >
            清空已选
          </Button>
          {canUpdate ? (
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!selectedRecord}
              onClick={() => openEditRecord(selectedRecord)}
            >
              编辑{entityLabel}
            </Button>
          ) : null}
          {canDisable ? (
            <Popconfirm
              title={
                selectedRecord?.is_active === false
                  ? '确认启用？'
                  : '确认停用？'
              }
              onConfirm={() => toggleRecordActive(selectedRecord)}
              disabled={!selectedRecord}
            >
              <Button
                size="small"
                disabled={!selectedRecord}
                icon={
                  selectedRecord?.is_active === false ? (
                    <CheckCircleOutlined />
                  ) : (
                    <StopOutlined />
                  )
                }
              >
                {selectedRecord?.is_active === false ? '启用' : '停用'}
              </Button>
            </Popconfirm>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={orderedRecordColumns}
        dataSource={records}
        scroll={{ x: isProcessDictionaryPage ? 1000 : 1300 }}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        emptyDescription={`暂无${entityLabel}记录`}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRecord?.id ? [selectedRecord.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedRecord(selectedRows[0] || null),
        }}
        rowClassName={(record) =>
          record.id === selectedRecord?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedRecord(record),
          onDoubleClick: () => {
            if (canUpdate) {
              openEditRecord(record)
            }
          },
        })}
      />

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={getRecordName(selectedRecord, effectiveType) || ''}
      />

      <BusinessFormModal
        size={showContactForm ? 'masterDataItems' : 'masterData'}
        title={
          editingRecord?.id
            ? `编辑${entityLabel}`
            : `新建${config.createTitleLabel || config.title}`
        }
        description={config.formBoundary}
        open={recordModalOpen}
        onOk={saveRecord}
        onCancel={() => setRecordModalOpen(false)}
        confirmLoading={saving || contactLoading}
        forceRender
        destroyOnHidden={false}
      >
        <Form
          form={recordForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <MasterDataFormFields
            form={recordForm}
            type={effectiveType}
            productOptions={productOptions}
            unitOptions={unitOptions}
            unitLoading={unitLoading}
            materialCategoryOptions={materialCategoryOptions}
            materialColorOptions={materialColorOptions}
            processNameOptions={processNameOptions}
            processCategoryOptions={processCategoryOptions}
            supplierTypeOptions={SUPPLIER_TYPE_OPTIONS}
            customerPaymentConditionOptions={customerPaymentConditionOptions}
            onCustomerPaymentMethodChange={applyCustomerPaymentMethod}
          />
          {showContactForm ? (
            <ContactFormList form={recordForm} entityLabel={entityLabel} />
          ) : null}
        </Form>
      </BusinessFormModal>

      <ColumnOrderModal
        open={columnOrderOpen}
        moduleTitle={config.title}
        columns={recordColumns}
        order={preferredRecordColumnOrder}
        saving={columnOrderSaving}
        onChange={(nextOrder) => persistColumnOrder(nextOrder, recordColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />
    </BusinessPageLayout>
  )
}
