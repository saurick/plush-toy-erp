import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import {
  Button,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
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
  ColumnOrderModal,
  getColumnLabel,
} from '../components/business-list/ColumnOrderModal.jsx'
import { getBusinessModule } from '../config/businessModules.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

const STATUS_OPTIONS = Object.freeze([
  { label: '全部状态', value: '' },
  { label: '待处理', value: 'pending_api', color: 'blue' },
  { label: '待确认', value: 'review_required', color: 'gold' },
  { label: '可查看', value: 'source_grounded', color: 'green' },
])

const OWNER_ROLE_LABELS = Object.freeze({
  products: '业务 / PMC',
  'material-bom': '产品工程 / PMC',
  'accessories-purchase': '采购',
  inbound: '仓库 / 品质',
  'quality-inspections': '品质',
  inventory: '仓库',
  'processing-contracts': '采购 / 外协',
  'production-scheduling': 'PMC',
  'production-progress': '生产经理',
  'production-exceptions': 'PMC / 生产经理',
  'shipping-release': '业务 / 仓库 / 财务',
  outbound: '仓库',
  reconciliation: '财务',
  payables: '财务',
  receivables: '财务',
  invoices: '财务',
})

const MODULE_CREATE_LABELS = Object.freeze({
  products: '新建产品',
  'material-bom': '新建BOM',
  'accessories-purchase': '新建采购订单',
  inbound: '新建入库',
  'quality-inspections': '新建质检单',
  inventory: '新建库存调整',
  'processing-contracts': '新建委外订单',
  'production-scheduling': '新建排程',
  'production-progress': '新建进度记录',
  'production-exceptions': '新建异常',
  'shipping-release': '新建放行单',
  outbound: '新建出库',
  reconciliation: '新建对账',
  payables: '新建应付',
  receivables: '新建应收',
  invoices: '新建发票',
})

const MODULE_PRIMARY_ACTION_LABELS = Object.freeze({
  products: '生成产品资料',
  'material-bom': '生成BOM',
  'accessories-purchase': '生成采购合同',
  inbound: '生成入库单',
  'quality-inspections': '生成质检结论',
  inventory: '生成库存调整',
  'processing-contracts': '生成委外合同',
  'production-scheduling': '生成生产任务',
  'production-progress': '更新进度',
  'production-exceptions': '关闭异常',
  'shipping-release': '生成出货放行',
  outbound: '生成出库',
  reconciliation: '生成对账单',
  payables: '生成应付',
  receivables: '生成应收',
  invoices: '生成发票',
})

