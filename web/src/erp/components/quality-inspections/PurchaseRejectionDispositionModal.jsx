import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Tag,
} from 'antd'
import { unitQuantityRule } from '../../utils/unitQuantity.mjs'
import { sumNumeric20Scale6Values,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import Table from '@/common/components/table/AppTable'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  cancelPurchaseRejectionDisposition,
  createPurchaseRejectionDisposition,
  getPurchaseRejectionDisposition,
  listPurchaseRejectionDispositions,
  postPurchaseRejectionDisposition,
} from '../../api/purchaseApi.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'

const STATUS_META = Object.freeze({
  DRAFT: { label: '草稿', color: 'blue' },
  POSTED: { label: '已确认', color: 'green' },
  CANCELLED: { label: '已取消', color: 'default' },
})

export default function PurchaseRejectionDispositionModal({
  open,
  inspection,
  canPost = false,
  canReceiveReplacement = false,
  canCancel = false,
  onClose,
  onChanged,
}) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [record, setRecord] = useState(null)
  const [postConfirmOpen, setPostConfirmOpen] = useState(false)
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  }, [onChanged])
  const sourceRef = useRef(null)
  sourceRef.current = open ? Number(inspection?.id || 0) : null
  const [history, setHistory] = useState([])
  useEffect(() => {
    setPostConfirmOpen(false)
  }, [open, record?.id, record?.status])
  useEffect(() => {
    if (!record) return
    form.setFieldsValue({
      disposition_no: record.disposition_no,
      disposition_type: record.disposition_type,
      quantity: record.quantity,
      reason: record.reason,
      cancel_reason: '',
      counted_quantity: '',
    })
  }, [form, record])

  const remember = useCallback((next) => {
    if (
      !sourceRef.current ||
      Number(next?.quality_inspection_id) !== sourceRef.current
    )
      { return }
    setRecord(next || null)
    if (next?.id) {
      setHistory((current) => [
        next,
        ...current.filter((item) => Number(item.id) !== Number(next.id)),
      ])
    }
    onChangedRef.current?.(next || null)
  }, [])

  const recover = useCallback(
    async (id, quiet = false) => {
      try {
        const next = await getPurchaseRejectionDisposition({ id: Number(id) })
        if (!next?.id) throw new Error('退厂处置回执不完整')
        remember(next)
        return next
      } catch (error) {
        if (!quiet) {
          message.error(getActionErrorMessage(error, '恢复退厂处置记录'))
        }
        return null
      }
    },
    [remember]
  )

  useEffect(() => {
    setHistory([])
    setRecord(null)
    if (!open || !inspection?.id) return
    let active = true
    const controller = new AbortController()
    form.resetFields()
    form.setFieldsValue({
      disposition_no: sourceBusinessActionNo(
        'IQC-DISP',
        inspection?.inspection_no || 'QUALITY',
        sourceBusinessActionUUID()
      ),
      disposition_type: 'RETURN_TO_VENDOR',
      quantity: '',
      reason: '首次来料检验不合格',
      cancel_reason: '',
    })
    listPurchaseRejectionDispositions(
      {
        quality_inspection_id: Number(inspection?.id || 0),
        limit: 50,
        offset: 0,
      },
      { signal: controller.signal }
    )
      .then((data) => {
        if (!active) return
        const rows = Array.isArray(data?.purchase_rejection_dispositions)
          ? data.purchase_rejection_dispositions
          : []
        setHistory(rows)
        setRecord(
          rows.find((item) => item?.status === 'DRAFT') || rows[0] || null
        )
      })
      .catch((error) => {
        if (active)
          { message.error(getActionErrorMessage(error, '读取来料处置记录')) }
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [form, inspection?.id, inspection?.inspection_no, open, recover])

  const create = async () => {
    let values
    try {
      values = await form.validateFields([
        'disposition_no',
        'disposition_type',
        'quantity',
        'reason',
      ])
    } catch {
      return
    }
    const payload = {
      disposition_no: String(values.disposition_no || '').trim(),
      quality_inspection_id: Number(inspection?.id || 0),
      disposition_type: values.disposition_type,
      quantity: String(values.quantity || '').trim(),
      reason: String(values.reason || '').trim(),
    }
    const scope = `purchase-rejection:${inspection?.id || 0}`
    const attempt = attemptsRef.current.prepare(scope, payload)
    setLoading(true)
    try {
      const next = await createPurchaseRejectionDisposition(attempt.params)
      if (!next?.id || next.status !== 'DRAFT') {
        throw Object.assign(new Error('退厂处置结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      attemptsRef.current.settle(scope, attempt, null)
      remember(next)
      message.success('退厂处置草稿已生成，请核对后确认')
    } catch (error) {
      const retained = attemptsRef.current.settle(scope, attempt, error)
      message[retained ? 'warning' : 'error'](
        retained
          ? '提交结果暂时无法确认，请保持内容不变后重试'
          : getActionErrorMessage(error, '生成退厂处置')
      )
    } finally {
      setLoading(false)
    }
  }

  const prepareNew = () => {
    setRecord(null)
    form.setFieldsValue({
      disposition_no: sourceBusinessActionNo(
        'IQC-DISP',
        inspection?.inspection_no || 'QUALITY',
        sourceBusinessActionUUID()
      ),
      disposition_type: 'RETURN_TO_VENDOR',
      quantity: '',
      reason: '首次来料检验不合格',
      cancel_reason: '',
    })
  }

  const transition = async (action) => {
    if (!record?.id) return
    const replacement = record.disposition_type === 'REPLACE'
    if (
      action === 'post' &&
      (!canPost || (replacement && !canReceiveReplacement))
    )
      { return }
    let countedQuantity
    if (action === 'post' && replacement) {
      try {
        const values = await form.validateFields(['counted_quantity'])
        countedQuantity = String(values.counted_quantity).trim()
      } catch {
        return
      }
    }
    const cancelReason = String(
      form.getFieldValue('cancel_reason') || ''
    ).trim()
    if (action === 'cancel' && !cancelReason) {
      message.warning('请填写取消原因')
      return
    }
    setLoading(true)
    try {
      const next =
        action === 'post'
          ? await postPurchaseRejectionDisposition({
              id: record.id,
              expected_version: record.version,
              ...(replacement ? { counted_quantity: countedQuantity } : {}),
            })
          : await cancelPurchaseRejectionDisposition({
              id: record.id,
              expected_version: record.version,
              reason: cancelReason,
            })
      if (!next?.id) {
        throw Object.assign(new Error('退厂处置结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      remember(next)
      message.success(action === 'post' ? '退厂处置已确认' : '退厂处置已取消')
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        const recovered = await recover(record.id, true)
        if (recovered?.status !== record.status) {
          message.success('已重新读取退厂处置结果')
          return
        }
      }
      message.error(getActionErrorMessage(error, '处理退厂处置'))
    } finally {
      setLoading(false)
    }
  }

  const changePostConfirmation = async (nextOpen) => {
    if (nextOpen && record?.disposition_type === 'REPLACE') {
      try {
        await form.validateFields(['counted_quantity'])
      } catch {
        return
      }
    }
    setPostConfirmOpen(nextOpen)
  }

  const status = STATUS_META[record?.status] || null
  return (
    <BusinessModal
      className="erp-purchase-rejection-disposition-modal"
      title="首次来料不合格退厂处置"
      open={open}
      size="recordDetails"
      destroyOnHidden
      maskClosable={!loading}
      keyboard={!loading}
      closable={!loading}
      onCancel={() => !loading && onClose?.()}
      footer={
        <Space wrap>
          <Button disabled={loading} onClick={onClose}>
            关闭
          </Button>
          {!record ? (
            <Button type="primary" loading={loading} onClick={create}>
              生成处置草稿
            </Button>
          ) : null}
          {record && record.status !== 'DRAFT' ? (
            <Button disabled={loading} onClick={prepareNew}>
              继续登记
            </Button>
          ) : null}
          {record && record.status !== 'CANCELLED' && canCancel ? (
            <Popconfirm
              title="确认取消这笔处置？"
              okText="确认取消"
              cancelText="返回"
              onConfirm={() => transition('cancel')}
            >
              <Button danger disabled={loading}>
                取消处置
              </Button>
            </Popconfirm>
          ) : null}
          {record?.status === 'DRAFT' &&
          canPost &&
          (record.disposition_type !== 'REPLACE' || canReceiveReplacement) ? (
            <Popconfirm
              title="确认退厂处置？"
              open={postConfirmOpen}
              onOpenChange={changePostConfirmation}
              description={
                record.disposition_type === 'REPLACE'
                  ? '请确认补换实物已到货且已逐项清点。实点数量必须与本笔补换一致，确认后才交 IQC 重新检验。'
                  : '确认本笔退厂数量及实物交接。原收货未入库，不生成库存退货流水。'
              }
              okText="确认处置"
              cancelText="返回"
              onConfirm={() => transition('post')}
            >
              <Button type="primary" loading={loading}>
                确认处置
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      }
    >
      <Alert
        type="warning"
        showIcon
        message="采购按不合格来源行登记退厂或补换方案。补换由仓库实点到货后确认，再交 IQC 重新检验；部分处置不会取消整张收货。"
      />
      {history.length > 0 ? (
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          message={`已登记 ${history.length} 笔处置，累计数量 ${sumNumeric20Scale6Values(history.filter((item) => item.status !== 'CANCELLED').map((item) => item.quantity))}`}
        />
      ) : null}
      {history.length > 0 ? (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          style={{ marginTop: 12 }}
          dataSource={history}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: record?.id ? [record.id] : [],
            onChange: (_, rows) => setRecord(rows[0] || null),
          }}
          columns={[
            { title: '处置单号', dataIndex: 'disposition_no' },
            {
              title: '方式',
              dataIndex: 'disposition_type',
              render: (value) =>
                value === 'REPLACE' ? '供应商补换' : '退回供应商',
            },
            { align: 'right', title: '数量', dataIndex: 'quantity' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value) => STATUS_META[value]?.label || '待确认',
            },
          ]}
        />
      ) : null}
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'inspection',
            label: '质检单',
            children: inspection?.inspection_no || '已关联质检单',
          },
          {
            key: 'supplier',
            label: '供应商',
            children: record?.supplier_name || '将按质检来源带入',
          },
          ...(status
            ? [
                {
                  key: 'status',
                  label: '处置状态',
                  children: <Tag color={status.color}>{status.label}</Tag>,
                },
              ]
            : []),
        ]}
      />
      <Form form={form} layout="vertical" preserve={false} disabled={loading}>
        <Form.Item
          name="disposition_no"
          label="处置单号"
          rules={[
            { required: true, whitespace: true, message: '请填写处置单号' },
          ]}
        >
          <Input maxLength={64} disabled={Boolean(record)} />
        </Form.Item>
        <Form.Item
          name="disposition_type"
          label="处置方式"
          rules={[{ required: true, message: '请选择处置方式' }]}
        >
          <Select
            disabled={Boolean(record)}
            options={[
              { value: 'RETURN_TO_VENDOR', label: '退回供应商' },
              { value: 'REPLACE', label: '供应商补换' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="quantity"
          label="处置数量"
          rules={[
            unitQuantityRule(inspection?.unit_precision),
            { required: true, message: '请填写处置数量' },
            {
              validator: (_, value) =>
                isPositiveNumeric20Scale6Units(numeric20Scale6Units(value))
                  ? Promise.resolve()
                  : Promise.reject(new Error('处置数量必须大于 0')),
            },
          ]}
        >
          <Input inputMode="decimal" disabled={Boolean(record)} />
        </Form.Item>
        <Form.Item
          name="reason"
          label="处置原因"
          rules={[
            { required: true, whitespace: true, message: '请填写处置原因' },
          ]}
        >
          <Input.TextArea
            rows={2}
            maxLength={255}
            showCount
            disabled={Boolean(record)}
          />
        </Form.Item>
        {record?.status === 'DRAFT' && record.disposition_type === 'REPLACE' ? (
          <Form.Item
            name="counted_quantity"
            label="补换实际到货数量"
            extra={
              canReceiveReplacement
                ? '按实物清点填写；数量与本笔方案不符时，先取消本笔并按实际数量重新登记。'
                : '等待仓库实点并确认，采购登记方案不代表补换已到货。'
            }
            rules={[
              { required: true, message: '请填写补换实际到货数量' },
              unitQuantityRule(inspection?.unit_precision, { positive: true }),
              {
                validator: (_, value) =>
                  isPositiveNumeric20Scale6Units(numeric20Scale6Units(value)) &&
                  numeric20Scale6Units(value) ===
                    numeric20Scale6Units(record.quantity)
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          '实点数量须与本笔补换一致；不一致请先调整处置方案'
                        )
                      ),
              },
            ]}
          >
            <Input inputMode="decimal" disabled={!canReceiveReplacement} />
          </Form.Item>
        ) : null}
        {record && record.status !== 'CANCELLED' && canCancel ? (
          <Form.Item name="cancel_reason" label="取消原因（取消时必填）">
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
        ) : null}
      </Form>
    </BusinessModal>
  )
}
