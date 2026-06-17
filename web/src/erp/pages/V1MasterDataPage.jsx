import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  RollbackOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
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
  createProduct,
  createProductSKU,
  createSupplier,
  disableContact,
  listContactsByOwner,
  listCustomers,
  listMaterials,
  listProducts,
  listProductSKUs,
  listSuppliers,
  setCustomerActive,
  setMaterialActive,
  setProductActive,
  setProductSKUActive,
  setSupplierActive,
  updateContact,
  updateCustomer,
  updateMaterial,
  updateProduct,
  updateProductSKU,
  updateSupplier,
} from '../api/masterDataOrderApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  buildContactParams,
  buildMasterDataParams,
  buildProductParams,
  buildProductSKUParams,
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

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const BUSINESS_FORM_MODAL_WIDTH = 'min(1360px, calc(100vw - 96px))'

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
    entityLabel: '客户',
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
    entityLabel: '供应商',
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
    formBoundary:
      '只维护产品规格主数据，不在此写订单、库存、BOM、生产或出货事实。',
    summary:
      '维护产品规格 / SKU；产品归属使用 product_id，订单、库存、BOM 和出货事实在对应业务模块处理。',
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
  if (type === 'products') {
    return (
      <>
        <Form.Item
          className="erp-business-action-form__field"
          label="产品编号"
          name="code"
          rules={[{ required: true, message: '请填写产品编号' }]}
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="产品名称"
          name="name"
          rules={[{ required: true, message: '请填写产品名称' }]}
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="内部款号"
          name="style_no"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="客户款号"
          name="customer_style_no"
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
    )
  }

  if (type === 'product_skus') {
    return (
      <>
        <Form.Item
          className="erp-business-action-form__field"
          label="产品 ID"
          name="product_id"
          rules={[{ required: true, message: '请填写产品 ID' }]}
        >
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="SKU 编号"
          name="sku_code"
          rules={[{ required: true, message: '请填写 SKU 编号' }]}
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="SKU 名称"
          name="sku_name"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="条码"
          name="barcode"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="客户 SKU"
          name="customer_sku"
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
          label="色号"
          name="color_no"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="尺码"
          name="size"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="包装版本"
          name="packaging_version"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="默认单位 ID"
          name="default_unit_id"
        >
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </>
    )
  }

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

function createEmptyContactRow() {
  return { is_primary: true }
}

function contactRecordToFormRow(contact = {}) {
  return {
    id: contact.id,
    name: contact.name || '',
    title: contact.title || '',
    mobile: contact.mobile || '',
    phone: contact.phone || '',
    email: contact.email || '',
    note: contact.note || '',
    is_primary: contact.is_primary === true,
  }
}

function contactRowsForForm(contacts = []) {
  const activeContacts = Array.isArray(contacts)
    ? contacts.filter((contact) => contact?.is_active !== false)
    : []
  const rows = activeContacts.map(contactRecordToFormRow)
  return rows.length > 0 ? rows : [createEmptyContactRow()]
}

function hasContactPayload(row = {}) {
  return ['name', 'title', 'mobile', 'phone', 'email', 'note'].some((key) =>
    String(row?.[key] ?? '').trim()
  )
}

function normalizeContactRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id || hasContactPayload(row))
    .map((row) => ({
      ...row,
      id: row?.id ? Number(row.id) : undefined,
      name: String(row?.name ?? '').trim(),
      title: String(row?.title ?? '').trim(),
      mobile: String(row?.mobile ?? '').trim(),
      phone: String(row?.phone ?? '').trim(),
      email: String(row?.email ?? '').trim(),
      note: String(row?.note ?? '').trim(),
      is_primary: row?.is_primary === true,
    }))
}

