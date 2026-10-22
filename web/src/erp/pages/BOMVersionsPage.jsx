import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  PrinterOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Alert, Button, Form, Popconfirm, Space } from 'antd'
import {
  useLocation,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import Select from '@/common/components/select/AppSelect'
import { showPageLoadError } from '../components/PageLoadFeedback.jsx'
import BusinessModal from '../components/business-list/BusinessModal.jsx'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import useBusinessPageState from '../hooks/useBusinessPageState'
import useBusinessNavigate from '../hooks/useBusinessNavigate.js'
import {
  engineeringBOMReturnState,
  readBOMPreparation,
} from '../utils/bomPreparationNavigation.mjs'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  activateBOMVersion,
  archiveBOMVersion,
  copyBOMVersion,
  getBOMVersion,
  listAllBOMVersions,
  listBOMVersions,
  saveBOMWithItems,
} from '../api/bomApi.mjs'
import {
  downloadBusinessAttachment,
  listBusinessAttachments,
} from '../api/attachmentApi.mjs'
import {
  getProduct,
  listAllMaterials,
  listAllProducts,
  listAllUnits,
} from '../api/masterDataOrderApi.mjs'
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
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import BusinessFormPage from '../components/business-list/BusinessFormPage.jsx'
import BusinessFormSection from '../components/business-list/BusinessFormSection.jsx'
import { invalidateBOMUsageSnapshots } from '../utils/bomMaterialGroups.mjs'
import { loadBOMPrintSnapshot } from '../utils/bomPrintSnapshot.mjs'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import BOMMaterialGroupsForm from '../components/bom/BOMMaterialGroupsForm.jsx'
import BOMTaskPanel from '../components/bom/BOMTaskPanel.jsx'
import BOMRevisionAction from '../components/bom/BOMRevisionAction.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import { useLineItemAppendScroll } from '../components/business-list/useLineItemAppendScroll.mjs'
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
import {
  BOMHeaderFormFields,
  buildHeaderParams,
  buildItemParams,
  unixToDateInputValue,
} from '../components/bom/BOMVersionForms.jsx'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import { suggestNextBOMVersion } from '../utils/bomVersionSuggestion.mjs'
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
  describeBOMImportIssues,
  getBOMImportDraftIssues,
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

function normalizeBOMLineForForm(headerID, item = {}) {
  return {
    id: item.id,
    bom_header_id: item.bom_header_id || headerID,
    material_id: item.material_id || undefined,
    quantity: item.quantity ?? '',
    unit_id: item.unit_id || undefined,
    loss_rate: item.loss_rate ?? '0',
    position: item.position || '',
    piece_count: item.piece_count || '',
    total_usage_snapshot: item.total_usage_snapshot || '',
    process_base: item.process_base || '',
    process_method: item.process_method || '',
    note: item.note || '',
  }
}

function normalizeBOMLinesForForm(headerID, items = []) {
  return (Array.isArray(items) ? items : []).map((item) =>
    normalizeBOMLineForForm(headerID, item)
  )
}

function BOMImportReviewSummary({ form, review, productOptions }) {
  const issues =
    Form.useWatch(getBOMImportDraftIssues, {
      form,
      preserve: true,
    }) || []
  const productID = Form.useWatch('product_id', { form, preserve: true })
  if (!review) return null
  const affectedRows = new Set(
    issues
      .filter((issue) => issue.scope === 'item')
      .flatMap((issue) => issue.itemIndexes)
  ).size
  const lossEvidence = review.lossEvidence || {}
  const issueText =
    issues.length > 0
      ? `请先${describeBOMImportIssues(issues)}${
          affectedRows > 0 ? `（涉及 ${affectedRows} 个部位）` : ''
        }`
      : '明细已全部关联，可继续核对并保存'

  return (
    <Alert
      className="erp-business-source-summary erp-bom-import-review"
      data-bom-import-issue-count={issues.length}
      data-bom-import-product-status={productID ? 'matched' : 'unresolved'}
      description={
        <div className="erp-bom-import-review__details">
          <span>
            来源：{review.fileName} / {review.sheetName}
          </span>
          <span>
            原表产品：{review.productCode || review.productName || '原表未填写'}
            ；
            {productID
              ? `已关联：${referenceLabel(productOptions, productID, '产品')}`
              : '尚未关联，请在上方选择对应产品档案'}
          </span>
          <span>
            原表名称用于核对，保存需关联产品、材料和单位档案；同种物料选择一次即可应用到全部部位。
          </span>
          <span>
            损耗核对：原表明确 {Number(lossEvidence.explicit || 0)}{' '}
            行，按单位用量、 订单数量和总用量反算{' '}
            {Number(lossEvidence.calculated || 0)} 行
          </span>
          <span>
            文件仅在当前浏览器解析；保存时只创建 BOM
            草稿，并把来源文件名写入备注， 不会自动上传原文件或创建主数据。
          </span>
        </div>
      }
      message={`已读取 ${review.rowCount} 条 BOM 明细；${issueText}`}
      showIcon
      type={issues.length > 0 ? 'warning' : 'success'}
    />
  )
}

