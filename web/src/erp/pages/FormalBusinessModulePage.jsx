import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import {
  Button,
  Descriptions,
  Dropdown,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Tooltip,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  listWorkflowTasks,
  updateWorkflowTaskStatus,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
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
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
} from '../components/business-list/ColumnOrderModal.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import {
  getBusinessModule,
  getFormalShellFormFieldLabels,
} from '../config/businessModules.mjs'
import {
  applyBusinessColumnSorters,
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import { ROLE_DISPLAY_NAMES } from '../utils/roleKeys.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const SHIPPING_RELEASE_MODULE_KEY = 'shipping-release'
const WORKFLOW_ROLE_LABELS = new Map(Object.entries(ROLE_DISPLAY_NAMES))

const STATUS_OPTIONS = Object.freeze([
  { label: '全部状态', value: '' },
  { label: '待接入', value: 'pending_api', color: 'blue' },
  { label: '待评审', value: 'review_required', color: 'gold' },
  { label: '可参考', value: 'source_grounded', color: 'green' },
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
  products: '预览产品字段',
  'material-bom': '预览BOM字段',
  'accessories-purchase': '预览采购字段',
  inbound: '预览入库字段',
  'quality-inspections': '预览质检字段',
  inventory: '预览库存字段',
  'processing-contracts': '预览委外字段',
  'production-scheduling': '预览排程字段',
  'production-progress': '预览进度字段',
  'production-exceptions': '预览异常字段',
  'shipping-release': '预览放行字段',
  outbound: '预览出库字段',
  reconciliation: '预览对账字段',
  payables: '预览应付字段',
  receivables: '预览应收字段',
  invoices: '预览发票字段',
})

const MODULE_PRIMARY_ACTION_LABELS = Object.freeze({
  products: '查看产品接入边界',
  'material-bom': '查看BOM接入边界',
  'accessories-purchase': '查看采购接入边界',
  inbound: '查看入库接入边界',
  'quality-inspections': '查看质检接入边界',
  inventory: '查看库存接入边界',
  'processing-contracts': '查看委外接入边界',
  'production-scheduling': '查看排程接入边界',
  'production-progress': '查看进度接入边界',
  'production-exceptions': '查看异常接入边界',
  'shipping-release': '查看放行接入边界',
  outbound: '查看出库接入边界',
  reconciliation: '查看对账接入边界',
  payables: '查看应付接入边界',
  receivables: '查看应收接入边界',
  invoices: '查看发票接入边界',
})

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

function statusTag(status) {
  const option =
    STATUS_OPTIONS.find((item) => item.value === status) || STATUS_OPTIONS[1]
  return <Tag color={option.color || 'default'}>{option.label}</Tag>
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN')
}

function workflowPayloadOf(task = {}) {
  return task?.payload && typeof task.payload === 'object' ? task.payload : {}
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
      document_no: `${moduleItem.key.toUpperCase()}-PREVIEW-001`,
      title: `${moduleItem.title}字段预览`,
      business_status: 'source_grounded',
      owner_role: ownerRole,
      source_refs: refs,
      created_at: '2026-06-13',
      updated_at: '2026-06-13',
      scope: scopeItems[0] || moduleItem.primaryEntity || moduleItem.title,
    },
    {
      id: `${moduleItem.key}-review`,
      document_no: `${moduleItem.key.toUpperCase()}-PREVIEW-002`,
      title: `${moduleItem.title}评审边界`,
      business_status: 'review_required',
      owner_role: ownerRole,
      source_refs: moduleItem.primaryEntity || refs,
      created_at: '2026-06-13',
      updated_at: '2026-06-13',
      scope: scopeItems[1] || moduleItem.boundary || '字段和动作待评审',
    },
    {
      id: `${moduleItem.key}-api`,
      document_no: `${moduleItem.key.toUpperCase()}-PREVIEW-003`,
      title: `${moduleItem.title}接入边界`,
      business_status: 'pending_api',
      owner_role: ownerRole,
      source_refs: moduleItem.factSource || refs,
      created_at: '2026-06-13',
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
    record.scope,
  ].some((value) =>
    String(value || '')
      .toLowerCase()
      .includes(query)
  )
}

