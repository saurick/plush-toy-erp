import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  DownOutlined,
  EditOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Popconfirm, Space } from 'antd'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import useBusinessSearchParams from '../hooks/useBusinessSearchParams.js'
import useWorkflowTaskBusinessResult from '../hooks/useWorkflowTaskBusinessResult.js'
import BusinessStatusFilter from '../components/business-list/BusinessStatusFilter.jsx'
import { resolveBusinessStatusCounts } from '../utils/businessStatusCounts.mjs'
import { canReadReference, loadReferenceIDs } from '../utils/remoteReferences.mjs'
import RemoteReferenceSelect, { ReferenceRecordsProvider } from '../components/RemoteReferenceSelect.jsx'
import { useReferenceRecords } from '../hooks/useReferenceRecords.js'
import { showPageLoadError } from '../components/PageLoadFeedback.jsx'
import BusinessModal from '../components/business-list/BusinessModal.jsx'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import useBusinessPageState from '../hooks/useBusinessPageState'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  activateBOMVersion,
  archiveBOMVersion,
  getBOMVersion,
  listAllBOMVersions,
  listBOMVersions,
} from '../api/bomApi.mjs'
import {
  downloadBusinessAttachment,
  listBusinessAttachments,
} from '../api/attachmentApi.mjs'
import {
  getProduct,
  listMaterials,
  listAllMaterials,
  listAllProducts,
  listAllUnits,
  listUnits,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import { BusinessListToolbarActions, useBusinessColumnOrder } from '../components/business-list/BusinessListToolbarActions.jsx'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import BOMEditor from '../components/bom/BOMEditor.jsx'
import { loadBOMPrintSnapshot } from '../utils/bomPrintSnapshot.mjs'
import BOMExcelImportFormat from '../components/bom/BOMExcelImportFormat.jsx'
import BOMExcelImportPreview, {
} from '../components/bom/BOMExcelImportPreview.jsx'
import BOMTaskPanel from '../components/bom/BOMTaskPanel.jsx'
import BOMRevisionAction from '../components/bom/BOMRevisionAction.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import {
  LIFECYCLE_SCOPE,
  filterLifecycleStatusOptions,
  lifecycleScopeFromSearchParams,
  lifecycleScopeIncludesStatus,
  normalizeLifecycleStatus,
  withLifecycleScopeSearchParam,
} from '../utils/lifecycleScope.mjs'
import {
  BOM_MODULE_KEY,
  BOM_STATUS_OPTIONS,
  bomStatusText,
  buildBOMVersionColumns,
} from '../components/bom/BOMVersionColumns.jsx'
import {
  canActivateBOM,
  canArchiveBOM,
  canCopyBOM,
  canEditBOM,
  canRequestBOMArchive,
  runBOMArchiveBatch,
} from '../components/bom/bomLifecycle.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import {
  DEFAULT_BUSINESS_PAGE_SIZE,
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  materialOption,
  productOption,
  referenceLabel,
  uniqueReferenceOptions,
  unitOption,
} from '../utils/referenceSelectOptions.mjs'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import {
  MAX_BOM_XLSX_FILE_BYTES,
  buildBOMImportDraft,
  parseBOMXlsx,
} from '../utils/bomXlsxImport.mjs'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  openPrintWorkspaceWindow,
  resolveRuntimeCustomerPrintCompanyName,
} from '../utils/printWorkspace.js'
import { loadProductPrintImageSnapshots } from '../utils/productPrintImages.mjs'
import {
  COLOR_CARD_TEMPLATE_KEY,
  MATERIAL_DETAIL_TEMPLATE_KEY,
  WORK_INSTRUCTION_TEMPLATE_KEY,
  buildColorCardDraftFromBOMVersion,
  buildMaterialDetailDraftFromBOMVersion,
  buildWorkInstructionDraftFromBOMVersion,
} from '../data/engineeringPrintTemplates.mjs'

