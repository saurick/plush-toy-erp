import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  cancelOutsourcingReturnDisposition,
  createOutsourcingReturnDisposition,
  listOutsourcingReturnDispositions,
  postOutsourcingReturnDisposition,
} from '../../api/operationalFactApi.mjs'
import {
  createSourceBusinessActionAttemptStore,
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'

export default function OutsourcingReturnDispositionModal({
  open,
  inspection,
  canCreate,
  canPost,
  canCancel,
  onClose,
  onChanged,
}) {
  const [form] = Form.useForm()
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const attempts = useRef(createSourceBusinessActionAttemptStore())
  const load = useCallback(async () => {
    if (!inspection?.id) return
    setLoading(true)
    try {
      const data = await listOutsourcingReturnDispositions({
        quality_inspection_id: inspection.id,
        limit: 50,
        offset: 0,
      })
      if (!Array.isArray(data?.outsourcing_return_dispositions)) {
        throw Object.assign(new Error('委外处置记录返回不完整'), {
          isInvalidResponse: true,
        })
      }
      setRows(data.outsourcing_return_dispositions)
      setSelected(
        (current) =>
          data.outsourcing_return_dispositions.find(
            (item) => item.id === current?.id
          ) ||
          data.outsourcing_return_dispositions[0] ||
          null
      )
      return data.outsourcing_return_dispositions
    } catch (error) {
      message.error(getActionErrorMessage(error, '读取委外不合格处置'))
      return null
    } finally {
      setLoading(false)
    }
  }, [inspection?.id])
  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      disposition_no: sourceBusinessActionNo(
        'OUT-DISP',
        inspection?.inspection_no || 'QUALITY',
        sourceBusinessActionUUID()
      ),
      disposition_type: 'RETURN_TO_VENDOR',
      quantity: '',
      reason: '委外回货检验不合格',
      cancel_reason: '',
    })
    load()
  }, [form, inspection?.inspection_no, load, open])

  const create = async () => {
    const values = await form.validateFields([
      'disposition_no',
      'disposition_type',
      'quantity',
      'reason',
    ])
    const payload = {
      disposition_no: values.disposition_no.trim(),
      quality_inspection_id: Number(inspection.id),
      disposition_type: values.disposition_type,
      quantity: String(values.quantity).trim(),
      reason: values.reason.trim(),
    }
    const attempt = attempts.current.prepare(
      `outsourcing-disposition:${inspection.id}`,
      payload
    )
    setLoading(true)
    try {
      const next = await createOutsourcingReturnDisposition(attempt.params)
      if (!next?.id || next.status !== 'DRAFT') {
        throw Object.assign(new Error('委外处置结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      attempts.current.settle(
        `outsourcing-disposition:${inspection.id}`,
        attempt,
        null
      )
      await load()
      setSelected(next)
      onChanged?.()
      message.success('委外处置草稿已生成')
    } catch (error) {
      const retained = attempts.current.settle(
        `outsourcing-disposition:${inspection.id}`,
        attempt,
        error
      )
      message[retained ? 'warning' : 'error'](
        retained
          ? '结果暂时无法确认，请保持内容不变后重试'
          : getActionErrorMessage(error, '生成委外处置')
      )
    } finally {
      setLoading(false)
    }
  }
  const transition = async (mode) => {
    if (!selected?.id) return
    const reason = String(form.getFieldValue('cancel_reason') || '').trim()
    if (mode === 'cancel' && !reason) {
      message.warning('请填写取消原因')
      return
    }
    setLoading(true)
    try {
      const next =
        mode === 'post'
          ? await postOutsourcingReturnDisposition({
              id: selected.id,
              expected_version: selected.version,
            })
          : await cancelOutsourcingReturnDisposition({
              id: selected.id,
              expected_version: selected.version,
              reason,
            })
      if (!next?.id || Number(next.version) <= Number(selected.version)) {
        throw Object.assign(new Error('委外处置结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      await load()
      onChanged?.()
      message.success(
        mode === 'post' ? '委外返厂或返工已确认' : '委外处置已取消'
      )
    } catch (error) {
      const refreshed = await load()
      const latest = refreshed?.find(
        (item) => Number(item.id) === Number(selected.id)
      )
      const recovered =
        (mode === 'post' && latest?.status === 'POSTED') ||
        (mode === 'cancel' && latest?.status === 'CANCELLED')
      if (recovered) {
        onChanged?.()
        message.success('已重新读取委外处置结果')
        return
      }
      message.error(getActionErrorMessage(error, '办理委外处置'))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal
      title="委外不合格返厂 / 返工"
      open={open}
      width={900}
      footer={
        <Space wrap>
          <Button onClick={onClose} disabled={loading}>
            关闭
          </Button>
          {canCreate ? (
            <Button type="primary" onClick={create} loading={loading}>
              生成处置草稿
            </Button>
          ) : null}
          {selected?.status === 'DRAFT' && canPost ? (
            <Button
              type="primary"
              onClick={() => transition('post')}
              loading={loading}
            >
              确认执行
            </Button>
          ) : null}
          {selected && selected.status !== 'CANCELLED' && canCancel ? (
            <Button
              danger
              onClick={() => transition('cancel')}
              disabled={loading}
            >
              取消 / 冲正
            </Button>
          ) : null}
        </Space>
      }
      onCancel={() => !loading && onClose?.()}
    >
      <Alert
        type="warning"
        showIcon
        message="返厂确认写库存出库，取消写冲正；返工确认生成新的在制返工批次。质检结论本身不会代写这些事实。"
      />
      <Form
        form={form}
        layout="vertical"
        disabled={loading}
        style={{ marginTop: 12 }}
      >
        <Space align="start" wrap>
          <Form.Item
            name="disposition_no"
            label="处置单号"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="disposition_type"
            label="处置方式"
            rules={[{ required: true }]}
          >
            <Select
              style={{ width: 180 }}
              options={[
                { value: 'RETURN_TO_VENDOR', label: '返厂' },
                { value: 'REWORK', label: '返工' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="处置数量"
            rules={[{ required: true }]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
        </Space>
        <Form.Item
          name="reason"
          label="处置原因"
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea rows={2} maxLength={255} />
        </Form.Item>
        <Form.Item name="cancel_reason" label="取消或冲正原因">
          <Input.TextArea rows={2} maxLength={255} />
        </Form.Item>
      </Form>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={rows}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected?.id ? [selected.id] : [],
          onChange: (_, selectedRows) => setSelected(selectedRows[0] || null),
        }}
        columns={[
          { title: '处置单号', dataIndex: 'disposition_no' },
          {
            title: '方式',
            dataIndex: 'disposition_type',
            render: (value) => (value === 'REWORK' ? '返工' : '返厂'),
          },
          { title: '数量', dataIndex: 'quantity' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) => (
              <Tag>
                {value === 'DRAFT'
                  ? '草稿'
                  : value === 'POSTED'
                    ? '已执行'
                    : '已取消'}
              </Tag>
            ),
          },
        ]}
      />
    </Modal>
  )
}