function FormalShellActionForm({ moduleItem, actionModal, selectedLabel }) {
  const record = actionModal?.record || null
  const statusOption = record
    ? STATUS_OPTIONS.find((item) => item.value === record.business_status)
    : null
  const coreFieldLabels = getFormalShellFormFieldLabels(moduleItem.key)
  const fieldScope = (moduleItem.currentScope || []).join('；') || record?.scope
  const boundaryText = [
    '当前页面仍是待接入预览页；真实保存必须接入领域 usecase、API 和 RBAC 后启用，不能从前端本地伪造事实。',
    moduleItem.boundary ? `模块边界：${moduleItem.boundary}` : '',
    '不读取、不创建、不更新、不删除 business_records；旧表族不作为运行时真源。',
  ]
    .filter(Boolean)
    .join(' ')
  const valueOrPlaceholder = (value, placeholder = '待接入领域 API 后生成') =>
    value || placeholder
  const shellFields = [
    {
      label: '当前记录',
      value: valueOrPlaceholder(
        record?.title,
        actionModal?.title || selectedLabel
      ),
    },
    {
      label: '当前状态',
      value: statusOption?.label || '新建草稿',
    },
    {
      label: '主事实 / 真源',
      value:
        moduleItem.factSource || moduleItem.primaryEntity || '领域真源待评审',
    },
    {
      label: '来源表',
      value:
        record?.source_refs ||
        (moduleItem.sourceRefs || []).join(' / ') ||
        moduleItem.title,
    },
  ]
  const scopedCoreFields =
    coreFieldLabels.length > 0
      ? coreFieldLabels.map((label) => ({
          label,
          value: valueOrPlaceholder(null),
        }))
      : [
          {
            label: '字段范围',
            value: fieldScope || '字段清单待评审',
            type: 'textarea',
          },
        ]

  return (
    <Form layout="vertical" className="erp-business-action-form">
      {shellFields.map((field) => (
        <Form.Item
          key={field.label}
          label={field.label}
          className="erp-business-action-form__field"
        >
          <Input value={field.value} disabled readOnly />
        </Form.Item>
      ))}
      <div className="erp-business-action-form__section-title">
        产品核心字段
      </div>
      {scopedCoreFields.map((field) => (
        <Form.Item
          key={field.label}
          label={field.label}
          className={`erp-business-action-form__field${
            field.type === 'textarea'
              ? ' erp-business-action-form__field--full'
              : ''
          }`}
        >
          {field.type === 'textarea' ? (
            <Input.TextArea
              value={field.value}
              disabled
              readOnly
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          ) : (
            <Input value={field.value} disabled readOnly />
          )}
        </Form.Item>
      ))}
      <Form.Item
        label="当前边界"
        className="erp-business-action-form__field erp-business-action-form__field--full"
      >
        <Input.TextArea
          value={boundaryText}
          disabled
          readOnly
          autoSize={{ minRows: 3, maxRows: 5 }}
        />
      </Form.Item>
    </Form>
  )
}

