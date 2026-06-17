import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Table,
  Tag,
} from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  addPurchaseReceiptItem,
  cancelPurchaseReceipt,
  createPurchaseReceiptDraft,
  listPurchaseReceipts,
  postPurchaseReceipt,
} from '../api/purchaseApi.mjs'
import {
  BusinessOperationPanel,
  BusinessPageLayout,
  DateInput,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  buildPurchaseReceiptItemParams,
  decimalNumber,
  formatQuantity,
} from '../utils/businessLineItems.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'

const BUSINESS_FORM_MODAL_WIDTH = 'min(900px, calc(100vw - 96px))'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已过账', value: 'POSTED' },
  { label: '已取消', value: 'CANCELLED' },
]

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  POSTED: 'blue',
  CANCELLED: 'red',
})

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || key || '-'}
    </Tag>
  )
}

function hasPermission(adminProfile, permission) {
  return (
    adminProfile?.is_super_admin === true ||
    hasActionPermission(adminProfile, permission)
  )
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function buildReceiptParams(values = {}) {
  return compactParams({
    receipt_no: trimOptional(values.receipt_no),
    supplier_name: trimOptional(values.supplier_name),
    received_at: trimOptional(values.received_at),
    note: trimOptional(values.note),
  })
}

function receiptItemCount(receipt = {}) {
  return Array.isArray(receipt.items) ? receipt.items.length : 0
}

function receiptQuantityTotal(receipt = {}) {
  return (receipt.items || []).reduce(
    (total, item) => total + decimalNumber(item?.quantity),
    0
  )
}

function PurchaseReceiptItemsTable({ items = [] }) {
  return (
    <Table
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={items}
      scroll={{ x: 920 }}
      columns={[
        { title: '行 ID', dataIndex: 'id', width: 84 },
        { title: '材料 ID', dataIndex: 'material_id', width: 100 },
        { title: '仓库 ID', dataIndex: 'warehouse_id', width: 100 },
        { title: '单位 ID', dataIndex: 'unit_id', width: 92 },
        { title: '批次 ID', dataIndex: 'lot_id', width: 92 },
        { title: '批次号', dataIndex: 'lot_no', width: 140 },
        { title: '数量', dataIndex: 'quantity', width: 120 },
        { title: '单价', dataIndex: 'unit_price', width: 120 },
        { title: '金额', dataIndex: 'amount', width: 120 },
        {
          title: '采购订单行',
          dataIndex: 'purchase_order_item_id',
          width: 130,
          render: (value) => value || '-',
        },
        {
          title: '来源行号',
          dataIndex: 'source_line_no',
          width: 120,
          render: (value) => value || '-',
        },
        { title: '备注', dataIndex: 'note', ellipsis: true },
      ]}
    />
  )
}

function expandedPurchaseReceiptItemsRow(record) {
  return <PurchaseReceiptItemsTable items={record.items || []} />
}

function canExpandPurchaseReceiptRow(record) {
  return receiptItemCount(record) > 0
}

export default function V1PurchaseReceiptsPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const adminProfile = outletContext?.adminProfile || {}
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [receiptModal, setReceiptModal] = useState(null)
  const [receiptForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const canCreate = hasPermission(adminProfile, 'purchase.receipt.create')
  const canPost =
    canCreate || hasPermission(adminProfile, 'warehouse.inbound.confirm')
  const relatedMenuItems = [
    { key: 'purchase-orders', label: '采购订单' },
    { key: 'quality-inspections', label: '来料质检' },
    { key: 'inventory', label: '库存台账' },
  ]

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    const pathByKey = {
      'purchase-orders': V1_ROUTE_PATHS.purchaseOrders,
      'quality-inspections': V1_ROUTE_PATHS.qualityInspections,
      inventory: V1_ROUTE_PATHS.inventory,
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listPurchaseReceipts(
        compactParams({
          status: statusFilter,
          keyword: trimOptional(keyword),
          ...getBusinessPaginationParams(pagination),
        })
      )
      const nextRows = Array.isArray(data?.purchase_receipts)
        ? data.purchase_receipts
        : []
      setRows(nextRows)
      setSelectedRow((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) || current
          : null
      )
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载采购入库单'))
    } finally {
      setLoading(false)
    }
  }, [keyword, pagination, statusFilter])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  useEffect(() => {
    if (receiptModal?.mode === 'create') {
      receiptForm.setFieldsValue({
        receipt_no: '',
        supplier_name: '',
        received_at: todayInputValue(),
        note: '',
      })
    }
    if (receiptModal?.mode === 'item') {
      itemForm.setFieldsValue({
        material_id: undefined,
        warehouse_id: undefined,
        unit_id: undefined,
        lot_id: undefined,
        purchase_order_item_id: undefined,
        lot_no: '',
        quantity: '',
        unit_price: '',
        amount: '',
        source_line_no: '',
        note: '',
      })
    }
  }, [itemForm, receiptForm, receiptModal?.mode])

  const openCreate = useCallback(() => {
    setReceiptModal({ mode: 'create' })
  }, [])

  const openAddItem = useCallback((receipt) => {
    setReceiptModal({ mode: 'item', receipt })
  }, [])

  const closeModal = useCallback(() => {
    setReceiptModal(null)
  }, [])

  const handleCreateReceipt = useCallback(async () => {
    const values = await receiptForm.validateFields()
    setSaving(true)
    try {
      const receipt = await createPurchaseReceiptDraft(
        buildReceiptParams(values)
      )
      message.success('采购入库草稿已创建')
      setSelectedRow(receipt)
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '创建采购入库草稿'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, loadRows, receiptForm])

  const handleAddItem = useCallback(async () => {
    const values = await itemForm.validateFields()
    const receipt = receiptModal?.receipt
    if (!receipt?.id) return
    setSaving(true)
    try {
      await addPurchaseReceiptItem(
        buildPurchaseReceiptItemParams(receipt.id, values)
      )
      message.success('入库明细已添加')
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '添加入库明细'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, itemForm, loadRows, receiptModal?.receipt])

  const runReceiptAction = useCallback(
    async (receipt, action, successText) => {
      if (!receipt?.id) return
      setSaving(true)
      try {
        const nextReceipt = await action({ id: receipt.id })
        setSelectedRow(nextReceipt || receipt)
        message.success(successText)
        await loadRows()
      } catch (error) {
        message.error(getActionErrorMessage(error, successText))
      } finally {
        setSaving(false)
      }
    },
    [loadRows]
  )

  const selectedRowLabel = selectedRow
    ? `${selectedRow.receipt_no || selectedRow.id} / ${
        selectedRow.supplier_name || '未填写供应商'
      }`
    : '请先选择一张采购入库单'

  const columns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '入库单号',
          dataIndex: 'receipt_no',
          width: 160,
          sortType: 'text',
        },
        {
          title: '状态',
          dataIndex: 'status',
          width: 110,
          sortType: 'text',
          render: statusTag,
        },
        {
          title: '供应商',
          dataIndex: 'supplier_name',
          width: 180,
          sortType: 'text',
        },
        {
          title: '收货日期',
          dataIndex: 'received_at',
          width: 130,
          sortType: 'date',
          render: formatUnixDate,
        },
        {
          title: '过账时间',
          dataIndex: 'posted_at',
          width: 170,
          sortType: 'date',
          render: formatUnixDateTime,
        },
        {
          title: '明细行数',
          key: 'item_count',
          width: 100,
          sortValue: receiptItemCount,
          render: (_, record) => receiptItemCount(record),
        },
        {
          title: '入库数量',
          key: 'quantity_total',
          width: 120,
          sortValue: receiptQuantityTotal,
          render: (_, record) => formatQuantity(receiptQuantityTotal(record)),
        },
        {
          title: '创建时间',
          dataIndex: 'created_at',
          width: 170,
          sortType: 'date',
          render: formatUnixDateTime,
        },
        {
          title: '更新时间',
          dataIndex: 'updated_at',
          width: 170,
          sortType: 'date',
          render: formatUnixDateTime,
        },
        { title: '备注', dataIndex: 'note', ellipsis: true, sortable: false },
      ]),
    []
  )

  return (
    <BusinessPageLayout className="erp-v1-purchase-receipts-page">
      <PageHeaderCard
        compact
        title="入库管理"
        description="入库管理当前接入 purchase_receipts / purchase_receipt_items；草稿加明细后由后端过账写库存流水、余额和批次，Workflow 入库任务完成不等于采购入库过账。"
        tags={[
          <Tag color="gold" key="workflow">
            Workflow：协同入库
          </Tag>,
          <Tag color="blue" key="receipt">
            PurchaseReceipt：入库事实
          </Tag>,
          <Tag color="green" key="inventory">
            过账后写 inventory_txns
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总入库单', value: total },
          { key: 'current', label: '当前结果', value: rows.length },
          {
            key: 'draft',
            label: '草稿',
            value: rows.filter((item) => item.status === 'DRAFT').length,
          },
          {
            key: 'posted',
            label: '已过账',
            value: rows.filter((item) => item.status === 'POSTED').length,
          },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索入库单号 / 供应商"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
          </>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建入库单
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
          boundaryText="过账和取消均由后端采购入库 usecase 写库存事实或冲正；前端不本地改库存。"
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空已选
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={!selectedRow}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!selectedRow}
            >
              关联 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'DRAFT' ||
              !canCreate ||
              saving
            }
            onClick={() => openAddItem(selectedRow)}
          >
            维护明细
          </Button>
          <Popconfirm
            title="确认过账并写库存入库事实？"
            onConfirm={() =>
              runReceiptAction(
                selectedRow,
                postPurchaseReceipt,
                '采购入库已过账'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'DRAFT' ||
                !canPost ||
                saving
              }
            >
              过账入库
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认取消已过账入库并写库存冲正？"
            onConfirm={() =>
              runReceiptAction(
                selectedRow,
                cancelPurchaseReceipt,
                '采购入库已取消'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'POSTED' ||
                !canPost ||
                saving
              }
            >
              取消入库
            </Button>
          </Popconfirm>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <Card className="erp-business-data-table-card erp-business-module-table-card">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={createBusinessTablePagination({
            pagination,
            total,
            onChange: (current, pageSize) =>
              setPagination({ current, pageSize }),
          })}
          scroll={{ x: 1320 }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedRow ? [selectedRow.id] : [],
            onChange: (_keys, selectedRows) =>
              setSelectedRow(selectedRows[0] || null),
          }}
          rowClassName={(record) =>
            record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
          }
          onRow={(record) => ({
            onClick: () => setSelectedRow(record),
          })}
          expandable={{
            expandedRowRender: expandedPurchaseReceiptItemsRow,
            rowExpandable: canExpandPurchaseReceiptRow,
          }}
          locale={{
            emptyText: <Empty description="暂无采购入库单" />,
          }}
        />
      </Card>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        title={
          receiptModal?.mode === 'item' ? '添加入库明细' : '新建采购入库单'
        }
        open={Boolean(receiptModal)}
        onCancel={closeModal}
        onOk={
          receiptModal?.mode === 'item' ? handleAddItem : handleCreateReceipt
        }
        confirmLoading={saving}
        maskClosable={false}
        centered
        destroyOnHidden
        width={BUSINESS_FORM_MODAL_WIDTH}
        okText={receiptModal?.mode === 'item' ? '添加明细' : '创建草稿'}
        cancelText="关闭"
      >
        {receiptModal?.mode === 'item' ? (
          <Form
            form={itemForm}
            layout="vertical"
            className="erp-business-action-form erp-business-action-form--grid"
          >
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
              label="仓库 ID"
              name="warehouse_id"
              rules={[{ required: true, message: '请填写仓库 ID' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
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
              label="入库数量"
              name="quantity"
              rules={[{ required: true, message: '请填写入库数量' }]}
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="批次 ID"
              name="lot_id"
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="批次号"
              name="lot_no"
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="采购订单行 ID"
              name="purchase_order_item_id"
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="来源行号"
              name="source_line_no"
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="单价"
              name="unit_price"
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="金额"
              name="amount"
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field erp-business-action-form__field--wide"
              label="备注"
              name="note"
            >
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
            </Form.Item>
          </Form>
        ) : (
          <Form
            form={receiptForm}
            layout="vertical"
            className="erp-business-action-form erp-business-action-form--grid"
          >
            <Form.Item
              className="erp-business-action-form__field"
              label="入库单号"
              name="receipt_no"
              rules={[{ required: true, message: '请填写入库单号' }]}
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="供应商"
              name="supplier_name"
              rules={[{ required: true, message: '请填写供应商' }]}
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="收货日期"
              name="received_at"
            >
              <DateInput />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field erp-business-action-form__field--wide"
              label="备注"
              name="note"
            >
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </BusinessPageLayout>
  )
}
