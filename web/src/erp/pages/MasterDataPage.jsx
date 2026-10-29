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
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Button, Form, Popconfirm, Space } from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { showPageLoadError } from '../components/PageLoadFeedback.jsx'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import useBusinessPageState from '../hooks/useBusinessPageState'
import Tabs from '@/common/components/navigation/SlidingTabs'
import { MATERIAL_STOCK_CATEGORY_OPTIONS } from '../utils/warehouseClassification.mjs'
import { DEFAULT_DELIVERY_COUNTRY } from '../utils/deliveryAddress.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import { BusinessListToolbarActions, useBusinessColumnOrder } from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessFormSection from '../components/business-list/BusinessFormSection.jsx'
import BusinessFormPage from '../components/business-list/BusinessFormPage.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import {
  ContactFormList,
  MasterDataFormFields,
  createEmptyContactRow,
  contactRowsForForm,
  mergeTextSuggestionOptions,
  normalizeContactRows,
} from '../components/master-data/MasterDataForm.jsx'
import ProductRecordEditor from '../components/master-data/ProductRecordEditor.jsx'
import {
  listContactsByOwner,
  listAllProcesses,
  listAllProducts,
  listAllUnits,
} from '../api/masterDataOrderApi.mjs'
import {
  buildMaterialDraftCode,
  buildSequentialDraftCode,
  buildTextSelectOptions,
  buildUnitSelectOptions,
  formatUnitShortDisplayName,
  hasActionPermission,
  inferDefaultUnitID,
  inferProductDefaultUnitID,
} from '../utils/masterDataOrderView.mjs'
import {
  buildContactParams,
  buildMasterDataParams,
  buildProcessParams,
} from '../utils/masterDataParams.mjs'
import {
  buildPaymentConditionOptions,
  resolvePaymentTermDays,
} from '../utils/paymentConditions.mjs'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import { filterColumnsByEffectiveFieldPolicy } from '../utils/adminProfileSync.mjs'
import {
  processOption,
  productOption,
  uniqueReferenceOptions,
} from '../utils/referenceSelectOptions.mjs'
import {
  DEFAULT_BUSINESS_PAGE_SIZE,
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  SUPPLIER_TYPE_OPTIONS,
  buildMasterDataRecordColumns,
} from '../components/master-data/masterDataColumns.jsx'
import {
  DEFAULT_PLUSH_PROCESS_CATEGORIES,
  DEFAULT_PLUSH_PROCESS_NAMES,
  MASTER_DATA_PAGE_CONFIG,
  getRecordCode,
  getRecordName,
  getRecordSearchHint,
  getRecordSearchPlaceholder,
  needsUnitDictionary,
} from '../components/master-data/masterDataPageConfig.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import {
  LIFECYCLE_SCOPE,
  lifecycleScopeFromSearchParams,
  withLifecycleScopeSearchParam,
} from '../utils/lifecycleScope.mjs'

