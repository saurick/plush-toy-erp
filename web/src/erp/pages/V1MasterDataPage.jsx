import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Tag,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessFilterPanel,
  CollaborationTaskPanel,
  BusinessListToolbar,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  createContact,
  createCustomer,
  createSupplier,
  listContactsByOwner,
  listCustomers,
  listSuppliers,
  setCustomerActive,
  setPrimaryContact,
  setSupplierActive,
  disableContact,
  updateContact,
  updateCustomer,
  updateSupplier,
} from '../api/masterDataOrderApi.mjs'
import {
  buildContactParams,
  buildMasterDataParams,
  formatUnixDate,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'

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
    summary:
      '正式 customers 表页面，只维护客户交易主体，不写订单、出货、库存或财务事实。',
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
    summary:
      '正式 suppliers 表页面，只维护供应商 / 加工厂交易主体，不写采购入库、质检、库存或财务事实。',
  },
})

const ACTIVE_FILTER_OPTIONS = Object.freeze([
  { label: '全部主体', value: 'all' },
  { label: '仅看启用', value: 'active' },
])

function activeTag(active) {
  return active === false ? (
    <Tag color="red">停用</Tag>
  ) : (
    <Tag color="green">启用</Tag>
  )
}

function MasterDataFormFields({ type }) {
  return (
    <>
      <Form.Item
        label="编号"
        name="code"
        rules={[{ required: true, message: '请填写编号' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        label="名称"
        name="name"
        rules={[{ required: true, message: '请填写名称' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="简称" name="short_name">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      {type === 'suppliers' ? (
        <Form.Item label="供应商类型" name="supplier_type">
          <Input
            allowClear
            autoComplete="off"
            placeholder="如：加工厂、辅材供应商"
          />
        </Form.Item>
      ) : null}
      <Form.Item label="税号" name="tax_no">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="备注" name="note">
        <Input.TextArea allowClear rows={3} showCount maxLength={300} />
      </Form.Item>
    </>
  )
}

function ContactFormFields() {
  return (
    <>
      <Form.Item
        label="联系人"
        name="name"
        rules={[{ required: true, message: '请填写联系人' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="职位" name="title">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="手机" name="mobile">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="电话" name="phone">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="邮箱" name="email">
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item label="主联系人" name="is_primary" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item label="备注" name="note">
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
  const [editingRecord, setEditingRecord] = useState(null)
  const [editingContact, setEditingContact] = useState(null)
  const [saving, setSaving] = useState(false)
  const [recordForm] = Form.useForm()
  const [contactForm] = Form.useForm()

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
  const canSetPrimaryContact = hasActionPermission(
    adminProfile,
    config.permissions.contactPrimary
  )

  const loadContacts = useCallback(
    async (record) => {
      if (!record?.id) {
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
    [config.ownerType]
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
    setEditingRecord(record)
    recordForm.setFieldsValue(record)
    setRecordModalOpen(true)
  }

  const openCreateContact = () => {
    if (!selectedRecord?.id) {
      message.warning('请先选择一个主体')
      return
    }
    setEditingContact(null)
    contactForm.resetFields()
    contactForm.setFieldsValue({ is_primary: false })
    setContactModalOpen(true)
  }

  const openEditContact = (contact) => {
    setEditingContact(contact)
    contactForm.setFieldsValue(contact)
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
    if (!selectedRecord?.id) return
    const values = await contactForm.validateFields()
    setSaving(true)
    try {
      const params = buildContactParams(values, {
        owner_type: config.ownerType,
        owner_id: selectedRecord.id,
        ...(editingContact?.id ? { id: editingContact.id } : {}),
      })
      await (editingContact?.id ? updateContact(params) : createContact(params))
      message.success(editingContact?.id ? '联系人已更新' : '联系人已创建')
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

  const markPrimaryContact = async (contact) => {
    setSaving(true)
    try {
      await setPrimaryContact({ id: contact.id })
      message.success('主联系人已更新')
      await loadContacts(selectedRecord)
    } catch (error) {
      message.error(getActionErrorMessage(error, '设置主联系人'))
    } finally {
      setSaving(false)
    }
  }

  const disableSelectedContact = async (contact) => {
    setSaving(true)
    try {
      await disableContact({ id: contact.id })
      message.success('联系人已禁用')
      await loadContacts(selectedRecord)
    } catch (error) {
      message.error(getActionErrorMessage(error, '禁用联系人'))
    } finally {
      setSaving(false)
    }
  }

  const recordColumns = useMemo(
    () => [
      { title: '编号', dataIndex: 'code', width: 140 },
      { title: '名称', dataIndex: 'name', width: 220 },
      {
        title: '简称',
        dataIndex: 'short_name',
        width: 160,
        render: (value) => value || '-',
      },
      ...(type === 'suppliers'
        ? [
            {
              title: '类型',
              dataIndex: 'supplier_type',
              width: 140,
              render: (value) => value || '-',
            },
          ]
        : []),
      {
        title: '税号',
        dataIndex: 'tax_no',
        width: 180,
        render: (value) => value || '-',
      },
      { title: '状态', dataIndex: 'is_active', width: 90, render: activeTag },
      {
        title: '操作',
        key: 'actions',
        width: 260,
        fixed: 'right',
        render: (_, record) => (
          <Space size={6} wrap>
            <Button
              size="small"
              onClick={() => {
                setSelectedRecord(record)
                setDetailOpen(true)
              }}
            >
              查看
            </Button>
            {canUpdate ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditRecord(record)}
              >
                编辑
              </Button>
            ) : null}
            {canDisable ? (
              <Popconfirm
                title={record.is_active === false ? '确认启用？' : '确认停用？'}
                onConfirm={() => toggleRecordActive(record)}
              >
                <Button
                  size="small"
                  icon={
                    record.is_active === false ? (
                      <CheckCircleOutlined />
                    ) : (
                      <StopOutlined />
                    )
                  }
                >
                  {record.is_active === false ? '启用' : '停用'}
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [canDisable, canUpdate, type]
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
      {
        title: '操作',
        key: 'actions',
        width: 260,
        render: (_, contact) => (
          <Space size={6} wrap>
            {canUpdateContact ? (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditContact(contact)}
              >
                编辑
              </Button>
            ) : null}
            {canSetPrimaryContact && contact.is_active !== false ? (
              <Button
                size="small"
                icon={<UserSwitchOutlined />}
                onClick={() => markPrimaryContact(contact)}
              >
                设为主联系人
              </Button>
            ) : null}
            {canDisableContact && contact.is_active !== false ? (
              <Popconfirm
                title="确认禁用该联系人？"
                onConfirm={() => disableSelectedContact(contact)}
              >
                <Button size="small" icon={<StopOutlined />}>
                  禁用
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [canDisableContact, canSetPrimaryContact, canUpdateContact]
  )

  const activeRecordCount = useMemo(
    () => records.filter((record) => record.is_active !== false).length,
    [records]
  )
  const selectedRecordDisplayText = useMemo(() => {
    if (!selectedRecord) return '请先选择一个主体'
    return `${selectedRecord.code || selectedRecord.id} / ${
      selectedRecord.name || '未命名主体'
    }`
  }, [selectedRecord])
  const selectedRecordSummaryItems = useMemo(() => {
    if (!selectedRecord) return []
    const items = [
      {
        key: 'status',
        label: '状态',
        value: selectedRecord.is_active === false ? '停用' : '启用',
      },
      {
        key: 'short-name',
        label: '简称',
        value: selectedRecord.short_name || '-',
      },
      {
        key: 'contacts',
        label: '联系人',
        value: contacts.length,
      },
    ]
    if (type === 'suppliers') {
      items.splice(2, 0, {
        key: 'supplier-type',
        label: '类型',
        value: selectedRecord.supplier_type || '-',
      })
    }
    return items
  }, [contacts.length, selectedRecord, type])

  return (
    <BusinessPageLayout className="erp-v1-master-data-page">
      <PageHeaderCard
        compact
        sectionTitle="基础资料"
        title={config.title}
        description={config.summary}
        tags={
          <div className="erp-business-module-chip-row">
            <Tag color="green">正式 MasterData</Tag>
            <Tag>只维护交易主体</Tag>
          </div>
        }
        stats={[
          { key: 'total', label: '总主体', value: total },
          { key: 'current', label: '当前结果', value: records.length },
          { key: 'active', label: '启用主体', value: activeRecordCount },
          { key: 'selected', label: '已选主体', value: selectedRecord ? 1 : 0 },
        ]}
      />

      <BusinessFilterPanel compact>
        <SearchInput
          placeholder="搜索编号、名称、简称"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={loadRecords}
        />
        <SelectFilter
          className="erp-business-filter-control--status"
          options={ACTIVE_FILTER_OPTIONS}
          value={activeOnly ? 'active' : 'all'}
          onChange={(nextValue) => setActiveOnly(nextValue === 'active')}
        />
      </BusinessFilterPanel>

      <BusinessListToolbar
        stats={[
          { key: 'current', label: '当前结果', value: records.length },
          { key: 'contacts', label: '当前联系人', value: contacts.length },
          { key: 'selected', label: '已选主体', value: selectedRecord ? 1 : 0 },
        ]}
        actions={
          <>
            <ToolbarButton
              icon={<ReloadOutlined />}
              onClick={loadRecords}
              loading={loading}
            >
              刷新
            </ToolbarButton>
            {canCreate ? (
              <ToolbarButton
                type="primary"
                className="erp-business-list-toolbar__primary-action"
                icon={<PlusOutlined />}
                onClick={openCreateRecord}
              >
                新建主体
              </ToolbarButton>
            ) : null}
          </>
        }
      />

      <SelectionActionBar
        selectedCount={selectedRecord ? 1 : 0}
        selectedLabel={selectedRecordDisplayText}
        summaryItems={selectedRecordSummaryItems}
        boundaryText={config.summary}
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
            编辑主体
          </Button>
        ) : null}
        {canDisable ? (
          <Popconfirm
            title={
              selectedRecord?.is_active === false ? '确认启用？' : '确认停用？'
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
      </SelectionActionBar>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={recordColumns}
        dataSource={records}
        scroll={{ x: 980 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        emptyDescription="暂无客户或供应商主体记录"
        rowClassName={(record) =>
          record.id === selectedRecord?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedRecord(record),
        })}
      />

      <BusinessListToolbar
        stats={[
          {
            key: 'owner',
            label: '联系人主体',
            value: selectedRecord?.name || '未选择',
          },
          { key: 'contacts', label: '联系人', value: contacts.length },
        ]}
        actions={
          canCreateContact ? (
            <ToolbarButton
              icon={<PlusOutlined />}
              onClick={openCreateContact}
              disabled={!selectedRecord}
            >
              新建联系人
            </ToolbarButton>
          ) : null
        }
      />
      <BusinessDataTable
        rowKey="id"
        loading={selectedRecord ? contactLoading : false}
        columns={contactColumns}
        dataSource={selectedRecord ? contacts : []}
        scroll={{ x: 1080 }}
        pagination={false}
        emptyDescription={
          selectedRecord ? '当前主体暂无联系人' : '尚未选择主体'
        }
      />

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={selectedRecord?.name || ''}
      />

      <Modal
        title={editingRecord?.id ? '编辑主数据' : '新建主数据'}
        open={recordModalOpen}
        onOk={saveRecord}
        onCancel={() => setRecordModalOpen(false)}
        confirmLoading={saving}
        forceRender
        destroyOnHidden={false}
      >
        <Form form={recordForm} layout="vertical">
          <MasterDataFormFields type={type} />
        </Form>
      </Modal>

      <Modal
        title={editingContact?.id ? '编辑联系人' : '新建联系人'}
        open={contactModalOpen}
        onOk={saveContact}
        onCancel={() => setContactModalOpen(false)}
        confirmLoading={saving}
        forceRender
        destroyOnHidden={false}
      >
        <Form form={contactForm} layout="vertical">
          <ContactFormFields />
        </Form>
      </Modal>

      <Drawer
        title="主数据详情"
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
            <Descriptions.Item label="简称">
              {selectedRecord.short_name || '-'}
            </Descriptions.Item>
            {type === 'suppliers' ? (
              <Descriptions.Item label="供应商类型">
                {selectedRecord.supplier_type || '-'}
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label="税号">
              {selectedRecord.tax_no || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {activeTag(selectedRecord.is_active)}
            </Descriptions.Item>
            <Descriptions.Item label="创建日期">
              {formatUnixDate(selectedRecord.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="更新日期">
              {formatUnixDate(selectedRecord.updated_at)}
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
