import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
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
  DateInput,
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
import {
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'
import {
  dateInputNotAfterRule,
  dateInputNotBeforeRule,
  isDateInputAfter,
  isDateInputBefore,
} from '../utils/dateRange.mjs'
import {
  applyBusinessColumnSorters,
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

const BOM_MODULE_KEY = 'material-bom'
const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已激活', value: 'ACTIVE' },
  { label: '历史版本', value: 'ARCHIVED' },
  { label: '已停用', value: 'DISABLED' },
]

const STATUS_LABELS = {
  DRAFT: '草稿',
  ACTIVE: '已激活',
  ARCHIVED: '历史版本',
  DISABLED: '已停用',
}

const STATUS_COLORS = {
  DRAFT: 'gold',
  ACTIVE: 'green',
  ARCHIVED: 'default',
  DISABLED: 'red',
}

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

function statusTag(status) {
  const key = String(status || '')
    .trim()
    .toUpperCase()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || key || '-'}
    </Tag>
  )
}

function unixToDateInputValue(value) {
  if (!value) return ''
  const date = new Date(Number(value) * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function dateInputToParam(value) {
  return value ? String(value) : undefined
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCSV({ filename, rows }) {
  const header = [
    '产品ID',
    'BOM版本',
    '状态',
    '生效开始',
    '生效结束',
    '备注',
    '更新时间',
  ]
  const body = rows.map((row) => [
    row.product_id,
    row.version,
    STATUS_LABELS[row.status] || row.status,
    formatUnixDate(row.effective_from),
    formatUnixDate(row.effective_to),
    row.note || '',
    formatUnixDateTime(row.updated_at),
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

function buildHeaderParams(values = {}, extra = {}) {
  return {
    ...extra,
    product_id: Number(values.product_id || extra.product_id || 0),
    version: String(values.version || '').trim(),
    effective_from: dateInputToParam(values.effective_from),
    effective_to: dateInputToParam(values.effective_to),
    note: values.note ? String(values.note).trim() : undefined,
  }
}

function buildItemParams(values = {}, extra = {}) {
  return {
    ...extra,
    bom_header_id: Number(values.bom_header_id || extra.bom_header_id || 0),
    material_id: Number(values.material_id || 0),
    quantity: String(values.quantity || '').trim(),
    unit_id: Number(values.unit_id || 0),
    loss_rate: String(values.loss_rate ?? '0').trim(),
    position: values.position ? String(values.position).trim() : undefined,
    note: values.note ? String(values.note).trim() : undefined,
  }
}

function HeaderFormFields({
  form,
  includeProduct = true,
  disabled = false,
  productOptions = [],
  versionSuggestion = '',
  versionSuggestionLoading = false,
  onUseVersionSuggestion,
}) {
  const effectiveFrom = Form.useWatch('effective_from', form)
  const effectiveTo = Form.useWatch('effective_to', form)
  const disableEffectiveFromOnOrAfterEnd = useCallback(
    (current) =>
      isDateInputAfter(current, effectiveTo, {
        allowSameDay: false,
      }),
    [effectiveTo]
  )
  const disableEffectiveToOnOrBeforeStart = useCallback(
    (current) =>
      isDateInputBefore(current, effectiveFrom, {
        allowSameDay: false,
      }),
    [effectiveFrom]
  )
  let versionHint = null
  if (!disabled) {
    if (versionSuggestionLoading) {
      versionHint = '正在读取同产品已有 BOM 版本...'
    } else if (versionSuggestion) {
      versionHint = (
        <Space size={4} wrap>
          <span>建议使用下一个版本号</span>
          <Button size="small" type="link" onClick={onUseVersionSuggestion}>
            {versionSuggestion}
          </Button>
          <span>，也可手动填写。</span>
        </Space>
      )
    } else {
      versionHint =
        '先选择产品，系统会建议下一个版本号；也可手动填写打样版 A 等自定义版本。'
    }
  }

  return (
    <>
      {includeProduct ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="产品"
          name="product_id"
          rules={[{ required: true, message: '请选择产品' }]}
        >
          <Select
            allowClear
            disabled={disabled}
            optionFilterProp="label"
            options={productOptions}
            placeholder="请选择产品"
            showSearch
          />
        </Form.Item>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="BOM 版本"
        name="version"
        rules={[{ required: true, message: '请填写 BOM 版本' }]}
      >
        <Input
          allowClear
          autoComplete="off"
          disabled={disabled}
          placeholder="例如 V1、V2、打样版 A"
        />
      </Form.Item>
      {versionHint ? (
        <div className="erp-business-action-form__field erp-business-action-form__field--full">
          <span className="erp-business-selection-action-bar__hint">
            {versionHint}
          </span>
        </div>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="生效开始"
        name="effective_from"
        rules={[
          dateInputNotAfterRule({
            getEndValue: () => form.getFieldValue('effective_to'),
            message: '生效开始必须早于生效结束',
            allowSameDay: false,
          }),
        ]}
      >
        <DateInput
          disabled={disabled}
          disabledDate={
            effectiveTo ? disableEffectiveFromOnOrAfterEnd : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        dependencies={['effective_from']}
        label="生效结束"
        name="effective_to"
        rules={[
          dateInputNotBeforeRule({
            getStartValue: () => form.getFieldValue('effective_from'),
            message: '生效结束必须晚于生效开始',
            allowSameDay: false,
          }),
        ]}
      >
        <DateInput
          disabled={disabled}
          disabledDate={
            effectiveFrom ? disableEffectiveToOnOrBeforeStart : undefined
          }
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea
          allowClear
          disabled={disabled}
          rows={3}
          showCount
          maxLength={300}
        />
      </Form.Item>
    </>
  )
}

function ItemFormFields({ materialOptions = [], unitOptions = [] }) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料"
        name="material_id"
        rules={[{ required: true, message: '请选择材料' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={materialOptions}
          placeholder="请选择材料"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料用量"
        name="quantity"
        rules={[{ required: true, message: '请填写材料用量' }]}
      >
        <Input autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单位"
        name="unit_id"
        rules={[{ required: true, message: '请选择单位' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={unitOptions}
          placeholder="请选择单位"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="损耗率"
        name="loss_rate"
        rules={[{ required: true, message: '请填写损耗率' }]}
      >
        <Input autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="部位"
        name="position"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea allowClear rows={3} showCount maxLength={300} />
      </Form.Item>
    </>
  )
}

export default function BOMVersionsPage() {
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
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
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
  const [headerForm] = Form.useForm()
  const [itemForm] = Form.useForm()
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
    label: record.version || `BOM ${record.id}`,
    title: `${referenceLabel(productOptions, record.product_id, '产品')} / ${
      STATUS_LABELS[record.status] || record.status || '-'
    }`,
  }))
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
    setHeaderMode('create')
    headerForm.resetFields()
    headerForm.setFieldsValue({ effective_from: '', effective_to: '' })
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
      note: record.note || '',
    })
  }

  const openView = async (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('view')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openEdit = async (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('edit')
    fillHeaderForm(detail)
    setHeaderProductIDForSuggestion(undefined)
    setHeaderModalOpen(true)
  }

  const openCopy = (record = selectedVersion) => {
    if (!record?.id) return
    headerAttachmentRef.current?.clearPendingAttachments()
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
      note: '',
    })
    setHeaderProductIDForSuggestion(record.product_id)
    setHeaderModalOpen(true)
  }

  const saveHeader = async () => {
    const values = await headerForm.validateFields()
    setSaving(true)
    try {
      let savedVersion = null
      if (headerMode === 'copy') {
        savedVersion = await copyBOMVersion(
          buildHeaderParams(values, { source_id: activeActionVersion?.id })
        )
      } else if (headerMode === 'edit') {
        savedVersion = await updateBOMDraft(
          buildHeaderParams(values, { id: activeActionVersion?.id })
        )
      } else {
        savedVersion = await createBOMDraft(buildHeaderParams(values))
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
      setHeaderModalOpen(false)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const openCreateItem = () => {
    if (!activeActionVersion?.id || selectedRowKeys.length !== 1) {
      message.warning('请先选择一个 BOM 版本')
      return
    }
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({
      bom_header_id: activeActionVersion.id,
      quantity: '',
      loss_rate: '0',
    })
    setItemModalOpen(true)
  }

  const openEditItem = useCallback(
    (item) => {
      if (!item?.id) return
      setEditingItem(item)
      itemForm.resetFields()
      itemForm.setFieldsValue({
        material_id: item.material_id,
        quantity: item.quantity,
        unit_id: item.unit_id,
        loss_rate: item.loss_rate,
        position: item.position || '',
        note: item.note || '',
      })
      setItemModalOpen(true)
    },
    [itemForm]
  )

  const saveItem = async () => {
    const values = await itemForm.validateFields()
    setSaving(true)
    try {
      if (editingItem?.id) {
        await updateBOMItem(buildItemParams(values, { id: editingItem.id }))
        message.success('BOM 明细已更新')
      } else {
        await addBOMItem(
          buildItemParams(values, { bom_header_id: activeActionVersion?.id })
        )
        message.success('BOM 明细已添加')
      }
      setItemModalOpen(false)
      await loadDetail(activeActionVersion?.id)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 明细'))
    } finally {
      setSaving(false)
    }
  }

  const removeItem = useCallback(
    async (item) => {
      setSaving(true)
      try {
        await deleteBOMItem({ id: item.id })
        message.success('BOM 明细已移除')
        await loadDetail(activeActionVersion?.id)
        await loadVersions()
      } catch (error) {
        message.error(getActionErrorMessage(error, '移除 BOM 明细'))
      } finally {
        setSaving(false)
      }
    },
    [activeActionVersion?.id, loadDetail, loadVersions]
  )

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
    () =>
      applyBusinessColumnSorters([
        {
          title: '产品',
          exportTitle: '产品',
          dataIndex: 'product_id',
          width: 180,
          sortType: 'number',
          sorter: (a, b) =>
            Number(a?.product_id || 0) - Number(b?.product_id || 0),
          render: (value) => referenceLabel(productOptions, value, '产品'),
          exportValue: (record) =>
            referenceLabel(productOptions, record?.product_id, '产品'),
        },
        {
          title: 'BOM 版本',
          exportTitle: 'BOM 版本',
          dataIndex: 'version',
          width: 180,
          sorter: (a, b) =>
            String(a?.version || '').localeCompare(String(b?.version || '')),
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'status',
          width: 110,
          sortValue: (record) => STATUS_LABELS[record.status] || record.status,
          render: statusTag,
          exportValue: (record) =>
            STATUS_LABELS[record.status] || record.status,
        },
        {
          title: '生效开始',
          exportTitle: '生效开始',
          dataIndex: 'effective_from',
          width: 130,
          sortType: 'date',
          render: formatUnixDate,
          exportValue: (record) => formatUnixDate(record.effective_from),
        },
        {
          title: '生效结束',
          exportTitle: '生效结束',
          dataIndex: 'effective_to',
          width: 130,
          sortType: 'date',
          render: formatUnixDate,
          exportValue: (record) => formatUnixDate(record.effective_to),
        },
        {
          title: '备注',
          exportTitle: '备注',
          dataIndex: 'note',
          width: 220,
          sortable: false,
          render: (value) => value || '-',
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 160,
          render: formatUnixDateTime,
          sorter: (a, b) =>
            Number(a?.updated_at || 0) - Number(b?.updated_at || 0),
          exportValue: (record) => formatUnixDateTime(record.updated_at),
        },
      ]),
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

  const itemColumns = useMemo(
    () => [
      {
        title: '材料',
        dataIndex: 'material_id',
        width: 180,
        render: (value) => referenceLabel(materialOptions, value, '材料'),
      },
      { title: '用量', dataIndex: 'quantity', width: 110 },
      {
        title: '单位',
        dataIndex: 'unit_id',
        width: 100,
        render: (value) => referenceLabel(unitOptions, value, '单位'),
      },
      { title: '损耗率', dataIndex: 'loss_rate', width: 110 },
      {
        title: '部位',
        dataIndex: 'position',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '备注',
        dataIndex: 'note',
        width: 180,
        render: (value) => value || '-',
      },
      {
        title: '操作',
        dataIndex: 'actions',
        width: 150,
        fixed: 'right',
        render: (_, item) =>
          activeActionCanEdit ? (
            <Space size={8}>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditItem(item)}
              >
                编辑
              </Button>
              <Popconfirm
                title="移除这条 BOM 明细？"
                okText="移除"
                cancelText="取消"
                onConfirm={() => removeItem(item)}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  移除
                </Button>
              </Popconfirm>
            </Space>
          ) : (
            <Tag>只读</Tag>
          ),
      },
    ],
    [
      activeActionCanEdit,
      materialOptions,
      openEditItem,
      removeItem,
      unitOptions,
    ]
  )

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
          { key: 'selected', label: '已选BOM', value: selectedRowKeys.length },
        ]}
      />

      <BusinessOperationPanel
        compact
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
              options={STATUS_OPTIONS}
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
                downloadCSV({ filename: 'bom-versions.csv', rows: versions })
              }
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
            icon={<PlusOutlined />}
            disabled={selectedRowKeys.length !== 1 || !activeActionCanEdit}
            onClick={openCreateItem}
          >
            添加明细
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={selectedRowKeys.length !== 1 || !canCreate}
            onClick={() => openCopy(activeActionVersion)}
          >
            复制新版本
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
        description="BOM 只维护产品结构和材料用量，不写库存、采购或成本事实。"
        okText="保存"
        cancelText="取消"
        confirmLoading={saving || detailLoading}
        onOk={saveHeader}
        onCancel={() => {
          headerAttachmentRef.current?.clearPendingAttachments()
          setHeaderModalOpen(false)
        }}
        footer={
          headerMode === 'view' ? (
            <Button onClick={() => setHeaderModalOpen(false)}>关闭</Button>
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
          <HeaderFormFields
            form={headerForm}
            includeProduct={headerMode !== 'edit'}
            disabled={headerMode === 'view'}
            productOptions={productOptions}
            versionSuggestion={headerVersionSuggestion}
            versionSuggestionLoading={headerVersionCandidates.loading}
            onUseVersionSuggestion={useHeaderVersionSuggestion}
          />
        </Form>
        <BusinessAttachmentPanel
          ref={headerAttachmentRef}
          ownerType="bom_header"
          ownerId={
            headerMode === 'edit' || headerMode === 'view'
              ? activeActionVersion?.id || selectedVersion?.id
              : undefined
          }
          title="BOM 附件"
          description="上传色卡、SOP、工艺图片或材料清单来源文件；附件不写库存、采购或成本事实。"
          canUpload={headerMode !== 'view' && (canCreate || canUpdate)}
          canDelete={canUpdate}
          variant="inline"
        />
        {headerMode === 'create' ? (
          <p className="erp-business-selection-action-bar__hint">
            保存 BOM 草稿后，在同一 BOM 版本弹窗下方维护材料明细。
          </p>
        ) : (
          <section className="erp-master-contact-list erp-bom-modal-items">
            <div className="erp-master-contact-list__head">
              <strong>BOM 明细</strong>
              <Space wrap size={8}>
                <Tag>{selectedVersion?.items?.length || 0} 行</Tag>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={!activeActionCanEdit}
                  onClick={openCreateItem}
                >
                  添加明细
                </Button>
              </Space>
            </div>
            <Table
              loading={detailLoading}
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={
                Array.isArray(selectedVersion?.items)
                  ? selectedVersion.items
                  : []
              }
              pagination={false}
              scroll={{ x: 860 }}
              locale={{ emptyText: <Empty description="暂无 BOM 明细" /> }}
            />
          </section>
        )}
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

      <BusinessFormModal
        open={itemModalOpen}
        title={editingItem ? '编辑 BOM 明细' : '添加 BOM 明细'}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={saveItem}
        onCancel={() => setItemModalOpen(false)}
      >
        <Form
          form={itemForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <ItemFormFields
            materialOptions={materialOptions}
            unitOptions={unitOptions}
          />
        </Form>
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