export default function FormalBusinessModulePage({ moduleKey }) {
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const moduleItem = getBusinessModule(moduleKey)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [actionModal, setActionModal] = useState(null)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const isShippingReleaseWorkflowPage =
    moduleItem?.key === SHIPPING_RELEASE_MODULE_KEY
  const canReadWorkflowTasks =
    isShippingReleaseWorkflowPage &&
    hasActionPermission(adminProfile, 'workflow.task.read')
  const canUpdateWorkflowTasks =
    isShippingReleaseWorkflowPage &&
    hasActionPermission(adminProfile, 'workflow.task.update')
  const canCompleteWorkflowTasks =
    isShippingReleaseWorkflowPage &&
    hasActionPermission(adminProfile, 'workflow.task.complete')

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

  const dataColumns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '预览编号',
          exportTitle: '预览编号',
          dataIndex: 'document_no',
          width: 180,
          sorter: (a, b) => compareText(a.document_no, b.document_no),
        },
        {
          title: '预览对象',
          exportTitle: '预览对象',
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
          title: '字段范围',
          exportTitle: '字段范围',
          dataIndex: 'scope',
          width: 260,
          sorter: (a, b) => compareText(a.scope, b.scope),
        },
        {
          title: '创建时间',
          exportTitle: '创建时间',
          dataIndex: 'created_at',
          width: 130,
          sorter: (a, b) => compareText(a.created_at, b.created_at),
        },
        {
          title: '更新时间',
          exportTitle: '更新时间',
          dataIndex: 'updated_at',
          width: 130,
          sorter: (a, b) => compareText(a.updated_at, b.updated_at),
        },
      ]).map((column, index) => ({
        ...column,
        key: column.key || column.dataIndex || `column-${index}`,
      })),
    []
  )

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
    () =>
      applyModuleColumnOrder(dataColumns, preferredColumnOrder).map(
        (column) => ({
          ...column,
          title: (
            <ColumnOrderHeaderMenu
              column={column}
              columns={dataColumns}
              order={preferredColumnOrder}
              saving={columnOrderSaving}
              onChange={(nextOrder) =>
                persistColumnOrder(nextOrder, dataColumns)
              }
              onOpenPanel={() => setColumnOrderOpen(true)}
            />
          ),
        })
      ),
    [columnOrderSaving, dataColumns, persistColumnOrder, preferredColumnOrder]
  )

  useEffect(() => {
    setSelectedRowKeys((current) =>
      current.filter((key) => rows.some((record) => record.id === key))
    )
  }, [rows])

  const loadShippingReleaseWorkflowTasks = useCallback(async () => {
    if (!isShippingReleaseWorkflowPage || !canReadWorkflowTasks) {
      setWorkflowTasks([])
      return
    }
    try {
      const data = await listWorkflowTasks({
        source_type: SHIPPING_RELEASE_MODULE_KEY,
        limit: 100,
      })
      setWorkflowTasks(data?.tasks || [])
    } catch (error) {
      setWorkflowTasks([])
      message.warning(getActionErrorMessage(error, '加载出货放行协同任务失败'))
    }
  }, [canReadWorkflowTasks, isShippingReleaseWorkflowPage])

  useEffect(() => {
    loadShippingReleaseWorkflowTasks()
  }, [loadShippingReleaseWorkflowTasks])

  useEffect(() => {
    if (!moduleItem) {
      return undefined
    }
    return outletContext?.registerPageRefresh?.(async () => {
      if (isShippingReleaseWorkflowPage) {
        await loadShippingReleaseWorkflowTasks()
        message.success('出货放行协同任务已刷新')
        return false
      }
      message.info(`${moduleItem.title}当前为待接入预览页，暂无远端数据刷新`)
      return false
    })
  }, [
    isShippingReleaseWorkflowPage,
    loadShippingReleaseWorkflowTasks,
    moduleItem,
    outletContext,
  ])

  const completeWorkflowTask = useCallback(
    async (task) => {
      await updateWorkflowTaskStatus({
        id: task.id,
        task_status_key: 'done',
        business_status_key: task.business_status_key || 'shipping_released',
        reason: '',
        payload: {
          ...workflowPayloadOf(task),
          shipment_release_page_action: 'complete',
          shipment_release_page_scope: 'workflow_only',
        },
      })
      message.success('出货放行协同任务已完成，真实出货仍需出货单进入 SHIPPED')
      await loadShippingReleaseWorkflowTasks()
    },
    [loadShippingReleaseWorkflowTasks]
  )

  const blockWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      await updateWorkflowTaskStatus({
        id: task.id,
        task_status_key: 'blocked',
        business_status_key: 'blocked',
        reason,
        payload: {
          ...workflowPayloadOf(task),
          blocked_reason: reason,
          shipment_release_page_action: 'block',
          shipment_release_page_scope: 'workflow_only',
        },
      })
      message.success('出货放行阻塞原因已记录')
      await loadShippingReleaseWorkflowTasks()
    },
    [loadShippingReleaseWorkflowTasks]
  )

  const urgeShippingReleaseWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      await urgeWorkflowTask({
        task_id: task.id,
        action: 'urge_task',
        reason,
        actor_role_key: 'admin',
        payload: {
          source_type: task.source_type,
          source_id: task.source_id,
          source_no: task.source_no,
          entry: 'shipping_release_page',
          shipment_release_page_scope: 'workflow_only',
        },
      })
      message.success('出货放行催办已记录')
      await loadShippingReleaseWorkflowTasks()
    },
    [loadShippingReleaseWorkflowTasks]
  )

  if (!moduleItem) {
    return (
      <BusinessPageLayout>
        <PageHeaderCard
          title="模块未登记"
          description="当前路由没有匹配的产品菜单定义。"
          tags={<Tag color="red">未登记</Tag>}
        />
      </BusinessPageLayout>
    )
  }

  const openActionHint = (
    actionLabel,
    record = selectedRows[0] || null,
    variant = 'confirm'
  ) => {
    setActionModal({
      title: actionLabel || MODULE_CREATE_LABELS[moduleItem.key] || '预览字段',
      record,
      variant,
    })
  }

  const openCreateActionHint = () => {
    openActionHint(createLabel, null, 'form')
  }

  const openEditActionHint = (record) => {
    if (record?.id) {
      setSelectedRowKeys([record.id])
    }
    openActionHint(
      `预览${moduleItem.shortLabel || moduleItem.title}字段`,
      record || null,
      'form'
    )
  }

  const selectedLabel =
    selectedRows.length === 1
      ? `${selectedRows[0].document_no} / ${selectedRows[0].title}`
      : selectedRows.length > 1
        ? `已选择 ${selectedRows.length} 条${moduleItem.shortLabel || '记录'}`
        : `请先选择一条${moduleItem.shortLabel || '记录'}`
  const selectedSummaryItems = selectedRows.map((record) => ({
    key: record.id,
    label: record.document_no || record.title,
    title: record.title,
  }))
  const singleSelectedRecord =
    selectedRows.length === 1 ? selectedRows[0] : null
  const createLabel = MODULE_CREATE_LABELS[moduleItem.key] || '预览字段'
  const primaryActionLabel =
    MODULE_PRIMARY_ACTION_LABELS[moduleItem.key] || '查看接入边界'
  const linkedMenuItems = [
    { key: 'source', label: '来源边界' },
    { key: 'downstream', label: '下游边界' },
  ]
  const transitionMenuItems = [
    {
      key: 'status-transitions',
      label: '待接入状态动作',
      type: 'group',
      children: [
        { key: 'submit', label: '提交边界' },
        { key: 'approve', label: '确认边界' },
        { key: 'return', label: '退回边界' },
      ],
    },
  ]
  return (
    <BusinessPageLayout className="erp-formal-business-module-page">
      <PageHeaderCard
        title={moduleItem.title}
        description={moduleItem.description}
        stats={[
          { key: 'total', label: '预览项', value: rows.length },
          { key: 'current', label: '筛选结果', value: filteredRows.length },
          {
            key: 'pending',
            label: '待接入',
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
            <Tooltip title="当前待接入预览页不导出业务数据；字段清单应以产品台账和领域 API 接入评审为准。">
              <span>
                <ToolbarButton icon={<DownloadOutlined />} disabled>
                  预览导出待接入
                </ToolbarButton>
              </span>
            </Tooltip>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderOpen(true)}
            >
              列顺序
            </ToolbarButton>
          </Space>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            icon={<EyeOutlined />}
            onClick={openCreateActionHint}
          >
            {createLabel}
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRowKeys.length}
          selectedLabel={selectedLabel}
          selectedItems={selectedSummaryItems}
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
            onClick={() => openEditActionHint(singleSelectedRecord)}
          >
            预览选中字段
          </Button>
          <Dropdown
            menu={{
              items: linkedMenuItems,
              onClick: ({ key }) =>
                openActionHint(key === 'source' ? '来源边界' : '下游边界'),
            }}
            disabled={!singleSelectedRecord}
            trigger={['click']}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!singleSelectedRecord}
            >
              接入边界 <DownOutlined />
            </Button>
          </Dropdown>
          <Dropdown
            menu={{
              items: transitionMenuItems,
              onClick: ({ key }) => {
                const label =
                  transitionMenuItems
                    .flatMap((item) => item.children || item)
                    .find((item) => item.key === key)?.label || '状态边界'
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
              状态边界 <DownOutlined />
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
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        columns={orderedColumns}
        dataSource={filteredRows}
        scroll={{ x: 1340 }}
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
          onDoubleClick: () => openEditActionHint(record),
        })}
        pagination={{
          pageSize: 10,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />

      <CollaborationTaskPanel
        tasks={isShippingReleaseWorkflowPage ? workflowTasks : []}
        selectedTasks={[]}
        selectedRecordLabel={selectedRows[0]?.title || selectedLabel}
        roleLabelMap={WORKFLOW_ROLE_LABELS}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgeShippingReleaseWorkflowTask : undefined
        }
      />

      {actionModal?.variant === 'form' ? (
        <BusinessFormModal
          title={actionModal?.title || '操作'}
          description="当前只预览待接入字段和边界；真实保存需接入领域 usecase、API 和 RBAC。"
          open={Boolean(actionModal)}
          onCancel={() => setActionModal(null)}
          footer={
            <>
              <Button onClick={() => setActionModal(null)}>关闭</Button>
              <Button type="primary" disabled>
                真实保存待接入
              </Button>
            </>
          }
          destroyOnHidden
        >
          <FormalShellActionForm
            moduleItem={moduleItem}
            actionModal={actionModal}
            selectedLabel={selectedLabel}
          />
        </BusinessFormModal>
      ) : (
        <Modal
          className="erp-business-action-modal erp-business-action-modal--confirm"
          width={560}
          title={actionModal?.title || '操作'}
          open={Boolean(actionModal)}
          onCancel={() => setActionModal(null)}
          maskClosable={false}
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
            <Descriptions.Item label="未来接入位置">
              {moduleItem.primaryEntity || moduleItem.title}（待接入）
            </Descriptions.Item>
            <Descriptions.Item label="当前边界">
              当前页面仍是待接入预览页；真实保存必须接入领域 usecase、API 和
              RBAC 后启用，不能从前端本地伪造事实。
            </Descriptions.Item>
          </Descriptions>
        </Modal>
      )}

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