function renderColumnHeader(column, onOpenColumnOrder) {
  const label = getColumnLabel(column)
  return (
    <span className="erp-module-column-header">
      <span className="erp-module-column-header-text">{label}</span>
      <Tooltip title="调整列顺序">
        <Button
          type="text"
          size="small"
          className="erp-module-column-header-trigger"
          icon={<MoreOutlined />}
          aria-label={`${label} 列设置`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenColumnOrder?.()
          }}
        />
      </Tooltip>
    </span>
  )
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

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCSV({ filename, columns, rows }) {
  const header = columns.map((column) => csvEscape(getColumnLabel(column)))
  const body = rows.map((row) =>
    columns.map((column) => {
      const rawValue =
        typeof column.exportValue === 'function'
          ? column.exportValue(row)
          : row?.[column.dataIndex]
      return csvEscape(rawValue)
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

function statusTag(status) {
  const option =
    STATUS_OPTIONS.find((item) => item.value === status) || STATUS_OPTIONS[1]
  return <Tag color={option.color || 'default'}>{option.label}</Tag>
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN')
}

function buildFormalShellRows(moduleItem) {
  const scopeItems = Array.isArray(moduleItem?.currentScope)
    ? moduleItem.currentScope
    : []
  const ownerRole = OWNER_ROLE_LABELS[moduleItem.key] || '业务负责人'
  const refs = Array.isArray(moduleItem.sourceRefs)
    ? moduleItem.sourceRefs.join(' / ')
    : moduleItem.factSource || moduleItem.primaryEntity || '领域表待评审'

  return [
    {
      id: `${moduleItem.key}-source`,
      document_no: `${moduleItem.key.toUpperCase()}-001`,
      title: `${moduleItem.title}列表视图`,
      business_status: 'source_grounded',
      owner_role: ownerRole,
      source_refs: refs,
      next_action: '查看详情或调整列顺序',
      updated_at: '2026-06-13',
      scope: scopeItems[0] || moduleItem.primaryEntity || moduleItem.title,
    },
    {
      id: `${moduleItem.key}-review`,
      document_no: `${moduleItem.key.toUpperCase()}-002`,
      title: `${moduleItem.title}字段确认`,
      business_status: 'review_required',
      owner_role: ownerRole,
      source_refs: moduleItem.primaryEntity || refs,
      next_action: '确认字段和详情页内容',
      updated_at: '2026-06-13',
      scope: scopeItems[1] || moduleItem.boundary || '字段和动作待评审',
    },
    {
      id: `${moduleItem.key}-api`,
      document_no: `${moduleItem.key.toUpperCase()}-003`,
      title: `${moduleItem.title}操作配置`,
      business_status: 'pending_api',
      owner_role: ownerRole,
      source_refs: moduleItem.factSource || refs,
      next_action: '接入新建、编辑、流转和打印',
      updated_at: '2026-06-13',
      scope: scopeItems[2] || '操作入口待接入',
    },
  ]
}

function recordMatchesKeyword(record, keyword) {
  const query = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!query) {
    return true
  }

  return [
    record.document_no,
    record.title,
    record.owner_role,
    record.source_refs,
    record.next_action,
    record.scope,
  ].some((value) =>
    String(value || '')
      .toLowerCase()
      .includes(query)
  )
}

function ModuleBoundaryDescriptions({ moduleItem, record }) {
  return (
    <Descriptions bordered column={1} size="small">
      <Descriptions.Item label="当前记录">
        {record?.title || moduleItem.title}
      </Descriptions.Item>
      <Descriptions.Item label="业务编号">
        {record?.document_no || moduleItem.key}
      </Descriptions.Item>
      <Descriptions.Item label="当前状态">
        {record ? statusTag(record.business_status) : '待选择记录'}
      </Descriptions.Item>
      <Descriptions.Item label="主事实 / 真源">
        {moduleItem.factSource || moduleItem.primaryEntity || '领域真源待评审'}
      </Descriptions.Item>
      <Descriptions.Item label="字段范围">
        {(moduleItem.currentScope || []).join('；') || '字段清单待评审'}
      </Descriptions.Item>
      <Descriptions.Item label="边界">
        {moduleItem.boundary ||
          '当前页面只恢复正式入口和列表体验，真实写入必须接入领域 usecase。'}
      </Descriptions.Item>
      <Descriptions.Item label="旧入口关系">
        不读取、不创建、不更新、不删除
        business_records；旧表族不作为运行时真源。
      </Descriptions.Item>
    </Descriptions>
  )
}

export default function FormalBusinessModulePage({ moduleKey }) {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const moduleItem = getBusinessModule(moduleKey)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [detailRecord, setDetailRecord] = useState(null)
  const [actionModal, setActionModal] = useState(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleteReason, setBatchDeleteReason] = useState('')
  const [recycleOpen, setRecycleOpen] = useState(false)
  const [recycleSelectedRowKeys, setRecycleSelectedRowKeys] = useState([])
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)

  const rows = useMemo(
    () => (moduleItem ? buildFormalShellRows(moduleItem) : []),
    [moduleItem]
  )
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (record) =>
          recordMatchesKeyword(record, keyword) &&
          (!statusFilter || record.business_status === statusFilter)
      ),
    [keyword, rows, statusFilter]
  )
  const selectedRows = useMemo(
    () => rows.filter((record) => selectedRowKeys.includes(record.id)),
    [rows, selectedRowKeys]
  )

  const persistColumnOrder = useCallback(
    async (nextOrder, columns) => {
      if (!moduleItem?.key) {
        return
      }
      const sanitizedOrder = sanitizeModuleColumnOrder(nextOrder, columns)
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(moduleItem.key, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: moduleItem.key,
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
    [moduleItem?.key, outletContext]
  )

  const dataColumns = useMemo(() => {
    const openColumnOrder = () => setColumnOrderOpen(true)
    return [
      {
        title: '业务编号',
        exportTitle: '业务编号',
        dataIndex: 'document_no',
        width: 180,
        sorter: (a, b) => compareText(a.document_no, b.document_no),
      },
      {
        title: '标题',
        exportTitle: '标题',
        dataIndex: 'title',
        width: 220,
        sorter: (a, b) => compareText(a.title, b.title),
      },
      {
        title: '状态',
        exportTitle: '状态',
        dataIndex: 'business_status',
        width: 120,
        render: statusTag,
        sorter: (a, b) => compareText(a.business_status, b.business_status),
        exportValue: (record) =>
          STATUS_OPTIONS.find((item) => item.value === record.business_status)
            ?.label || record.business_status,
      },
      {
        title: '责任角色',
        exportTitle: '责任角色',
        dataIndex: 'owner_role',
        width: 160,
        sorter: (a, b) => compareText(a.owner_role, b.owner_role),
      },
      {
        title: '来源',
        exportTitle: '来源',
        dataIndex: 'source_refs',
        width: 260,
        sorter: (a, b) => compareText(a.source_refs, b.source_refs),
      },
      {
        title: '内容',
        exportTitle: '内容',
        dataIndex: 'scope',
        width: 260,
        sorter: (a, b) => compareText(a.scope, b.scope),
      },
      {
        title: '下一步',
        exportTitle: '下一步',
        dataIndex: 'next_action',
        width: 240,
        sorter: (a, b) => compareText(a.next_action, b.next_action),
      },
      {
        title: '更新时间',
        exportTitle: '更新时间',
        dataIndex: 'updated_at',
        width: 130,
        sorter: (a, b) => compareText(a.updated_at, b.updated_at),
      },
    ].map((column, index) => ({
      ...column,
      title: renderColumnHeader(
        { ...column, key: column.key || column.dataIndex },
        openColumnOrder
      ),
      key: column.key || column.dataIndex || `column-${index}`,
    }))
  }, [])

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: moduleItem?.key,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns, moduleItem?.key]
  )
  const orderedColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [dataColumns, preferredColumnOrder]
  )

  useEffect(() => {
    setSelectedRowKeys((current) =>
      current.filter((key) => rows.some((record) => record.id === key))
    )
  }, [rows])

  useEffect(() => {
    if (!moduleItem) {
      return undefined
    }
    return outletContext?.registerPageRefresh?.(() => {
      message.info(`${moduleItem.title}当前为正式入口壳，暂无远端数据刷新`)
      return true
    })
  }, [moduleItem, outletContext])

  if (!moduleItem) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard
          sectionTitle="正式业务入口"
          title="模块未登记"
          description="当前路由没有匹配的产品菜单定义。"
          tags={<Tag color="red">未登记</Tag>}
        />
      </BusinessPageLayout>
    )
  }

  const exportRows = () => {
    downloadCSV({
      filename: `${moduleItem.key}-formal-shell.csv`,
      columns: orderedColumns.filter((column) => column.key !== 'actions'),
      rows: filteredRows,
    })
    message.success('已导出当前结果')
  }

  const openActionHint = (actionLabel) => {
    setActionModal({
      title: actionLabel || MODULE_CREATE_LABELS[moduleItem.key] || '新建记录',
      record: selectedRows[0] || null,
    })
  }

  const selectedLabel =
    selectedRows.length === 1
      ? `${selectedRows[0].document_no} / ${selectedRows[0].title}`
      : selectedRows.length > 1
        ? `已选择 ${selectedRows.length} 条${moduleItem.shortLabel || '记录'}`
        : `请先选择一条${moduleItem.shortLabel || '记录'}`
  const singleSelectedRecord =
    selectedRows.length === 1 ? selectedRows[0] : null
  const createLabel = MODULE_CREATE_LABELS[moduleItem.key] || '新建记录'
  const primaryActionLabel =
    MODULE_PRIMARY_ACTION_LABELS[moduleItem.key] || '生成下游记录'
  const linkedMenuItems = [
    { key: 'source', label: '来源记录' },
    { key: 'downstream', label: '下游记录' },
  ]
  const transitionMenuItems = [
    { key: 'submit', label: '提交' },
    { key: 'approve', label: '确认' },
    { key: 'return', label: '退回' },
  ]
  const recycleColumns = [
    { title: '单据编号', dataIndex: 'document_no', width: 180 },
    { title: '标题', dataIndex: 'title', width: 260 },
    {
      title: '业务状态',
      dataIndex: 'business_status',
      width: 120,
      render: statusTag,
    },
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
  ]

  return (
    <BusinessPageLayout className="erp-formal-business-module-page">
      <PageHeaderCard
        sectionTitle={moduleItem.sectionTitle || '正式业务入口'}
        title={moduleItem.title}
        description={moduleItem.description}
        stats={[
          { key: 'total', label: '总记录', value: rows.length },
          { key: 'current', label: '当前结果', value: filteredRows.length },
          {
            key: 'pending',
            label: '待处理',
            value: rows.filter(
              (record) => record.business_status === 'pending_api'
            ).length,
          },
          { key: 'selected', label: '已选记录', value: selectedRowKeys.length },
        ]}
      />

      <BusinessOperationPanel
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder={`搜索${moduleItem.shortLabel || moduleItem.title}、编号、责任人`}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <SelectFilter
              value={statusFilter}
              allowClear
              placeholder="全部状态"
              options={STATUS_OPTIONS}
              onChange={(value) => setStatusFilter(value || '')}
            />
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              onClick={exportRows}
              disabled={filteredRows.length === 0}
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
              disabled={selectedRowKeys.length === 0}
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
          <ToolbarButton
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openActionHint(createLabel)}
          >
            {createLabel}
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRowKeys.length}
          selectedLabel={selectedLabel}
        >
          {selectedRowKeys.length > 0 ? (
            <Button
              type="link"
              size="small"
              onClick={() => setSelectedRowKeys([])}
            >
              清空已选
            </Button>
          ) : null}
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={!singleSelectedRecord}
            onClick={() => openActionHint('编辑')}
          >
            编辑
          </Button>
          <Dropdown
            menu={{
              items: linkedMenuItems,
              onClick: ({ key }) =>
                openActionHint(key === 'source' ? '来源记录' : '下游记录'),
            }}
            disabled={!singleSelectedRecord}
            trigger={['click']}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!singleSelectedRecord}
            >
              关联表格 <DownOutlined />
            </Button>
          </Dropdown>
          <Dropdown
            menu={{
              items: transitionMenuItems,
              onClick: ({ key }) => {
                const label =
                  transitionMenuItems.find((item) => item.key === key)?.label ||
                  '流转'
                openActionHint(label)
              },
            }}
            disabled={!singleSelectedRecord}
            trigger={['click']}
          >
            <Button
              size="small"
              icon={<SwapOutlined />}
              disabled={!singleSelectedRecord}
            >
              流转 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            size="small"
            type="primary"
            disabled={!singleSelectedRecord}
            onClick={() => openActionHint(primaryActionLabel)}
          >
            {primaryActionLabel}
          </Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={!singleSelectedRecord}
            onClick={() => openActionHint('打印')}
          >
            打印
          </Button>
          <Popconfirm
            title="确认删除该记录？"
            okText="删除"
            cancelText="取消"
            disabled={!singleSelectedRecord}
            onConfirm={() => openActionHint('删除')}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!singleSelectedRecord}
            >
              删除
            </Button>
          </Popconfirm>
          <Button
            size="small"
            icon={<InfoCircleOutlined />}
            disabled={!singleSelectedRecord}
            onClick={() => setDetailRecord(singleSelectedRecord)}
          >
            详情
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        columns={orderedColumns}
        dataSource={filteredRows}
        scroll={{ x: 1450 }}
        emptyDescription="暂无匹配记录"
        rowSelection={{
          selectedRowKeys,
          onChange: (nextKeys) => setSelectedRowKeys(nextKeys),
        }}
        rowClassName={(record) =>
          selectedRowKeys.includes(record.id) ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedRowKeys([record.id]),
          onDoubleClick: () => setDetailRecord(record),
        })}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />

      <CollaborationTaskPanel
        tasks={[]}
        selectedTasks={[]}
        selectedRecordLabel={selectedRows[0]?.title || selectedLabel}
      />

      <Drawer
        title={`${moduleItem.title}详情`}
        open={Boolean(detailRecord)}
        width={620}
        onClose={() => setDetailRecord(null)}
      >
        <ModuleBoundaryDescriptions
          moduleItem={moduleItem}
          record={detailRecord}
        />
      </Drawer>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--confirm"
        width={560}
        title={actionModal?.title || '操作'}
        open={Boolean(actionModal)}
        onCancel={() => setActionModal(null)}
        footer={
          <Button type="primary" onClick={() => setActionModal(null)}>
            确定
          </Button>
        }
        centered
        destroyOnHidden
      >
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="当前模块">
            {moduleItem.title}
          </Descriptions.Item>
          <Descriptions.Item label="当前记录">
            {actionModal?.record?.document_no || selectedLabel}
          </Descriptions.Item>
          <Descriptions.Item label="保存位置">
            {moduleItem.primaryEntity || moduleItem.title}
          </Descriptions.Item>
        </Descriptions>
      </Modal>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--confirm erp-business-batch-delete-modal"
        width={560}
        title="批量删除记录"
        open={batchDeleteOpen}
        onCancel={() => setBatchDeleteOpen(false)}
        onOk={() => {
          setBatchDeleteOpen(false)
          setBatchDeleteReason('')
          message.info(`${moduleItem.title}删除动作待接入正式数据后启用`)
        }}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: selectedRowKeys.length === 0 }}
        centered
        destroyOnHidden
      >
        <Space
          direction="vertical"
          size={12}
          className="erp-business-batch-delete-modal__content"
        >
          <span>
            已选择 <strong>{selectedRowKeys.length}</strong>{' '}
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
            <Button icon={<ReloadOutlined />}>刷新</Button>
            <span>已选择 {recycleSelectedRowKeys.length} 条回收站记录</span>
            {recycleSelectedRowKeys.length > 0 ? (
              <Button
                type="link"
                size="small"
                onClick={() => setRecycleSelectedRowKeys([])}
              >
                清空已选
              </Button>
            ) : null}
          </Space>
          <Table
            rowKey="id"
            size="small"
            rowSelection={{
              selectedRowKeys: recycleSelectedRowKeys,
              onChange: (keys) => setRecycleSelectedRowKeys(keys),
            }}
            columns={recycleColumns}
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

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle={moduleItem.title}
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onReset={() => persistColumnOrder([], dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />
    </BusinessPageLayout>
  )
}
