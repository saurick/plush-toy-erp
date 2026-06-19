import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  LinkOutlined,
  PlusOutlined,
  PrinterOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Modal, Popconfirm, Tabs, Tag } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  addShipmentItem,
  cancelFinanceFact,
  cancelOutsourcingFact,
  cancelProductionFact,
  cancelShipment,
  consumeStockReservation,
  createFinanceFact,
  createOutsourcingFact,
  createProductionFact,
  createShipment,
  createStockReservation,
  listFinanceFacts,
  listOutsourcingFacts,
  listProductionFacts,
  listShipments,
  listStockReservations,
  postFinanceFact,
  postOutsourcingFact,
  postProductionFact,
  releaseStockReservation,
  settleFinanceFact,
  shipShipment,
} from '../api/operationalFactApi.mjs'
import {
  compactParams,
  buildSequentialDraftCode,
  formatUnixDate,
  formatUnixDateTime,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
} from '../utils/businessPagination.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'
import { buildProcessingContractDraftFromOutsourcingFact } from '../data/processingContractTemplate.mjs'
import {
  ACTION_PERMISSIONS,
  FinanceFormFields,
  FactFormFields,
  OUTSOURCING_FACT_TYPES,
  PRODUCTION_FACT_TYPES,
  ReservationFormFields,
  ShipmentFormFields,
  ShipmentItemFormFields,
  decimalNumber,
  buildFactParams,
  buildFinanceParams,
  buildReservationParams,
  buildShipmentItemParams,
  buildShipmentParams,
  businessModalTitle,
  formatQuantity,
  hasAnyPermission,
  idempotencyKey,
  selectedLabelForKey,
  sourceRouteFor,
  statusTag,
} from '../components/operational-facts/OperationalFactForms.jsx'

const DEFAULT_OPERATIONAL_FACT_PAGINATION = Object.freeze({
  current: 1,
  pageSize: 20,
})

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已过账', value: 'POSTED' },
  { label: '已发货', value: 'SHIPPED' },
  { label: '已结清', value: 'SETTLED' },
  { label: '生效中', value: 'ACTIVE' },
  { label: '已释放', value: 'RELEASED' },
  { label: '已消耗', value: 'CONSUMED' },
  { label: '已取消', value: 'CANCELLED' },
]

const DEFAULT_OPERATIONAL_FACT_SUMMARY =
  '统一承接生产、委外、出货、库存预留和财务事实的最小运行入口。页面只提交动作，库存流水、冲正和状态边界由后端 usecase 处理。'
const EMPTY_VIEW_OVERRIDES = Object.freeze({})

