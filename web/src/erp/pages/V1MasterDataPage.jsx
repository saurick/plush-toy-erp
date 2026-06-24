import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  CheckCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Button, Form, Popconfirm, Space, Tabs } from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
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
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
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
  formatUnitShortDisplayName,
  hasActionPermission,
  inferDefaultUnitID,
  resolvePaymentTermDays,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import {
  productOption,
  uniqueReferenceOptions,
} from '../utils/referenceSelectOptions.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  SUPPLIER_TYPE_OPTIONS,
  buildMasterDataRecordColumns,
} from '../components/master-data/masterDataColumns.jsx'

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
  const [productCatalogTabType, setProductCatalogTabType] = useState('products')
  const [productCatalogType, setProductCatalogType] = useState('products')
  const [, startProductCatalogTransition] = useTransition()
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
  const skuAttachmentRef = useRef(null)
  const requestControllersRef = useRef({})
  const requestSequenceRef = useRef({})
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
    (unitID) => formatUnitShortDisplayName(unitID, unitByID),
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

  const beginLatestRequest = useCallback((key) => {
    requestControllersRef.current[key]?.abort()
    const controller = new AbortController()
    const nextSequence = Number(requestSequenceRef.current[key] || 0) + 1
    requestControllersRef.current[key] = controller
    requestSequenceRef.current[key] = nextSequence

    return {
      signal: controller.signal,
      isCurrent: () =>
        requestControllersRef.current[key] === controller &&
        requestSequenceRef.current[key] === nextSequence &&
        !controller.signal.aborted,
      finish: () => {
        if (requestControllersRef.current[key] === controller) {
          delete requestControllersRef.current[key]
        }
      },
    }
  }, [])

  useEffect(() => {
    const controllers = requestControllersRef.current
    return () => {
      Object.values(controllers).forEach((controller) => {
        controller?.abort()
      })
    }
  }, [])

  const loadContacts = useCallback(
    async (record) => {
      const request = beginLatestRequest('contacts')
      if (!supportsContacts || !record?.id) {
        if (request.isCurrent()) {
          setContacts([])
        }
        request.finish()
        return []
      }
      setContactLoading(true)
      try {
        const result = await listContactsByOwner(
          {
            owner_type: config.ownerType,
            owner_id: record.id,
            limit: 100,
          },
          { signal: request.signal }
        )
        if (!request.isCurrent()) {
          return []
        }
        const nextContacts = Array.isArray(result?.contacts)
          ? result.contacts
          : []
        setContacts(nextContacts)
        return nextContacts
      } catch (error) {
        if (isRpcAbortError(error) || !request.isCurrent()) {
          return []
        }
        message.error(getActionErrorMessage(error, '加载联系人'))
        setContacts([])
        return []
      } finally {
        if (request.isCurrent()) {
          setContactLoading(false)
          request.finish()
        }
      }
    },
    [beginLatestRequest, config.ownerType, supportsContacts]
  )

  const loadUnits = useCallback(async () => {
    const request = beginLatestRequest('units')
    if (!needsUnitDictionary(effectiveType)) {
      if (request.isCurrent()) {
        setUnits([])
      }
      request.finish()
      return true
    }
    setUnitLoading(true)
    try {
      const result = await listUnits({ limit: 500 }, { signal: request.signal })
      if (!request.isCurrent()) {
        return false
      }
      const nextUnits = Array.isArray(result?.units) ? result.units : []
      setUnits(nextUnits)
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(error, '加载单位字典'))
      setUnits([])
      return false
    } finally {
      if (request.isCurrent()) {
        setUnitLoading(false)
        request.finish()
      }
    }
  }, [beginLatestRequest, effectiveType])

  const loadProductReferences = useCallback(async () => {
    const request = beginLatestRequest('productReferences')
    if (effectiveType !== 'product_skus') {
      if (request.isCurrent()) {
        setProductReferences([])
      }
      request.finish()
      return true
    }
    try {
      const result = await listProducts(
        { limit: 500, active_only: true },
        { signal: request.signal }
      )
      if (!request.isCurrent()) {
        return false
      }
      setProductReferences(
        Array.isArray(result?.products) ? result.products : []
      )
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(error, '加载产品字典'))
      setProductReferences([])
      return false
    } finally {
      if (request.isCurrent()) {
        request.finish()
      }
    }
  }, [beginLatestRequest, effectiveType])

  const loadRecords = useCallback(async () => {
    const request = beginLatestRequest('records')
    setLoading(true)
    try {
      const result = await config.list(
        {
          keyword,
          active_only: activeOnly,
          ...getBusinessPaginationParams(pagination),
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) {
        return false
      }
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
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(error, `加载${config.title}`))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [activeOnly, beginLatestRequest, config, keyword, pagination])

  const refreshCurrentData = useCallback(async () => {
    const [recordsOK, unitsOK, productReferencesOK] = await Promise.all([
      loadRecords(),
      loadUnits(),
      loadProductReferences(),
    ])
    return (
      recordsOK !== false && unitsOK !== false && productReferencesOK !== false
    )
  }, [loadProductReferences, loadRecords, loadUnits])

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
    return outletContext?.registerPageRefresh?.(refreshCurrentData)
  }, [outletContext, refreshCurrentData])

  useEffect(() => {
    setSelectedRecord(null)
    setContacts([])
    setEditingRecord(null)
    setRecordModalOpen(false)
    setColumnOrder(null)
    setPagination((current) =>
      current.current === 1 && current.pageSize === 20
        ? current
        : { current: 1, pageSize: 20 }
    )
    setKeyword((current) => (current ? '' : current))
    setActiveOnly((current) => (current ? false : current))
  }, [effectiveType])

  const hasActiveFilters = Boolean(keyword.trim() || activeOnly)
  const clearFilters = useCallback(() => {
    setKeyword('')
    setActiveOnly(false)
    resetBusinessPaginationCurrent(setPagination)
  }, [])

  const handleProductCatalogTabChange = useCallback(
    (nextType) => {
      setProductCatalogTabType(nextType)
      startProductCatalogTransition(() => {
        setProductCatalogType(nextType)
      })
    },
    [startProductCatalogTransition]
  )

  const openCreateRecord = () => {
    skuAttachmentRef.current?.clearPendingAttachments()
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
    skuAttachmentRef.current?.clearPendingAttachments()
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
      const attachmentSaved =
        effectiveType === 'product_skus'
          ? (await skuAttachmentRef.current?.flushPendingAttachments(
              saved?.id
            )) !== false
          : true
      message.success(
        attachmentSaved
          ? editingRecord?.id
            ? '主数据已更新'
            : '主数据已创建'
          : '主数据已保存，未上传的附件请重新选择'
      )
      skuAttachmentRef.current?.clearPendingAttachments()
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

  const recordColumns = useMemo(
    () =>
      buildMasterDataRecordColumns({
        type: effectiveType,
        productOptions,
        unitDisplay,
      }),
    [effectiveType, productOptions, unitDisplay]
  )
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
  const productCatalogTabItems = useMemo(
    () => [
      { key: 'products', label: '产品基础信息', children: null },
      { key: 'product_skus', label: '产品规格', children: null },
    ],
    []
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

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
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
        tableHeader={
          isProductCatalogPage ? (
            <Tabs
              aria-label="产品档案视图"
              activeKey={productCatalogTabType}
              onChange={handleProductCatalogTabChange}
              items={productCatalogTabItems}
            />
          ) : null
        }
        rowKey="id"
        loading={loading}
        columns={orderedRecordColumns}
        dataSource={records}
        tableLayout={isProductCatalogPage ? 'fixed' : undefined}
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
        onCancel={() => {
          skuAttachmentRef.current?.clearPendingAttachments()
          setRecordModalOpen(false)
        }}
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
          {effectiveType === 'product_skus' ? (
            <BusinessAttachmentPanel
              ref={skuAttachmentRef}
              ownerType="product_sku"
              ownerId={editingRecord?.id}
              title="SKU 附件"
              description="上传产品图、样品图、包装图或客户款式确认资料；附件不改变 SKU 主数据启停状态。"
              canUpload={canCreate || canUpdate}
              canDelete={canUpdate}
              variant="inline"
            />
          ) : null}
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
