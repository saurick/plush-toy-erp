import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd'
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
import {
  createContact,
  createCustomer,
  createMaterial,
  createSupplier,
  listContactsByOwner,
  listCustomers,
  listMaterials,
  listSuppliers,
  setCustomerActive,
  setMaterialActive,
  setSupplierActive,
  updateCustomer,
  updateMaterial,
  updateSupplier,
} from '../api/masterDataOrderApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  buildContactParams,
  buildMasterDataParams,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const BUSINESS_FORM_MODAL_WIDTH = 'min(960px, calc(100vw - 96px))'

const PAGE_CONFIG = Object.freeze({
  customers: {
    title: '客户档案',
    ownerType: 'CUSTOMER',
    recordKey: 'customers',
    list: listCustomers,
    create: createCustomer,
    update: updateCustomer,
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
    entityLabel: '主体',
    formBoundary: '只维护交易主体资料，不在此写订单、库存或财务事实。',
    summary:
      '维护客户交易主体和联系人；订单、出货、库存和财务事实在对应业务模块处理。',
  },
  suppliers: {
    title: '供应商档案',
    ownerType: 'SUPPLIER',
    recordKey: 'suppliers',
    list: listSuppliers,
    create: createSupplier,
    update: updateSupplier,
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
    entityLabel: '主体',
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
    formBoundary: '只维护材料主数据，不在此写采购、库存、质检或 BOM 用量。',
    summary:
      '维护材料主数据；采购订单、库存余额、来料质检和 BOM 用量在对应业务模块处理。',
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

function MasterDataFormFields({ type }) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="编号"
        name="code"
        rules={[{ required: true, message: '请填写编号' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="名称"
        name="name"
        rules={[{ required: true, message: '请填写名称' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      {type === 'materials' ? null : (
        <Form.Item
          className="erp-business-action-form__field"
          label="简称"
          name="short_name"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
      )}
      {type === 'suppliers' ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="供应商类型"
          name="supplier_type"
        >
          <Select
            allowClear
            options={SUPPLIER_TYPE_OPTIONS}
            placeholder="请选择供应商类型"
          />
        </Form.Item>
      ) : null}
      {type === 'materials' ? (
        <>
          <Form.Item
            className="erp-business-action-form__field"
            label="分类"
            name="category"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="规格"
            name="spec"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="颜色"
            name="color"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="默认单位 ID"
            name="default_unit_id"
            rules={[{ required: true, message: '请填写默认单位 ID' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </>
      ) : (
        <Form.Item
          className="erp-business-action-form__field"
          label="税号"
          name="tax_no"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
      )}
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

function ContactFormFields() {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="联系人"
        name="name"
        rules={[{ required: true, message: '请填写联系人' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="职位"
        name="title"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="手机"
        name="mobile"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="电话"
        name="phone"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="邮箱"
        name="email"
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="主联系人"
        name="is_primary"
        valuePropName="checked"
      >
        <Switch />
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

export default function V1MasterDataPage({ type }) {
  const config = PAGE_CONFIG[type] || PAGE_CONFIG.customers
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const [loading, setLoading] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [contacts, setContacts] = useState([])
  const [recordModalOpen, setRecordModalOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleteReason, setBatchDeleteReason] = useState('')
  const [recycleOpen, setRecycleOpen] = useState(false)
  const [recycleSelectedRowKeys, setRecycleSelectedRowKeys] = useState([])
  const [editingRecord, setEditingRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [recordForm] = Form.useForm()
  const [contactForm] = Form.useForm()
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

  const loadContacts = useCallback(
    async (record) => {
      if (!supportsContacts || !record?.id) {
        setContacts([])
        return
      }
      setContactLoading(true)
      try {
        const result = await listContactsByOwner({
          owner_type: config.ownerType,
          owner_id: record.id,
          limit: 100,
        })
        setContacts(Array.isArray(result?.contacts) ? result.contacts : [])
      } catch (error) {
        message.error(getActionErrorMessage(error, '加载联系人'))
      } finally {
        setContactLoading(false)
      }
    },
    [config.ownerType, supportsContacts]
  )

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const result = await config.list({
        keyword,
        active_only: activeOnly,
        limit: 100,
      })
      const nextRecords = Array.isArray(result?.[config.recordKey])
        ? result[config.recordKey]
        : []
      setRecords(nextRecords)
      setTotal(Number(result?.total || nextRecords.length || 0))
      setSelectedRecord((current) => {
        if (!current?.id) return nextRecords[0] || null
        return (
          nextRecords.find((item) => item.id === current.id) ||
          nextRecords[0] ||
          null
        )
      })
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, `加载${config.title}`))
      return false
    } finally {
      setLoading(false)
    }
  }, [activeOnly, config, keyword])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  useEffect(() => {
    loadContacts(selectedRecord)
  }, [loadContacts, selectedRecord])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRecords)
  }, [loadRecords, outletContext])

  const openCreateRecord = () => {
    setEditingRecord(null)
    recordForm.resetFields()
    setRecordModalOpen(true)
  }

  const openEditRecord = (record) => {
    if (!record?.id) return
    setSelectedRecord(record)
    setDetailOpen(false)
    setEditingRecord(record)
    recordForm.setFieldsValue(record)
    setRecordModalOpen(true)
  }

  const openCreateContact = () => {
    if (!supportsContacts) {
      return
    }
    if (!selectedRecord?.id) {
      message.warning(`请先选择一个${entityLabel}`)
      return
    }
    contactForm.resetFields()
    contactForm.setFieldsValue({ is_primary: false })
    setContactModalOpen(true)
  }

  const saveRecord = async () => {
    const values = await recordForm.validateFields()
    setSaving(true)
    try {
      const params = buildMasterDataParams(
        values,
        editingRecord?.id ? { id: editingRecord.id } : {}
      )
      const saved = editingRecord?.id
        ? await config.update(params)
        : await config.create(params)
      message.success(editingRecord?.id ? '主数据已更新' : '主数据已创建')
      setRecordModalOpen(false)
      setSelectedRecord(saved || selectedRecord)
      await loadRecords()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存主数据'))
    } finally {
      setSaving(false)
    }
  }

  const saveContact = async () => {
    if (!supportsContacts || !selectedRecord?.id) return
    const values = await contactForm.validateFields()
    setSaving(true)
    try {
      const params = buildContactParams(values, {
        owner_type: config.ownerType,
        owner_id: selectedRecord.id,
      })
      await createContact(params)
      message.success('联系人已创建')
      setContactModalOpen(false)
      await loadContacts(selectedRecord)
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存联系人'))
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
    () => [
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
      ...(type === 'materials'
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
      ...(type === 'materials'
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
              title: '默认单位 ID',
              exportTitle: '默认单位 ID',
              dataIndex: 'default_unit_id',
              width: 130,
              sorter: (a, b) =>
                Number(a?.default_unit_id || 0) -
                Number(b?.default_unit_id || 0),
            },
          ]
        : []),
      ...(type === 'suppliers'
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
      ...(type === 'materials'
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
    ],
    [type]
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
  const orderedRecordColumns = useMemo(
    () =>
      applyModuleColumnOrder(recordColumns, preferredRecordColumnOrder).map(
        (column) => ({
          ...column,
          title: (
            <ColumnOrderHeaderMenu
              column={column}
              columns={recordColumns}
              order={preferredRecordColumnOrder}
              saving={columnOrderSaving}
              onChange={(nextOrder) =>
                persistColumnOrder(nextOrder, recordColumns)
              }
              onOpenPanel={() => setColumnOrderOpen(true)}
            />
          ),
        })
      ),
    [
      columnOrderSaving,
      persistColumnOrder,
      preferredRecordColumnOrder,
      recordColumns,
    ]
  )

  const contactColumns = useMemo(
    () => [
      { title: '联系人', dataIndex: 'name', width: 140 },
      {
        title: '职位',
        dataIndex: 'title',
        width: 120,
        render: (value) => value || '-',
      },
      {
        title: '手机',
        dataIndex: 'mobile',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '电话',
        dataIndex: 'phone',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        width: 180,
        render: (value) => value || '-',
      },
      {
        title: '主联系人',
        dataIndex: 'is_primary',
        width: 100,
        render: (value) => (value ? <Tag color="blue">主</Tag> : '-'),
      },
      { title: '状态', dataIndex: 'is_active', width: 90, render: activeTag },
    ],
    []
  )

  const activeRecordCount = useMemo(
    () => records.filter((record) => record.is_active !== false).length,
    [records]
  )
  const selectedRecordDisplayText = useMemo(() => {
    if (!selectedRecord) return `请先选择一个${entityLabel}`
    return `${selectedRecord.code || selectedRecord.id} / ${
      selectedRecord.name || `未命名${entityLabel}`
    }`
  }, [entityLabel, selectedRecord])
  const exportRecords = () => {
    downloadCSV({
      filename: `${type}-current-results.csv`,
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
        stats={[
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
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              placeholder={
                type === 'materials'
                  ? '搜索编号、名称、分类、规格、颜色'
                  : '搜索编号、名称、简称'
              }
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={loadRecords}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              options={[
                { label: `全部${entityLabel}`, value: 'all' },
                { label: `仅看启用${entityLabel}`, value: 'active' },
              ]}
              value={activeOnly ? 'active' : 'all'}
              onChange={(nextValue) => setActiveOnly(nextValue === 'active')}
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
            <ToolbarButton
              icon={<DeleteOutlined />}
              danger
              disabled={!selectedRecord}
              onClick={() => setBatchDeleteOpen(true)}
            >
              批量删除
            </ToolbarButton>
            <ToolbarButton
              icon={<InboxOutlined />}
              onClick={() => setRecycleOpen(true)}
            >
              回收站
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
          <Button
            size="small"
            disabled={!selectedRecord}
            onClick={() => setDetailOpen(true)}
          >
            查看详情
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
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!selectedRecord}
            onClick={() => setBatchDeleteOpen(true)}
          >
            删除
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={orderedRecordColumns}
        dataSource={records}
        scroll={{ x: 1300 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        emptyDescription={`暂无${entityLabel}记录`}
        rowSelection={{
          selectedRowKeys: selectedRecord?.id ? [selectedRecord.id] : [],
          onSelect: (record, selected) => {
            setSelectedRecord(selected ? record : null)
          },
          onSelectAll: (_selected, selectedRows) => {
            setSelectedRecord(selectedRows[0] || null)
          },
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

      {supportsContacts ? (
        <section
          className={[
            'erp-v1-master-data-contact-panel',
            selectedRecord
              ? 'erp-v1-master-data-contact-panel--active'
              : 'erp-v1-master-data-contact-panel--empty',
          ].join(' ')}
          aria-label="联系人明细"
        >
          <div className="erp-v1-master-data-contact-panel__head">
            <div className="erp-v1-master-data-contact-panel__title">
              <span>联系人明细</span>
              <strong>
                {selectedRecord?.name || '先从上方选择一个客户或供应商'}
              </strong>
              <small>
                联系人随主体维护，不作为独立业务对象，也不生成订单、出货、库存或财务事实。
              </small>
            </div>
            <div className="erp-v1-master-data-contact-panel__meta">
              <span>
                主体 <strong>{selectedRecord?.code || '未选择'}</strong>
              </span>
              <span>
                联系人 <strong>{selectedRecord ? contacts.length : 0}</strong>
              </span>
            </div>
            {canCreateContact ? (
              <ToolbarButton
                icon={<PlusOutlined />}
                onClick={openCreateContact}
                disabled={!selectedRecord}
              >
                新建联系人
              </ToolbarButton>
            ) : null}
          </div>
          {selectedRecord ? (
            <Table
              rowKey="id"
              className="erp-v1-master-data-contact-panel__table"
              loading={contactLoading}
              columns={contactColumns}
              dataSource={contacts}
              scroll={{ x: 1080 }}
              pagination={false}
              locale={{
                emptyText: <Empty description="当前主体暂无联系人" />,
              }}
            />
          ) : (
            <div className="erp-v1-master-data-contact-panel__empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="从上方主体表选择一行后维护联系人"
              />
            </div>
          )}
        </section>
      ) : null}

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={selectedRecord?.name || ''}
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        width={BUSINESS_FORM_MODAL_WIDTH}
        title={
          <div className="erp-business-action-modal__title">
            <span>
              {editingRecord?.id ? `编辑${entityLabel}` : `新建${config.title}`}
            </span>
            <small>{config.formBoundary}</small>
          </div>
        }
        open={recordModalOpen}
        onOk={saveRecord}
        onCancel={() => setRecordModalOpen(false)}
        maskClosable={false}
        confirmLoading={saving}
        centered
        forceRender
        destroyOnHidden={false}
      >
        <Form
          form={recordForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <MasterDataFormFields type={type} />
        </Form>
      </Modal>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        width={BUSINESS_FORM_MODAL_WIDTH}
        title={
          <div className="erp-business-action-modal__title">
            <span>新建联系人</span>
            <small>
              联系人随当前主体维护，不生成订单、出货、库存或财务事实。
            </small>
          </div>
        }
        open={supportsContacts && contactModalOpen}
        onOk={saveContact}
        onCancel={() => setContactModalOpen(false)}
        maskClosable={false}
        confirmLoading={saving}
        centered
        forceRender
        destroyOnHidden={false}
      >
        <Form
          form={contactForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <ContactFormFields />
        </Form>
      </Modal>

      <ColumnOrderModal
        open={columnOrderOpen}
        moduleTitle={config.title}
        columns={recordColumns}
        order={preferredRecordColumnOrder}
        saving={columnOrderSaving}
        onChange={(nextOrder) => persistColumnOrder(nextOrder, recordColumns)}
        onReset={() => persistColumnOrder([], recordColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--confirm erp-business-batch-delete-modal"
        width={560}
        title="批量删除记录"
        open={batchDeleteOpen}
        onCancel={() => setBatchDeleteOpen(false)}
        onOk={() => {
          setBatchDeleteOpen(false)
          setBatchDeleteReason('')
          message.info(
            `${config.title}当前使用启停状态管理，不执行批量物理删除`
          )
        }}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !selectedRecord }}
        centered
        destroyOnHidden
      >
        <Space
          direction="vertical"
          size={12}
          className="erp-business-batch-delete-modal__content"
        >
          <span>
            已选择 <strong>{selectedRecord ? 1 : 0}</strong>{' '}
            条记录，将进入回收站。
          </span>
          <Input.TextArea
            className="erp-business-batch-delete-modal__reason"
            value={batchDeleteReason}
            onChange={(event) => setBatchDeleteReason(event.target.value)}
            rows={3}
            maxLength={255}
            showCount
            placeholder="请输入删除原因（可选）"
          />
        </Space>
      </Modal>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--recycle"
        title="回收站"
        open={recycleOpen}
        onCancel={() => {
          setRecycleOpen(false)
          setRecycleSelectedRowKeys([])
        }}
        footer={null}
        width={980}
        centered
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Button
              icon={<RollbackOutlined />}
              disabled={recycleSelectedRowKeys.length === 0}
            >
              批量恢复
            </Button>
            <Button icon={<ReloadOutlined />}>刷新</Button>
            <span>已选择 {recycleSelectedRowKeys.length} 条回收站记录</span>
          </Space>
          <Table
            rowKey="id"
            size="small"
            rowSelection={{
              selectedRowKeys: recycleSelectedRowKeys,
              onChange: (keys) => setRecycleSelectedRowKeys(keys),
            }}
            columns={[
              { title: '单据编号', dataIndex: 'code', width: 180 },
              { title: '名称', dataIndex: 'name', width: 260 },
              { title: '业务状态', dataIndex: 'status', width: 140 },
              { title: '删除时间', dataIndex: 'deleted_at', width: 160 },
              { title: '删除原因', dataIndex: 'delete_reason', width: 180 },
              {
                title: '操作',
                key: 'actions',
                width: 110,
                render: () => (
                  <Button type="link" size="small" disabled>
                    恢复
                  </Button>
                ),
              },
            ]}
            dataSource={[]}
            pagination={{
              pageSize: 8,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 条`,
            }}
            locale={{ emptyText: <Empty description="回收站暂无记录" /> }}
            scroll={{ x: 1010 }}
          />
        </Space>
      </Modal>

      <Drawer
        title={`${config.title}详情`}
        width={520}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {selectedRecord ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="编号">
              {selectedRecord.code}
            </Descriptions.Item>
            <Descriptions.Item label="名称">
              {selectedRecord.name}
            </Descriptions.Item>
            {type === 'materials' ? (
              <>
                <Descriptions.Item label="分类">
                  {selectedRecord.category || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="规格">
                  {selectedRecord.spec || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="颜色">
                  {selectedRecord.color || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="默认单位 ID">
                  {selectedRecord.default_unit_id || '-'}
                </Descriptions.Item>
              </>
            ) : (
              <Descriptions.Item label="简称">
                {selectedRecord.short_name || '-'}
              </Descriptions.Item>
            )}
            {type === 'suppliers' ? (
              <Descriptions.Item label="供应商类型">
                {SUPPLIER_TYPE_LABELS[selectedRecord.supplier_type] ||
                  selectedRecord.supplier_type ||
                  '-'}
              </Descriptions.Item>
            ) : null}
            {type === 'materials' ? null : (
              <Descriptions.Item label="税号">
                {selectedRecord.tax_no || '-'}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="状态">
              {activeTag(selectedRecord.is_active)}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {formatUnixDateTime(selectedRecord.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {formatUnixDateTime(selectedRecord.updated_at)}
            </Descriptions.Item>
            <Descriptions.Item label="备注">
              {selectedRecord.note || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </BusinessPageLayout>
  )
}
