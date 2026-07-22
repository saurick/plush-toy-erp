import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  approveSalesReturn,
  cancelSalesReturn,
  createSalesReturn,
  getSalesReturn,
  listAllShipments,
  listSalesReturns,
  receiveSalesReturn,
} from '../api/operationalFactApi.mjs'
import {
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SelectFilter,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
} from '../utils/businessPagination.mjs'
import {
  compactParams,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
} from '../utils/masterDataOrderView.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../utils/sourceBusinessAction.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../utils/numeric20Scale6.mjs'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '待审批' },
  { value: 'APPROVED', label: '已批准待收货' },
  { value: 'RECEIVED', label: '已收货' },
  { value: 'CANCELLED', label: '已取消' },
]
const STATUS_META = Object.freeze({
  DRAFT: ['待审批', 'blue'],
  APPROVED: ['已批准待收货', 'gold'],
  RECEIVED: ['已收货', 'green'],
  CANCELLED: ['已取消', 'default'],
})

function statusTag(value) {
  const [label, color] = STATUS_META[value] || ['状态待核对', 'default']
  return <Tag color={color}>{label}</Tag>
}

function shipmentOption(shipment) {
  return {
    value: Number(shipment.id),
    label: `${shipment.shipment_no || '出货单'} / ${
      shipment.customer_snapshot || '客户已关联'
    }`,
  }
}

