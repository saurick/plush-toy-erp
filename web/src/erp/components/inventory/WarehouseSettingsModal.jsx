import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Space, Switch, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import Select from '@/common/components/select/AppSelect'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput.jsx'
import { message, useModal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { BusinessActionTooltip } from '../business-list/BusinessListLayout.jsx'
import MaintenanceSelectionBar from '../business-list/MaintenanceSelectionBar.jsx'
import {
  createWarehouse,
  updateWarehouse,
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
import {
  WAREHOUSE_TYPE_OPTIONS,
  warehouseTypeLabel,
} from '../../utils/warehouseClassification.mjs'
import BusinessForm from '../business-list/BusinessForm.jsx'
import './warehouseSettings.css'

export default function WarehouseSettingsModal({ open, onCancel, onSaved }) {
  const [form] = Form.useForm()
  const modal = useModal()
  const pendingSwitch = useRef(null)
  const submitting = useRef(false)
  const active = useRef(true)
  const editorDefaults = useRef(null)
  const invalidField = useRef(null)
  const toolbarRef = useRef(null)
  const [rows, setRows] = useState([])
  const [selectedID, setSelectedID] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [editorMode, setEditorMode] = useState(null)
  const [editingID, setEditingID] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const matches = rows.filter((row) => [row.code, row.name, warehouseTypeLabel(row.type)].some((value) => String(value || '').toLocaleLowerCase().includes(keyword.toLocaleLowerCase())))
  const selected = matches.slice((page - 1) * 5, page * 5).find((row) => row.id === selectedID)
  const selectionLocked = busy || loading || Boolean(error) || editorMode !== null
  useEffect(() => {
    active.current = true
    return () => { active.current = false; pendingSwitch.current?.destroy() }
  }, [])
  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    setError('')
    setLoading(true)
    listAllWarehouses({}, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.warehouses)
          setPage((current) => Math.min(current, Math.max(1, Math.ceil(result.warehouses.length / 5))))
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(getActionErrorMessage(err, '加载仓库'))
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, refresh])
  useEffect(() => {
    if (open) {
      setEditingID(0)
      setSelectedID(0)
      setPage(1)
      setKeyword('')
      setEditorMode(null)
      setDirty(false)
    }
  }, [open, form])
  useEffect(() => {
    if (!editorMode) return
    form.resetFields()
    form.setFieldsValue(editorDefaults.current)
    form.getFieldInstance(editorMode === 'new' ? 'code' : 'name')?.focus()
  }, [editorMode, editingID, form])
  useEffect(() => {
    if (open && editorMode === null) {
      toolbarRef.current?.closest('.ant-modal-body')?.scrollTo?.({ top: 0 })
    }
  }, [editorMode, open])
  useEffect(() => {
    if (busy || !editorMode || !invalidField.current) return
    form.scrollToField(invalidField.current, { focus: true, block: 'nearest' })
    invalidField.current = null
  }, [busy, editorMode, form])
  const confirmDiscard = (reset) => {
    if (busy) return
    if (!dirty) { reset(); return }
    if (pendingSwitch.current) return
    pendingSwitch.current = modal.confirm({
      maskClosable: true,
      title: '放弃未保存的修改？',
      content: '当前仓库的修改尚未保存，放弃后无法恢复。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: reset,
      afterClose: () => { pendingSwitch.current = null },
    })
  }
  const chooseWarehouse = (row = null) => {
    confirmDiscard(() => {
      editorDefaults.current = row || { is_active: true }
      invalidField.current = null
      setEditingID(row?.id || 0)
      setSelectedID(row?.id || 0)
      setEditorMode(row ? 'edit' : 'new')
      setDirty(false)
    })
  }
  const cancelEditor = () => confirmDiscard(() => {
    setEditorMode(null)
    invalidField.current = null
    setEditingID(0)
    setDirty(false)
  })
  const save = async () => {
    if (submitting.current || !editorMode || loading || error) return
    submitting.current = true
    setBusy(true)
    try {
      const values = await form.validateFields()
      const row = await (editingID
        ? updateWarehouse({ ...values, id: editingID })
        : createWarehouse(values))
      if (!active.current) return
      message.success('仓库已保存')
      const updatedRows = rows.some((item) => item.id === row.id) ? rows.map((item) => item.id === row.id ? row : item) : [row, ...rows]
      setRows(updatedRows)
      setSelectedID(row.id)
      setKeyword('')
      setPage(Math.floor(updatedRows.findIndex((item) => item.id === row.id) / 5) + 1)
      setEditorMode(null)
      setEditingID(0)
      setDirty(false)
      setRefresh((value) => value + 1)
      onSaved?.()
    } catch (err) {
      if (!active.current) return
      if (Array.isArray(err?.errorFields)) {
        invalidField.current = err.errorFields[0]?.name || null
        return
      }
      message.error(getActionErrorMessage(err, '保存仓库'))
    } finally {
      submitting.current = false
      if (active.current) setBusy(false)
    }
  }
  const footer = (
    <div className="erp-warehouse-settings-footer">
      <Typography.Text type="secondary">{editorMode ? editingID ? '编辑仓库' : '新建仓库' : `共 ${matches.length} 个仓库`}</Typography.Text>
      <Space wrap>
        <Button disabled={busy} onClick={editorMode ? cancelEditor : onCancel}>{editorMode ? '取消' : '关闭'}</Button>
        {editorMode ? <Button type="primary" loading={busy} disabled={loading || Boolean(error)} onClick={save}>{editingID ? '保存修改' : '保存仓库'}</Button> : null}
      </Space>
    </div>
  )
  return (
    <BusinessFormModal
      open={open}
      form={form}
      dirty={dirty}
      title="仓库设置"
      description="已有库存或默认仓关联时，用途变更和停用受限制。"
      className="erp-warehouse-settings-modal"
      onCancel={busy ? undefined : onCancel}
      onOk={save}
      okText={editingID ? '保存修改' : '保存仓库'}
      confirmLoading={busy}
      okButtonProps={{ disabled: loading || Boolean(error) }}
      maskClosable={!busy}
      width={800}
      footer={footer}
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
      <div className="erp-warehouse-settings-toolbar" ref={toolbarRef}>
        <SearchInput allowClear aria-label="搜索仓库" placeholder="搜索编号、名称或用途" disabled={selectionLocked} value={keyword} onSearch={(value) => { setKeyword(value.trim()); setPage(1); setSelectedID(0) }} />
        <Button type="primary" aria-label="新增仓库" icon={<PlusOutlined />} disabled={busy || loading || Boolean(error) || editorMode === 'new'} onClick={() => chooseWarehouse()}>新增仓库</Button>
      </div>
      <MaintenanceSelectionBar selectionLabel="仓库" emptyText="请选择一个仓库" selectedLabel={selected ? `${selected.code} · ${selected.name}` : null} disabled={selectionLocked} onClear={() => setSelectedID(0)}>
        <BusinessActionTooltip disabled={selectionLocked || !selected} disabledReason={selected ? '请先完成当前编辑或等待读取完成' : '请先选择一个仓库'}>
          <Button disabled={selectionLocked || !selected} onClick={() => chooseWarehouse(selected)}>编辑</Button>
        </BusinessActionTooltip>
      </MaintenanceSelectionBar>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={matches}
        pagination={{ current: page, pageSize: 5, hideOnSinglePage: true, disabled: selectionLocked, onChange: (next) => { if (selectionLocked) return; setPage(next); setSelectedID(0) } }}
        scroll={{ x: 560 }}
        rowSelection={{ type: 'radio', columnTitle: null, selectedRowKeys: selected ? [selected.id] : [], getCheckboxProps: (row) => ({ disabled: selectionLocked, 'aria-label': `选择仓库 ${row.code} · ${row.name}` }), onChange: (_keys, selectedRows) => { if (!selectionLocked) setSelectedID(selectedRows[0]?.id || 0) } }}
        rowClassName={(row) => row.id === selectedID ? 'ant-table-row-selected' : ''}
        onRow={(row) => ({ onClick: () => { if (!selectionLocked) setSelectedID(row.id) } })}
        columns={[
          { title: '编号', dataIndex: 'code', width: 140 },
          { align: 'left', title: '仓库名称', dataIndex: 'name' },
          { title: '用途', dataIndex: 'type', width: 150, render: warehouseTypeLabel },
          {
            title: '状态',
            dataIndex: 'is_active',
            width: 72,
            render: (value) => (value ? '启用' : '停用'),
          },
        ]}
      />
      {editorMode ? (
        <BusinessForm
          form={form}
          layout="vertical"
          className="erp-business-action-form erp-warehouse-settings-form"
          disabled={busy}
          onValuesChange={() => setDirty(true)}
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
              placeholder="请选择仓库用途"
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
        </BusinessForm>
      ) : null}
    </BusinessFormModal>
  )
}
