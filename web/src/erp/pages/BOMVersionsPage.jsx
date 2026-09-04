import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  PrinterOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Tag,
} from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
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
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
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
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
} from '../components/business-list/ColumnOrderModal.jsx'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import { BusinessHelpLabel } from '../components/help/BusinessContextHelp.jsx'
import BusinessLineItemsSection from '../components/business-list/BusinessLineItemsSection.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import { useLineItemAppendScroll } from '../components/business-list/useLineItemAppendScroll.mjs'
import {
  LIFECYCLE_SCOPE,
  filterLifecycleStatusOptions,
  lifecycleScopeFromSearchParams,
  lifecycleScopeIncludesStatus,
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
import {
  buildBOMItemSourceValuesFromMaterial,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { suggestNextBOMVersion } from '../utils/bomVersionSuggestion.mjs'
import {
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
import { createDuplicatedDraftLineItem } from '../utils/businessLineItems.mjs'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import {
  MAX_BOM_XLSX_FILE_BYTES,
  buildBOMImportDraft,
  getBOMImportDraftIssues,
  getBOMImportLineIssues,
  parseBOMXlsx,
} from '../utils/bomXlsxImport.mjs'
import {
  BOM_PRODUCTION_OPERATION_OPTIONS,
  bomProductionOperationLabel,
} from '../utils/bomProductionOperation.mjs'
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

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') return []
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
  if (typeof window === 'undefined') return
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
  if (sanitizedAccountOrder.length > 0) return sanitizedAccountOrder
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function createBlankBOMLine(headerID) {
  return {
    bom_header_id: headerID,
    material_id: undefined,
    production_operation_code: undefined,
    quantity: '',
    unit_id: undefined,
    loss_rate: '0',
    position: '',
    piece_count: '',
    total_usage_snapshot: '',
    process_base: '',
    process_method: '',
    note: '',
  }
}

function normalizeBOMLineForForm(headerID, item = {}) {
  return {
    id: item.id,
    bom_header_id: item.bom_header_id || headerID,
    material_id: item.material_id || undefined,
    production_operation_code: item.production_operation_code || undefined,
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

function BOMImportLineStatus({ fieldName, form }) {
  const materialID = Form.useWatch(['items', fieldName, 'material_id'], form)
  const unitID = Form.useWatch(['items', fieldName, 'unit_id'], form)
  const quantity = Form.useWatch(['items', fieldName, 'quantity'], form)
  const lossRate = Form.useWatch(['items', fieldName, 'loss_rate'], form)
  const source = form.getFieldValue(['items', fieldName, '_import_source'])
  if (!source) return null
  const issues = getBOMImportLineIssues({
    material_id: materialID,
    unit_id: unitID,
    quantity,
    loss_rate: lossRate,
    _import_source: source,
  })
  const sourceParts = [
    source.materialName || '未识别材料',
    source.materialSpec,
    source.color,
    source.unit,
  ].filter(Boolean)
  return (
    <div
      className="erp-bom-import-line-status"
      data-bom-import-row-status={issues.length > 0 ? 'unresolved' : 'matched'}
    >
      <span
        className="erp-bom-import-line-status__source"
        title={sourceParts.join(' / ')}
      >
        Excel 第 {source.rowNumber} 行 · {sourceParts.join(' / ')}
      </span>
      <Tag
        color={issues.length > 0 ? 'warning' : 'success'}
        title={issues.map((issue) => issue.message).join('；') || undefined}
      >
        {issues.length > 0 ? `待补全 ${issues.length} 项` : '已匹配'}
      </Tag>
    </div>
  )
}

function BOMImportReviewSummary({ issues, review }) {
  if (!review) return null
  const affectedRows = new Set(
    issues
      .filter((issue) => issue.scope === 'item')
      .map((issue) => issue.itemIndex)
  ).size
  const lossEvidence = review.lossEvidence || {}
  const issueText =
    issues.length > 0
      ? `待补全 ${issues.length} 项${
          affectedRows > 0 ? `，涉及 ${affectedRows} 行` : ''
        }`
      : '明细已全部关联，可继续核对并保存'

  return (
    <Alert
      className="erp-business-source-summary erp-bom-import-review"
      data-bom-import-issue-count={issues.length}
      description={
        <div className="erp-bom-import-review__details">
          <span>
            来源：{review.fileName} / {review.sheetName}
          </span>
          <span>
            产品：{review.productCode || review.productName || '原表未填写'}，
            {review.productMatchLabel}
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

const BOMLineItemsForm = React.memo(
  ({
    canEdit,
    description,
    form,
    materialByID,
    materialOptions,
    registerLineItemRow,
    requestLineItemScroll,
    selectedVersionID,
    unitOptions,
  }) => {
    const footerRef = useRef(null)
    const footerScrollFrameRef = useRef(null)

    useEffect(() => {
      return () => {
        if (footerScrollFrameRef.current !== null) {
          window.cancelAnimationFrame(footerScrollFrameRef.current)
        }
      }
    }, [])

    const requestFooterScroll = useCallback(() => {
      if (footerScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(footerScrollFrameRef.current)
      }
      footerScrollFrameRef.current = window.requestAnimationFrame(() => {
        footerScrollFrameRef.current = null
        footerRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
          inline: 'nearest',
        })
      })
    }, [])

    return (
      <BusinessLineItemsSection
        className="erp-bom-modal-items"
        title="BOM 明细"
        description={description}
        emptyDescription={
          canEdit ? '暂无 BOM 明细，可在同一表单内新增' : '暂无 BOM 明细'
        }
        renderRow={({ add, field, fields, index, remove }) => {
          return (
            <div
              className="erp-sales-order-lines-form__row"
              key={field.key}
              ref={(node) => registerLineItemRow(index, node)}
            >
              <div className="erp-sales-order-lines-form__row-head">
                <div className="erp-bom-line-row-title">
                  <strong>第 {index + 1} 行</strong>
                  <BOMImportLineStatus fieldName={field.name} form={form} />
                </div>
                {canEdit ? (
                  <Space
                    className="erp-sales-order-lines-form__row-actions"
                    size={4}
                    wrap
                  >
                    <Button
                      aria-label={`复制第 ${index + 1} 行`}
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        const currentLines = form.getFieldValue('items') || []
                        const sourceLine =
                          currentLines[field.name] || currentLines[index] || {}
                        const duplicatedLine =
                          createDuplicatedDraftLineItem(sourceLine)
                        delete duplicatedLine._import_source
                        add(duplicatedLine, index + 1)
                        requestLineItemScroll(index + 1)
                      }}
                    >
                      复制行
                    </Button>
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      disabled={fields.length <= 1}
                      onClick={() => remove(field.name)}
                    >
                      移除行
                    </Button>
                  </Space>
                ) : null}
              </div>
              <div className="erp-sales-order-lines-form__grid">
                <Form.Item name={[field.name, 'id']} hidden>
                  <Input />
                </Form.Item>
                <Form.Item name={[field.name, 'bom_header_id']} hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--source"
                  label="材料"
                  name={[field.name, 'material_id']}
                  rules={[{ required: true, message: '请选择材料' }]}
                >
                  <Select
                    allowClear
                    disabled={!canEdit}
                    onChange={(value) => {
                      const materialID = Number(value || 0)
                      const material = materialByID.get(materialID)
                      const sourceValues =
                        buildBOMItemSourceValuesFromMaterial(material)
                      const currentItems = form.getFieldValue('items') || []
                      const nextItems = [...currentItems]
                      nextItems[field.name] = {
                        ...(currentItems[field.name] || {}),
                        ...sourceValues,
                      }
                      form.setFieldsValue({ items: nextItems })
                    }}
                    optionFilterProp="label"
                    options={materialOptions}
                    placeholder="请选择材料"
                    showSearch
                  />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--date"
                  label="生产工序归属"
                  name={[field.name, 'production_operation_code']}
                  extra="显式标记进入首道布料加工的材料；不按材料名称自动判断"
                >
                  <Select
                    allowClear
                    disabled={!canEdit}
                    options={BOM_PRODUCTION_OPERATION_OPTIONS}
                    placeholder="不指定"
                  />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--quantity"
                  label="材料用量"
                  name={[field.name, 'quantity']}
                  rules={[{ required: true, message: '请填写材料用量' }]}
                >
                  <Input allowClear autoComplete="off" disabled={!canEdit} />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--unit"
                  label="单位"
                  name={[field.name, 'unit_id']}
                  rules={[{ required: true, message: '请选择单位' }]}
                >
                  <Select
                    allowClear
                    disabled={!canEdit}
                    optionFilterProp="label"
                    options={unitOptions}
                    placeholder="请选择单位"
                    showSearch
                  />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--quantity"
                  label={
                    <BusinessHelpLabel
                      itemKey="loss-rate"
                      label="损耗率"
                      pageKey="material-bom"
                    />
                  }
                  name={[field.name, 'loss_rate']}
                  rules={[{ required: true, message: '请填写损耗率' }]}
                >
                  <Input allowClear autoComplete="off" disabled={!canEdit} />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--date"
                  label="部位"
                  name={[field.name, 'position']}
                >
                  <Input allowClear autoComplete="off" disabled={!canEdit} />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--quantity"
                  label="片数"
                  name={[field.name, 'piece_count']}
                >
                  <Input allowClear autoComplete="off" disabled={!canEdit} />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--quantity"
                  label="总用量"
                  name={[field.name, 'total_usage_snapshot']}
                >
                  <Input
                    allowClear
                    autoComplete="off"
                    disabled={!canEdit}
                    placeholder="含损耗总用量"
                  />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--date"
                  label="加工基础"
                  name={[field.name, 'process_base']}
                >
                  <Input allowClear autoComplete="off" disabled={!canEdit} />
                </Form.Item>
                <Form.Item
                  className="erp-line-item-field erp-line-item-field--date"
                  label="加工方式"
                  name={[field.name, 'process_method']}
                >
                  <Input allowClear autoComplete="off" disabled={!canEdit} />
                </Form.Item>
                <Form.Item
                  className="erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note"
                  label="备注"
                  name={[field.name, 'note']}
                >
                  <Input.TextArea
                    allowClear
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    disabled={!canEdit}
                    maxLength={300}
                    showCount
                  />
                </Form.Item>
              </div>
            </div>
          )
        }}
        footerProps={({ add, fields }) => ({
          addLabel: '添加条目',
          addDisabled: !canEdit,
          onAdd: canEdit
            ? () => {
                const currentLines = form.getFieldValue('items') || []
                const nextIndex = Array.isArray(currentLines)
                  ? currentLines.length
                  : 0
                add(createBlankBOMLine(selectedVersionID))
                requestLineItemScroll(nextIndex)
                requestFooterScroll()
              }
            : undefined,
          ref: footerRef,
          stats: [
            {
              key: 'count',
              label: '已录入',
              value: Array.isArray(fields) ? fields.length : 0,
              suffix: '条',
            },
          ],
        })}
      />
    )
  }
)

export default function BOMVersionsPage() {
  const outletContext = useOutletContext()
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
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printingTemplateKey, setPrintingTemplateKey] = useState('')
  const [keyword, setKeyword] = useState(
    () => searchParams.get('keyword') || ''
  )
  const [lifecycleScope, setLifecycleScope] = useState(() =>
    lifecycleScopeFromSearchParams(searchParams)
  )
  const [status, setStatus] = useState(() => searchParams.get('status') || '')
  const [productID, setProductID] = useState(() => {
    const value = Number(searchParams.get('product_id') || 0)
    return Number.isSafeInteger(value) && value > 0 ? value : undefined
  })
  const [versions, setVersions] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const selectedRowKeysRef = useRef([])
  const itemsPreviewGenerationRef = useRef(0)
  const headerAttachmentRef = useRef(null)
  const importFileInputRef = useRef(null)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [headerMode, setHeaderMode] = useState('create')
  const [importing, setImporting] = useState(false)
  const [importReview, setImportReview] = useState(null)
  const [, setImportFormRevision] = useState(0)
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

  const canRead = hasActionPermission(adminProfile, 'bom.read')
  const canCreate = hasActionPermission(adminProfile, 'bom.create')
  const canUpdate = hasActionPermission(adminProfile, 'bom.update')
  const canActivate = hasActionPermission(adminProfile, 'bom.activate')
  const canPrint = hasActionPermission(adminProfile, 'erp.print_template.read')
  const printPermissionHint = canPrint
    ? undefined
    : '当前账号没有打印模板的权限。'
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
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
    () => uniqueReferenceOptions(materials, materialOption),
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
  const importIssues = importReview
    ? getBOMImportDraftIssues(headerForm.getFieldsValue(true))
    : []
  const bomItemsPreview = useBusinessRowItemsPreview({
    records: versions,
    getItemTotal: (record) => record?.item_count,
    rowExpandable: (record) =>
      canRead && Number.isSafeInteger(record?.id) && record.id > 0,
    getCacheKey: (record) =>
      `${record?.id}:${record?.version || record?.updated_at || 'current'}:${itemsPreviewGenerationRef.current}`,
    getRecordLabel: (record) =>
      record?.version ? `BOM ${record.version}` : '当前 BOM 版本',
    loadPreview: async (record) => {
      const detail = await getBOMVersion({ id: record.id })
      const items = Array.isArray(detail?.items) ? detail.items : []
      return { items, total: items.length }
    },
    getItemKey: (item) => item?.id,
    getItemLabel: (_item, { index }) => `明细 ${index + 1}`,
    getItemSummary: (item) =>
      `用量 ${item?.quantity || '-'} ${referenceLabel(unitOptions, item?.unit_id, '单位')}`,
    getItemFields: (item, { view }) => [
      {
        key: 'material',
        label: '材料',
        value: referenceLabel(materialOptions, item?.material_id, '材料'),
        wide: true,
      },
      {
        key: 'production_operation',
        label: '生产工序归属',
        value: bomProductionOperationLabel(item?.production_operation_code),
      },
      {
        key: 'quantity',
        label: '材料用量',
        value: item?.quantity || '-',
      },
      {
        key: 'unit',
        label: '单位',
        value: referenceLabel(unitOptions, item?.unit_id, '单位'),
      },
      {
        key: 'loss_rate',
        label: '损耗率',
        value: item?.loss_rate || '0',
      },
      { key: 'position', label: '部位', value: item?.position || '-' },
      { key: 'piece_count', label: '片数', value: item?.piece_count || '-' },
      {
        key: 'total_usage',
        label: '总用量',
        value: item?.total_usage_snapshot || '-',
      },
      {
        key: 'process_base',
        label: '加工基础',
        value: item?.process_base || '-',
      },
      {
        key: 'process_method',
        label: '加工方式',
        value: item?.process_method || '-',
      },
      ...(view === 'modal'
        ? [
            {
              key: 'note',
              label: '备注',
              value: item?.note || '-',
              wide: true,
            },
          ]
        : []),
    ],
    modalTitle: 'BOM 完整明细',
  })
  const primeBOMItemsPreview = bomItemsPreview.prime
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
        const items = Array.isArray(detail?.items) ? detail.items : []
        if (detail?.id) {
          primeBOMItemsPreview(detail, { items, total: items.length })
        }
        setSelectedVersion(detail)
        return detail
      } catch (error) {
        if (isRpcAbortError(error) || !request.isCurrent()) {
          return null
        }
        message.error(getActionErrorMessage(error, '加载 BOM 详情'))
        return null
      } finally {
        if (request.isCurrent()) {
          setDetailLoading(false)
          request.finish()
        }
      }
    },
    [beginLatestRequest, primeBOMItemsPreview]
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
      itemsPreviewGenerationRef.current += 1
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
      message.error(getActionErrorMessage(error, '加载 BOM 版本'))
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
        listAllProducts({ active_only: true }),
        listAllMaterials({ active_only: true }),
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
      message.error(getActionErrorMessage(error, '加载物料清单相关资料'))
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
  }, [headerModalOpen, headerMode, headerProductIDForSuggestion])

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
      const detail =
        selectedVersion?.id === activeActionVersion.id &&
        Array.isArray(selectedVersion?.items)
          ? selectedVersion
          : await loadDetail(activeActionVersion.id)
      if (!detail) return
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
        productOptions,
        products,
        materials,
        units,
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
          ? `已读取 ${draft.review.rowCount} 条明细，请先补全 ${issues.length} 项`
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

  const openCreate = () => {
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
    })
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const fillHeaderForm = (record) => {
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

  const openEdit = async (record = selectedVersion) => {
    if (!record?.id || !canEditBOM(record)) return
    headerAttachmentRef.current?.clearPendingAttachments()
    setImportReview(null)
    applySelectedRowKeys([record.id])
    const detail = await loadDetail(record.id)
    if (!detail?.id || !Array.isArray(detail.items)) {
      return
    }
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
    const nextVersionSuggestion = suggestNextBOMVersion(
      versions,
      record.product_id
    )
    setHeaderMode('copy')
    headerForm.resetFields()
    headerForm.setFieldsValue({
      product_id: record.product_id,
      version: nextVersionSuggestion || `${record.version || 'V'}-COPY`,
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
    if (headerMode === 'import') {
      const issues = getBOMImportDraftIssues(headerForm.getFieldsValue(true))
      if (issues.length > 0) {
        const firstLineIssue = issues.find((issue) => issue.scope === 'item')
        if (firstLineIssue) {
          requestLineItemScroll(firstLineIssue.itemIndex)
        } else {
          headerForm.scrollToField([issues[0].field], {
            block: 'center',
          })
        }
        message.warning(`还有 ${issues.length} 项导入内容需要补全，暂未保存`)
        return
      }
    }

    let values
    try {
      values = await headerForm.validateFields()
    } catch {
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
              ? 'BOM 草稿已更新'
              : headerMode === 'import'
                ? 'BOM 导入草稿已创建'
                : 'BOM 草稿已创建'
          : 'BOM 草稿已保存，未上传的附件请重新选择'
      )
      headerAttachmentRef.current?.clearPendingAttachments()
      setImportReview(null)
      setHeaderModalOpen(false)
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

  const activateSelected = async () => {
    if (
      !activeActionVersion?.id ||
      selectedRowKeys.length !== 1 ||
      !canActivateBOM(activeActionVersion)
    ) {
      return
    }
    setSaving(true)
    try {
      const next = await activateBOMVersion({ id: activeActionVersion.id })
      message.success('BOM 版本已激活，旧激活版本已设为历史版本')
      setSelectedVersion(next || activeActionVersion)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '激活 BOM 版本'))
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

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(BOM_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: BOM_MODULE_KEY,
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
    [outletContext]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: BOM_MODULE_KEY,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns]
  )

  const orderedDataColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [dataColumns, preferredColumnOrder]
  )

  const columns = useMemo(
    () =>
      orderedDataColumns.map((column) => ({
        ...column,
        title: (
          <ColumnOrderHeaderMenu
            column={column}
            columns={dataColumns}
            order={preferredColumnOrder}
            saving={columnOrderSaving}
            onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
            onOpenPanel={() => setColumnOrderOpen(true)}
          />
        ),
      })),
    [
      columnOrderSaving,
      dataColumns,
      orderedDataColumns,
      persistColumnOrder,
      preferredColumnOrder,
    ]
  )
  const exportColumns = useMemo(
    () => [
      ...orderedDataColumns,
      { title: '订单数量', dataIndex: 'quantity_text' },
      { title: '备品', dataIndex: 'spare_text' },
      { title: '制表', dataIndex: 'maker' },
      { title: '审核', dataIndex: 'auditor' },
      { title: '毛向', dataIndex: 'hair_direction' },
    ],
    [orderedDataColumns]
  )
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
    columns: exportColumns,
    recordLabel: '物料清单',
  })

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      productID ||
      lifecycleScope !== LIFECYCLE_SCOPE.CURRENT ||
      status
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setProductID(undefined)
    setLifecycleScope(LIFECYCLE_SCOPE.CURRENT)
    setStatus('')
    setSearchParams(new URLSearchParams(), { replace: true })
    resetBusinessPaginationCurrent(setPagination)
  }, [setSearchParams])

  return (
    <BusinessPageLayout>
      <PageHeaderCard
        compact
        helpKey="material-bom"
        title="物料清单（BOM）"
        description="维护产品工程资料版本、材料用量、损耗率和生效规则。"
        stats={[
          { key: 'total', label: '物料清单总数', value: total },
          { key: 'current', label: '本页显示', value: versions.length },
          {
            key: 'active',
            label: '已生效',
            value: versions.filter((item) => item.status === 'ACTIVE').length,
          },
        ]}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索 BOM 版本"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadVersions}
            />
            <Select
              allowClear
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
            <ToolbarButton
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={loading || exporting || total === 0}
              onClick={exportVersions}
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
              onClick={openCreate}
            >
              新建草稿
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRowKeys.length}
          selectedLabel={selectedLabel}
          selectedItems={selectedItems}
          boundaryText="已激活版本需复制为新草稿后修改；历史版本可以重新激活。"
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
                编辑草稿
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {canCreate ? (
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
              disabled={
                selectedRowKeys.length !== 1 ||
                !canActivateBOM(activeActionVersion) ||
                saving
              }
              disabledReason={
                selectedRowKeys.length !== 1
                  ? '请先选择一个 BOM 版本'
                  : !canActivateBOM(activeActionVersion)
                    ? '当前 BOM 版本不能激活'
                    : saving
                      ? '当前操作完成后可激活'
                      : ''
              }
            >
              <Popconfirm
                title="激活该 BOM 版本？同产品当前生效版本会设为历史版本。"
                okText="激活"
                cancelText="取消"
                onConfirm={activateSelected}
              >
                <Button
                  data-business-action-key="activate"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  disabled={
                    selectedRowKeys.length !== 1 ||
                    !canActivateBOM(activeActionVersion) ||
                    saving
                  }
                >
                  激活
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {canUpdate ? (
            <BusinessActionTooltip
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
                title="将该 BOM 版本设为历史版本？后续仍可重新激活。"
                okText="设为历史版本"
                cancelText="取消"
                onConfirm={archiveSelected}
              >
                <Button
                  data-business-action-key="archive"
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
        expandable={bomItemsPreview.expandable}
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
      {bomItemsPreview.modal}

      <BusinessFormModal
        open={headerModalOpen}
        forceRender
        destroyOnHidden={false}
        title={
          headerMode === 'copy'
            ? '复制 BOM 新版本'
            : headerMode === 'edit'
              ? '编辑 BOM 草稿'
              : headerMode === 'view'
                ? '查看 BOM 版本'
                : headerMode === 'import'
                  ? '检查并保存导入草稿'
                  : '新建 BOM 草稿'
        }
        description="BOM 只维护产品结构和材料用量，库存、采购或成本变动请到对应业务页面处理。"
        okText={headerMode === 'import' ? '保存为草稿' : '保存'}
        cancelText="取消"
        confirmLoading={saving || detailLoading}
        onOk={saveHeader}
        onCancel={() => {
          headerAttachmentRef.current?.clearPendingAttachments()
          setImportReview(null)
          setHeaderModalOpen(false)
        }}
        footer={
          headerMode === 'view' ? (
            <Button
              onClick={() => {
                setHeaderModalOpen(false)
              }}
            >
              关闭
            </Button>
          ) : undefined
        }
      >
        <Form
          form={headerForm}
          layout="vertical"
          className="erp-business-action-form"
          onValuesChange={(changedValues) => {
            if (headerMode === 'import') {
              setImportFormRevision((current) => current + 1)
            }
            if (
              Object.prototype.hasOwnProperty.call(changedValues, 'product_id')
            ) {
              setHeaderProductIDForSuggestion(changedValues.product_id)
            }
          }}
        >
          <BOMHeaderFormFields
            form={headerForm}
            includeProduct
            disabled={headerMode === 'view'}
            productDisabled={headerMode === 'edit'}
            productOptions={productOptions}
            versionSuggestion={headerVersionSuggestion}
            versionSuggestionLoading={headerVersionCandidates.loading}
            onUseVersionSuggestion={useHeaderVersionSuggestion}
          />
          {headerMode === 'import' ? (
            <BOMImportReviewSummary
              issues={importIssues}
              review={importReview}
            />
          ) : null}
          <BusinessAttachmentPanel
            ref={headerAttachmentRef}
            ownerType="bom_header"
            ownerId={
              headerMode === 'edit' || headerMode === 'view'
                ? activeActionVersion?.id || selectedVersion?.id
                : undefined
            }
            title="BOM 附件"
            description="上传色卡、SOP、工艺图片或材料清单来源文件；附件不会改变库存、采购或成本记录。"
            canUpload={
              headerMode !== 'view' &&
              (headerMode === 'edit' ? modalActionCanEdit : canCreate)
            }
            canWithdraw={
              headerMode !== 'view' &&
              (headerMode === 'edit' ? modalActionCanEdit : canCreate)
            }
            variant="inline"
          />
          {headerMode === 'copy' ? (
            <p className="erp-business-selection-action-bar__hint">
              保存复制草稿后，可在编辑 BOM 草稿弹窗内原地维护材料明细。
            </p>
          ) : (
            <BOMLineItemsForm
              canEdit={
                headerMode === 'create' || headerMode === 'import'
                  ? canCreate
                  : modalActionCanEdit
              }
              description={
                headerMode === 'import'
                  ? '逐行核对材料、单位、单位用量和损耗率；待补全项修正后才能保存。'
                  : headerMode === 'create'
                    ? '新建草稿时可先录入材料明细，保存后一起写入当前 BOM 草稿。'
                    : '在当前弹窗内维护材料、用量、损耗率和备注。'
              }
              form={headerForm}
              materialByID={materialByID}
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
        </Form>
      </BusinessFormModal>

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="物料清单列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />
    </BusinessPageLayout>
  )
}