function ContactFormList({ form, entityLabel }) {
  return (
    <Form.List
      name="contacts"
      rules={[
        {
          validator: async (_, rows) => {
            if (!Array.isArray(rows) || rows.length === 0) {
              throw new Error(`请至少维护一个${entityLabel}联系人`)
            }
            if (!rows.some((row) => String(row?.name ?? '').trim())) {
              throw new Error(`请填写${entityLabel}联系人`)
            }
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <div className="erp-master-contact-list">
          <div className="erp-master-contact-list__head">
            <div>
              <strong>联系人</strong>
              <span>
                联系人随当前{entityLabel}
                维护，不作为独立业务对象，也不生成订单、出货、库存或财务事实。
              </span>
            </div>
          </div>
          <div className="erp-master-contact-list__items">
            {fields.map((field, index) => (
              <div className="erp-master-contact-list__row" key={field.key}>
                <div className="erp-master-contact-list__row-head">
                  <strong>条目 {index + 1}</strong>
                  <Space size={4}>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      aria-label={`复制联系人条目 ${index + 1}`}
                      onClick={() => {
                        const currentRow =
                          form.getFieldValue(['contacts', field.name]) || {}
                        add({
                          ...currentRow,
                          id: undefined,
                          is_primary: false,
                        })
                      }}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除联系人条目 ${index + 1}`}
                      disabled={fields.length <= 1}
                      onClick={() => remove(field.name)}
                    />
                  </Space>
                </div>
                <Form.Item name={[field.name, 'id']} hidden>
                  <Input />
                </Form.Item>
                <div className="erp-master-contact-list__grid">
                  <Form.Item
                    label="联系人"
                    name={[field.name, 'name']}
                    rules={[{ required: true, message: '请填写联系人' }]}
                  >
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="职位" name={[field.name, 'title']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="手机" name={[field.name, 'mobile']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="电话" name={[field.name, 'phone']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="邮箱" name={[field.name, 'email']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item
                    label="主联系人"
                    name={[field.name, 'is_primary']}
                    valuePropName="checked"
                  >
                    <Switch
                      onChange={(checked) => {
                        const rows = form.getFieldValue('contacts') || []
                        form.setFieldValue(
                          'contacts',
                          rows.map((row, rowIndex) => {
                            if (rowIndex === field.name) {
                              return { ...row, is_primary: checked }
                            }
                            return checked ? { ...row, is_primary: false } : row
                          })
                        )
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    className="erp-master-contact-list__field--full"
                    label="备注"
                    name={[field.name, 'note']}
                  >
                    <Input.TextArea
                      allowClear
                      rows={2}
                      showCount
                      maxLength={200}
                    />
                  </Form.Item>
                </div>
              </div>
            ))}
          </div>
          <div className="erp-line-items-form__footer">
            <div className="erp-line-items-form__footer-actions">
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ is_primary: false })}
              >
                添加条目
              </Button>
            </div>
            <div className="erp-line-items-form__stats">
              <span className="erp-line-items-form__stat">
                已录入
                <strong className="erp-line-items-form__stat-value">
                  {fields.length}
                </strong>
                条
              </span>
            </div>
          </div>
          <Form.ErrorList errors={errors} />
        </div>
      )}
    </Form.List>
  )
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
  if (type === 'products') {
    return '搜索产品编号、名称、内部款号、客户款号'
  }
  if (type === 'product_skus') {
    return '搜索 SKU、条码、客户 SKU、颜色、色号、尺码、包装版本'
  }
  return '搜索编号、名称、简称'
}

export default function V1MasterDataPage({ type }) {
  const isProductCatalogPage = type === 'product_skus'
  const [productCatalogType, setProductCatalogType] = useState('products')
  const effectiveType = isProductCatalogPage ? productCatalogType : type
  const config = PAGE_CONFIG[effectiveType] || PAGE_CONFIG.customers
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
  const [contacts, setContacts] = useState([])
  const [recordModalOpen, setRecordModalOpen] = useState(false)
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
  const showContactForm =
    supportsContacts && (canCreateContact || canUpdateContact)

  const loadContacts = useCallback(
    async (record) => {
      if (!supportsContacts || !record?.id) {
        setContacts([])
        return []
      }
      setContactLoading(true)
      try {
        const result = await listContactsByOwner({
          owner_type: config.ownerType,
          owner_id: record.id,
          limit: 100,
        })
        const nextContacts = Array.isArray(result?.contacts)
          ? result.contacts
          : []
        setContacts(nextContacts)
        return nextContacts
      } catch (error) {
        message.error(getActionErrorMessage(error, '加载联系人'))
        setContacts([])
        return []
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
        ...getBusinessPaginationParams(pagination),
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
  }, [activeOnly, config, keyword, pagination])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRecords)
  }, [loadRecords, outletContext])

  useEffect(() => {
    setSelectedRecord(null)
    setContacts([])
    setEditingRecord(null)
    setRecordModalOpen(false)
    setColumnOrder(null)
    setPagination({ current: 1, pageSize: 20 })
    setKeyword('')
    setActiveOnly(false)
  }, [effectiveType])

  const openCreateRecord = () => {
    setEditingRecord(null)
    setContacts([])
    recordForm.resetFields()
    if (showContactForm) {
      recordForm.setFieldsValue({ contacts: [createEmptyContactRow()] })
    }
    setRecordModalOpen(true)
  }

  const openEditRecord = async (record) => {
    if (!record?.id) return
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

  const syncContactRows = async (owner, rows = []) => {
    if (!showContactForm || !owner?.id) {
      return
    }

    const nextRows = normalizeContactRows(rows)
    const retainedContactIds = new Set()
    for (const row of nextRows) {
      const params = buildContactParams(row, {
        owner_type: config.ownerType,
        owner_id: owner.id,
      })
      if (row.id) {
        retainedContactIds.add(row.id)
        if (!canUpdateContact) continue
        await updateContact({ id: row.id, ...params })
      } else if (canCreateContact) {
        const created = await createContact(params)
        if (created?.id) {
          retainedContactIds.add(Number(created.id))
        }
      }
    }

    if (editingRecord?.id && canDisableContact) {
      for (const contact of contacts) {
        if (
          contact?.id &&
          contact.is_active !== false &&
          !retainedContactIds.has(Number(contact.id))
        ) {
          await disableContact({ id: contact.id })
        }
      }
    }
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
            : buildMasterDataParams(values, extra)
      const saved = editingRecord?.id
        ? await config.update(params)
        : await config.create(params)
      await syncContactRows(saved, values.contacts)
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

  const recordColumns = useMemo(() => {
    if (effectiveType === 'products') {
      return [
        {
          title: '产品编号',
          exportTitle: '产品编号',
          dataIndex: 'code',
          width: 150,
          sorter: (a, b) => compareText(a?.code, b?.code),
        },
        {
          title: '产品名称',
          exportTitle: '产品名称',
          dataIndex: 'name',
          width: 220,
          sorter: (a, b) => compareText(a?.name, b?.name),
        },
        {
          title: '内部款号',
          exportTitle: '内部款号',
          dataIndex: 'style_no',
          width: 160,
          sorter: (a, b) => compareText(a?.style_no, b?.style_no),
          render: (value) => value || '-',
        },
        {
          title: '客户款号',
          exportTitle: '客户款号',
          dataIndex: 'customer_style_no',
          width: 160,
          sorter: (a, b) =>
            compareText(a?.customer_style_no, b?.customer_style_no),
          render: (value) => value || '-',
        },
        {
          title: '默认单位 ID',
          exportTitle: '默认单位 ID',
          dataIndex: 'default_unit_id',
          width: 130,
          sorter: (a, b) =>
            Number(a?.default_unit_id || 0) - Number(b?.default_unit_id || 0),
        },
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
      ]
    }

    if (effectiveType === 'product_skus') {
      return [
        {
          title: '产品 ID',
          exportTitle: '产品 ID',
          dataIndex: 'product_id',
          width: 110,
          sorter: (a, b) =>
            Number(a?.product_id || 0) - Number(b?.product_id || 0),
        },
        {
          title: 'SKU 编号',
          exportTitle: 'SKU 编号',
          dataIndex: 'sku_code',
          width: 160,
          sorter: (a, b) => compareText(a?.sku_code, b?.sku_code),
        },
        {
          title: 'SKU 名称',
          exportTitle: 'SKU 名称',
          dataIndex: 'sku_name',
          width: 200,
          sorter: (a, b) => compareText(a?.sku_name, b?.sku_name),
          render: (value) => value || '-',
        },
        {
          title: '条码',
          exportTitle: '条码',
          dataIndex: 'barcode',
          width: 160,
          sorter: (a, b) => compareText(a?.barcode, b?.barcode),
          render: (value) => value || '-',
        },
        {
          title: '客户 SKU',
          exportTitle: '客户 SKU',
          dataIndex: 'customer_sku',
          width: 160,
          sorter: (a, b) => compareText(a?.customer_sku, b?.customer_sku),
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
          title: '色号',
          exportTitle: '色号',
          dataIndex: 'color_no',
          width: 120,
          sorter: (a, b) => compareText(a?.color_no, b?.color_no),
          render: (value) => value || '-',
        },
        {
          title: '尺码',
          exportTitle: '尺码',
          dataIndex: 'size',
          width: 110,
          sorter: (a, b) => compareText(a?.size, b?.size),
          render: (value) => value || '-',
        },
        {
          title: '包装版本',
          exportTitle: '包装版本',
          dataIndex: 'packaging_version',
          width: 140,
          sorter: (a, b) =>
            compareText(a?.packaging_version, b?.packaging_version),
          render: (value) => value || '-',
        },
        {
          title: '默认单位 ID',
          exportTitle: '默认单位 ID',
          dataIndex: 'default_unit_id',
          width: 130,
          sorter: (a, b) =>
            Number(a?.default_unit_id || 0) - Number(b?.default_unit_id || 0),
          render: (value) => value || '-',
        },
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
      ]
    }

    return [
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
      ...(effectiveType === 'materials'
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
      ...(effectiveType === 'materials'
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
      ...(effectiveType === 'suppliers'
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
      ...(effectiveType === 'materials'
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
    ]
  }, [effectiveType])
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

  const activeRecordCount = useMemo(
    () => records.filter((record) => record.is_active !== false).length,
    [records]
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

      {isProductCatalogPage ? (
        <Segmented
          aria-label="产品档案视图"
          value={effectiveType}
          onChange={(nextValue) => setProductCatalogType(nextValue)}
          options={[
            { label: '产品基础信息', value: 'products' },
            { label: '产品规格', value: 'product_skus' },
          ]}
        />
      ) : null}

      <BusinessOperationPanel
        compact
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
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
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

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={getRecordName(selectedRecord, effectiveType) || ''}
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        width={BUSINESS_FORM_MODAL_WIDTH}
        title={
          <div className="erp-business-action-modal__title">
            <span>
              {editingRecord?.id
                ? `编辑${entityLabel}`
                : `新建${config.createTitleLabel || config.title}`}
            </span>
            <small>{config.formBoundary}</small>
          </div>
        }
        open={recordModalOpen}
        onOk={saveRecord}
        onCancel={() => setRecordModalOpen(false)}
        maskClosable={false}
        confirmLoading={saving || contactLoading}
        centered
        forceRender
        destroyOnHidden={false}
      >
        <Form
          form={recordForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <MasterDataFormFields type={effectiveType} />
          {showContactForm ? (
            <ContactFormList form={recordForm} entityLabel={entityLabel} />
          ) : null}
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
    </BusinessPageLayout>
  )
}