export default function BOMVersionsPage() {
  const outletContext = useOutletContext()
  const location = useLocation()
  const navigate = useBusinessNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const beginLatestRequest = useLatestRequestCoordinator()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = useMemo(
    () => adminProfile?.effective_session?.customer?.key || '',
    [adminProfile]
  )
  const preparation = useMemo(
    () => readBOMPreparation(location.state, adminProfile?.id),
    [location.state, adminProfile?.id]
  )
  const preparedEntry = useRef(null)
  const [preparedBOMID, setPreparedBOMID] = useState(null)
  const [preparationError, setPreparationError] = useState('')
  const [preparationRetry, setPreparationRetry] = useState(0)
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
  const headerAttachmentRef = useRef(null)
  const importFileInputRef = useRef(null)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [headerMode, setHeaderMode] = useState('create')
  const [revisionEditing, setRevisionEditing] = useState(false)
  const [savedRevision, setSavedRevision] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importReview, setImportReview] = useState(null)
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
  const [referenceOptionsState, setReferenceOptionsState] = useState({
    loading: true,
    loaded: false,
  })
  const [headerForm] = Form.useForm()
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
  const [headerProductIDForSuggestion, setHeaderProductIDForSuggestion] =
    useState()
  const [headerVersionCandidates, setHeaderVersionCandidates] = useState({
    productID: undefined,
    versions: [],
    loading: false,
    loaded: false,
  })

  const canRead = hasActionPermission(adminProfile, PermissionCode.BOM_READ)
  const canReadTasks = hasActionPermission(
    adminProfile,
    PermissionCode.WORKFLOW_TASK_READ
  )
  const canCreate = hasActionPermission(adminProfile, PermissionCode.BOM_CREATE)
  const canUpdate = hasActionPermission(adminProfile, PermissionCode.BOM_UPDATE)
  const canActivate = hasActionPermission(
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
  const materialByID = useMemo(() => {
    const entries = (Array.isArray(materials) ? materials : [])
      .map((material) => [Number(material?.id || 0), material])
      .filter(([id]) => Number.isFinite(id) && id > 0)
    return new Map(entries)
  }, [materials])
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const headerVersionSuggestion = useMemo(() => {
    if (!headerVersionCandidates.loaded) return ''
    return suggestNextBOMVersion(
      headerVersionCandidates.versions,
      headerProductIDForSuggestion
    )
  }, [
    headerVersionCandidates.loaded,
    headerVersionCandidates.versions,
    headerProductIDForSuggestion,
  ])
  const useHeaderVersionSuggestion = useCallback(() => {
    if (!headerVersionSuggestion) return
    headerForm.setFieldsValue({ version: headerVersionSuggestion })
  }, [headerForm, headerVersionSuggestion])

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
    [beginLatestRequest]
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
          ...getBusinessPaginationParams(pagination),
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) {
        return false
      }
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
      const [productResult, materialResult, unitResult] = await Promise.all([
        listAllProducts({ active_only: false }),
        listAllMaterials({ active_only: false }),
        listAllUnits(),
      ])
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
      setReferenceOptionsState({ loading: false, loaded: true })
    } catch (error) {
      showPageLoadError(error, '加载物料清单相关资料')
      setProducts([])
      setMaterials([])
      setUnits([])
      setReferenceOptionsState({ loading: false, loaded: false })
    }
  }, [])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    const nextProductID = Number(headerProductIDForSuggestion || 0)
    const shouldLoadSuggestions =
      headerModalOpen &&
      ['copy', 'create', 'import'].includes(headerMode) &&
      Number.isFinite(nextProductID) &&
      nextProductID > 0

    if (!shouldLoadSuggestions) {
      setHeaderVersionCandidates((current) =>
        current.productID ||
        current.versions.length > 0 ||
        current.loading ||
        current.loaded
          ? {
              productID: undefined,
              versions: [],
              loading: false,
              loaded: false,
            }
          : current
      )
      return undefined
    }

    let cancelled = false
    setHeaderVersionCandidates({
      productID: nextProductID,
      versions: [],
      loading: true,
      loaded: false,
    })
    listAllBOMVersions({ product_id: nextProductID })
      .then((result) => {
        if (cancelled) return
        if (
          headerMode === 'copy' &&
          !String(headerForm.getFieldValue('version') || '').trim()
        ) {
          headerForm.setFieldsValue({
            version: suggestNextBOMVersion(
              result?.bom_versions || [],
              nextProductID
            ),
          })
        }
        setHeaderVersionCandidates({
          productID: nextProductID,
          versions: Array.isArray(result?.bom_versions)
            ? result.bom_versions
            : [],
          loading: false,
          loaded: true,
        })
      })
      .catch((error) => {
        if (cancelled) return
        setHeaderVersionCandidates({
          productID: nextProductID,
          versions: [],
          loading: false,
          loaded: false,
        })
        message.warning(getActionErrorMessage(error, '读取同产品 BOM 版本建议'))
      })

    return () => {
      cancelled = true
    }
  }, [headerForm, headerModalOpen, headerMode, headerProductIDForSuggestion])

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
  const modalActionVersion = selectedVersion || activeActionVersion
  const modalActionCanEdit =
    headerMode === 'edit' && canEditBOM(modalActionVersion) && canUpdate
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
        { getBOMVersion, getProduct, listAllMaterials, listAllUnits }
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

  const openImportedDraft = async (file) => {
    if (!file) return
    if (!referenceOptionsState.loaded) {
      message.warning('产品、材料和单位尚未加载完成，请稍后重试')
      return
    }
    if (!/\.xlsx$/iu.test(String(file.name || ''))) {
      message.warning('仅支持 .xlsx 格式的 BOM Excel 文件')
      return
    }
    if (Number(file.size || 0) > MAX_BOM_XLSX_FILE_BYTES) {
      message.warning('Excel 文件超过 20MB，请精简图片或拆分后再导入')
      return
    }

    setImporting(true)
    try {
      const parsed = await parseBOMXlsx(await file.arrayBuffer(), {
        fileName: file.name,
      })
      const draft = buildBOMImportDraft(parsed, {
        products,
        materials,
        units,
      })
      headerAttachmentRef.current?.clearPendingAttachments()
      setHeaderMode('import')
      headerForm.resetFields()
      headerForm.setFieldsValue(draft.values)
      setHeaderProductIDForSuggestion(draft.values.product_id)
      setImportReview(draft.review)
      setHeaderModalOpen(true)
      const issues = getBOMImportDraftIssues(draft.values)
      message.success(
        issues.length > 0
          ? `已读取 ${draft.review.rowCount} 条明细，请先${describeBOMImportIssues(issues)}`
          : `已读取 ${draft.review.rowCount} 条明细，请核对后保存草稿`
      )
    } catch (error) {
      message.error(
        getActionErrorMessage(
          error,
          'Excel 解析失败，请确认文件未损坏且使用现有 BOM 明细格式'
        )
      )
    } finally {
      setImporting(false)
    }
  }

  const handleImportFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) openImportedDraft(file)
  }

  const openCreate = useCallback(
    (prefill = {}) => {
      headerAttachmentRef.current?.clearPendingAttachments()
      setImportReview(null)
      setHeaderMode('create')
      headerForm.resetFields()
      headerForm.setFieldsValue({
        effective_from: '',
        effective_to: '',
        source_order_no: '',
        quantity_text: '',
        spare_text: '',
        print_date: '',
        designer: '',
        maker: '',
        auditor: '',
        hair_direction: '',
        items: [],
        product_id: prefill.productID,
        ...(prefill.orderNo
          ? {
              source_order_no: prefill.orderNo,
              quantity_text: prefill.quantityText,
            }
          : {}),
      })
      setHeaderProductIDForSuggestion(prefill.productID)
      setHeaderModalOpen(true)
    },
    [headerForm]
  )

  const fillHeaderForm = useCallback(
    (record) => {
      headerForm.resetFields()
      headerForm.setFieldsValue({
        product_id: record.product_id,
        version: record.version,
        effective_from: unixToDateInputValue(record.effective_from),
        effective_to: unixToDateInputValue(record.effective_to),
        source_order_no: record.source_order_no || '',
        quantity_text: record.quantity_text || '',
        spare_text: record.spare_text || '',
        print_date: unixToDateInputValue(record.print_date),
        designer: record.designer || '',
        maker: record.maker || '',
        auditor: record.auditor || '',
        hair_direction: record.hair_direction || '',
        note: record.note || '',
        items: normalizeBOMLinesForForm(record.id, record.items),
      })
    },
    [headerForm]
  )

  useEffect(() => {
    if (
      !preparation ||
      preparedEntry.current === location.key ||
      !canRead ||
      loading ||
      !referenceOptionsState.loaded
    ) {
      return undefined
    }
    const controller = new AbortController()
    setPreparationError('')
    setPreparedBOMID(null)
    setRevisionEditing(false)
    if (preparation.mode === 'create') {
      if (!canCreate) {
        setPreparationError('当前账号没有新建 BOM 的权限，请返回工程资料核对。')
      } else {
        preparedEntry.current = location.key
        openCreate(preparation)
      }
      return undefined
    }
    setDetailLoading(true)
    getBOMVersion({ id: preparation.bomID }, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return
        if (
          detail.product_id !== preparation.productID ||
          !Array.isArray(detail.items)
        ) {
          setPreparationError(
            '此 BOM 与所选产品不一致，请返回工程资料重新选择。'
          )
          return
        }
        preparedEntry.current = location.key
        setPreparedBOMID(detail.id)
        setSelectedVersion(detail)
        applySelectedRowKeys([detail.id])
        setHeaderMode(
          preparation.mode === 'edit' && canUpdate && canEditBOM(detail)
            ? 'edit'
            : 'view'
        )
        fillHeaderForm(detail)
        setHeaderProductIDForSuggestion(undefined)
        setHeaderModalOpen(true)
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPreparationError(getActionErrorMessage(error, '打开订单关联 BOM'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [
    preparation,
    location.key,
    canRead,
    canCreate,
    canUpdate,
    openCreate,
    fillHeaderForm,
    applySelectedRowKeys,
    preparationRetry,
    loading,
    referenceOptionsState.loaded,
  ])

  const returnToEngineering = () => {
    if (saving || !preparation) return
    navigate(preparation.returnPath, {
      replace: true,
      state: engineeringBOMReturnState(
        preparation,
        preparedBOMID || preparation.bomID
      ),
    })
  }

  const openView = async (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    setImportReview(null)
    applySelectedRowKeys([record.id])
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('view')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openEdit = async (
    record = selectedVersion,
    revision = false,
    prepared = false
  ) => {
    if (!record?.id || !canEditBOM(record)) return
    headerAttachmentRef.current?.clearPendingAttachments()
    setImportReview(null)
    applySelectedRowKeys([record.id])
    const detail = prepared ? record : await loadDetail(record.id)
    if (!detail?.id || !Array.isArray(detail.items)) {
      return
    }
    if (!canEditBOM(detail)) {
      message.warning('此版本已不能直接编辑，请刷新后选择可修改的版本')
      return
    }
    setSelectedVersion(detail)
    setRevisionEditing(revision)
    setHeaderMode('edit')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openCopy = (record = selectedVersion) => {
    if (!record?.id || !canCopyBOM(record)) return
    headerAttachmentRef.current?.clearPendingAttachments()
    setImportReview(null)
    applySelectedRowKeys([record.id])
    setHeaderMode('copy')
    headerForm.resetFields()
    headerForm.setFieldsValue({
      product_id: record.product_id,
      version: '',
      effective_from: '',
      effective_to: '',
      source_order_no: record.source_order_no || '',
      quantity_text: record.quantity_text || '',
      spare_text: record.spare_text || '',
      print_date: unixToDateInputValue(record.print_date),
      designer: record.designer || '',
      maker: record.maker || '',
      auditor: record.auditor || '',
      hair_direction: record.hair_direction || '',
      note: '',
      items: [],
    })
    setHeaderProductIDForSuggestion(record.product_id)
    setHeaderModalOpen(true)
  }

  const saveHeader = async () => {
    if (saving || headerMode === 'view') return
    if (headerMode === 'import') {
      const issues = getBOMImportDraftIssues(headerForm.getFieldsValue(true))
      if (issues.length > 0) {
        const fields = issues.map((issue) => ({
          name:
            issue.scope === 'item'
              ? ['items', issue.itemIndex, issue.field]
              : [issue.field],
          errors: [issue.message],
        }))
        headerForm.setFields(fields)
        window.requestAnimationFrame(() => {
          headerForm.scrollToField(fields[0].name, {
            focus: true,
            block: 'center',
          })
        })
        message.warning(`暂未保存：请先${describeBOMImportIssues(issues)}`)
        return
      }
    }

    let values
    try {
      values = await headerForm.validateFields()
    } catch (error) {
      window.requestAnimationFrame(() => {
        const firstField = error?.errorFields?.[0]?.name
        if (firstField) {
          headerForm.scrollToField(firstField, { focus: true, block: 'center' })
        }
      })
      message.warning('请先补全表单中的必填项')
      return
    }
    const isCreatingVersion = headerMode !== 'edit'
    setSaving(true)
    try {
      let savedVersion = null
      if (headerMode === 'copy') {
        savedVersion = await copyBOMVersion(
          buildHeaderParams(values, { source_id: modalActionVersion?.id })
        )
      } else if (headerMode === 'edit') {
        savedVersion = await saveBOMWithItems({
          ...buildHeaderParams(values, {
            id: modalActionVersion?.id,
            product_id: modalActionVersion?.product_id,
          }),
          expected_version: modalActionVersion?.edit_version,
          items: (Array.isArray(values.items) ? values.items : []).map(
            (item) => ({
              ...buildItemParams(item),
              id: item?.id || undefined,
            })
          ),
        })
      } else {
        savedVersion = await saveBOMWithItems({
          ...buildHeaderParams(values),
          items: (Array.isArray(values.items) ? values.items : []).map((item) =>
            buildItemParams(item)
          ),
        })
      }
      const attachmentSaved =
        (await headerAttachmentRef.current?.flushPendingAttachments(
          savedVersion?.id
        )) !== false
      message.success(
        attachmentSaved
          ? headerMode === 'copy'
            ? 'BOM 新版本已复制为草稿'
            : headerMode === 'edit'
              ? 'BOM 草稿已保存，尚未启用'
              : headerMode === 'import'
                ? 'BOM 导入草稿已创建'
                : 'BOM 草稿已创建'
          : 'BOM 草稿已保存，未上传的附件请重新选择'
      )
      headerAttachmentRef.current?.clearPendingAttachments()
      setImportReview(null)
      setHeaderModalOpen(false)
      if (preparation && savedVersion?.product_id === preparation.productID) {
        setPreparedBOMID(savedVersion.id)
        setSelectedVersion(savedVersion)
        applySelectedRowKeys([savedVersion.id])
      }
      if (headerMode === 'edit' && revisionEditing && savedVersion?.id) {
        setSavedRevision(savedVersion)
      }
      if (isCreatingVersion) {
        resetBusinessPaginationCurrent(setPagination)
      } else {
        await loadVersions()
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const activateSelected = async (record = activeActionVersion) => {
    if (!record?.id || !canActivate || saving || !canActivateBOM(record)) {
      return
    }
    setSaving(true)
    try {
      const next = await activateBOMVersion({ id: record.id })
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
    status,
  ].filter(Boolean).length
  const clearFilters = useCallback(() => {
    setProductID(undefined)
    setLifecycleScope(LIFECYCLE_SCOPE.CURRENT)
    setStatus('')
    setSearchParams((current) => {
      const next = withLifecycleScopeSearchParam(current, LIFECYCLE_SCOPE.CURRENT)
      next.delete('product_id')
      return next
    }, { replace: true })
    resetBusinessPaginationCurrent(setPagination)
  }, [setProductID, setLifecycleScope, setStatus, setSearchParams, setPagination])

  const preparationLoadError =
    preparationError ||
    (preparation &&
    !referenceOptionsState.loading &&
    !referenceOptionsState.loaded
      ? 'BOM 相关资料未读取成功，请重新读取后继续编制。'
      : '')

  return (
    <BusinessPageLayout>
      <PageHeaderCard compact helpKey="material-bom" title="物料清单（BOM）" />

      {preparation ? (
        <Space wrap className="erp-business-inline-note">
          <span>工程与打样 · {preparation.orderNo}</span>
          <Button size="small" disabled={saving} onClick={returnToEngineering}>
            返回工程与打样
          </Button>
        </Space>
      ) : null}
      {preparationLoadError ? (
        <Alert
          type="error"
          showIcon
          message={preparationLoadError}
          action={
            <Button
              size="small"
              onClick={() => {
                if (!referenceOptionsState.loaded) loadReferenceOptions()
                setPreparationRetry((value) => value + 1)
              }}
            >
              重新读取
            </Button>
          }
        />
      ) : null}

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
        filters={
          <>
            <SearchInput
              value={keyword}
              {...BUSINESS_SEARCH_SCOPES.bom}
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadVersions}
            />
            <Select
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
            <SelectFilter
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
            {canCreate ? (
              <>
                <ToolbarButton
                  data-business-action-key="import-bom-xlsx"
                  icon={<UploadOutlined />}
                  loading={importing}
                  disabled={
                    importing ||
                    referenceOptionsState.loading ||
                    !referenceOptionsState.loaded
                  }
                  title={
                    referenceOptionsState.loaded
                      ? '按现有材料分析明细表导入并生成待核对草稿'
                      : '产品、材料和单位加载完成后可导入'
                  }
                  onClick={() => importFileInputRef.current?.click()}
                >
                  导入 Excel
                </ToolbarButton>
                <input
                  ref={importFileInputRef}
                  aria-label="选择 BOM Excel 文件"
                  hidden
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleImportFileChange}
                />
              </>
            ) : null}
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
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              onClick={openCreate}
            >
              新建 BOM
            </ToolbarButton>
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

      <BusinessFormPage
        open={headerModalOpen}
        form={headerForm}
        className="erp-bom-editor"
        readOnly={headerMode === 'view'}
        initialDirty={headerMode === 'import'}
        title={
          headerMode === 'copy'
            ? '复制 BOM 新版本'
            : headerMode === 'edit'
              ? '编辑 BOM 草稿 · 未生效'
              : headerMode === 'view'
                ? `查看 BOM 版本 · ${bomStatusText(modalActionVersion?.status)} · 只读`
                : headerMode === 'import'
                  ? '检查并保存导入草稿'
                  : '新建 BOM 草稿'
        }
        okText="保存草稿"
        confirmLoading={saving}
        loading={detailLoading}
        onOk={saveHeader}
        onCancel={() => {
          headerAttachmentRef.current?.clearPendingAttachments()
          setImportReview(null)
          setHeaderModalOpen(false)
          if (headerMode === 'edit' && revisionEditing) loadVersions()
        }}
      >
        {preparation ? (
          <Space wrap className="erp-business-inline-note">
            <span>
              {preparation.orderNo} ·
              保存草稿后返回工程资料关联，启用与任务提交仍需分别办理。
            </span>
            <Button
              size="small"
              disabled={saving}
              onClick={returnToEngineering}
            >
              返回工程与打样
            </Button>
          </Space>
        ) : null}
        <Form
          form={headerForm}
          layout="vertical"
          className="erp-business-action-form"
          onValuesChange={(changedValues) => {
            if (
              Object.hasOwn(changedValues, 'quantity_text') ||
              changedValues.items
            ) {
              const items = headerForm.getFieldValue('items') || []
              invalidateBOMUsageSnapshots(items, changedValues).forEach(
                (item, index) => {
                  if (
                    item.total_usage_snapshot !==
                    items[index].total_usage_snapshot
                  ) {
                    headerForm.setFieldValue(
                      ['items', index, 'total_usage_snapshot'],
                      item.total_usage_snapshot
                    )
                  }
                }
              )
            }
            if (
              Object.prototype.hasOwnProperty.call(changedValues, 'product_id')
            ) {
              setHeaderProductIDForSuggestion(changedValues.product_id)
            }
          }}
        >
          {headerMode === 'edit' ? (
            <p className="erp-business-source-summary erp-business-inline-note">
              正在修改草稿，尚未生效。保存后需启用，已有订单仍使用原 BOM。
            </p>
          ) : null}
          {headerMode === 'view' && canUpdate ? (
            <BOMRevisionAction
              key={`detail:${adminProfile?.id}`}
              record={modalActionVersion}
              canCreate={canCreate}
              disabled={detailLoading || saving}
              onEdit={(detail) => openEdit(detail, true, true)}
            />
          ) : null}
          {headerMode === 'view' && canReadTasks ? (
            <Button
              icon={<UnorderedListOutlined />}
              onClick={() =>
                setTaskContext({ bomID: modalActionVersion.id, page: 1 })
              }
            >
              任务协作
            </Button>
          ) : null}
          <BOMHeaderFormFields
            form={headerForm}
            includeProduct
            disabled={headerMode === 'view'}
            productDisabled={headerMode === 'edit'}
            productOptions={productOptions}
            versionSuggestion={headerVersionSuggestion}
            versionSuggestionLoading={headerVersionCandidates.loading}
            onUseVersionSuggestion={useHeaderVersionSuggestion}
            attachmentPanel={
              <BusinessAttachmentPanel
                ref={headerAttachmentRef}
                ownerType="bom_header"
                ownerId={
                  headerMode === 'edit' || headerMode === 'view'
                    ? activeActionVersion?.id || selectedVersion?.id
                    : undefined
                }
                title="BOM 附件"
                description="色卡、工艺图、作业说明和原始材料清单"
                canUpload={
                  headerMode !== 'view' &&
                  (headerMode === 'edit' ? modalActionCanEdit : canCreate)
                }
                canWithdraw={
                  headerMode !== 'view' &&
                  canUpdate &&
                  (headerMode !== 'edit' || modalActionCanEdit)
                }
                variant="inline"
                compact
              />
            }
          >
            {headerMode === 'import' ? (
              <BOMImportReviewSummary
                form={headerForm}
                review={importReview}
                productOptions={productOptions}
              />
            ) : null}

            <BusinessFormSection title="材料分析明细表" showHeading={false}>
              {headerMode === 'copy' ? (
                <p className="erp-business-selection-action-bar__hint">
                  保存复制草稿后，可打开新版本继续维护物料和部位。
                </p>
              ) : (
                <BOMMaterialGroupsForm
                  canEdit={
                    headerMode === 'create' || headerMode === 'import'
                      ? canCreate
                      : modalActionCanEdit
                  }
                  form={headerForm}
                  materialByID={materialByID}
                  canCreateMaterial={hasActionPermission(
                    adminProfile,
                    PermissionCode.MATERIAL_CREATE
                  )}
                  onMaterialCreated={(material) =>
                    setMaterials((current) => [material, ...current])
                  }
                  materialOptions={materialOptions}
                  registerLineItemRow={registerLineItemRow}
                  requestLineItemScroll={requestLineItemScroll}
                  selectedVersionID={
                    headerMode === 'create' || headerMode === 'import'
                      ? undefined
                      : modalActionVersion?.id
                  }
                  unitOptions={unitOptions}
                />
              )}
            </BusinessFormSection>
          </BOMHeaderFormFields>
        </Form>
      </BusinessFormPage>

      {columnOrderModal}
    </BusinessPageLayout>
  )
}
