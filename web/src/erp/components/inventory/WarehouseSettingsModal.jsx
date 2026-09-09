import React, { useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Select, Switch, Table } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import {
  createWarehouse,
  updateWarehouse,
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
import {
  WAREHOUSE_TYPE_OPTIONS,
  warehouseTypeLabel,
} from '../../utils/warehouseClassification.mjs'

export default function WarehouseSettingsModal({ open, onCancel, onSaved }) {
  const [form] = Form.useForm()
  const [rows, setRows] = useState([])
  const [editingID, setEditingID] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    setError('')
    listAllWarehouses({}, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setRows(result.warehouses)
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(getActionErrorMessage(err, '加载仓库'))
        }
      })
    return () => controller.abort()
  }, [open, refresh])
  useEffect(() => {
    if (open) {
      setEditingID(0)
      form.resetFields()
      form.setFieldsValue({ is_active: true })
    }
  }, [open, form])
  const save = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setBusy(true)
    try {
      const row = await (editingID
        ? updateWarehouse({ ...values, id: editingID })
        : createWarehouse(values))
      message.success('仓库已保存')
      setEditingID(row.id)
      setRefresh((value) => value + 1)
      onSaved?.()
    } catch (err) {
      message.error(getActionErrorMessage(err, '保存仓库'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <BusinessFormModal
      open={open}
      title="仓库设置"
      description="按实际仓库设置用途；材料与成品分别入账，已有库存或默认仓关联会限制类别变更和停用。"
      onCancel={busy ? undefined : onCancel}
      onOk={save}
      okText={editingID ? '保存修改' : '新增仓库'}
      confirmLoading={busy}
      width={880}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button onClick={() => setRefresh((value) => value + 1)}>
              重试
            </Button>
          }
        />
      ) : null}
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 5 }}
        scroll={{ x: 540 }}
        columns={[
          { title: '编号', dataIndex: 'code' },
          { title: '仓库名称', dataIndex: 'name' },
          { title: '用途', dataIndex: 'type', render: warehouseTypeLabel },
          {
            title: '状态',
            dataIndex: 'is_active',
            render: (value) => (value ? '启用' : '停用'),
          },
          {
            title: '操作',
            key: 'edit',
            render: (_, row) => (
              <Button
                size="small"
                disabled={busy}
                onClick={() => {
                  setEditingID(row.id)
                  form.setFieldsValue(row)
                }}
              >
                编辑
              </Button>
            ),
          },
        ]}
      />
      <Button
        disabled={busy}
        onClick={() => {
          setEditingID(0)
          form.resetFields()
          form.setFieldsValue({ is_active: true })
        }}
      >
        新建仓库
      </Button>
      <Form
        form={form}
        layout="vertical"
        className="erp-business-action-form"
        disabled={busy}
      >
        <Form.Item
          label="仓库编号"
          name="code"
          rules={[{ required: true, message: '请输入仓库编号' }]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label="仓库名称"
          name="name"
          rules={[{ required: true, message: '请输入仓库名称' }]}
        >
          <Input maxLength={128} />
        </Form.Item>
        <Form.Item
          label="仓库用途"
          name="type"
          rules={[
            {
              required: true,
              type: 'enum',
              enum: WAREHOUSE_TYPE_OPTIONS.map((item) => item.value),
              message: '请选择仓库用途',
            },
          ]}
        >
          <Select
            options={
              rows.some(
                (row) => row.id === editingID && row.type === 'UNCLASSIFIED'
              )
                ? [
                    ...WAREHOUSE_TYPE_OPTIONS,
                    { value: 'UNCLASSIFIED', label: '待分类', disabled: true },
                  ]
                : WAREHOUSE_TYPE_OPTIONS
            }
          />
        </Form.Item>
        <Form.Item label="启用" name="is_active" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </BusinessFormModal>
  )
}
