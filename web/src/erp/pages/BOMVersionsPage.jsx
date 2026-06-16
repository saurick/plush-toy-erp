import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  activateBOMVersion,
  addBOMItem,
  archiveBOMVersion,
  copyBOMVersion,
  createBOMDraft,
  deleteBOMItem,
  getBOMVersion,
  listBOMVersions,
  updateBOMDraft,
  updateBOMItem,
} from '../api/bomApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
} from '../utils/masterDataOrderView.mjs'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已激活', value: 'ACTIVE' },
  { label: '已归档', value: 'ARCHIVED' },
  { label: '已停用', value: 'DISABLED' },
]

const STATUS_LABELS = {
  DRAFT: '草稿',
  ACTIVE: '已激活',
  ARCHIVED: '已归档',
  DISABLED: '已停用',
}

const STATUS_COLORS = {
  DRAFT: 'gold',
  ACTIVE: 'green',
  ARCHIVED: 'default',
  DISABLED: 'red',
}

const BUSINESS_FORM_MODAL_WIDTH = 'min(960px, calc(100vw - 96px))'

function statusTag(status) {
  const key = String(status || '')
    .trim()
    .toUpperCase()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || key || '-'}
    </Tag>
  )
}

function unixToDateInputValue(value) {
  if (!value) return ''
  const date = new Date(Number(value) * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function dateInputToParam(value) {
  return value ? String(value) : undefined
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCSV({ filename, rows }) {
  const header = ['产品ID', 'BOM版本', '状态', '生效开始', '生效结束', '备注']
  const body = rows.map((row) => [
    row.product_id,
    row.version,
    STATUS_LABELS[row.status] || row.status,
    formatUnixDate(row.effective_from),
    formatUnixDate(row.effective_to),
    row.note || '',
  ])
  const csv = [header, ...body]
    .map((line) => line.map(csvEscape).join(','))
    .join('\n')
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

function buildHeaderParams(values = {}, extra = {}) {
  return {
    ...extra,
    product_id: Number(values.product_id || extra.product_id || 0),
    version: String(values.version || '').trim(),
    effective_from: dateInputToParam(values.effective_from),
    effective_to: dateInputToParam(values.effective_to),
    note: values.note ? String(values.note).trim() : undefined,
  }
}

function buildItemParams(values = {}, extra = {}) {
  return {
    ...extra,
    bom_header_id: Number(values.bom_header_id || extra.bom_header_id || 0),
    material_id: Number(values.material_id || 0),
    quantity: String(values.quantity || '').trim(),
    unit_id: Number(values.unit_id || 0),
    loss_rate: String(values.loss_rate ?? '0').trim(),
    position: values.position ? String(values.position).trim() : undefined,
    note: values.note ? String(values.note).trim() : undefined,
  }
}

function HeaderFormFields({ includeProduct = true, disabled = false }) {
  return (
    <>
      {includeProduct ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="产品 ID"
          name="product_id"
          rules={[{ required: true, message: '请填写产品 ID' }]}
        >
          <InputNumber
            disabled={disabled}
            min={1}
            precision={0}
            style={{ width: '100%' }}
          />
        </Form.Item>
      ) : null}
      <Form.Item
        className="erp-business-action-form__field"
        label="BOM 版本"
        name="version"
        rules={[{ required: true, message: '请填写 BOM 版本' }]}
      >
        <Input allowClear autoComplete="off" disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="生效开始"
        name="effective_from"
      >
        <Input type="date" disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="生效结束"
        name="effective_to"
      >
        <Input type="date" disabled={disabled} />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea
          allowClear
          disabled={disabled}
          rows={3}
          showCount
          maxLength={300}
        />
      </Form.Item>
    </>
  )
}

function ItemFormFields() {
  return (
    <>
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
        label="材料用量"
        name="quantity"
        rules={[{ required: true, message: '请填写材料用量' }]}
      >
        <Input autoComplete="off" />
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
        label="损耗率"
        name="loss_rate"
        rules={[{ required: true, message: '请填写损耗率' }]}
      >
        <Input autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="部位"
        name="position"
      >
        <Input allowClear autoComplete="off" />
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

export default function BOMVersionsPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [productID, setProductID] = useState()
  const [versions, setVersions] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [headerMode, setHeaderMode] = useState('create')
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [headerForm] = Form.useForm()
  const [itemForm] = Form.useForm()

  const canRead = hasActionPermission(adminProfile, 'bom.read')
  const canCreate = hasActionPermission(adminProfile, 'bom.create')
  const canUpdate = hasActionPermission(adminProfile, 'bom.update')
  const canActivate = hasActionPermission(adminProfile, 'bom.activate')
  const selectedIsDraft = selectedVersion?.status === 'DRAFT'
  const selectedCanEdit = selectedIsDraft && canUpdate

  const loadDetail = useCallback(async (id) => {
    if (!id) return null
    setDetailLoading(true)
    try {
      const detail = await getBOMVersion({ id })
      setSelectedVersion(detail)
      return detail
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 详情'))
      return null
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const loadVersions = useCallback(async () => {
    if (!canRead) {
      setVersions([])
      setSelectedVersion(null)
      return false
    }
    setLoading(true)
    try {
      const result = await listBOMVersions({
        keyword,
        status,
        product_id: productID || undefined,
        limit: 100,
      })
      const nextVersions = Array.isArray(result?.bom_versions)
        ? result.bom_versions
        : []
      setVersions(nextVersions)
      setTotal(Number(result?.total || nextVersions.length || 0))
      const nextSelected =
        nextVersions.find((item) => item.id === selectedVersion?.id) ||
        nextVersions[0] ||
        null
      if (nextSelected?.id) {
        await loadDetail(nextSelected.id)
      } else {
        setSelectedVersion(null)
      }
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载 BOM 版本'))
      return false
    } finally {
      setLoading(false)
    }
  }, [canRead, keyword, loadDetail, productID, selectedVersion?.id, status])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadVersions)
  }, [loadVersions, outletContext])

  const openCreate = () => {
    setHeaderMode('create')
    headerForm.resetFields()
    headerForm.setFieldsValue({ effective_from: '', effective_to: '' })
    setHeaderModalOpen(true)
  }

  const fillHeaderForm = (record) => {
    headerForm.resetFields()
    headerForm.setFieldsValue({
      product_id: record.product_id,
      version: record.version,
      effective_from: unixToDateInputValue(record.effective_from),
      effective_to: unixToDateInputValue(record.effective_to),
      note: record.note || '',
    })
  }

  const openView = async (record = selectedVersion) => {
    if (!record?.id) return
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('view')
    fillHeaderForm(detail)
    setHeaderModalOpen(true)
  }

  const openEdit = async (record = selectedVersion) => {
    if (!record?.id) return
    const detail = (await loadDetail(record.id)) || record
    setHeaderMode('edit')
    fillHeaderForm(detail)
    setHeaderModalOpen(true)
  }

  const openCopy = (record = selectedVersion) => {
    if (!record?.id) return
    setHeaderMode('copy')
    headerForm.resetFields()
    headerForm.setFieldsValue({
      product_id: record.product_id,
      version: `${record.version || 'V'}-COPY`,
      effective_from: '',
      effective_to: '',
      note: '',
    })
    setHeaderModalOpen(true)
  }

  const saveHeader = async () => {
    const values = await headerForm.validateFields()
    setSaving(true)
    try {
      if (headerMode === 'copy') {
        await copyBOMVersion(
          buildHeaderParams(values, { source_id: selectedVersion?.id })
        )
        message.success('BOM 新版本已复制为草稿')
      } else if (headerMode === 'edit') {
        await updateBOMDraft(
          buildHeaderParams(values, { id: selectedVersion?.id })
        )
        message.success('BOM 草稿已更新')
      } else {
        await createBOMDraft(buildHeaderParams(values))
        message.success('BOM 草稿已创建')
      }
      setHeaderModalOpen(false)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const openCreateItem = () => {
    if (!selectedVersion?.id) {
      message.warning('请先选择一个 BOM 版本')
      return
    }
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({
      bom_header_id: selectedVersion.id,
      quantity: '',
      loss_rate: '0',
    })
    setItemModalOpen(true)
  }

  const openEditItem = useCallback(
    (item) => {
      if (!item?.id) return
      setEditingItem(item)
      itemForm.resetFields()
      itemForm.setFieldsValue({
        material_id: item.material_id,
        quantity: item.quantity,
        unit_id: item.unit_id,
        loss_rate: item.loss_rate,
        position: item.position || '',
        note: item.note || '',
      })
      setItemModalOpen(true)
    },
    [itemForm]
  )

  const saveItem = async () => {
    const values = await itemForm.validateFields()
    setSaving(true)
    try {
      if (editingItem?.id) {
        await updateBOMItem(buildItemParams(values, { id: editingItem.id }))
        message.success('BOM 明细已更新')
      } else {
        await addBOMItem(
          buildItemParams(values, { bom_header_id: selectedVersion?.id })
        )
        message.success('BOM 明细已添加')
      }
      setItemModalOpen(false)
      await loadDetail(selectedVersion?.id)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存 BOM 明细'))
    } finally {
      setSaving(false)
    }
  }

  const removeItem = useCallback(
    async (item) => {
      setSaving(true)
      try {
        await deleteBOMItem({ id: item.id })
        message.success('BOM 明细已删除')
        await loadDetail(selectedVersion?.id)
        await loadVersions()
      } catch (error) {
        message.error(getActionErrorMessage(error, '删除 BOM 明细'))
      } finally {
        setSaving(false)
      }
    },
    [loadDetail, loadVersions, selectedVersion?.id]
  )

  const activateSelected = async () => {
    if (!selectedVersion?.id) return
    setSaving(true)
    try {
      const next = await activateBOMVersion({ id: selectedVersion.id })
      message.success('BOM 版本已激活，旧激活版本已归档')
      setSelectedVersion(next || selectedVersion)
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '激活 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const archiveSelected = async () => {
    if (!selectedVersion?.id) return
    setSaving(true)
    try {
      await archiveBOMVersion({ id: selectedVersion.id })
      message.success('BOM 版本已归档')
      await loadVersions()
    } catch (error) {
      message.error(getActionErrorMessage(error, '归档 BOM 版本'))
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        title: '产品 ID',
        dataIndex: 'product_id',
        width: 110,
        sorter: (a, b) =>
          Number(a?.product_id || 0) - Number(b?.product_id || 0),
      },
      {
        title: 'BOM 版本',
        dataIndex: 'version',
        width: 180,
        sorter: (a, b) =>
          String(a?.version || '').localeCompare(String(b?.version || '')),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: statusTag,
      },
      {
        title: '生效开始',
        dataIndex: 'effective_from',
        width: 130,
        render: formatUnixDate,
      },
      {
        title: '生效结束',
        dataIndex: 'effective_to',
        width: 130,
        render: formatUnixDate,
      },
      {
        title: '备注',
        dataIndex: 'note',
        width: 220,
        render: (value) => value || '-',
      },
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        width: 160,
        render: formatUnixDateTime,
        sorter: (a, b) =>
          Number(a?.updated_at || 0) - Number(b?.updated_at || 0),
      },
    ],
    []
  )

  const itemColumns = useMemo(
    () => [
      { title: '材料 ID', dataIndex: 'material_id', width: 100 },
      { title: '用量', dataIndex: 'quantity', width: 110 },
      { title: '单位 ID', dataIndex: 'unit_id', width: 90 },
      { title: '损耗率', dataIndex: 'loss_rate', width: 110 },
      {
        title: '部位',
        dataIndex: 'position',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '备注',
        dataIndex: 'note',
        width: 180,
        render: (value) => value || '-',
      },
      {
        title: '操作',
        dataIndex: 'actions',
        width: 150,
        fixed: 'right',
        render: (_, item) =>
          selectedCanEdit ? (
            <Space size={8}>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditItem(item)}
              >
                编辑
              </Button>
              <Popconfirm
                title="删除这条 BOM 明细？"
                okText="删除"
                cancelText="取消"
                onConfirm={() => removeItem(item)}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          ) : (
            <Tag>只读</Tag>
          ),
      },
    ],
    [openEditItem, removeItem, selectedCanEdit]
  )

  return (
    <BusinessPageLayout>
      <PageHeaderCard
        title="BOM 管理"
        description="维护产品工程资料版本、材料用量、损耗率和生效边界；BOM 不写库存、不自动生成采购需求。"
        tags={[
          <Tag color="blue" key="source">
            bom_headers / bom_items
          </Tag>,
          <Tag color="gold" key="boundary">
            ACTIVE 不可直接改
          </Tag>,
        ]}
        stats={[
          { label: '当前列表', value: total },
          {
            label: '已激活',
            value: versions.filter((item) => item.status === 'ACTIVE').length,
          },
          {
            label: '草稿',
            value: versions.filter((item) => item.status === 'DRAFT').length,
          },
        ]}
        summary="草稿可维护明细；激活会将同产品旧 ACTIVE 版本归档；已激活版本要改版必须复制新版本。"
      />

      <BusinessOperationPanel
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索 BOM 版本"
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={loadVersions}
            />
            <InputNumber
              min={1}
              precision={0}
              placeholder="产品 ID"
              value={productID}
              onChange={setProductID}
              style={{ width: 140 }}
            />
            <SelectFilter
              value={status}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => setStatus(nextStatus || '')}
              style={{ width: 140 }}
            />
          </>
        }
        actions={
          <>
            <ToolbarButton icon={<ReloadOutlined />} onClick={loadVersions}>
              刷新
            </ToolbarButton>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={versions.length === 0}
              onClick={() =>
                downloadCSV({ filename: 'bom-versions.csv', rows: versions })
              }
            >
              导出
            </ToolbarButton>
            <ToolbarButton
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canCreate}
              onClick={openCreate}
            >
              新建草稿
            </ToolbarButton>
          </>
        }
      />

      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={versions}
        pagination={false}
        emptyDescription="暂无 BOM 版本"
        rowClassName={(record) =>
          record?.id === selectedVersion?.id
            ? 'erp-business-table-row--selected'
            : ''
        }
        onRow={(record) => ({
          onClick: () => {
            setSelectedVersion(record)
            loadDetail(record.id)
          },
          onDoubleClick: () => {
            if (record.status === 'DRAFT' && canUpdate) {
              openEdit(record)
              return
            }
            openView(record)
          },
        })}
      />

      <SelectionActionBar
        selectedCount={selectedVersion?.id ? 1 : 0}
        selectedLabel={selectedVersion?.version || '未选择 BOM'}
        summaryItems={
          selectedVersion
            ? [
                {
                  key: 'status',
                  label: '状态',
                  value:
                    STATUS_LABELS[selectedVersion.status] ||
                    selectedVersion.status,
                },
                {
                  key: 'product',
                  label: '产品',
                  value: selectedVersion.product_id,
                },
              ]
            : []
        }
        boundaryText="BOM 只维护工程资料版本，不写库存、不自动生成采购需求。"
      >
        <Button
          icon={<InboxOutlined />}
          disabled={!selectedVersion}
          onClick={() => openView()}
        >
          查看
        </Button>
        <Button
          icon={<EditOutlined />}
          disabled={!selectedCanEdit}
          onClick={() => openEdit()}
        >
          编辑草稿
        </Button>
        <Button
          icon={<PlusOutlined />}
          disabled={!selectedCanEdit}
          onClick={openCreateItem}
        >
          添加明细
        </Button>
        <Button
          icon={<CopyOutlined />}
          disabled={!selectedVersion || !canCreate}
          onClick={() => openCopy()}
        >
          复制新版本
        </Button>
        <Popconfirm
          title="激活该 BOM 版本？同产品旧 ACTIVE 版本会归档。"
          okText="激活"
          cancelText="取消"
          onConfirm={activateSelected}
        >
          <Button
            icon={<CheckCircleOutlined />}
            disabled={
              !selectedVersion ||
              !canActivate ||
              selectedVersion.status === 'ACTIVE'
            }
          >
            激活
          </Button>
        </Popconfirm>
        <Popconfirm
          title="归档该 BOM 版本？"
          okText="归档"
          cancelText="取消"
          onConfirm={archiveSelected}
        >
          <Button
            disabled={
              !selectedVersion ||
              !canUpdate ||
              selectedVersion.status === 'ARCHIVED'
            }
          >
            归档
          </Button>
        </Popconfirm>
      </SelectionActionBar>

      <CollaborationTaskPanel
        moduleKey="material-bom"
        selectedRecord={selectedVersion}
        ownerRoleLabel="产品工程 / PMC"
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        open={headerModalOpen}
        title={
          <div className="erp-business-action-modal__title">
            <span>
              {headerMode === 'copy'
                ? '复制 BOM 新版本'
                : headerMode === 'edit'
                  ? '编辑 BOM 草稿'
                  : headerMode === 'view'
                    ? '查看 BOM 版本'
                    : '新建 BOM 草稿'}
            </span>
            <small>
              BOM 只维护产品结构和材料用量，不写库存、采购或成本事实。
            </small>
          </div>
        }
        width={BUSINESS_FORM_MODAL_WIDTH}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving || detailLoading}
        onOk={saveHeader}
        onCancel={() => setHeaderModalOpen(false)}
        footer={
          headerMode === 'view' ? (
            <Button onClick={() => setHeaderModalOpen(false)}>关闭</Button>
          ) : undefined
        }
      >
        <Form
          form={headerForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <HeaderFormFields
            includeProduct={headerMode !== 'edit'}
            disabled={headerMode === 'view'}
          />
        </Form>
        {headerMode === 'create' ? (
          <p className="erp-business-selection-action-bar__hint">
            保存 BOM 草稿后，在同一 BOM 版本弹窗下方维护材料明细。
          </p>
        ) : (
          <section className="erp-master-contact-list erp-bom-modal-items">
            <div className="erp-master-contact-list__head">
              <strong>BOM 明细</strong>
              <Space wrap size={8}>
                <Tag>{selectedVersion?.items?.length || 0} 行</Tag>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={!selectedCanEdit}
                  onClick={openCreateItem}
                >
                  添加明细
                </Button>
              </Space>
            </div>
            <Table
              loading={detailLoading}
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={
                Array.isArray(selectedVersion?.items)
                  ? selectedVersion.items
                  : []
              }
              pagination={false}
              scroll={{ x: 860 }}
              locale={{ emptyText: <Empty description="暂无 BOM 明细" /> }}
            />
          </section>
        )}
      </Modal>

      <Modal
        open={itemModalOpen}
        title={editingItem ? '编辑 BOM 明细' : '添加 BOM 明细'}
        width={BUSINESS_FORM_MODAL_WIDTH}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={saveItem}
        onCancel={() => setItemModalOpen(false)}
      >
        <Form
          form={itemForm}
          layout="vertical"
          className="erp-business-action-form"
        >
          <ItemFormFields />
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}