export function OperationalFactWorkspace({
  pageTitle = '业务事实处理',
  pageSummary = DEFAULT_OPERATIONAL_FACT_SUMMARY,
  initialActiveKey = 'production',
  enabledViews,
  viewOverrides = EMPTY_VIEW_OVERRIDES,
  showTabs = true,
}) {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const adminProfile = outletContext?.adminProfile || {}
  const [activeKey, setActiveKey] = useState(initialActiveKey)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowsByKey, setRowsByKey] = useState({})
  const [totalByKey, setTotalByKey] = useState({})
  const [paginationByKey, setPaginationByKey] = useState({})
  const [selectedByKey, setSelectedByKey] = useState({})
  const [createTarget, setCreateTarget] = useState(null)
  const [createForm] = Form.useForm()
  const [shipmentItemOpen, setShipmentItemOpen] = useState(false)
  const [shipmentItemForm] = Form.useForm()

  const baseConfigs = useMemo(
    () => ({
      production: {
        title: '生产事实',
        listKey: 'production_facts',
        createLabel: '新建生产事实',
        createPrefix: 'prod',
        draftNumberField: 'fact_no',
        draftNumberPrefix: 'PROD',
        list: listProductionFacts,
        create: createProductionFact,
        post: postProductionFact,
        cancel: cancelProductionFact,
        writePermissions: ACTION_PERMISSIONS.productionWrite,
        buildParams: buildFactParams,
        renderForm: () => (
          <FactFormFields typeOptions={PRODUCTION_FACT_TYPES} />
        ),
        initialValues: {
          fact_type: 'MATERIAL_ISSUE',
          subject_type: 'MATERIAL',
        },
      },
      outsourcing: {
        title: '委外事实',
        listKey: 'outsourcing_facts',
        createLabel: '新建委外事实',
        createPrefix: 'outsource',
        draftNumberField: 'fact_no',
        draftNumberPrefix: 'OUTF',
        list: listOutsourcingFacts,
        create: createOutsourcingFact,
        post: postOutsourcingFact,
        cancel: cancelOutsourcingFact,
        writePermissions: ACTION_PERMISSIONS.outsourcingWrite,
        buildParams: buildFactParams,
        renderForm: () => (
          <FactFormFields
            typeOptions={OUTSOURCING_FACT_TYPES}
            includeSupplier
          />
        ),
        initialValues: {
          fact_type: 'MATERIAL_ISSUE',
          subject_type: 'MATERIAL',
        },
      },
      shipments: {
        title: '出货事实',
        listKey: 'shipments',
        createLabel: '新建出货单',
        createPrefix: 'shipment',
        draftNumberField: 'shipment_no',
        draftNumberPrefix: 'SHIP',
        list: listShipments,
        create: createShipment,
        post: shipShipment,
        cancel: cancelShipment,
        writePermissions: ACTION_PERMISSIONS.shipmentWrite,
        confirmPermissions: ACTION_PERMISSIONS.shipmentConfirm,
        buildParams: buildShipmentParams,
        renderForm: () => <ShipmentFormFields />,
        initialValues: {},
      },
      reservations: {
        title: '库存预留',
        listKey: 'stock_reservations',
        createLabel: '新建库存预留',
        createPrefix: 'reserve',
        draftNumberField: 'reservation_no',
        draftNumberPrefix: 'RSV',
        list: listStockReservations,
        create: createStockReservation,
        release: releaseStockReservation,
        consume: consumeStockReservation,
        writePermissions: ACTION_PERMISSIONS.reservationWrite,
        confirmPermissions: ACTION_PERMISSIONS.shipmentConfirm,
        buildParams: buildReservationParams,
        renderForm: () => <ReservationFormFields />,
        initialValues: {},
      },
      finance: {
        title: '财务事实',
        listKey: 'finance_facts',
        createLabel: '新建财务事实',
        createPrefix: 'finance',
        draftNumberField: 'fact_no',
        draftNumberPrefix: 'FIN',
        list: listFinanceFacts,
        create: createFinanceFact,
        post: postFinanceFact,
        settle: settleFinanceFact,
        cancel: cancelFinanceFact,
        writePermissions: ACTION_PERMISSIONS.financeWrite,
        buildParams: buildFinanceParams,
        renderForm: () => <FinanceFormFields />,
        initialValues: {
          fact_type: 'RECEIVABLE',
          counterparty_type: 'CUSTOMER',
          currency: 'CNY',
        },
      },
    }),
    []
  )

  const enabledViewKeys = useMemo(() => {
    const requestedKeys =
      Array.isArray(enabledViews) && enabledViews.length > 0
        ? enabledViews
        : Object.keys(baseConfigs)
    const validKeys = requestedKeys.filter((key) => Boolean(baseConfigs[key]))
    return validKeys.length > 0 ? validKeys : ['production']
  }, [baseConfigs, enabledViews])

  const configs = useMemo(() => {
    const nextConfigs = {}
    enabledViewKeys.forEach((key) => {
      const baseConfig = baseConfigs[key]
      const override = viewOverrides?.[key] || {}
      nextConfigs[key] = {
        ...baseConfig,
        ...override,
        initialValues: {
          ...(baseConfig.initialValues || {}),
          ...(override.initialValues || {}),
        },
        listParams: {
          ...(baseConfig.listParams || {}),
          ...(override.listParams || {}),
        },
      }
    })
    return nextConfigs
  }, [baseConfigs, enabledViewKeys, viewOverrides])

  useEffect(() => {
    if (!configs[activeKey]) {
      setActiveKey(enabledViewKeys[0] || 'production')
    }
  }, [activeKey, configs, enabledViewKeys])

  const activeConfig = configs[activeKey] || configs.production
  const activeRows = rowsByKey[activeKey] || []
  const activeTotal = totalByKey[activeKey] || 0
  const activeSelectedRow = selectedByKey[activeKey] || null
  const activePagination =
    paginationByKey[activeKey] || DEFAULT_OPERATIONAL_FACT_PAGINATION
  const canWriteActive = hasAnyPermission(
    adminProfile,
    activeConfig.writePermissions
  )

  const loadRows = useCallback(
    async (key = activeKey) => {
      const config = configs[key]
      if (!config) {
        return
      }
      setLoading(true)
      try {
        const pagination = paginationByKey[key] || activePagination
        const data = await config.list(
          compactParams({
            status: statusFilter,
            ...(config.listParams || {}),
            ...getBusinessPaginationParams(pagination),
          })
        )
        const nextRows = Array.isArray(data?.[config.listKey])
          ? data[config.listKey]
          : []
        setRowsByKey((prev) => ({
          ...prev,
          [key]: nextRows,
        }))
        setSelectedByKey((prev) => {
          const current = prev[key]
          if (!current?.id) return prev
          const refreshed = nextRows.find((item) => item.id === current.id)
          return {
            ...prev,
            [key]: refreshed || current,
          }
        })
        setTotalByKey((prev) => ({ ...prev, [key]: Number(data?.total || 0) }))
      } catch (error) {
        message.error(getActionErrorMessage(error, `加载${config.title}`))
      } finally {
        setLoading(false)
      }
    },
    [activeKey, activePagination, configs, paginationByKey, statusFilter]
  )

  useEffect(() => {
    loadRows(activeKey)
  }, [activeKey, loadRows])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(() => loadRows(activeKey))
  }, [activeKey, loadRows, outletContext])

  const openCreate = () => {
    const today = new Date().toISOString().slice(0, 10)
    const nextTarget = activeKey
    const config = configs[nextTarget]
    setCreateTarget(nextTarget)
    createForm.setFieldsValue({
      ...config.initialValues,
      [config.draftNumberField]: buildSequentialDraftCode(activeRows, {
        prefix: config.draftNumberPrefix,
        field: config.draftNumberField,
      }),
      idempotency_key: idempotencyKey(config.createPrefix),
      occurred_at: today,
      reserved_at: today,
    })
  }

  const closeCreate = () => {
    setCreateTarget(null)
    createForm.resetFields()
  }

  const submitCreate = async () => {
    const config = configs[createTarget]
    if (!config) {
      return
    }
    try {
      const values = await createForm.validateFields()
      setSaving(true)
      await config.create(config.buildParams(values))
      message.success(`${config.createLabel}已保存`)
      closeCreate()
      await loadRows(createTarget)
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, config.createLabel))
    } finally {
      setSaving(false)
    }
  }

  const runRowAction = async (config, row, actionKey, actionLabel) => {
    const action = config[actionKey]
    if (!action || !row?.id) {
      return
    }
    try {
      setSaving(true)
      await action({ id: row.id })
      message.success(`${actionLabel}已完成`)
      await loadRows(activeKey)
    } catch (error) {
      message.error(getActionErrorMessage(error, actionLabel))
    } finally {
      setSaving(false)
    }
  }

  const openShipmentItem = (shipment) => {
    shipmentItemForm.setFieldsValue({ shipment_id: shipment?.id })
    setShipmentItemOpen(true)
  }

  const closeShipmentItem = () => {
    setShipmentItemOpen(false)
    shipmentItemForm.resetFields()
  }

  const submitShipmentItem = async () => {
    try {
      const values = await shipmentItemForm.validateFields()
      setSaving(true)
      await addShipmentItem(buildShipmentItemParams(values))
      message.success('出货行已保存')
      closeShipmentItem()
      await loadRows('shipments')
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, '保存出货行'))
    } finally {
      setSaving(false)
    }
  }

  const clearActiveSelection = () => {
    setSelectedByKey((prev) => ({ ...prev, [activeKey]: null }))
  }

  const openProcessingContractPrint = () => {
    try {
      const initialDraft =
        buildProcessingContractDraftFromOutsourcingFact(activeSelectedRow)
      openPrintWorkspaceWindow(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
      })
      message.success('已打开加工合同打印模板，可在窗口补齐工序和明细')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开加工合同打印模板'))
    }
  }

  const baseColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 72,
      sortType: 'number',
    },
    {
      title: '单号',
      dataIndex:
        activeKey === 'shipments'
          ? 'shipment_no'
          : activeKey === 'reservations'
            ? 'reservation_no'
            : 'fact_no',
      width: 180,
      ellipsis: true,
      sortType: 'text',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      sortType: 'text',
      render: statusTag,
    },
  ]

  const quantityColumns = [
    {
      title: '对象',
      width: 150,
      sortValue: (record) =>
        `${record.subject_type || 'PRODUCT'}-${
          record.subject_id || record.product_id || ''
        }`,
      render: (_, record) =>
        `${record.subject_type || 'PRODUCT'} #${
          record.subject_id || record.product_id || '-'
        }`,
    },
    {
      title: '仓库/批次/单位',
      width: 180,
      sortValue: (record) =>
        `${record.warehouse_id || ''}-${record.lot_id || ''}-${
          record.unit_id || ''
        }`,
      render: (_, record) =>
        `W${record.warehouse_id || '-'} / L${record.lot_id || '-'} / U${
          record.unit_id || '-'
        }`,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 120,
      sortValue: (record) => decimalNumber(record?.quantity),
      render: formatQuantity,
    },
  ]

  const sourceColumns = [
    {
      title: '来源',
      width: 180,
      ellipsis: true,
      sortValue: (record) =>
        `${record.source_type || ''}-${record.source_id || ''}`,
      render: (_, record) =>
        record.source_type
          ? `${record.source_type} #${record.source_id || '-'}`
          : '-',
    },
    {
      title: '日期',
      width: 120,
      sortValue: (record) =>
        Number(
          record.occurred_at ||
            record.planned_ship_at ||
            record.reserved_at ||
            0
        ),
      render: (_, record) =>
        formatUnixDate(
          record.occurred_at || record.planned_ship_at || record.reserved_at
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: formatUnixDateTime,
      sortType: 'date',
    },
    {
      title: '备注',
      dataIndex: 'note',
      ellipsis: true,
      sortable: false,
    },
  ]

  const columnsByKey = {
    production: [
      ...baseColumns,
      { title: '类型', dataIndex: 'fact_type', width: 170, sortType: 'text' },
      ...quantityColumns,
      ...sourceColumns,
    ],
    outsourcing: [
      ...baseColumns,
      { title: '类型', dataIndex: 'fact_type', width: 160, sortType: 'text' },
      {
        title: '供应商',
        width: 150,
        ellipsis: true,
        sortValue: (record) => record.supplier_name || record.supplier_id || '',
        render: (_, record) =>
          record.supplier_name ||
          (record.supplier_id ? `#${record.supplier_id}` : '-'),
      },
      ...quantityColumns,
      ...sourceColumns,
    ],
    shipments: [
      ...baseColumns,
      {
        title: '销售订单',
        dataIndex: 'sales_order_id',
        width: 120,
        sortType: 'number',
      },
      {
        title: '客户',
        dataIndex: 'customer_id',
        width: 140,
        ellipsis: true,
        sortValue: (record) =>
          record.customer_snapshot || record.customer_id || '',
        render: (_, record) =>
          record.customer_snapshot || record.customer_id || '-',
      },
      {
        title: '行数',
        width: 90,
        sortValue: (record) => record.items?.length || 0,
        render: (_, record) => record.items?.length || 0,
      },
      ...sourceColumns,
    ],
    reservations: [
      ...baseColumns,
      {
        title: '销售订单',
        dataIndex: 'sales_order_id',
        width: 120,
        sortType: 'number',
      },
      ...quantityColumns,
      ...sourceColumns,
    ],
    finance: [
      ...baseColumns,
      { title: '类型', dataIndex: 'fact_type', width: 150, sortType: 'text' },
      {
        title: '往来方',
        width: 150,
        sortValue: (record) =>
          `${record.counterparty_type || ''}-${record.counterparty_id || ''}`,
        render: (_, record) =>
          `${record.counterparty_type || '-'} #${record.counterparty_id || '-'}`,
      },
      {
        title: '金额',
        dataIndex: 'amount',
        width: 120,
        sortValue: (record) => decimalNumber(record?.amount),
      },
      { title: '币种', dataIndex: 'currency', width: 90, sortType: 'text' },
      ...sourceColumns,
    ],
  }

  const createConfig = createTarget ? configs[createTarget] : null
  const createModalTitle = createConfig?.createLabel || '新建事实'
  const createModalDescription =
    createConfig?.modalDescription ||
    '页面只提交业务事实动作，库存流水、冲正和状态边界由后端 usecase 处理。'
  const activeBoundaryText =
    activeConfig.selectionBoundaryText ||
    '当前操作只调用 operational_fact 后端 usecase；前端不本地写库存、出货、财务或 Workflow 事实。'
  const tableColumns = applyBusinessColumnSorters(columnsByKey[activeKey] || [])
  const canConfirmActive = hasAnyPermission(
    adminProfile,
    activeConfig.confirmPermissions || activeConfig.writePermissions
  )
  const selectedLabel = selectedLabelForKey(activeKey, activeSelectedRow)
  const relatedMenuItems = useMemo(() => {
    if (!activeSelectedRow) return []
    const items = []
    if (
      ['shipments', 'reservations'].includes(activeKey) &&
      activeSelectedRow.sales_order_id
    ) {
      items.push({ key: 'sales-order', label: '销售订单' })
    }
    if (
      ['production', 'outsourcing', 'shipments', 'reservations'].includes(
        activeKey
      )
    ) {
      items.push({ key: 'inventory', label: '库存台账' })
    }
    if (activeKey === 'shipments') {
      items.push({ key: 'receivables', label: '应收管理' })
      items.push({ key: 'invoices', label: '发票管理' })
    }
    if (
      activeKey === 'finance' &&
      sourceRouteFor(activeSelectedRow.source_type)
    ) {
      items.push({ key: 'source', label: '来源单据' })
    }
    return items
  }, [activeKey, activeSelectedRow])

  const openRelatedTable = ({ key }) => {
    if (!activeSelectedRow) return
    const pathByKey = {
      'sales-order': V1_ROUTE_PATHS.salesOrders,
      inventory: V1_ROUTE_PATHS.inventory,
      receivables: V1_ROUTE_PATHS.receivables,
      invoices: V1_ROUTE_PATHS.invoices,
    }
    if (key === 'source') {
      const targetPath = sourceRouteFor(activeSelectedRow.source_type)
      if (targetPath) navigate(targetPath)
      return
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }
  const currentRowsCount = activeRows.length
  const activeDraftCount = activeRows.filter(
    (item) => item.status === 'DRAFT'
  ).length
  const postedCount = activeRows.filter((item) =>
    ['POSTED', 'SHIPPED', 'SETTLED', 'CONSUMED'].includes(item.status)
  ).length
  const activeCancelledCount = activeRows.filter((item) =>
    ['CANCELLED', 'RELEASED'].includes(item.status)
  ).length
  const tabItems = Object.entries(configs).map(([key, config]) => ({
    key,
    label: config.title,
  }))

  return (
    <BusinessPageLayout className="erp-v1-operational-fact-page">
      <PageHeaderCard
        compact
        title={pageTitle}
        description={pageSummary}
        tags={[
          <Tag color="cyan" key="view">
            {activeConfig.title}
          </Tag>,
          <Tag color="blue" key="fact">
            Operational Fact：业务事实
          </Tag>,
          <Tag color="green" key="backend">
            后端 usecase 过账 / 冲正
          </Tag>,
          <Tag color="gold" key="boundary">
            Workflow 不直接落事实
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总记录', value: activeTotal },
          { key: 'current', label: '当前结果', value: currentRowsCount },
          { key: 'draft', label: '草稿', value: activeDraftCount },
          { key: 'posted', label: '已生效', value: postedCount },
          { key: 'closed', label: '已取消/释放', value: activeCancelledCount },
        ]}
      />

      {showTabs && tabItems.length > 1 ? (
        <Tabs
          className="erp-business-view-tabs"
          activeKey={activeKey}
          onChange={setActiveKey}
          items={tabItems}
        />
      ) : null}

      <BusinessOperationPanel
        compact
        filters={
          <SelectFilter
            className="erp-business-filter-control--status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={(nextStatus) => {
              setStatusFilter(nextStatus)
              setPaginationByKey((prev) => ({
                ...prev,
                [activeKey]: {
                  ...(prev[activeKey] || activePagination),
                  current: 1,
                },
              }))
            }}
          />
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canWriteActive}
            onClick={openCreate}
          >
            {activeConfig.createLabel}
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={activeSelectedRow ? 1 : 0}
          selectedLabel={selectedLabel}
          boundaryText={activeBoundaryText}
        >
          <Button
            type="link"
            size="small"
            disabled={!activeSelectedRow}
            onClick={clearActiveSelection}
          >
            清空已选
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={!activeSelectedRow || relatedMenuItems.length === 0}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!activeSelectedRow || relatedMenuItems.length === 0}
            >
              关联 <DownOutlined />
            </Button>
          </Dropdown>
          {activeKey === 'shipments' ? (
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== 'DRAFT' ||
                !canWriteActive ||
                saving
              }
              onClick={() => openShipmentItem(activeSelectedRow)}
            >
              维护明细
            </Button>
          ) : null}
          {['production', 'outsourcing', 'finance'].includes(activeKey) ? (
            <Popconfirm
              title="确认过账？"
              onConfirm={() =>
                runRowAction(activeConfig, activeSelectedRow, 'post', '过账')
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={
                  !activeSelectedRow ||
                  activeSelectedRow.status !== 'DRAFT' ||
                  !canConfirmActive ||
                  saving
                }
              >
                过账
              </Button>
            </Popconfirm>
          ) : null}
          {activeKey === 'outsourcing' ? (
            <Button
              size="small"
              icon={<PrinterOutlined />}
              disabled={!activeSelectedRow}
              onClick={openProcessingContractPrint}
            >
              加工合同打印
            </Button>
          ) : null}
          {activeKey === 'shipments' ? (
            <Popconfirm
              title="确认发货并写出库流水？"
              onConfirm={() =>
                runRowAction(activeConfig, activeSelectedRow, 'post', '发货')
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={
                  !activeSelectedRow ||
                  activeSelectedRow.status !== 'DRAFT' ||
                  !canConfirmActive ||
                  saving
                }
              >
                发货
              </Button>
            </Popconfirm>
          ) : null}
          {activeKey === 'reservations' ? (
            <>
              <Popconfirm
                title="确认释放库存预留？"
                onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'release',
                    '释放预留'
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  icon={<RollbackOutlined />}
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== 'ACTIVE' ||
                    !canWriteActive ||
                    saving
                  }
                >
                  释放
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确认消耗库存预留？"
                onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'consume',
                    '消耗预留'
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== 'ACTIVE' ||
                    !canConfirmActive ||
                    saving
                  }
                >
                  消耗
                </Button>
              </Popconfirm>
            </>
          ) : null}
          {activeKey === 'finance' ? (
            <Popconfirm
              title="确认结清财务事实？"
              onConfirm={() =>
                runRowAction(activeConfig, activeSelectedRow, 'settle', '结清')
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                disabled={
                  !activeSelectedRow ||
                  activeSelectedRow.status !== 'POSTED' ||
                  !canConfirmActive ||
                  saving
                }
              >
                结清
              </Button>
            </Popconfirm>
          ) : null}
          {['production', 'outsourcing', 'finance'].includes(activeKey) ? (
            <Popconfirm
              title="确认取消并按后端规则处理冲正？"
              onConfirm={() =>
                runRowAction(activeConfig, activeSelectedRow, 'cancel', '取消')
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                disabled={
                  !activeSelectedRow ||
                  activeSelectedRow.status !== 'POSTED' ||
                  !canConfirmActive ||
                  saving
                }
              >
                取消
              </Button>
            </Popconfirm>
          ) : null}
          {activeKey === 'shipments' ? (
            <Popconfirm
              title="确认取消并写出库冲正？"
              onConfirm={() =>
                runRowAction(
                  activeConfig,
                  activeSelectedRow,
                  'cancel',
                  '取消发货'
                )
              }
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                disabled={
                  !activeSelectedRow ||
                  activeSelectedRow.status !== 'SHIPPED' ||
                  !canConfirmActive ||
                  saving
                }
              >
                取消发货
              </Button>
            </Popconfirm>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        columns={tableColumns}
        dataSource={activeRows}
        loading={loading}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: activeSelectedRow ? [activeSelectedRow.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedByKey((prev) => ({
              ...prev,
              [activeKey]: selectedRows[0] || null,
            })),
        }}
        rowClassName={(record) =>
          record.id === activeSelectedRow?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () =>
            setSelectedByKey((prev) => ({
              ...prev,
              [activeKey]: record,
            })),
        })}
        emptyDescription="暂无业务事实记录"
        pagination={createBusinessTablePagination({
          pagination: activePagination,
          total: activeTotal,
          onChange: (current, pageSize) =>
            setPaginationByKey((prev) => ({
              ...prev,
              [activeKey]: { current, pageSize },
            })),
        })}
        scroll={{ x: 1320 }}
      />

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form erp-business-action-modal--operational-fact"
        title={businessModalTitle(createModalTitle, createModalDescription)}
        open={Boolean(createConfig)}
        onCancel={closeCreate}
        onOk={submitCreate}
        confirmLoading={saving}
        centered
        forceRender
        width={720}
      >
        <Form
          form={createForm}
          layout="vertical"
          preserve={false}
          className="erp-business-action-form"
        >
          {createConfig?.renderForm?.()}
        </Form>
      </Modal>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form erp-business-action-modal--operational-fact"
        title={businessModalTitle(
          '新增出货行',
          '出货明细只维护出货单行，不在前端本地写库存或财务事实。'
        )}
        open={shipmentItemOpen}
        onCancel={closeShipmentItem}
        onOk={submitShipmentItem}
        confirmLoading={saving}
        centered
        forceRender
        width={640}
      >
        <Form
          form={shipmentItemForm}
          layout="vertical"
          preserve={false}
          className="erp-business-action-form"
        >
          <ShipmentItemFormFields />
        </Form>
      </Modal>
    </BusinessPageLayout>
  )
}

export default function OperationalFactsPage() {
  return <OperationalFactWorkspace />
}