export default function SalesReturnsPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [shipments, setShipments] = useState([])
  const [form] = Form.useForm()
  const requestRef = useRef(0)
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const selectedShipmentID = Form.useWatch('shipment_id', form)
  const selectedShipment = useMemo(
    () =>
      shipments.find(
        (item) => Number(item.id) === Number(selectedShipmentID || 0)
      ) || null,
    [selectedShipmentID, shipments]
  )

  const canCreate = hasActionPermission(adminProfile, 'sales_return.create')
  const canApprove = hasActionPermission(adminProfile, 'sales_return.approve')
  const canReceive = hasActionPermission(adminProfile, 'sales_return.receive')
  const canCancel = hasActionPermission(adminProfile, 'sales_return.cancel')

  const loadRows = useCallback(async () => {
    const sequence = requestRef.current + 1
    requestRef.current = sequence
    setLoading(true)
    try {
      const [data, shipmentData] = await Promise.all([
        listSalesReturns(
          compactParams({
            status,
            ...getBusinessPaginationParams(pagination),
          })
        ),
        listAllShipments({}),
      ])
      if (requestRef.current !== sequence) return
      const nextRows = Array.isArray(data?.sales_returns)
        ? data.sales_returns
        : []
      setRows(nextRows)
      setShipments(
        Array.isArray(shipmentData?.shipments) ? shipmentData.shipments : []
      )
      setTotal(Number(data?.total || 0))
      setSelected((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      )
    } catch (error) {
      if (requestRef.current !== sequence || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, '加载客户退货记录'))
    } finally {
      if (requestRef.current === sequence) setLoading(false)
    }
  }, [pagination, status])

  useEffect(() => {
    loadRows()
    return () => {
      requestRef.current += 1
    }
  }, [loadRows])
  useEffect(
    () => outletContext?.registerPageRefresh?.(loadRows),
    [loadRows, outletContext]
  )

  const openCreate = async () => {
    setCreateOpen(true)
    form.resetFields()
  }

  useEffect(() => {
    if (!createOpen || !selectedShipment) return
    form.setFieldsValue({
      return_no: sourceBusinessActionNo(
        'RMA',
        selectedShipment.shipment_no || 'SHIPMENT',
        sourceBusinessActionUUID()
      ),
      reason: '',
      items: (selectedShipment.items || []).map((item, index) => ({
        shipment_item_id: item.id,
        label: `出货明细 ${index + 1} / 已出货 ${item.quantity || '-'}`,
        quantity: '',
        note: '',
      })),
    })
  }, [createOpen, form, selectedShipment])

  const submitCreate = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const items = (values.items || [])
      .filter((item) => String(item.quantity || '').trim())
      .map((item) => ({
        shipment_item_id: Number(item.shipment_item_id),
        quantity: String(item.quantity).trim(),
        ...(trimOptional(item.note) ? { note: trimOptional(item.note) } : {}),
      }))
    if (items.length === 0) {
      message.warning('请至少填写一项退货数量')
      return
    }
    const payload = compactParams({
      customer_key: customerKey || undefined,
      return_no: trimOptional(values.return_no),
      shipment_id: Number(values.shipment_id),
      reason: trimOptional(values.reason),
      items,
    })
    const scope = `sales-return:${payload.shipment_id}`
    const attempt = attemptsRef.current.prepare(scope, payload)
    setSaving(true)
    try {
      const next = await createSalesReturn(attempt.params)
      if (!next?.id || next.status !== 'DRAFT') {
        throw Object.assign(new Error('客户退货结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      attemptsRef.current.settle(scope, attempt, null)
      setCreateOpen(false)
      form.resetFields()
      await loadRows()
      setSelected(next)
      message.success('客户退货申请已生成，等待审批')
    } catch (error) {
      const retained = attemptsRef.current.settle(scope, attempt, error)
      message[retained ? 'warning' : 'error'](
        retained
          ? '提交结果暂时无法确认，请保持填写内容不变后重试'
          : getActionErrorMessage(error, '创建客户退货')
      )
    } finally {
      setSaving(false)
    }
  }

  const transition = async (action, reason = '') => {
    if (!selected?.id || !selected?.version) return
    setSaving(true)
    try {
      const params = compactParams({
        customer_key: customerKey || undefined,
        id: selected.id,
        expected_version: selected.version,
        reason: trimOptional(reason),
      })
      const next =
        action === 'approve'
          ? await approveSalesReturn(params)
          : action === 'receive'
            ? await receiveSalesReturn(params)
            : await cancelSalesReturn(params)
      if (!next?.id) throw new Error('客户退货结果暂时无法确认')
      setSelected(next)
      setCancelOpen(false)
      setCancelReason('')
      await loadRows()
      message.success(
        action === 'approve'
          ? '客户退货已批准'
          : action === 'receive'
            ? '退货已收货入库'
            : '客户退货已取消'
      )
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        const recovered = await getSalesReturn({ id: selected.id }).catch(
          () => null
        )
        if (recovered?.version !== selected.version) {
          setSelected(recovered)
          await loadRows()
          message.success('已重新读取客户退货结果')
          return
        }
      }
      message.error(getActionErrorMessage(error, '处理客户退货'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { title: '退货单号', dataIndex: 'return_no', width: 190 },
    {
      title: '客户',
      dataIndex: 'customer_name',
      width: 180,
      render: (value) => value || '客户已关联',
    },
    {
      title: '来源出货',
      key: 'shipment',
      width: 150,
      render: (_, record) =>
        shipments.find(
          (shipment) => Number(shipment.id) === Number(record.shipment_id)
        )?.shipment_no || '已关联出货单',
    },
    { title: '状态', dataIndex: 'status', width: 150, render: statusTag },
    { title: '退货原因', dataIndex: 'reason', width: 300 },
    {
      title: '退货明细',
      dataIndex: 'items',
      width: 120,
      render: (items) => `${Array.isArray(items) ? items.length : 0} 项`,
    },
    {
      title: '批准时间',
      dataIndex: 'approved_at',
      width: 170,
      render: formatUnixDateTime,
    },
    {
      title: '收货时间',
      dataIndex: 'received_at',
      width: 170,
      render: formatUnixDateTime,
    },
  ]

  return (
    <BusinessPageLayout className="erp-sales-returns-page">
      <PageHeaderCard
        compact
        title="客户退货 / RMA"
        description="从真实已出货记录创建客户退货，按审批、收货和取消状态办理；收货才会形成退回库存，取消已收货记录会保留冲正追溯。"
        tags={[
          <Tag color="blue" key="source">
            来源出货
          </Tag>,
          <Tag color="gold" key="approval">
            审批后收货
          </Tag>,
          <Tag color="green" key="fact">
            收货写库存事实
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '筛选结果', value: total },
          { key: 'page', label: '本页显示', value: rows.length },
        ]}
      />
      <BusinessOperationPanel
        compact
        filters={
          <SelectFilter
            value={status}
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setStatus(value || '')
              setPagination((current) => ({ ...current, current: 1 }))
            }}
          />
        }
        actions={
          canCreate ? (
            <Button type="primary" onClick={openCreate}>
              新建客户退货
            </Button>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selected ? 1 : 0}
          selectedLabel={selected?.return_no || '请选择客户退货记录'}
          boundaryText="审批只确认退货申请；只有收货会写入退回库存，取消已收货记录会生成冲正，不会物理删除。"
        >
          <Button disabled={!selected} onClick={() => setDetail(selected)}>
            查看详情
          </Button>
          <Popconfirm
            title="确认批准客户退货？"
            onConfirm={() => transition('approve')}
          >
            <Button
              type="primary"
              disabled={
                !selected ||
                selected.status !== 'DRAFT' ||
                !canApprove ||
                saving
              }
            >
              批准
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认已收到客户退货？"
            description="确认后会按退货明细形成库存入库。"
            onConfirm={() => transition('receive')}
          >
            <Button
              disabled={
                !selected ||
                selected.status !== 'APPROVED' ||
                !canReceive ||
                saving
              }
            >
              确认收货
            </Button>
          </Popconfirm>
          <Button
            danger
            disabled={
              !selected ||
              selected.status === 'CANCELLED' ||
              !canCancel ||
              saving
            }
            onClick={() => setCancelOpen(true)}
          >
            取消退货
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>
      <Table
        className="erp-business-data-table-card"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        scroll={{ x: 1400 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelected(selectedRows[0] || null),
        }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
        locale={{ emptyText: <Empty description="暂无客户退货记录" /> }}
      />
      <Modal
        title="新建客户退货"
        open={createOpen}
        width={900}
        okText="提交退货申请"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
        onCancel={() => !saving && setCreateOpen(false)}
        onOk={submitCreate}
      >
        <Form form={form} layout="vertical" preserve={false} disabled={saving}>
          <Form.Item
            name="shipment_id"
            label="来源出货"
            rules={[{ required: true, message: '请选择已出货记录' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={shipments
                .filter((shipment) => shipment.status === 'SHIPPED')
                .map(shipmentOption)}
            />
          </Form.Item>
          <Form.Item
            name="return_no"
            label="退货单号"
            rules={[
              { required: true, whitespace: true, message: '请填写退货单号' },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="退货原因"
            rules={[
              { required: true, whitespace: true, message: '请填写退货原因' },
            ]}
          >
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
          <Form.List name="items">
            {(fields) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => (
                  <Space key={field.key} align="start" wrap>
                    <Form.Item name={[field.name, 'shipment_item_id']} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name={[field.name, 'label']} label="出货明细">
                      <Input disabled style={{ width: 260 }} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'quantity']}
                      label="退货数量"
                      rules={[
                        {
                          validator: (_, value) =>
                            !String(value || '').trim() ||
                            isPositiveNumeric20Scale6Units(
                              numeric20Scale6Units(value)
                            )
                              ? Promise.resolve()
                              : Promise.reject(new Error('数量必须大于 0')),
                        },
                      ]}
                    >
                      <Input inputMode="decimal" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'note']} label="明细备注">
                      <Input maxLength={255} style={{ width: 220 }} />
                    </Form.Item>
                  </Space>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
      <Modal
        title="取消客户退货"
        open={cancelOpen}
        okText="确认取消"
        cancelText="返回"
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
        onCancel={() => !saving && setCancelOpen(false)}
        onOk={() => {
          if (!cancelReason.trim()) {
            message.warning('请填写取消原因')
            return
          }
          transition('cancel', cancelReason)
        }}
      >
        <Input.TextArea
          value={cancelReason}
          rows={3}
          maxLength={255}
          showCount
          placeholder="请填写取消原因"
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </Modal>
      <BusinessRecordDetailsModal
        open={Boolean(detail)}
        title="客户退货详情"
        description="明细来源于已出货记录；页面不显示内部关联编号。"
        record={detail}
        columns={columns}
        onClose={() => setDetail(null)}
      />
    </BusinessPageLayout>
  )
}
