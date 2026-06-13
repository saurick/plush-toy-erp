import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DownloadOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Descriptions, Drawer, Modal, Space, Tag, Tooltip } from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  BusinessDataTable,
  BusinessFilterPanel,
  BusinessListToolbar,
  BusinessPageLayout,
  CollaborationTaskPanel,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import { getBusinessModule } from '../config/businessModules.mjs'
import {
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  getModuleColumnKey,
  repositionModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

const STATUS_OPTIONS = Object.freeze([
  { label: '全部状态', value: '' },
  { label: '待接入', value: 'pending_api', color: 'blue' },
  { label: '待评审', value: 'review_required', color: 'gold' },
  { label: '已收口', value: 'source_grounded', color: 'green' },
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

function getColumnLabel(column = {}) {
  return String(column.exportTitle || column.title || column.key || '').trim()
}

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
          icon={<SettingOutlined />}
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
      document_no: `${moduleItem.key.toUpperCase()}-SOURCE`,
      title: `${moduleItem.title}真源评审`,
      business_status: 'source_grounded',
      owner_role: ownerRole,
      source_refs: refs,
      next_action: '按领域 usecase 接入读写 API',
      updated_at: '2026-06-13',
      scope: scopeItems[0] || moduleItem.primaryEntity || moduleItem.title,
    },
    {
      id: `${moduleItem.key}-review`,
      document_no: `${moduleItem.key.toUpperCase()}-REVIEW`,
      title: `${moduleItem.title}页面字段清单`,
      business_status: 'review_required',
      owner_role: ownerRole,
      source_refs: moduleItem.primaryEntity || refs,
      next_action: '补字段、动作和审计边界评审',
      updated_at: '2026-06-13',
      scope: scopeItems[1] || moduleItem.boundary || '字段和动作待评审',
    },
    {
      id: `${moduleItem.key}-api`,
      document_no: `${moduleItem.key.toUpperCase()}-API`,
      title: `${moduleItem.title}领域 API 接入`,
      business_status: 'pending_api',
      owner_role: ownerRole,
      source_refs: moduleItem.factSource || refs,
      next_action: '后续补 schema / API / RBAC / 测试闭环',
      updated_at: '2026-06-13',
      scope: scopeItems[2] || '运行时写入待接入正式领域能力',
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

function ColumnOrderModal({
  open,
  columns = [],
  order = [],
  saving = false,
  moduleTitle = '',
  onChange,
  onReset,
  onClose,
}) {
  const normalizedOrder = useMemo(() => {
    const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
    return sanitizedOrder.length > 0
      ? sanitizedOrder
      : buildModuleColumnOrder(columns)
  }, [columns, order])
  const orderedColumns = useMemo(
    () => applyModuleColumnOrder(columns, normalizedOrder),
    [columns, normalizedOrder]
  )

  return (
    <Modal
      title="调整列表列顺序"
      open={open}
      onCancel={onClose}
      destroyOnHidden={false}
      footer={
        <Space wrap>
          <Button disabled={saving} onClick={onReset}>
            恢复默认
          </Button>
          <Button type="primary" loading={saving} onClick={onClose}>
            完成
          </Button>
        </Space>
      }
    >
      <div
        className="erp-business-column-order-modal"
        role="list"
        aria-label={`${moduleTitle || '列表'}列顺序`}
      >
        {orderedColumns.map((column, index) => {
          const key = getModuleColumnKey(column, index)
          const label = getColumnLabel(column)
          return (
            <div
              key={key}
              className="erp-business-column-order-modal__row"
              role="listitem"
            >
              <span className="erp-business-column-order-modal__label">
                {label}
              </span>
              <Space size={4}>
                <Tooltip title="移到最前">
                  <Button
                    type="text"
                    size="small"
                    icon={<VerticalAlignTopOutlined />}
                    aria-label={`${label} 移到最前`}
                    disabled={saving || index === 0}
                    onClick={() =>
                      onChange?.(
                        repositionModuleColumnOrder(
                          normalizedOrder,
                          columns,
                          key,
                          0
                        )
                      )
                    }
                  />
                </Tooltip>
                <Tooltip title="移到最后">
                  <Button
                    type="text"
                    size="small"
                    icon={<VerticalAlignBottomOutlined />}
                    aria-label={`${label} 移到最后`}
                    disabled={saving || index === orderedColumns.length - 1}
                    onClick={() =>
                      onChange?.(
                        repositionModuleColumnOrder(
                          normalizedOrder,
                          columns,
                          key,
                          orderedColumns.length - 1
                        )
                      )
                    }
                  />
                </Tooltip>
              </Space>
            </div>
          )
        })}
      </div>
    </Modal>
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
  const [actionOpen, setActionOpen] = useState(false)
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
      },
      {
        title: '标题',
        exportTitle: '标题',
        dataIndex: 'title',
        width: 220,
      },
      {
        title: '状态',
        exportTitle: '状态',
        dataIndex: 'business_status',
        width: 120,
        render: statusTag,
        exportValue: (record) =>
          STATUS_OPTIONS.find((item) => item.value === record.business_status)
            ?.label || record.business_status,
      },
      {
        title: '责任角色',
        exportTitle: '责任角色',
        dataIndex: 'owner_role',
        width: 160,
      },
      {
        title: '真源 / 依赖',
        exportTitle: '真源 / 依赖',
        dataIndex: 'source_refs',
        width: 260,
      },
      {
        title: '当前范围',
        exportTitle: '当前范围',
        dataIndex: 'scope',
        width: 260,
      },
      {
        title: '下一步',
        exportTitle: '下一步',
        dataIndex: 'next_action',
        width: 240,
      },
      {
        title: '更新时间',
        exportTitle: '更新时间',
        dataIndex: 'updated_at',
        width: 130,
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 130,
        render: (_, record) => (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              setDetailRecord(record)
            }}
          >
            查看详情
          </Button>
        ),
      },
    ].map((column, index) => ({
      ...column,
      title:
        column.key === 'actions'
          ? column.title
          : renderColumnHeader(
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

  const openActionHint = () => {
    setActionOpen(true)
  }

  const selectedLabel =
    selectedRows.length === 1
      ? selectedRows[0].title
      : selectedRows.length > 1
        ? `已选择 ${selectedRows.length} 条${moduleItem.shortLabel || '记录'}`
        : `未选择${moduleItem.shortLabel || '记录'}`

  return (
    <BusinessPageLayout className="erp-formal-business-module-page">
      <PageHeaderCard
        sectionTitle={moduleItem.sectionTitle || '正式业务入口'}
        title={moduleItem.title}
        description={moduleItem.description}
        tags={
          <Space wrap>
            <Tag color="green">正式新入口</Tag>
            <Tag color="blue">领域 API 待接入</Tag>
            <Tag>不读取 business_records</Tag>
          </Space>
        }
        stats={[
          { key: 'rows', label: '当前结果', value: filteredRows.length },
          { key: 'selected', label: '已选', value: selectedRowKeys.length },
          {
            key: 'refs',
            label: '真源引用',
            value: moduleItem.sourceRefs?.length || 1,
          },
        ]}
        summary={moduleItem.boundary}
      />

      <BusinessFilterPanel
        summary={`当前页面先恢复 ${moduleItem.title} 的产品核心入口和列表体验。`}
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<ReloadOutlined />}
              onClick={() =>
                message.info(`${moduleItem.title}暂无远端 API，已保留当前筛选`)
              }
            >
              刷新
            </ToolbarButton>
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
              type="primary"
              icon={<PlusOutlined />}
              onClick={openActionHint}
            >
              新建草稿
            </ToolbarButton>
          </Space>
        }
      >
        <SearchInput
          value={keyword}
          placeholder={`搜索${moduleItem.shortLabel || moduleItem.title}、真源或下一步`}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <SelectFilter
          value={statusFilter}
          allowClear
          placeholder="状态"
          options={STATUS_OPTIONS}
          onChange={(value) => setStatusFilter(value || '')}
        />
      </BusinessFilterPanel>

      <BusinessListToolbar
        stats={[
          { key: 'all', label: '样例行', value: rows.length },
          { key: 'filtered', label: '筛选结果', value: filteredRows.length },
          {
            key: 'pending',
            label: '待接入 API',
            value: rows.filter(
              (record) => record.business_status === 'pending_api'
            ).length,
          },
        ]}
        actions={
          <Space wrap>
            <Tag color="blue">{moduleItem.primaryEntity}</Tag>
            <Tag>Workflow / Fact 分层守卫</Tag>
          </Space>
        }
      />

      <SelectionActionBar
        selectedCount={selectedRowKeys.length}
        selectedLabel={selectedLabel}
        summaryItems={[
          { key: 'module', label: '模块', value: moduleItem.title },
          {
            key: 'source',
            label: '真源',
            value: moduleItem.primaryEntity || '待评审',
          },
        ]}
        collaborationItems={[
          { key: 'boundary', label: '边界', value: '不写旧表', color: 'green' },
        ]}
        boundaryText="当前操作只恢复页面交互；真实写入必须走领域 usecase、schema、API、RBAC 和审计。"
      >
        <Button
          icon={<InfoCircleOutlined />}
          disabled={selectedRowKeys.length === 0}
          onClick={() => setDetailRecord(selectedRows[0] || null)}
        >
          查看选中
        </Button>
        <Button type="primary" onClick={openActionHint}>
          接入动作说明
        </Button>
      </SelectionActionBar>

      <BusinessDataTable
        rowKey="id"
        columns={orderedColumns}
        dataSource={filteredRows}
        scroll={{ x: 1450 }}
        emptyDescription="暂无匹配记录；当前页面只展示正式入口壳和接入清单。"
        rowSelection={{
          selectedRowKeys,
          onChange: (nextKeys) => setSelectedRowKeys(nextKeys),
        }}
        onRow={(record) => ({
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
        title={`${moduleItem.title}动作待接入领域 API`}
        open={actionOpen}
        onCancel={() => setActionOpen(false)}
        footer={
          <Button type="primary" onClick={() => setActionOpen(false)}>
            知道了
          </Button>
        }
      >
        <ModuleBoundaryDescriptions moduleItem={moduleItem} />
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
