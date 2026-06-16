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
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
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
import {
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'

const BOM_MODULE_KEY = 'material-bom'
const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已激活', value: 'ACTIVE' },
  { label: '已归档', value: 'ARCHIVED' },
  { label: '已停用', value: 'DISABLED' },
]

const STATUS_LABELS = {
  DRAFT: '草稿',
  ACTIVE: '已激活',
  ARCHIVED: '已归档',
  DISABLED: '已停用',
}

const STATUS_COLORS = {
  DRAFT: 'gold',
  ACTIVE: 'green',
  ARCHIVED: 'default',
  DISABLED: 'red',
}

const BUSINESS_FORM_MODAL_WIDTH = 'min(960px, calc(100vw - 96px))'

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

function HeaderFormFields({ includeProduct = true, disabled = false }) {
  return (
    <>
      {includeProduct ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="产品 ID"
          name="product_id"
          rules={[{ required: true, message: '请填写产品 ID' }]}
        >
          <InputNumber
            disabled={disabled}
            min={1}
            precision={0}
            style={{ width: '100%' }}
          />
        </Form.Item>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="BOM 版本"
        name="version"
        rules={[{ required: true, message: '请填写 BOM 版本' }]}
      >
        <Input allowClear autoComplete="off" disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="生效开始"
        name="effective_from"
      >
        <DateInput disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="生效结束"
        name="effective_to"
      >
        <DateInput disabled={disabled} />
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

function ItemFormFields() {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料 ID"
        name="material_id"
        rules={[{ required: true, message: '请填写材料 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
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
        label="单位 ID"
        name="unit_id"
        rules={[{ required: true, message: '请填写单位 ID' }]}
      >
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
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
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [headerMode, setHeaderMode] = useState('create')
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [headerForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const canRead = hasActionPermission(adminProfile, 'bom.read')
  const canCreate = hasActionPermission(adminProfile, 'bom.create')
  const canUpdate = hasActionPermission(adminProfile, 'bom.update')
  const canActivate = hasActionPermission(adminProfile, 'bom.activate')

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

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

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
    title: `产品 ID ${record.product_id || '-'} / ${
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
    setHeaderMode('create')
    headerForm.resetFields()
    headerForm.setFieldsValue({ effective_from: '', effective_to: '' })
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
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('view')
    fillHeaderForm(detail)
    setHeaderModalOpen(true)
  }

  const openEdit = async (record = selectedVersion) => {
    if (!record?.id) return
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('edit')
    fillHeaderForm(detail)
    setHeaderModalOpen(true)
  }

  const openCopy = (record = selectedVersion) => {
    if (!record?.id) return
    setHeaderMode('copy')
    headerForm.resetFields()
    headerForm.setFieldsValue({
      product_id: record.product_id,
      version: `${record.version || 'V'}-COPY`,
      effective_from: '',
      effective_to: '',
      note: '',
    })
    setHeaderModalOpen(true)
  }

  const saveHeader = async () => {
    const values = await headerForm.validateFields()
    setSaving(true)
    try {
      if (headerMode === 'copy') {
        await copyBOMVersion(
          buildHeaderParams(values, { source_id: activeActionVersion?.id })
        )
        message.success('BOM 新版本已复制为草稿')
      } else if (headerMode === 'edit') {
        await updateBOMDraft(
          buildHeaderParams(values, { id: activeActionVersion?.id })
        )
        message.success('BOM 草稿已更新')
      } else {
        await createBOMDraft(buildHeaderParams(values))
        message.success('BOM 草稿已创建')
      }
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
        message.success('BOM 明细已删除')
        await loadDetail(activeActionVersion?.id)
        await loadVersions()
      } catch (error) {
        message.error(getActionErrorMessage(error, '删除 BOM 明细'))
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
      message.success('BOM 版本已激活，旧激活版本已归档')
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
          ? `已归档 ${archivableSelectedVersions.length} 个 BOM 版本`
          : 'BOM 版本已归档'
      )
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '归档 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const dataColumns = useMemo(
    () => [
      {
        title: '产品 ID',
        exportTitle: '产品 ID',
        dataIndex: 'product_id',
        width: 110,
        sorter: (a, b) =>
          Number(a?.product_id || 0) - Number(b?.product_id || 0),
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
        render: statusTag,
        exportValue: (record) => STATUS_LABELS[record.status] || record.status,
      },
      {
        title: '生效开始',
        exportTitle: '生效开始',
        dataIndex: 'effective_from',
        width: 130,
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record.effective_from),
      },
      {
        title: '生效结束',
        exportTitle: '生效结束',
        dataIndex: 'effective_to',
        width: 130,
        render: formatUnixDate,
        exportValue: (record) => formatUnixDate(record.effective_to),
      },
      {
        title: '备注',
        exportTitle: '备注',
        dataIndex: 'note',
        width: 220,
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
    ],
    []
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
      { title: '材料 ID', dataIndex: 'material_id', width: 100 },
      { title: '用量', dataIndex: 'quantity', width: 110 },
      { title: '单位 ID', dataIndex: 'unit_id', width: 90 },
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
                title="删除这条 BOM 明细？"
                okText="删除"
                cancelText="取消"
                onConfirm={() => removeItem(item)}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          ) : (
            <Tag>只读</Tag>
          ),
      },
    ],
    [activeActionCanEdit, openEditItem, removeItem]
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
            <InputNumber
              min={1}
              precision={0}
              placeholder="产品 ID"
              value={productID}
              onChange={(nextProductID) => {
                setProductID(nextProductID)
                resetBusinessPaginationCurrent(setPagination)
              }}
              style={{ width: 140 }}
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
            <Tooltip title="BOM 版本不走物理删除或回收站；需要退出使用时请归档所选版本。">
              <span>
                <ToolbarButton icon={<DeleteOutlined />} danger disabled>
                  批量删除
                </ToolbarButton>
              </span>
            </Tooltip>
            <Tooltip title="当前 BOM Version API 没有回收站主路径，归档是正式退出方式。">
              <span>
                <ToolbarButton icon={<InboxOutlined />} disabled>
                  回收站
                </ToolbarButton>
              </span>
            </Tooltip>
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
            title="激活该 BOM 版本？同产品旧 ACTIVE 版本会归档。"
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
            title="归档该 BOM 版本？"
            okText="归档"
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
              {selectedRowKeys.length > 1 ? '归档所选' : '归档'}
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

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        open={headerModalOpen}
        title={
          <div className="erp-business-action-modal__title">
            <span>
              {headerMode === 'copy'
                ? '复制 BOM 新版本'
                : headerMode === 'edit'
                  ? '编辑 BOM 草稿'
                  : headerMode === 'view'
                    ? '查看 BOM 版本'
                    : '新建 BOM 草稿'}
            </span>
            <small>
              BOM 只维护产品结构和材料用量，不写库存、采购或成本事实。
            </small>
          </div>
        }
        width={BUSINESS_FORM_MODAL_WIDTH}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving || detailLoading}
        onOk={saveHeader}
        onCancel={() => setHeaderModalOpen(false)}
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
        >
          <HeaderFormFields
            includeProduct={headerMode !== 'edit'}
            disabled={headerMode === 'view'}
          />
        </Form>
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
      </Modal>

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="BOM 管理列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onReset={() => persistColumnOrder([], dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <Modal
        open={itemModalOpen}
        title={editingItem ? '编辑 BOM 明细' : '添加 BOM 明细'}
        width={BUSINESS_FORM_MODAL_WIDTH}
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
          <ItemFormFields />
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