export default function MasterDataPage({ type }) {
  const isProductCatalogPage = type === 'product_skus'
  const outletContext = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const canReadProducts = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCT_READ
  )
  const canReadProductSKUs = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCT_SKU_READ
  )
  const canReadMaterials = hasActionPermission(
    adminProfile,
    PermissionCode.MATERIAL_READ
  )
  const canReadProcesses = hasActionPermission(
    adminProfile,
    PermissionCode.PROCESS_READ
  )
  const canReadContacts = hasActionPermission(
    adminProfile,
    PermissionCode.CONTACT_READ
  )
  const requestedProductCatalogType = searchParams.get('catalog')
  const initialProductCatalogType =
    requestedProductCatalogType === 'product_skus' && canReadProductSKUs
      ? 'product_skus'
      : canReadProducts
        ? 'products'
        : 'product_skus'
  const [productCatalogType, setProductCatalogType] = useState(
    initialProductCatalogType
  )
  const [, startProductCatalogTransition] = useTransition()
  const authorizedProductCatalogType =
    (productCatalogType === 'products' && canReadProducts) ||
    (productCatalogType === 'product_skus' && canReadProductSKUs)
      ? productCatalogType
      : canReadProducts
        ? 'products'
        : 'product_skus'
  const effectiveType = isProductCatalogPage
    ? authorizedProductCatalogType
    : type
  const config =
    MASTER_DATA_PAGE_CONFIG[effectiveType] || MASTER_DATA_PAGE_CONFIG.customers
  const isProcessDictionaryPage = effectiveType === 'processes'
  const [loading, setLoading] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [keyword, setKeyword] = useBusinessPageState(
    `keyword:${searchParams.get('keyword') || ''}`,
    () => searchParams.get('keyword') || ''
  )
  const [stockCategory, setStockCategory] = useBusinessPageState(
    'stockCategory',
    ''
  )
  const [lifecycleScope, setLifecycleScope] = useBusinessPageState(
    `lifecycleScope:${searchParams.get('scope') || ''}`,
    () => lifecycleScopeFromSearchParams(searchParams)
  )
  const [supplierTypeFilter, setSupplierTypeFilter] = useBusinessPageState(
    `supplierTypeFilter:${searchParams.get('supplier_type') || ''}`,
    () => {
      const requestedType = searchParams.get('supplier_type') || ''
      return SUPPLIER_TYPE_OPTIONS.some((item) => item.value === requestedType)
        ? requestedType
        : ''
    }
  )
  const [pagination, setPagination] = useBusinessPageState('pagination', {
    current: 1,
    pageSize: DEFAULT_BUSINESS_PAGE_SIZE,
  })
  // 表格数据与已完成读取的分页一起呈现，避免新条数配置套用旧页数据。
  const [recordPage, setRecordPage] = useState(() => ({
    records: [],
    total: 0,
    pagination,
  }))
  const { records, total, pagination: displayedPagination } = recordPage
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [, setContacts] = useState([])
  const [productReferences, setProductReferences] = useState([])
  const [processReferences, setProcessReferences] = useState([])
  const [units, setUnits] = useState([])
  const [unitLoading, setUnitLoading] = useState(false)
  const [recordModalOpen, setRecordModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [detailRecord, setDetailRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [recordForm] = Form.useForm()
  const requestControllersRef = useRef({})
  const requestSequenceRef = useRef({})
  const moduleKey = config.recordKey
  const supportsContacts = Boolean(config.ownerType)
  const entityLabel = config.entityLabel || '主体'

  const canReadCurrentRecord = hasActionPermission(
    adminProfile,
    config.permissions.read
  )
  const canMaintainReferences =
    effectiveType === 'product_skus' ? canReadProducts : true
  const canCreate =
    canReadCurrentRecord &&
    canMaintainReferences &&
    hasActionPermission(adminProfile, config.permissions.create)
  const canUpdate =
    canReadCurrentRecord &&
    canMaintainReferences &&
    hasActionPermission(adminProfile, config.permissions.update)
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
    canReadContacts && canCreateContact && canUpdateContact && canDisableContact
  const showContactForm =
    supportsContacts && canSyncContacts && Boolean(config.saveWithContacts)
  const productOptions = useMemo(
    () => uniqueReferenceOptions(productReferences, productOption),
    [productReferences]
  )
  const supplierProcessOptions = useMemo(
    () => uniqueReferenceOptions(processReferences, processOption),
    [processReferences]
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
  const handleRecordValuesChange = useCallback(
    (changedValues) => {
      const defaultUnitChanged = Object.prototype.hasOwnProperty.call(
        changedValues,
        'default_unit_id'
      )
      const skuProductChanged =
        effectiveType === 'product_skus' &&
        Object.prototype.hasOwnProperty.call(changedValues, 'product_id')
      if (
        (effectiveType !== 'products' || !defaultUnitChanged) &&
        (effectiveType !== 'product_skus' ||
          (!defaultUnitChanged && !skuProductChanged))
      ) {
        return
      }
      const currentWeight = recordForm.getFieldValue('unit_net_weight_g')
      if (
        currentWeight === undefined ||
        currentWeight === null ||
        currentWeight === ''
      ) {
        return
      }
      recordForm.setFieldValue('unit_net_weight_g', undefined)
      message.info(
        effectiveType === 'product_skus'
          ? '所属产品或 SKU 默认单位已变更，SKU 单重已清空，请重新确认'
          : '默认单位已变更，产品单重已清空，请重新确认'
      )
    },
    [effectiveType, recordForm]
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
      if (!supportsContacts || !canReadContacts || !record?.id) {
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
          return null
        }
        const nextContacts = Array.isArray(result?.contacts)
          ? result.contacts
          : []
        setContacts(nextContacts)
        return nextContacts
      } catch (error) {
        if (isRpcAbortError(error) || !request.isCurrent()) {
          return null
        }
        showPageLoadError(error, '加载联系人')
        setContacts([])
        return null
      } finally {
        if (request.isCurrent()) {
          setContactLoading(false)
          request.finish()
        }
      }
    },
    [beginLatestRequest, canReadContacts, config.ownerType, supportsContacts]
  )

  const loadUnits = useCallback(async () => {
    const request = beginLatestRequest('units')
    if (
      !needsUnitDictionary(effectiveType) ||
      !(canReadMaterials || canReadProducts)
    ) {
      if (request.isCurrent()) {
        setUnits([])
      }
      request.finish()
      return true
    }
    setUnitLoading(true)
    try {
      const result = await listAllUnits({}, { signal: request.signal })
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
      showPageLoadError(error, '加载单位字典')
      setUnits([])
      return false
    } finally {
      if (request.isCurrent()) {
        setUnitLoading(false)
        request.finish()
      }
    }
  }, [beginLatestRequest, canReadMaterials, canReadProducts, effectiveType])

  const loadProductReferences = useCallback(async () => {
    const request = beginLatestRequest('productReferences')
    if (effectiveType !== 'product_skus' || !canReadProducts) {
      if (request.isCurrent()) {
        setProductReferences([])
      }
      request.finish()
      return true
    }
    try {
      const result = await listAllProducts(
        { active_only: true },
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
      showPageLoadError(error, '加载产品字典')
      setProductReferences([])
      return false
    } finally {
      if (request.isCurrent()) {
        request.finish()
      }
    }
  }, [beginLatestRequest, canReadProducts, effectiveType])

  const loadProcessReferences = useCallback(async () => {
    const request = beginLatestRequest('processReferences')
    if (effectiveType !== 'suppliers' || !canReadProcesses) {
      if (request.isCurrent()) {
        setProcessReferences([])
      }
      request.finish()
      return true
    }
    try {
      const result = await listAllProcesses({}, { signal: request.signal })
      if (!request.isCurrent()) {
        return false
      }
      setProcessReferences(
        Array.isArray(result?.processes) ? result.processes : []
      )
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      showPageLoadError(error, '加载可加工工序')
      setProcessReferences([])
      return false
    } finally {
      if (request.isCurrent()) {
        request.finish()
      }
    }
  }, [beginLatestRequest, canReadProcesses, effectiveType])

  const recordListParams = useMemo(
    () => ({
      keyword,
      lifecycle_scope: lifecycleScope,
      ...(effectiveType === 'materials' && stockCategory
        ? { stock_category: stockCategory }
        : {}),
      ...(effectiveType === 'suppliers' && supplierTypeFilter
        ? { supplier_types: [supplierTypeFilter] }
        : {}),
    }),
    [effectiveType, keyword, lifecycleScope, supplierTypeFilter, stockCategory]
  )

  const loadRecords = useCallback(async () => {
    const request = beginLatestRequest('records')
    if (!canReadCurrentRecord) {
      if (request.isCurrent()) {
        setRecordPage({ records: [], total: 0, pagination })
        setSelectedRecord(null)
      }
      request.finish()
      return true
    }
    setLoading(true)
    try {
      const result = await config.list(
        {
          ...recordListParams,
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
      setRecordPage({
        records: nextRecords,
        total: Number(result?.total || nextRecords.length || 0),
        pagination,
      })
      setSelectedRecord((current) => {
        if (!current?.id) return null
        return nextRecords.find((item) => item.id === current.id) || null
      })
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      showPageLoadError(error, `加载${config.title}`)
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    canReadCurrentRecord,
    config,
    pagination,
    recordListParams,
  ])

  const refreshCurrentData = useCallback(async () => {
    const [recordsOK, unitsOK, productReferencesOK, processReferencesOK] =
      await Promise.all([
        loadRecords(),
        loadUnits(),
        loadProductReferences(),
        loadProcessReferences(),
      ])
    return (
      recordsOK !== false &&
      unitsOK !== false &&
      productReferencesOK !== false &&
      processReferencesOK !== false
    )
  }, [loadProcessReferences, loadProductReferences, loadRecords, loadUnits])

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
    loadProcessReferences()
  }, [loadProcessReferences])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshCurrentData)
  }, [outletContext, refreshCurrentData])

  const previousEffectiveType = useRef(effectiveType)
  useEffect(() => {
    if (previousEffectiveType.current === effectiveType) return
    previousEffectiveType.current = effectiveType
    setSelectedRecord(null)
    setContacts([])
    setEditingRecord(null)
    setRecordModalOpen(false)
    setPagination((current) =>
      current.current === 1 && current.pageSize === DEFAULT_BUSINESS_PAGE_SIZE
        ? current
        : { current: 1, pageSize: DEFAULT_BUSINESS_PAGE_SIZE }
    )
    setKeyword((current) => (current ? '' : current))
    setStockCategory('')
  }, [effectiveType, setKeyword, setPagination, setStockCategory])

  const activeFilterCount = [
    lifecycleScope !== LIFECYCLE_SCOPE.CURRENT,
    effectiveType === 'suppliers' && supplierTypeFilter,
    effectiveType === 'materials' && stockCategory,
  ].filter(Boolean).length
  const clearFilters = useCallback(() => {
    setLifecycleScope(LIFECYCLE_SCOPE.CURRENT)
    if (effectiveType === 'suppliers') setSupplierTypeFilter('')
    if (effectiveType === 'materials') setStockCategory('')
    setSearchParams((current) => {
      const next = withLifecycleScopeSearchParam(current, LIFECYCLE_SCOPE.CURRENT)
      if (effectiveType === 'suppliers') next.delete('supplier_type')
      return next
    }, { replace: true })
    resetBusinessPaginationCurrent(setPagination)
  }, [effectiveType, setLifecycleScope, setSupplierTypeFilter, setStockCategory, setSearchParams, setPagination])

  const handleProductCatalogTabChange = useCallback(
    (nextType) => {
      if (
        (nextType === 'products' && !canReadProducts) ||
        (nextType === 'product_skus' && !canReadProductSKUs)
      ) {
        return
      }
      startProductCatalogTransition(() => {
        setProductCatalogType(nextType)
      })
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('catalog', nextType)
      setSearchParams(nextParams, { replace: true })
    },
    [canReadProductSKUs, canReadProducts, searchParams, setSearchParams]
  )

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
      const inferUnitID = ['products', 'product_skus'].includes(effectiveType)
        ? inferProductDefaultUnitID
        : inferDefaultUnitID
      const defaultUnitID = inferUnitID(records, unitOptions)
      if (defaultUnitID) {
        createDefaults.default_unit_id = defaultUnitID
      }
    }
    if (showContactForm) {
      createDefaults.contacts = [createEmptyContactRow()]
    }
    if (effectiveType === 'customers') {
      createDefaults.country_region = DEFAULT_DELIVERY_COUNTRY
    }
    if (effectiveType === 'suppliers') {
      createDefaults.default_payment_term_days = 0
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
    if (
      recordForm.getFieldValue('default_unit_id') ||
      recordForm.isFieldTouched('default_unit_id')
    ) {
      return
    }
    const inferUnitID = ['products', 'product_skus'].includes(effectiveType)
      ? inferProductDefaultUnitID
      : inferDefaultUnitID
    const defaultUnitID = inferUnitID(records, unitOptions)
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
    recordForm.resetFields()
    const recordContacts = showContactForm ? await loadContacts(record) : []
    if (showContactForm && !Array.isArray(recordContacts)) {
      return
    }
    setEditingRecord(record)
    recordForm.setFieldsValue({
      ...record,
      ...(showContactForm
        ? { contacts: contactRowsForForm(recordContacts) }
        : {}),
    })
    setRecordModalOpen(true)
  }

  const openMasterDataRecord = (record) => {
    if (!record?.id) return
    setSelectedRecord(record)
    if (canUpdate) {
      openEditRecord(record)
      return
    }
    setDetailRecord(record)
  }

  const saveRecord = async () => {
    const values = await recordForm.validateFields()
    const isCreatingRecord = !editingRecord?.id
    const shouldShowCreatedRecordOnFirstPage =
      isCreatingRecord && effectiveType !== 'processes'
    setSaving(true)
    try {
      const extra = editingRecord?.id ? { id: editingRecord.id } : {}
      const params = effectiveType === 'processes'
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
      message.success(editingRecord?.id ? `${entityLabel}已更新` : `${entityLabel}已创建`)
      setRecordModalOpen(false)
      setSelectedRecord(saved || selectedRecord)
      if (Array.isArray(savedData?.contacts)) {
        setContacts(savedData.contacts)
      }
      if (shouldShowCreatedRecordOnFirstPage) {
        resetBusinessPaginationCurrent(setPagination)
      } else {
        await loadRecords()
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, `保存${entityLabel}`))
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

  const baseRecordColumns = useMemo(
    () =>
      buildMasterDataRecordColumns({
        type: effectiveType,
        productOptions,
        processOptions: supplierProcessOptions,
        unitDisplay,
      }),
    [effectiveType, productOptions, supplierProcessOptions, unitDisplay]
  )
  const recordColumns = useMemo(
    () =>
      filterColumnsByEffectiveFieldPolicy(
        baseRecordColumns,
        adminProfile,
        `${effectiveType}.default`
      ),
    [adminProfile, baseRecordColumns, effectiveType]
  )
  const {
    tableColumns: orderedRecordColumns,
    exportColumns: exportRecordColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey,
    moduleTitle: config.title,
    columns: recordColumns,
  })

  const loadExportRecords = useCallback(
    async ({ signal }) => {
      if (!canReadCurrentRecord) return []
      const result = await config.listAll(recordListParams, { signal })
      return result?.[config.recordKey]
    },
    [canReadCurrentRecord, config, recordListParams]
  )
  const { exporting, exportRows: exportRecords } = useBusinessListExport({
    requestKey: `master-data-export:${effectiveType}`,
    loadRows: loadExportRecords,
    filename: `${config.title}-筛选结果-${currentBusinessDate()}.csv`,
    columns: exportRecordColumns,
    recordLabel: `${entityLabel}记录`,
  })

  const productCatalogTabItems = useMemo(
    () =>
      [
        canReadProducts
          ? { key: 'products', label: '产品基础信息', children: null }
          : null,
        canReadProductSKUs
          ? { key: 'product_skus', label: '产品规格', children: null }
          : null,
      ].filter(Boolean),
    [canReadProductSKUs, canReadProducts]
  )
  const selectedRecordDisplayText = useMemo(() => {
    if (!selectedRecord) return `请先选择一个${entityLabel}`
    return `${
      getRecordCode(selectedRecord, effectiveType) || `${entityLabel}未编号`
    } / ${getRecordName(selectedRecord, effectiveType) || `未命名${entityLabel}`}`
  }, [effectiveType, entityLabel, selectedRecord])
  return (
    <BusinessPageLayout className="erp-master-data-page">
      <PageHeaderCard
        compact
        title={config.title}
        helpKey={isProductCatalogPage ? 'products' : moduleKey}
        viewSwitch={
          isProductCatalogPage ? (
            <Tabs
              aria-label="产品档案视图"
              activeKey={effectiveType}
              onChange={handleProductCatalogTabChange}
              items={productCatalogTabItems}
            />
          ) : null
        }
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
        filters={
          <>
            <SearchInput
              resetKey={effectiveType}
              placeholder={getRecordSearchPlaceholder(effectiveType)}
              searchHint={getRecordSearchHint(effectiveType)}
              value={keyword}
              onSearch={(value) => {
                setKeyword(value)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <LifecycleScopeFilter
              value={lifecycleScope}
              onChange={(nextScope) => {
                setLifecycleScope(nextScope)
                setSearchParams(
                  withLifecycleScopeSearchParam(searchParams, nextScope),
                  { replace: true }
                )
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            {effectiveType === 'materials' ? (
              <SelectFilter
                aria-label="材料库存类别"
                value={stockCategory}
                options={[
                  { label: '全部库存类别', value: '' },
                  ...MATERIAL_STOCK_CATEGORY_OPTIONS,
                  { label: '待分类', value: 'UNCLASSIFIED' },
                ]}
                onChange={(value) => {
                  setStockCategory(value || '')
                  resetBusinessPaginationCurrent(setPagination)
                }}
              />
            ) : null}
            {effectiveType === 'suppliers' ? (
              <SelectFilter
                aria-label="供应商与加工厂类型"
                value={supplierTypeFilter}
                options={[
                  { label: '全部类型', value: '' },
                  ...SUPPLIER_TYPE_OPTIONS,
                ]}
                onChange={(nextType) => {
                  setSupplierTypeFilter(nextType)
                  const nextParams = new URLSearchParams(searchParams)
                  if (nextType) {
                    nextParams.set('supplier_type', nextType)
                  } else {
                    nextParams.delete('supplier_type')
                  }
                  setSearchParams(nextParams, { replace: true })
                  resetBusinessPaginationCurrent(setPagination)
                }}
              />
            ) : null}
          </>
        }
        actions={
          <Space wrap>
            <BusinessListToolbarActions
              onExport={exportRecords}
              exportDisabled={loading || exporting || total === 0}
              exportDisabledReason={exporting ? '正在准备导出，请稍候' : ''}
              onOpenColumnOrder={openColumnOrder}
            />
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
          <SelectionClearAction
            selectedCount={selectedRecord ? 1 : 0}
            selectionLabel={entityLabel}
            onClear={() => {
              setSelectedRecord(null)
              setContacts([])
            }}
          />
          {canUpdate ? (
            <BusinessActionTooltip
              disabled={!selectedRecord || saving}
              disabledReason={
                !selectedRecord
                  ? `请先选择一个${entityLabel}`
                  : `当前操作完成后可编辑${entityLabel}`
              }
            >
              <Button
                size="small"
                icon={<EditOutlined />}
                disabled={!selectedRecord || saving}
                onClick={() => openEditRecord(selectedRecord)}
                data-business-action-role="edit"
              >
                编辑{entityLabel}
              </Button>
            </BusinessActionTooltip>
          ) : (
            <BusinessActionTooltip
              disabled={!selectedRecord || saving}
              disabledReason={
                !selectedRecord
                  ? `请先选择一个${entityLabel}`
                  : `当前操作完成后可查看${entityLabel}`
              }
            >
              <Button
                size="small"
                icon={<EyeOutlined />}
                disabled={!selectedRecord || saving}
                onClick={() => setDetailRecord(selectedRecord)}
                data-business-action-role="view"
              >
                查看{entityLabel}
              </Button>
            </BusinessActionTooltip>
          )}
          {canDisable ? (
            <BusinessActionTooltip
              disabled={!selectedRecord || saving}
              disabledReason={
                !selectedRecord
                  ? `请先选择一个${entityLabel}`
                  : '当前操作完成后可继续'
              }
            >
              <Popconfirm
                title={
                  selectedRecord?.is_active === false
                    ? '确认启用？'
                    : '确认停用？'
                }
                onConfirm={() => toggleRecordActive(selectedRecord)}
                disabled={!selectedRecord || saving}
              >
                <Button
                  size="small"
                  className="erp-business-module-status-action"
                  data-business-action-role="secondary"
                  data-business-action-group="business"
                  disabled={!selectedRecord || saving}
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
            </BusinessActionTooltip>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={orderedRecordColumns}
        dataSource={records}
        scroll={isProcessDictionaryPage ? { x: 1000 } : undefined}
        pagination={createBusinessTablePagination({
          pagination: displayedPagination,
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
        })}
        onOpenRecord={openMasterDataRecord}
      />

      {['products', 'product_skus'].includes(effectiveType) ? (
        <ProductRecordEditor
          type={effectiveType}
          form={recordForm}
          open={recordModalOpen}
          record={editingRecord}
          products={productReferences}
          records={records}
          onClose={() => setRecordModalOpen(false)}
          onSaved={async (saved) => {
            setSelectedRecord(saved)
            if (!editingRecord?.id) resetBusinessPaginationCurrent(setPagination)
            else await loadRecords()
          }}
        />
      ) : (
        <BusinessFormPage
          form={recordForm}
          title={
            editingRecord?.id
              ? `编辑${entityLabel}`
              : `新建${config.createTitleLabel || config.title}`
          }
          open={recordModalOpen}
          onOk={saveRecord}
          onCancel={() => {
            if (saving || contactLoading) return
                  setRecordModalOpen(false)
          }}
          confirmLoading={saving}
          loading={
            contactLoading || (needsUnitDictionary(effectiveType) && unitLoading)
          }
        >
          <Form
            form={recordForm}
            layout="vertical"
            className="erp-business-action-form"
            onValuesChange={handleRecordValuesChange}
          >
            <MasterDataFormFields
              form={recordForm}
              type={effectiveType}
              isEditing={Boolean(editingRecord?.id)}
              products={productReferences}
              productOptions={productOptions}
              unitOptions={unitOptions}
              unitLoading={unitLoading}
              materialCategoryOptions={materialCategoryOptions}
              materialColorOptions={materialColorOptions}
              processNameOptions={processNameOptions}
              processCategoryOptions={processCategoryOptions}
              supplierProcessOptions={supplierProcessOptions}
              canEditSupplierProcesses={canReadProcesses}
              supplierTypeOptions={SUPPLIER_TYPE_OPTIONS}
              customerPaymentConditionOptions={customerPaymentConditionOptions}
              onCustomerPaymentMethodChange={applyCustomerPaymentMethod}
              contactSection={
                showContactForm ? (
                  <BusinessFormSection
                    title="联系人"
                    showHeading={false}
                    layout="content"
                  >
                    <ContactFormList
                      form={recordForm}
                      entityLabel={entityLabel}
                    />
                  </BusinessFormSection>
                ) : null
              }
            />

          </Form>
        </BusinessFormPage>

      )}

      <BusinessDetailsModal
        columns={recordColumns}
        description="当前账号为只读查看；如需维护，请由具备相应权限的岗位办理。"
        open={Boolean(detailRecord)}
        record={detailRecord}
        title={`${entityLabel}详情`}
        onClose={() => setDetailRecord(null)}
      />

      {columnOrderModal}
    </BusinessPageLayout>
  )
}
