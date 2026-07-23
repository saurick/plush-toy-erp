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
  EyeOutlined,
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
} from '../components/business-list/ColumnOrderModal.jsx'
import {
  downloadBusinessCSV,
  getPreferredColumnOrder,
  writeStoredColumnOrder,
} from '../components/business-list/businessListPreferences.mjs'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import {
  ContactFormList,
  MasterDataFormFields,
  createEmptyContactRow,
  contactRowsForForm,
  mergeTextSuggestionOptions,
  normalizeContactRows,
} from '../components/master-data/MasterDataForm.jsx'
import ProductImageSlots from '../components/master-data/ProductImageSlots.jsx'
import {
  listContactsByOwner,
  listProcesses,
  listProducts,
  listUnits,
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
  inferProductDefaultUnitID,
  resolvePaymentTermDays,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { filterColumnsByEffectiveFieldPolicy } from '../utils/adminProfileSync.mjs'
import {
  processOption,
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

export default function V1MasterDataPage({ type }) {
  const isProductCatalogPage = type === 'product_skus'
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const canReadProducts = hasActionPermission(adminProfile, 'product.read')
  const canReadProductSKUs = hasActionPermission(
    adminProfile,
    'product_sku.read'
  )
  const canReadMaterials = hasActionPermission(adminProfile, 'material.read')
  const canReadProcesses = hasActionPermission(adminProfile, 'process.read')
  const canReadContacts = hasActionPermission(adminProfile, 'contact.read')
  const initialProductCatalogType = canReadProducts
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
  const [keyword, setKeyword] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [, setContacts] = useState([])
  const [productReferences, setProductReferences] = useState([])
  const [processReferences, setProcessReferences] = useState([])
  const [units, setUnits] = useState([])
  const [unitLoading, setUnitLoading] = useState(false)
  const [recordModalOpen, setRecordModalOpen] = useState(false)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [detailRecord, setDetailRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [recordForm] = Form.useForm()
  const productImageSlotsRef = useRef(null)
  const skuAttachmentRef = useRef(null)
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
    effectiveType === 'products'
      ? canReadMaterials
      : effectiveType === 'product_skus'
        ? canReadMaterials && canReadProducts
        : true
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
    canReadContacts &&
    canCreateContact &&
    canUpdateContact &&
    canDisableContact
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
    [beginLatestRequest, canReadContacts, config.ownerType, supportsContacts]
  )

  const loadUnits = useCallback(async () => {
    const request = beginLatestRequest('units')
    if (!needsUnitDictionary(effectiveType) || !canReadMaterials) {
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
  }, [beginLatestRequest, canReadMaterials, effectiveType])

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
      const result = await listProcesses(
        { limit: 500 },
        { signal: request.signal }
      )
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
      message.error(getActionErrorMessage(error, '加载可加工工序'))
      setProcessReferences([])
      return false
    } finally {
      if (request.isCurrent()) {
        request.finish()
      }
    }
  }, [beginLatestRequest, canReadProcesses, effectiveType])

  const loadRecords = useCallback(async () => {
    const request = beginLatestRequest('records')
    if (!canReadCurrentRecord) {
      if (request.isCurrent()) {
        setRecords([])
        setTotal(0)
        setSelectedRecord(null)
      }
      request.finish()
      return true
    }
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
  }, [
    activeOnly,
    beginLatestRequest,
    canReadCurrentRecord,
    config,
    keyword,
    pagination,
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
      if (
        (nextType === 'products' && !canReadProducts) ||
        (nextType === 'product_skus' && !canReadProductSKUs)
      ) {
        return
      }
      startProductCatalogTransition(() => {
        setProductCatalogType(nextType)
      })
    },
    [canReadProductSKUs, canReadProducts, startProductCatalogTransition]
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
      const productImageResult =
        effectiveType === 'products'
          ? await productImageSlotsRef.current?.flushChanges(saved?.id)
          : { mutationsApplied: true, reloaded: true }
      const productImagesApplied = productImageResult?.mutationsApplied === true
      const productImagesReloaded = productImageResult?.reloaded === true
      if (!productImagesApplied) {
        setSelectedRecord(saved || selectedRecord)
        setEditingRecord(saved || editingRecord)
        if (Array.isArray(savedData?.contacts)) {
          setContacts(savedData.contacts)
        }
        if (shouldShowCreatedRecordOnFirstPage) {
          resetBusinessPaginationCurrent(setPagination)
        } else {
          await loadRecords()
        }
        const currentImagesReloaded = productImagesReloaded
          ? true
          : (await productImageSlotsRef.current?.beginSession(saved?.id)) ===
            true
        message.warning(
          currentImagesReloaded
            ? '产品已保存，产品图未全部更新；已刷新当前图片，请重新选择未完成的产品图后再保存'
            : '产品已保存，产品图未全部更新且暂时无法刷新；请稍后重新打开产品并核对图片'
        )
        return
      }
      if (!productImagesReloaded) {
        message.warning(
          '产品和产品图已保存，但当前图片状态暂未刷新；请稍后重新打开产品核对'
        )
      } else if (!attachmentSaved) {
        message.warning(`${entityLabel}已保存，未上传的附件请重新选择`)
      } else {
        message.success(
          editingRecord?.id ? `${entityLabel}已更新` : `${entityLabel}已创建`
        )
      }
      productImageSlotsRef.current?.cancelSession()
      skuAttachmentRef.current?.clearPendingAttachments()
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
  const exportRecords = () => {
    downloadBusinessCSV({
      filename: `${config.title}-筛选结果-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: orderedRecordColumns,
      rows: records,
    })
    message.success('已导出筛选结果')
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
                { key: 'current', label: '本页显示', value: records.length },
                {
                  key: 'active',
                  label: `启用${entityLabel}`,
                  value: activeRecordCount,
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
              searchHint={getRecordSearchHint(effectiveType)}
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
              导出筛选结果
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
          ) : (
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!selectedRecord}
              onClick={() => setDetailRecord(selectedRecord)}
            >
              查看{entityLabel}
            </Button>
          )}
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
              activeKey={effectiveType}
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
        })}
        onOpenRecord={openMasterDataRecord}
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
          if (saving || contactLoading) return
          productImageSlotsRef.current?.cancelSession()
          skuAttachmentRef.current?.clearPendingAttachments()
          setRecordModalOpen(false)
        }}
        confirmLoading={saving || contactLoading}
        cancelButtonProps={{ disabled: saving || contactLoading }}
        closable={!(saving || contactLoading)}
        keyboard={!(saving || contactLoading)}
        forceRender
        destroyOnHidden={false}
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
          />
          {effectiveType === 'products' ? (
            <ProductImageSlots
              ref={productImageSlotsRef}
              productId={editingRecord?.id}
              open={recordModalOpen}
              canEdit={canUpdate}
            />
          ) : null}
          {effectiveType === 'product_skus' ? (
            <BusinessAttachmentPanel
              ref={skuAttachmentRef}
              ownerType="product_sku"
              ownerId={editingRecord?.id}
              title="产品规格附件"
              description="上传产品图、样品图、包装图或客户款式确认资料；附件不会改变产品规格的启用状态。"
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

      <BusinessRecordDetailsModal
        columns={recordColumns}
        description="当前账号为只读查看；如需维护，请由具备相应权限的岗位办理。"
        open={Boolean(detailRecord)}
        record={detailRecord}
        title={`${entityLabel}详情`}
        onClose={() => setDetailRecord(null)}
      />

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
