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
} from '@ant-design/icons'
import { Button, Form, Input, Popconfirm, Select, Space } from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  activateBOMVersion,
  addBOMItem,
  archiveBOMVersion,
  copyBOMVersion,
  createBOMDraft,
  deleteBOMItem,
  getBOMVersion,
  listBOMVersions,
  updateBOMDraft,
  updateBOMItem,
} from '../api/bomApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  listMaterials,
  listProducts,
  listUnits,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
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
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import BusinessLineItemsSection from '../components/business-list/BusinessLineItemsSection.jsx'
import { useLineItemAppendScroll } from '../components/business-list/useLineItemAppendScroll.mjs'
import {
  BOM_MODULE_KEY,
  BOM_STATUS_OPTIONS,
  bomStatusText,
  buildBOMVersionColumns,
} from '../components/bom/BOMVersionColumns.jsx'
import {
  BOMHeaderFormFields,
  buildHeaderParams,
  buildItemParams,
  unixToDateInputValue,
} from '../components/bom/BOMVersionForms.jsx'
import {
  buildBOMItemSourceValuesFromMaterial,
  formatUnixDate,
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
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  openPrintWorkspaceWindow,
  resolveRuntimeCustomerPrintCompanyName,
} from '../utils/printWorkspace.js'
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

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCSV({ filename, rows, productOptions = [] }) {
  const header = [
    '产品',
    'BOM版本',
    '状态',
    '来源订单号',
    '订单数量',
    '备品',
    '制表日期',
    '设计师',
    '制表',
    '审核',
    '毛向',
    '生效开始',
    '生效结束',
    '备注',
  ]
  const body = rows.map((row) => [
    referenceLabel(productOptions, row.product_id, '产品'),
    row.version,
    bomStatusText(row.status),
    row.source_order_no || '',
    row.quantity_text || '',
    row.spare_text || '',
    formatUnixDate(row.print_date),
    row.designer || '',
    row.maker || '',
    row.auditor || '',
    row.hair_direction || '',
    formatUnixDate(row.effective_from),
    formatUnixDate(row.effective_to),
    row.note || '',
  ])
  const csv = [header, ...body]
    .map((line) => line.map(csvEscape).join(','))
    .join('\n')
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

function createBlankBOMLine(headerID) {
  return {
    bom_header_id: headerID,
    material_id: undefined,
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

const BOMLineItemsForm = React.memo(
  ({
    canEdit,
    description,
    form,
    materialByID,
    materialOptions,
    onRemoveSavedItem,
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
          const lineID = form.getFieldValue(['items', field.name, 'id'])

          return (
            <div
              className="erp-sales-order-lines-form__row"
              key={field.key}
              ref={(node) => registerLineItemRow(index, node)}
            >
              <div className="erp-sales-order-lines-form__row-head">
                <strong>第 {index + 1} 行</strong>
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
                        add(
                          createDuplicatedDraftLineItem(sourceLine),
                          index + 1
                        )
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
                      onClick={() => {
                        if (lineID) {
                          onRemoveSavedItem(lineID)
                        }
                        remove(field.name)
                      }}
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
                      form.setFieldValue(
                        ['items', field.name, 'material_id'],
                        sourceValues.material_id
                      )
                      form.setFieldValue(
                        ['items', field.name, 'unit_id'],
                        sourceValues.unit_id
                      )
                    }}
                    optionFilterProp="label"
                    options={materialOptions}
                    placeholder="请选择材料"
                    showSearch
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
                  label="损耗率"
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
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [productID, setProductID] = useState()
  const [versions, setVersions] = useState([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const selectedRowKeysRef = useRef([])
  const headerAttachmentRef = useRef(null)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [headerMode, setHeaderMode] = useState('create')
  const [removedItemIDs, setRemovedItemIDs] = useState([])
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
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
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
    [products]
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

  const loadDetail = useCallback(async (id) => {
    if (!id) return null
    setDetailLoading(true)
    try {
      const detail = await getBOMVersion({ id })
      setSelectedVersion(detail)
      return detail
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 详情'))
      return null
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const loadVersions = useCallback(async () => {
    if (!canRead) {
      setVersions([])
      setSelectedVersion(null)
      applySelectedRowKeys([])
      return false
    }
    setLoading(true)
    try {
      const result = await listBOMVersions({
        keyword,
        status,
        product_id: productID || undefined,
        ...getBusinessPaginationParams(pagination),
      })
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
        setSelectedVersion(null)
      }
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 版本'))
      return false
    } finally {
      setLoading(false)
    }
  }, [
    applySelectedRowKeys,
    canRead,
    keyword,
    loadDetail,
    pagination,
    productID,
    status,
  ])

  const loadReferenceOptions = useCallback(async () => {
    try {
      const [productResult, materialResult, unitResult] = await Promise.all([
        listProducts({ limit: 500, active_only: true }),
        listMaterials({ limit: 500, active_only: true }),
        listUnits({ limit: 500 }),
      ])
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 引用数据'))
      setProducts([])
      setMaterials([])
      setUnits([])
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
      (headerMode === 'create' || headerMode === 'copy') &&
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
    listBOMVersions({ product_id: nextProductID, limit: 200 })
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
  const activeActionCanEdit =
    activeActionVersion?.status === 'DRAFT' && canUpdate
  const modalActionVersion = selectedVersion || activeActionVersion
  const modalActionCanEdit =
    headerMode === 'edit' && modalActionVersion?.status === 'DRAFT' && canUpdate
  const archivableSelectedVersions = selectedVersions.filter(
    (record) => record?.status !== 'ARCHIVED'
  )
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
      const initialDraft = builder(detail, {
        productOptions,
        products,
        materials,
        units,
        companyName: resolveRuntimeCustomerPrintCompanyName(),
      })
      openPrintWorkspaceWindow(templateKey, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
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

  const openCreate = () => {
    headerAttachmentRef.current?.clearPendingAttachments()
    setRemovedItemIDs([])
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
    setRemovedItemIDs([])
    applySelectedRowKeys([record.id])
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('view')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openEdit = async (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    setRemovedItemIDs([])
    applySelectedRowKeys([record.id])
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('edit')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openCopy = (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    setRemovedItemIDs([])
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

  const syncBOMItems = async ({ bomHeaderID, items = [], removedIDs = [] }) => {
    const normalizedBOMHeaderID = Number(bomHeaderID || 0)
    if (!Number.isFinite(normalizedBOMHeaderID) || normalizedBOMHeaderID <= 0) {
      throw new Error('缺少 BOM 草稿编号，无法同步 BOM 明细')
    }
    const uniqueRemovedIDs = Array.from(
      new Set(
        (Array.isArray(removedIDs) ? removedIDs : [])
          .map((id) => Number(id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    )
    for (const id of uniqueRemovedIDs) {
      await deleteBOMItem({ id })
    }
    for (const item of Array.isArray(items) ? items : []) {
      const params = buildItemParams(item, {
        bom_header_id: normalizedBOMHeaderID,
      })
      if (item?.id) {
        await updateBOMItem({ ...params, id: item.id })
      } else {
        await addBOMItem(params)
      }
    }
  }

  const saveHeader = async () => {
    const values = await headerForm.validateFields()
    setSaving(true)
    try {
      let savedVersion = null
      if (headerMode === 'copy') {
        savedVersion = await copyBOMVersion(
          buildHeaderParams(values, { source_id: modalActionVersion?.id })
        )
      } else if (headerMode === 'edit') {
        savedVersion = await updateBOMDraft(
          buildHeaderParams(values, { id: modalActionVersion?.id })
        )
        await syncBOMItems({
          bomHeaderID: savedVersion?.id || modalActionVersion?.id,
          items: values.items,
          removedIDs: removedItemIDs,
        })
      } else {
        savedVersion = await createBOMDraft(buildHeaderParams(values))
        await syncBOMItems({
          bomHeaderID: savedVersion?.id,
          items: values.items,
          removedIDs: [],
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
              : 'BOM 草稿已创建'
          : 'BOM 草稿已保存，未上传的附件请重新选择'
      )
      headerAttachmentRef.current?.clearPendingAttachments()
      setRemovedItemIDs([])
      setHeaderModalOpen(false)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const activateSelected = async () => {
    if (!activeActionVersion?.id || selectedRowKeys.length !== 1) return
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
    if (archivableSelectedVersions.length === 0) return
    setSaving(true)
    try {
      for (const record of archivableSelectedVersions) {
        await archiveBOMVersion({ id: record.id })
      }
      message.success(
        archivableSelectedVersions.length > 1
          ? `已将 ${archivableSelectedVersions.length} 个 BOM 版本设为历史版本`
          : 'BOM 版本已设为历史版本'
      )
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '设为历史版本'))
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

  const hasActiveFilters = Boolean(keyword.trim() || productID || status)
  const clearFilters = useCallback(() => {
    setKeyword('')
    setProductID(undefined)
    setStatus('')
    resetBusinessPaginationCurrent(setPagination)
  }, [])

  return (
    <BusinessPageLayout>
      <PageHeaderCard
        compact
        title="BOM 管理"
        description="维护产品工程资料版本、材料用量、损耗率和生效边界。"
        stats={[
          { key: 'total', label: '总BOM', value: total },
          { key: 'current', label: '当前结果', value: versions.length },
          {
            key: 'active',
            label: '已激活',
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
            <SelectFilter
              value={status}
              options={BOM_STATUS_OPTIONS}
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
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={versions.length === 0}
              onClick={() =>
                downloadCSV({
                  filename: 'bom-versions.csv',
                  rows: versions,
                  productOptions,
                })
              }
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
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建草稿
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRowKeys.length}
          selectedLabel={selectedLabel}
          selectedItems={selectedItems}
        >
          <Button
            type="link"
            size="small"
            disabled={selectedRowKeys.length === 0}
            onClick={() => {
              applySelectedRowKeys([])
              setSelectedVersion(null)
            }}
          >
            清空已选
          </Button>
          <Button
            size="small"
            icon={<InboxOutlined />}
            disabled={selectedRowKeys.length !== 1}
            onClick={() => openView(activeActionVersion)}
          >
            查看
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={selectedRowKeys.length !== 1 || !activeActionCanEdit}
            onClick={() => openEdit(activeActionVersion)}
          >
            编辑草稿
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={selectedRowKeys.length !== 1 || !canCreate}
            onClick={() => openCopy(activeActionVersion)}
          >
            复制新版本
          </Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={
              selectedRowKeys.length !== 1 ||
              detailLoading ||
              printingTemplateKey !== ''
            }
            loading={printingTemplateKey === MATERIAL_DETAIL_TEMPLATE_KEY}
            onClick={() => openEngineeringPrint(MATERIAL_DETAIL_TEMPLATE_KEY)}
          >
            打印物料明细
          </Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={
              selectedRowKeys.length !== 1 ||
              detailLoading ||
              printingTemplateKey !== ''
            }
            loading={printingTemplateKey === COLOR_CARD_TEMPLATE_KEY}
            onClick={() => openEngineeringPrint(COLOR_CARD_TEMPLATE_KEY)}
          >
            打印色卡
          </Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={
              selectedRowKeys.length !== 1 ||
              detailLoading ||
              printingTemplateKey !== ''
            }
            loading={printingTemplateKey === WORK_INSTRUCTION_TEMPLATE_KEY}
            onClick={() => openEngineeringPrint(WORK_INSTRUCTION_TEMPLATE_KEY)}
          >
            打印作业指导书
          </Button>
          <Popconfirm
            title="激活该 BOM 版本？同产品当前生效版本会设为历史版本。"
            okText="激活"
            cancelText="取消"
            onConfirm={activateSelected}
          >
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              disabled={
                selectedRowKeys.length !== 1 ||
                !activeActionVersion ||
                !canActivate ||
                activeActionVersion.status === 'ACTIVE'
              }
            >
              激活
            </Button>
          </Popconfirm>
          <Popconfirm
            title="将该 BOM 版本设为历史版本？后续仍可重新激活。"
            okText="设为历史版本"
            cancelText="取消"
            onConfirm={archiveSelected}
          >
            <Button
              size="small"
              icon={<InboxOutlined />}
              disabled={
                selectedRowKeys.length === 0 ||
                !canUpdate ||
                archivableSelectedVersions.length === 0
              }
            >
              {selectedRowKeys.length > 1 ? '所选设为历史版本' : '设为历史版本'}
            </Button>
          </Popconfirm>
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
          onDoubleClick: () => {
            if (record.status === 'DRAFT' && canUpdate) {
              openEdit(record)
              return
            }
            openView(record)
          },
        })}
      />

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={selectedVersion?.version || ''}
      />

      <BusinessFormModal
        open={headerModalOpen}
        title={
          headerMode === 'copy'
            ? '复制 BOM 新版本'
            : headerMode === 'edit'
              ? '编辑 BOM 草稿'
              : headerMode === 'view'
                ? '查看 BOM 版本'
                : '新建 BOM 草稿'
        }
        description="BOM 只维护产品结构和材料用量，库存、采购或成本变动请到对应业务页面处理。"
        okText="保存"
        cancelText="取消"
        confirmLoading={saving || detailLoading}
        onOk={saveHeader}
        onCancel={() => {
          headerAttachmentRef.current?.clearPendingAttachments()
          setRemovedItemIDs([])
          setHeaderModalOpen(false)
        }}
        footer={
          headerMode === 'view' ? (
            <Button
              onClick={() => {
                setRemovedItemIDs([])
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
            if (
              Object.prototype.hasOwnProperty.call(changedValues, 'product_id')
            ) {
              setHeaderProductIDForSuggestion(changedValues.product_id)
            }
          }}
        >
          <BOMHeaderFormFields
            form={headerForm}
            includeProduct={headerMode !== 'edit'}
            disabled={headerMode === 'view'}
            productOptions={productOptions}
            versionSuggestion={headerVersionSuggestion}
            versionSuggestionLoading={headerVersionCandidates.loading}
            onUseVersionSuggestion={useHeaderVersionSuggestion}
          />
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
            canUpload={headerMode !== 'view' && (canCreate || canUpdate)}
            canDelete={canUpdate}
            variant="inline"
          />
          {headerMode === 'copy' ? (
            <p className="erp-business-selection-action-bar__hint">
              保存复制草稿后，可在编辑 BOM 草稿弹窗内原地维护材料明细。
            </p>
          ) : (
            <BOMLineItemsForm
              canEdit={headerMode === 'create' ? canCreate : modalActionCanEdit}
              description={
                headerMode === 'create'
                  ? '新建草稿时可先录入材料明细，保存后一起写入当前 BOM 草稿。'
                  : '在当前弹窗内维护材料、用量、损耗率和备注。'
              }
              form={headerForm}
              materialByID={materialByID}
              materialOptions={materialOptions}
              onRemoveSavedItem={(id) =>
                setRemovedItemIDs((current) =>
                  current.includes(id) ? current : [...current, id]
                )
              }
              registerLineItemRow={registerLineItemRow}
              requestLineItemScroll={requestLineItemScroll}
              selectedVersionID={
                headerMode === 'create' ? undefined : modalActionVersion?.id
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
        moduleTitle="BOM 管理列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />
    </BusinessPageLayout>
  )
}