export default function BOMVersionsPage() {
  const outletContext = useBusinessPageContext()
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const taskReadOnly = outletContext?.taskBusiness?.readOnly === true
  const [searchParams, setSearchParams] = useBusinessSearchParams()
  const beginLatestRequest = useLatestRequestCoordinator()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = useMemo(
    () => adminProfile?.effective_session?.customer?.key || '',
    [adminProfile]
  )
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printingTemplateKey, setPrintingTemplateKey] = useState('')
  const [keyword, setKeyword] = useBusinessPageState(
    `keyword:${searchParams.get('keyword') || ''}`,
    () => searchParams.get('keyword') || ''
  )
  const [lifecycleScope, setLifecycleScope] = useBusinessPageState(
    `lifecycleScope:${searchParams.get('scope') || ''}`,
    () => lifecycleScopeFromSearchParams(searchParams)
  )
  const [savedStatus, setStatus] = useBusinessPageState(
    `status:${searchParams.get('status') || ''}`,
    () => searchParams.get('status') || ''
  )
  const status = normalizeLifecycleStatus(lifecycleScope, savedStatus, [
    'ARCHIVED',
  ])
  useEffect(() => {
    if (savedStatus !== status) setStatus(status)
    if (
      !lifecycleScopeIncludesStatus(
        lifecycleScope,
        searchParams.get('status'),
        ['ARCHIVED']
      )
    ) {
      const next = new URLSearchParams(searchParams)
      next.delete('status')
      setSearchParams(next, { replace: true })
    }
  }, [
    lifecycleScope,
    savedStatus,
    searchParams,
    setSearchParams,
    setStatus,
    status,
  ])
  const [productID, setProductID] = useBusinessPageState(
    `productID:${searchParams.get('product_id') || ''}`,
    () => {
      const value = Number(searchParams.get('product_id') || 0)
      return Number.isSafeInteger(value) && value > 0 ? value : undefined
    }
  )
  const [statusCounts, setStatusCounts] = useState(null)
  const [versions, setVersions] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useBusinessPageState('pagination', {
    current: 1,
    pageSize: DEFAULT_BUSINESS_PAGE_SIZE,
  })
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [taskContext, setTaskContext] = useBusinessPageState(
    'bomTaskContext',
    null
  )
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const selectedRowKeysRef = useRef([])
  const importFileInputRef = useRef(null)
  const importTargetRef = useRef('new')
  const importContextRef = useRef(0)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [headerMode, setHeaderMode] = useState('create')
  const [revisionEditing, setRevisionEditing] = useState(false)
  const [savedRevision, setSavedRevision] = useState(null)
  const [importing, setImporting] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [importFormatOpen, setImportFormatOpen] = useState(false)
  const [products, setProducts, mergeProducts] = useReferenceRecords(adminProfile)
  const [materials, setMaterials, mergeMaterials] = useReferenceRecords(adminProfile)
  const [units, setUnits] = useState([])
  const [referenceOptionsState, setReferenceOptionsState] = useState({
    loading: true,
    loaded: false,
  })
  const [editorInitialValues, setEditorInitialValues] = useState({})
  const [editorImportDraft, setEditorImportDraft] = useState(null)
  useEffect(() => { importContextRef.current += 1; setPendingImport(null) }, [headerModalOpen, headerMode, selectedVersion?.id, adminProfile?.id])

  const canRead = hasActionPermission(adminProfile, PermissionCode.BOM_READ)
  const canReadTasks = hasActionPermission(
    adminProfile,
    PermissionCode.WORKFLOW_TASK_READ
  )
  const canCreate = !taskReadOnly && hasActionPermission(adminProfile, PermissionCode.BOM_CREATE)
  const canUpdate = !taskReadOnly && hasActionPermission(adminProfile, PermissionCode.BOM_UPDATE)
  const canActivate = !taskReadOnly && hasActionPermission(
    adminProfile,
    PermissionCode.BOM_ACTIVATE
  )
  const canPrint = hasActionPermission(
    adminProfile,
    PermissionCode.ERP_PRINT_TEMPLATE_READ
  )
  const printPermissionHint = canPrint
    ? undefined
    : '当前账号没有打印模板的权限。'
  const productOptions = useMemo(
    () =>
      uniqueReferenceOptions(products, (item) => ({
        ...productOption(item),
        disabled: item.is_active === false,
      })),
    [products]
  )
  const lifecycleStatusOptions = useMemo(
    () =>
      filterLifecycleStatusOptions(BOM_STATUS_OPTIONS, lifecycleScope, [
        'ARCHIVED',
      ]),
    [lifecycleScope]
  )
  const materialOptions = useMemo(
    () =>
      uniqueReferenceOptions(materials, (item) => ({
        ...materialOption(item),
        disabled: item.is_active === false,
      })),
    [materials]
  )
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const applySelectedRowKeys = useCallback((nextKeys = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    selectedRowKeysRef.current = normalizedKeys
    setSelectedRowKeys(normalizedKeys)
  }, [])

  const loadDetail = useCallback(
    async (id) => {
      if (!id) return null
      const request = beginLatestRequest('detail')
      setDetailLoading(true)
      try {
        const detail = await getBOMVersion({ id }, { signal: request.signal })
        const [productData, materialData] = await Promise.all([
          canReadReference(adminProfile, 'products')
            ? loadReferenceIDs('products', [detail.product_id], { signal: request.signal }) : { products: [] },
          canReadReference(adminProfile, 'materials')
            ? loadReferenceIDs('materials', (detail.items || []).map((row) => row.material_id), { signal: request.signal }) : { materials: [] },
        ])
        if (request.isCurrent()) {
          mergeProducts(productData.products)
          mergeMaterials(materialData.materials)
        }
        if (!request.isCurrent()) {
          return null
        }
        setSelectedVersion(detail)
        return detail
      } catch (error) {
        if (isRpcAbortError(error) || !request.isCurrent()) {
          return null
        }
        showPageLoadError(error, '加载 BOM 详情')
        return null
      } finally {
        if (request.isCurrent()) {
          setDetailLoading(false)
          request.finish()
        }
      }
    },
    [adminProfile, beginLatestRequest, mergeProducts, mergeMaterials]
  )

  const bomListParams = useMemo(
    () => ({
      keyword,
      status,
      lifecycle_scope: lifecycleScope,
      product_id: productID || undefined,
    }),
    [keyword, lifecycleScope, productID, status]
  )

  const loadVersions = useCallback(async () => {
    const request = beginLatestRequest('versions')
    setStatusCounts(null)
    if (!canRead) {
      setVersions([])
      setSelectedVersion(null)
      const detailRequest = beginLatestRequest('detail')
      detailRequest.finish()
      applySelectedRowKeys([])
      setLoading(false)
      request.finish()
      return false
    }
    setLoading(true)
    try {
      const result = await listBOMVersions(
        {
          ...bomListParams,
          include_status_counts: true,
          ...getBusinessPaginationParams(pagination),
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) {
        return false
      }
      setStatusCounts(resolveBusinessStatusCounts(result))
      const nextVersions = Array.isArray(result?.bom_versions)
        ? result.bom_versions
        : []
      setVersions(nextVersions)
      setTotal(Number(result?.total || nextVersions.length || 0))
      const validKeys = selectedRowKeysRef.current.filter((key) =>
        nextVersions.some((item) => item.id === key)
      )
      applySelectedRowKeys(validKeys)
      if (validKeys.length === 1) {
        await loadDetail(validKeys[0])
      } else {
        const detailRequest = beginLatestRequest('detail')
        detailRequest.finish()
        setSelectedVersion(null)
      }
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      showPageLoadError(error, '加载 BOM 版本')
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    applySelectedRowKeys,
    beginLatestRequest,
    bomListParams,
    canRead,
    loadDetail,
    pagination,
  ])

  const loadReferenceOptions = useCallback(async () => {
    setReferenceOptionsState({ loading: true, loaded: false })
    try {
      const unitResult = await listAllUnits()
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
      setReferenceOptionsState({ loading: false, loaded: true })
    } catch (error) {
      showPageLoadError(error, '加载物料清单相关资料')
      setProducts([])
      setMaterials([])
      setUnits([])
      setReferenceOptionsState({ loading: false, loaded: false })
    }
  }, [setMaterials, setProducts])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadVersions)
  }, [loadVersions, outletContext])

  const selectedVersions = useMemo(
    () => versions.filter((record) => selectedRowKeys.includes(record.id)),
    [selectedRowKeys, versions]
  )
  const singleSelectedVersion =
    selectedRowKeys.length === 1 ? selectedVersions[0] || selectedVersion : null
  const activeActionVersion = singleSelectedVersion
  const activeActionCanEdit = canEditBOM(activeActionVersion) && canUpdate
  const archivableSelectedVersions = selectedVersions.filter((record) =>
    canArchiveBOM(record)
  )
  const canRequestSelectedArchive =
    selectedVersions.length > 0 &&
    selectedVersions.every((record) => canRequestBOMArchive(record))
  const selectedLabel =
    selectedVersions.length === 1
      ? selectedVersions[0]?.version || '已选择 1 条 BOM'
      : selectedVersions.length > 1
        ? `已选择 ${selectedVersions.length} 条 BOM`
        : '未选择 BOM'
  const selectedItems = selectedVersions.map((record) => ({
    key: record.id,
    label: record.version || 'BOM 已关联',
    title: `${referenceLabel(productOptions, record.product_id, '产品')} / ${bomStatusText(
      record.status
    )}`,
  }))
  const openEngineeringPrint = async (templateKey) => {
    if (!canPrint) {
      message.warning(printPermissionHint)
      return
    }
    if (!activeActionVersion?.id || selectedRowKeys.length !== 1) return
    setPrintingTemplateKey(templateKey)
    try {
      const { detail, ...references } = await loadBOMPrintSnapshot(
        activeActionVersion.id,
        { getBOMVersion, getProduct, listMaterials, listUnits }
      )
      const builder =
        templateKey === COLOR_CARD_TEMPLATE_KEY
          ? buildColorCardDraftFromBOMVersion
          : templateKey === WORK_INSTRUCTION_TEMPLATE_KEY
            ? buildWorkInstructionDraftFromBOMVersion
            : buildMaterialDetailDraftFromBOMVersion
      const productImages = [
        MATERIAL_DETAIL_TEMPLATE_KEY,
        WORK_INSTRUCTION_TEMPLATE_KEY,
      ].includes(templateKey)
        ? await loadProductPrintImageSnapshots(detail.product_id, {
            listAttachments: listBusinessAttachments,
            downloadAttachment: downloadBusinessAttachment,
          })
        : {}
      const initialDraft = builder(detail, {
        ...references,
        companyName: resolveRuntimeCustomerPrintCompanyName(),
        productImages,
      })
      openPrintWorkspaceWindow(templateKey, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
        accountKey: adminProfile?.id,
        configRevision: adminProfile?.effective_session?.config_revision || '',
      })
      message.success(
        templateKey === COLOR_CARD_TEMPLATE_KEY
          ? '已打开色卡打印模板'
          : templateKey === WORK_INSTRUCTION_TEMPLATE_KEY
            ? '已打开作业指导书打印模板'
            : '已打开物料明细打印模板'
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开工程打印模板失败'))
    } finally {
      setPrintingTemplateKey('')
    }
  }
  const selectSingleVersion = useCallback(
    async (record) => {
      if (!record?.id) return
      applySelectedRowKeys([record.id])
      setSelectedVersion(record)
      await loadDetail(record.id)
    },
    [applySelectedRowKeys, loadDetail]
  )

  const openImportedDraft = async (file, target) => {
    if (!file || importing || saving || !canCreate) return
    if (!referenceOptionsState.loaded) {
      message.warning('产品、材料和单位尚未加载完成，请稍后重试')
      return
    }
    if (!/\.xlsx$/iu.test(String(file.name || ''))) {
      message.warning('仅支持 .xlsx 格式的 BOM Excel 文件')
      return
    }
    if (Number(file.size || 0) > MAX_BOM_XLSX_FILE_BYTES) {
      message.warning(`Excel 文件超过 ${MAX_BOM_XLSX_FILE_BYTES / 1024 / 1024}MB，请精简图片或拆分后再导入`)
      return
    }

    const request = beginLatestRequest('import-references')
    const context = importContextRef.current
    setImporting(true)
    try {
      const parsed = await parseBOMXlsx(await file.arrayBuffer(), {
        fileName: file.name,
      })
      if (!request.isCurrent() || context !== importContextRef.current) return
      // Import matching needs complete names/aliases, including historical references.
      const [productData, materialData] = await Promise.all([
        listAllProducts({ active_only: false }, { signal: request.signal }),
        listAllMaterials({ active_only: false }, { signal: request.signal }),
      ])
      if (!request.isCurrent() || context !== importContextRef.current) return
      mergeProducts(productData.products)
      mergeMaterials(materialData.materials)
      const draft = buildBOMImportDraft(parsed, {
        products: productData.products,
        materials: materialData.materials,
        units,
      })
      setPendingImport({ draft, target })
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent() || context !== importContextRef.current) return
      message.error(
        getActionErrorMessage(
          error,
          'Excel 解析失败，请确认文件未损坏且使用现有 BOM 明细格式'
        )
      )
    } finally {
      if (request.isCurrent()) {
        setImporting(false)
        request.finish()
      }
    }
  }

  const handleImportFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) openImportedDraft(file, importTargetRef.current)
  }

  const chooseImportFile = (target) => {
    importTargetRef.current = target
    importFileInputRef.current?.click()
  }

  const applyImportedDraft = () => {
    if (!pendingImport || !canCreate || saving) return
    setEditorImportDraft(pendingImport.draft)
    setEditorInitialValues(pendingImport.draft.values)
    setHeaderMode('import')
    setHeaderModalOpen(true)
    setPendingImport(null)
  }
  const openCreate = (prefill = {}) => {
    setEditorInitialValues({ product_id: prefill.productID, source_order_no: prefill.orderNo || '', quantity_text: prefill.quantityText || '' })
    setEditorImportDraft(null)
    setSelectedVersion(null)
    setHeaderMode('create')
    setHeaderModalOpen(true)
  }
  const openView = async (record = selectedVersion) => {
    if (!record?.id) return
    applySelectedRowKeys([record.id])
    await loadDetail(record.id)
    setEditorImportDraft(null)
    setHeaderMode('view')
    setHeaderModalOpen(true)
  }
  const openEdit = async (record = selectedVersion, revision = false, prepared = false) => {
    if (!record?.id || !canUpdate || !canEditBOM(record)) return
    const detail = prepared ? record : await loadDetail(record.id)
    if (!detail?.id || !canEditBOM(detail)) return
    applySelectedRowKeys([detail.id])
    setSelectedVersion(detail)
    setRevisionEditing(revision)
    setEditorImportDraft(null)
    setHeaderMode('edit')
    setHeaderModalOpen(true)
  }
  const openCopy = (record = selectedVersion) => {
    if (!record?.id || !canCopyBOM(record)) return
    applySelectedRowKeys([record.id])
    setSelectedVersion(record)
    setEditorImportDraft(null)
    setHeaderMode('copy')
    setHeaderModalOpen(true)
  }

  const activateSelected = async (record = activeActionVersion) => {
    if (!record?.id || !canActivate || saving || !canActivateBOM(record)) {
      return
    }
    setSaving(true)
    try {
      const next = await activateBOMVersion({ id: record.id })
      reportBusinessResult('BOM 版本已启用', next)
      message.success('BOM 新版本已启用，原版本及已有订单引用已保留')
      setSelectedVersion(next || record)
      setSavedRevision(null)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '启用 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const archiveSelected = async () => {
    if (!canRequestSelectedArchive || archivableSelectedVersions.length === 0) {
      return
    }
    setSaving(true)
    try {
      const { archivedCount, archiveError, refreshError } =
        await runBOMArchiveBatch({
          records: archivableSelectedVersions,
          archive: (record) => archiveBOMVersion({ id: record.id }),
          refresh: loadVersions,
        })
      if (archiveError) {
        const errorMessage = getActionErrorMessage(archiveError, '设为历史版本')
        message.error(
          archivedCount > 0
            ? `已完成 ${archivedCount} 个，后续操作失败：${errorMessage}`
            : errorMessage
        )
        return
      }
      if (refreshError) {
        message.warning('归档已完成，但列表刷新失败，请手动刷新')
        return
      }
      message.success(
        archivedCount > 1
          ? `已将 ${archivedCount} 个 BOM 版本设为历史版本`
          : 'BOM 版本已设为历史版本'
      )
    } finally {
      setSaving(false)
    }
  }

  const dataColumns = useMemo(
    () => buildBOMVersionColumns({ productOptions }),
    [productOptions]
  )

  const {
    tableColumns: columns,
    exportColumns: orderedDataColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: BOM_MODULE_KEY,
    moduleTitle: 'BOM 版本列表',
    columns: dataColumns,
  })

  const loadExportVersions = useCallback(
    async ({ signal }) => {
      if (!canRead) return []
      const result = await listAllBOMVersions(bomListParams, { signal })
      return result?.bom_versions
    },
    [bomListParams, canRead]
  )
  const { exporting, exportRows: exportVersions } = useBusinessListExport({
    requestKey: 'bom-versions-export',
    loadRows: loadExportVersions,
    filename: `物料清单-${currentBusinessDate()}.csv`,
    columns: orderedDataColumns,
    recordLabel: '物料清单',
  })

  const activeFilterCount = [
    productID,
    lifecycleScope !== LIFECYCLE_SCOPE.CURRENT,
  ].filter(Boolean).length
  const clearFilters = useCallback(() => {
    setProductID(undefined)
    setLifecycleScope(LIFECYCLE_SCOPE.CURRENT)
    if (!lifecycleScopeIncludesStatus(LIFECYCLE_SCOPE.CURRENT, status, ['ARCHIVED'])) setStatus('')
    setSearchParams((current) => {
      const next = withLifecycleScopeSearchParam(current, LIFECYCLE_SCOPE.CURRENT)
      next.delete('product_id')
      return next
    }, { replace: true })
    resetBusinessPaginationCurrent(setPagination)
  }, [setProductID, setLifecycleScope, setStatus, setSearchParams, setPagination, status])

  return (
    <ReferenceRecordsProvider component={BusinessPageLayout} adminProfile={adminProfile} handlers={{ products: mergeProducts, materials: mergeMaterials }}>
      <PageHeaderCard compact helpKey="material-bom" title="物料清单（BOM）" />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
        filters={
          <>
            <SearchInput
              value={keyword}
              {...BUSINESS_SEARCH_SCOPES.bom}
              onSearch={(value) => {
                setKeyword(value)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <RemoteReferenceSelect
              referenceType="products"
              params={{ active_only: false }}
              allowClear
              label="产品"
              optionFilterProp="label"
              options={productOptions}
              placeholder="按产品筛选"
              showSearch
              value={productID}
              onChange={(nextProductID) => {
                setProductID(nextProductID)
                resetBusinessPaginationCurrent(setPagination)
              }}
              style={{ width: 180 }}
            />
            <LifecycleScopeFilter
              value={lifecycleScope}
              onChange={(nextScope) => {
                setLifecycleScope(nextScope)
                if (
                  !lifecycleScopeIncludesStatus(nextScope, status, ['ARCHIVED'])
                ) {
                  setStatus('')
                }
                setSearchParams(
                  withLifecycleScopeSearchParam(searchParams, nextScope),
                  { replace: true }
                )
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <BusinessStatusFilter
              inline
              counts={statusCounts}
              loading={loading}
              aria-label="BOM 状态"
              value={status}
              options={lifecycleStatusOptions}
              onChange={(nextStatus) => {
                setStatus(nextStatus || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
              style={{ width: 140 }}
            />
          </>
        }
        actions={
          <Space wrap>
            <BusinessListToolbarActions
              onExport={exportVersions}
              exportDisabled={loading || exporting || total === 0}
              exportDisabledReason={exporting ? '正在准备导出，请稍候' : ''}
              onOpenColumnOrder={openColumnOrder}
            />
          </Space>
        }
        primaryAction={
          canCreate ? (
            <Space.Compact>
              <ToolbarButton
                type="primary"
                className="erp-business-list-toolbar__primary-action"
                icon={<PlusOutlined />}
                onClick={() => openCreate()}
              >
                新建 BOM
              </ToolbarButton>
              <Dropdown
                trigger={['click']}
                menu={{ items: [{
                  key: 'import-bom-xlsx',
                  label: '从 Excel 新建',
                  icon: <UploadOutlined aria-hidden="true" />,
                  disabled: importing || !referenceOptionsState.loaded,
                  onClick: () => chooseImportFile('new'),
                }, {
                  key: 'bom-excel-format',
                  label: '查看 Excel 格式',
                  icon: <InfoCircleOutlined aria-hidden="true" />,
                  onClick: () => setImportFormatOpen(true),
                }] }}
              >
                <ToolbarButton type="primary" icon={<DownOutlined />} loading={importing} aria-label="更多新建方式" aria-haspopup="menu" />
              </Dropdown>
            </Space.Compact>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRowKeys.length}
          selectedLabel={selectedLabel}
          selectedItems={selectedItems}
          boundaryText="已启用版本只读；改版请创建修订草稿或选择同产品已有草稿，保存后需另行启用。"
        >
          <SelectionClearAction
            selectedCount={selectedRowKeys.length}
            selectionLabel="BOM 版本"
            onClear={() => {
              applySelectedRowKeys([])
              setSelectedVersion(null)
            }}
          />
          <BusinessActionTooltip
            disabled={selectedRowKeys.length !== 1}
            disabledReason="请先选择一个 BOM 版本"
          >
            <Button
              data-business-action-key="view"
              data-business-action-role="view"
              size="small"
              icon={<InboxOutlined />}
              disabled={selectedRowKeys.length !== 1}
              onClick={() => openView(activeActionVersion)}
            >
              查看
            </Button>
          </BusinessActionTooltip>
          {canUpdate ? (
            <BusinessActionTooltip
              visible={!activeActionVersion || activeActionCanEdit}
              disabled={
                selectedRowKeys.length !== 1 ||
                !activeActionCanEdit ||
                detailLoading ||
                saving
              }
              disabledReason={
                selectedRowKeys.length !== 1
                  ? '请先选择一个 BOM 版本'
                  : !activeActionCanEdit
                    ? '只有 BOM 草稿可以编辑'
                    : detailLoading || saving
                      ? '当前资料处理完成后可编辑'
                      : ''
              }
            >
              <Button
                data-business-action-key="edit"
                data-business-action-role="edit"
                type="primary"
                size="small"
                icon={<EditOutlined />}
                disabled={
                  selectedRowKeys.length !== 1 ||
                  !activeActionCanEdit ||
                  detailLoading ||
                  saving
                }
                onClick={() => openEdit(activeActionVersion)}
              >
                编辑 BOM
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canUpdate && activeActionVersion?.status === 'ACTIVE' ? (
            <BOMRevisionAction
              key={`list:${adminProfile?.id}`}
              record={activeActionVersion}
              canCreate={canCreate}
              disabled={selectedRowKeys.length !== 1 || detailLoading || saving}
              onEdit={(detail) => openEdit(detail, true, true)}
            />
          ) : null}
          {canReadTasks ? (
            <Button
              size="small"
              icon={<UnorderedListOutlined />}
              data-business-action-key="related-tasks"
              data-business-action-role="collaboration"
              className="erp-business-task-collaboration-entry"
              disabled={
                selectedRowKeys.length !== 1 || !activeActionVersion || saving
              }
              onClick={() =>
                setTaskContext({ bomID: activeActionVersion.id, page: 1 })
              }
            >
              任务协作
            </Button>
          ) : null}
          {canCreate &&
          (!canUpdate || activeActionVersion?.status !== 'ACTIVE') ? (
            <BusinessActionTooltip
              disabled={
                selectedRowKeys.length !== 1 ||
                !canCopyBOM(activeActionVersion) ||
                detailLoading ||
                saving
              }
              disabledReason={
                selectedRowKeys.length !== 1
                  ? '请先选择一个 BOM 版本'
                  : !canCopyBOM(activeActionVersion)
                    ? '当前 BOM 版本不能复制'
                    : detailLoading || saving
                      ? '当前资料处理完成后可复制'
                      : ''
              }
            >
              <Button
                data-business-action-key="copy"
                data-business-action-role="secondary"
                data-business-action-group="business"
                size="small"
                icon={<CopyOutlined />}
                disabled={
                  selectedRowKeys.length !== 1 ||
                  !canCopyBOM(activeActionVersion) ||
                  detailLoading ||
                  saving
                }
                onClick={() => openCopy(activeActionVersion)}
              >
                复制新版本
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canPrint
            ? [
                [MATERIAL_DETAIL_TEMPLATE_KEY, '打印物料明细'],
                [COLOR_CARD_TEMPLATE_KEY, '打印色卡'],
                [WORK_INSTRUCTION_TEMPLATE_KEY, '打印作业指导书'],
              ].map(([templateKey, label]) => (
                <BusinessActionTooltip
                  key={templateKey}
                  disabled={
                    selectedRowKeys.length !== 1 ||
                    detailLoading ||
                    printingTemplateKey !== ''
                  }
                  disabledReason={
                    selectedRowKeys.length !== 1
                      ? '请先选择一个 BOM 版本'
                      : detailLoading || printingTemplateKey !== ''
                        ? '当前资料处理完成后可打印'
                        : ''
                  }
                >
                  <Button
                    data-business-action-key={`print-${templateKey}`}
                    data-business-action-role="output"
                    size="small"
                    icon={<PrinterOutlined />}
                    disabled={
                      selectedRowKeys.length !== 1 ||
                      detailLoading ||
                      printingTemplateKey !== ''
                    }
                    loading={printingTemplateKey === templateKey}
                    onClick={() => openEngineeringPrint(templateKey)}
                  >
                    {label}
                  </Button>
                </BusinessActionTooltip>
              ))
            : null}
          {canActivate ? (
            <BusinessActionTooltip
              visible={
                !activeActionVersion || canActivateBOM(activeActionVersion)
              }
              disabled={
                selectedRowKeys.length !== 1 ||
                !canActivateBOM(activeActionVersion) ||
                saving
              }
              disabledReason={
                selectedRowKeys.length !== 1
                  ? '请先选择一个 BOM 版本'
                  : !canActivateBOM(activeActionVersion)
                    ? '当前 BOM 版本不能启用'
                    : saving
                      ? '当前操作完成后可启用'
                      : ''
              }
            >
              <Popconfirm
                title="启用该 BOM 版本？同产品当前生效版本会设为历史版本，已有订单引用保持不变。"
                okText="启用"
                cancelText="取消"
                onConfirm={() => activateSelected()}
              >
                <Button
                  data-business-action-key="activate"
                  data-business-action-role="action"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  disabled={
                    selectedRowKeys.length !== 1 ||
                    !canActivateBOM(activeActionVersion) ||
                    saving
                  }
                >
                  启用
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {canUpdate ? (
            <BusinessActionTooltip
              visible={
                selectedRowKeys.length === 0 ||
                archivableSelectedVersions.length > 0
              }
              disabled={
                selectedRowKeys.length === 0 ||
                !canRequestSelectedArchive ||
                archivableSelectedVersions.length === 0 ||
                saving
              }
              disabledReason={
                selectedRowKeys.length === 0
                  ? '请先选择 BOM 版本'
                  : !canRequestSelectedArchive ||
                      archivableSelectedVersions.length === 0
                    ? '所选 BOM 当前不能设为历史版本'
                    : saving
                      ? '当前操作完成后可设为历史版本'
                      : ''
              }
            >
              <Popconfirm
                title="将该 BOM 版本设为历史版本？后续仍可重新启用。"
                okText="设为历史版本"
                cancelText="取消"
                onConfirm={archiveSelected}
              >
                <Button
                  data-business-action-key="archive"
                  data-business-action-role="secondary"
                  data-business-action-group="lifecycle"
                  size="small"
                  icon={<InboxOutlined />}
                  disabled={
                    selectedRowKeys.length === 0 ||
                    !canRequestSelectedArchive ||
                    archivableSelectedVersions.length === 0 ||
                    saving
                  }
                >
                  {selectedRowKeys.length > 1
                    ? '所选设为历史版本'
                    : '设为历史版本'}
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={versions}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        emptyDescription="暂无 BOM 版本"
        rowSelection={{
          selectedRowKeys,
          onChange: (nextKeys, nextRows) => {
            applySelectedRowKeys(nextKeys)
            const nextSingle =
              nextKeys.length === 1
                ? versions.find(
                    (record) => String(record.id) === String(nextKeys[0])
                  ) ||
                  nextRows[0] ||
                  null
                : null
            if (nextSingle?.id) {
              setSelectedVersion(nextSingle)
              loadDetail(nextSingle.id)
            } else {
              setSelectedVersion(null)
            }
          },
        }}
        rowClassName={(record) =>
          selectedRowKeys.includes(record?.id) ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: (event) => {
            if (
              event.target?.closest?.(
                '.ant-checkbox-wrapper, .ant-checkbox, .ant-table-selection-column'
              )
            ) {
              return
            }
            selectSingleVersion(record)
          },
        })}
        onOpenRecord={(record) => {
          if (record.status === 'DRAFT' && canUpdate) {
            openEdit(record)
            return
          }
          openView(record)
        }}
      />

      <BOMTaskPanel
        context={taskContext}
        onContextChange={setTaskContext}
        adminProfile={adminProfile}
      />

      <BusinessModal
        title="BOM 草稿已保存"
        open={Boolean(savedRevision)}
        closable={!saving}
        maskClosable={!saving}
        keyboard={!saving}
        onCancel={() => {
          if (!saving) setSavedRevision(null)
        }}
        footer={
          <Space wrap>
            <Button disabled={saving} onClick={() => setSavedRevision(null)}>
              返回列表
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                const draft = savedRevision
                setSavedRevision(null)
                openEdit(draft, true)
              }}
            >
              继续编辑草稿
            </Button>
            {canActivate ? (
              <Popconfirm
                title="启用新版本？原版本会设为历史版本，已有订单引用保持不变。"
                okText="启用"
                cancelText="取消"
                onConfirm={() => activateSelected(savedRevision)}
              >
                <Button type="primary" loading={saving}>
                  启用此版本
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        }
      >
        <p>{savedRevision?.version} 已保存，尚未启用。当前启用版本继续使用。</p>
        {!canActivate ? <p>请有启用权限的同事确认并启用新版本。</p> : null}
      </BusinessModal>

      <BOMEditor
        open={headerModalOpen}
        mode={headerMode}
        record={['edit', 'view', 'copy'].includes(headerMode) ? selectedVersion : null}
        initialValues={editorInitialValues}
        importDraft={editorImportDraft}
        onClose={() => setHeaderModalOpen(false)}
        onSaved={async (saved) => {
          const isCreatingVersion = headerMode !== 'edit'
          setSelectedVersion(saved)
          applySelectedRowKeys([saved.id])
          reportBusinessResult('BOM 草稿已保存', saved)
          if (headerMode === 'edit' && revisionEditing) setSavedRevision(saved)
          if (isCreatingVersion) {
            resetBusinessPaginationCurrent(setPagination)
          } else {
            await loadVersions()
          }
        }}
        actions={headerMode === 'view' && canReadTasks ? <Button icon={<UnorderedListOutlined />} onClick={() => setTaskContext({ bomID: selectedVersion.id, page: 1 })}>任务协作</Button> : null}
      />

      <input
        ref={importFileInputRef}
        aria-label="选择 BOM Excel 文件"
        hidden
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleImportFileChange}
      />
      <BOMExcelImportPreview
        pending={pendingImport}
        existingCount={0}
        materialOptions={materialOptions}
        unitOptions={unitOptions}
        onCancel={() => setPendingImport(null)}
        onConfirm={applyImportedDraft}
      />
      <BOMExcelImportFormat open={importFormatOpen} onClose={() => setImportFormatOpen(false)} />

      {columnOrderModal}
    </ReferenceRecordsProvider>
  )
}
