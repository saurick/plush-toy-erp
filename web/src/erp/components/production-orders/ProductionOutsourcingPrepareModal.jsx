import React, { useEffect, useState } from 'react'
import { Alert, Form, Input, Select } from 'antd'
import { useNavigate } from 'react-router-dom'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import MaterialSupplierSelect from '../master-data/MaterialSupplierSelect.jsx'
import { prepareProductionOutsourcingOrder } from '../../api/productionWipApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'

export default function ProductionOutsourcingPrepareModal({
  open,
  batch,
  operation,
  requirements,
  onCancel,
  onPrepared,
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const fabric =
    operation?.operation_code === 'FABRIC_PROCESSING' &&
    batch?.flow_type === 'NORMAL'
  useEffect(() => {
    if (open) {
      form.resetFields()
      setError('')
    }
  }, [open, form])
  const prepare = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const result = await prepareProductionOutsourcingOrder({
        production_wip_batch_id: batch.id,
        expected_version: batch.version,
        supplier_id: values.supplier_id,
        requirement_ids: fabric ? values.requirement_ids : [],
        expected_return_date: values.expected_return_date,
      })
      message.success(`已生成 ${result.outsourcing_order_no}，请核价并确认合同`)
      onPrepared()
      navigate(
        `/erp/purchase/processing-contracts?outsourcing_order_id=${result.outsourcing_order_id}`
      )
    } catch (cause) {
      setError(getActionErrorMessage(cause, '生成委外草稿'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <BusinessFormModal
      title="按加工安排生成委外草稿"
      description="生产负责人选择外发材料和加工厂，系统带入工序、数量与单位。"
      open={open}
      onCancel={() => {
        if (!saving) onCancel()
      }}
      onOk={prepare}
      okText="生成委外草稿"
      confirmLoading={saving}
    >
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Form
        form={form}
        layout="vertical"
        disabled={saving}
        className="erp-business-action-form"
      >
        <p>
          加工工序：{operation?.process_name_snapshot} · 批次数量：
          {batch?.quantity}
        </p>
        <Form.Item
          name="supplier_id"
          label="加工厂"
          rules={[{ required: true, message: '请选择加工厂' }]}
        >
          <MaterialSupplierSelect />
        </Form.Item>
        {fabric ? (
          <Form.Item
            name="requirement_ids"
            label="本次外发的材料"
            rules={[{ required: true, message: '请选择交给加工厂的材料' }]}
          >
            <Select
              mode="multiple"
              optionFilterProp="label"
              options={requirements.map((item) => ({
                value: item.id,
                label: [
                  item.material_name_snapshot,
                  item.position,
                  `${item.planned_quantity} ${item.unit_name_snapshot || ''}`,
                ]
                  .filter(Boolean)
                  .join(' / '),
              }))}
            />
          </Form.Item>
        ) : null}
        <Form.Item
          name="expected_return_date"
          label="预计回厂日期"
          rules={[{ required: true, message: '请填写预计回厂日期' }]}
        >
          <Input type="date" />
        </Form.Item>
      </Form>
    </BusinessFormModal>
  )
}
