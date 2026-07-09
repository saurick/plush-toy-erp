import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  PrinterOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Space, Tag } from 'antd'
import { useOutletContext } from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  DateRangeFilter,
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
import {
  downloadBusinessCSV,
  getPreferredColumnOrder,
  writeStoredColumnOrder,
} from '../components/business-list/businessListPreferences.mjs'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import OutsourcingOrderForm, {
  createBlankOutsourcingLine,
  normalizeOutsourcingLineFormValue,
  productLabel,
  processLabel,
  supplierLabel,
  todayInputValue,
  unitLabel,
} from '../components/outsourcing-orders/OutsourcingOrderForm.jsx'
import {
  buildOutsourcingOrderColumns,
  renderOutsourcingOrderStatusTag,
} from '../components/outsourcing-orders/outsourcingOrderColumns.jsx'
import {
  listOutsourcingOrderItems,
  listOutsourcingOrders,
  listProcesses,
  listProducts,
  listContactsByOwner,
  listSuppliers,
  listUnits,
  saveOutsourcingOrderWithItems,
} from '../api/masterDataOrderApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import { listWorkflowTasks } from '../api/workflowApi.mjs'
import {
  OUTSOURCING_ORDER_STATUS_LABELS,
  buildOutsourcingOrderItemParams,
  buildOutsourcingOrderParams,
  buildSequentialDraftCode,
  contractPartySnapshotFromPrintTemplateDefaults,
  buildSupplierSnapshot,
  buildSupplierSnapshotWithContacts,
  canRunOutsourcingOrderLifecycleAction,
  hasActionPermission,
  SUPPLIER_CONTACT_OWNER_TYPE,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import { filterBusinessCollaborationTasksBySource } from '../utils/businessCollaborationTasks.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  openPrintWorkspaceWindow,
  resolveRuntimeCustomerPrintCompanyName,
} from '../utils/printWorkspace.js'
import { getEffectivePrintTemplateDefaults } from '../utils/adminProfileSync.mjs'
import { buildProcessingContractDraftFromOutsourcingOrder } from '../data/processingContractTemplate.mjs'
import {
  WORK_INSTRUCTION_TEMPLATE_KEY,
  buildWorkInstructionDraftFromOutsourcingOrder,
} from '../data/engineeringPrintTemplates.mjs'
import {
  completeProcessingContractDraft,
  mergeSnapshotMissingFields,
} from '../utils/contractPrintDraftCompleteness.mjs'
import {
  DEFAULT_OUTSOURCING_ORDER_PAGINATION,
  OUTSOURCING_ORDER_DATE_FILTER_OPTIONS,
  OUTSOURCING_ORDER_LIFECYCLE_ACTIONS,
  OUTSOURCING_ORDER_SORT_OPTIONS,
  OUTSOURCING_ORDER_STATUS_OPTIONS,
  OUTSOURCING_ORDERS_MODULE_KEY,
  buildOutsourcingOrderStats,
  canEditOutsourcingOrder,
  getOutsourcingOrderDisplayNo,
  parseOutsourcingOrderSortValue,
} from '../components/outsourcing-orders/outsourcingOrderPageConfig.mjs'
import { useOutsourcingOrderWorkflowActions } from '../components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs'

export default function V1OutsourcingOrdersPage() {
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = useMemo(
    () => adminProfile?.effective_session?.customer?.key || '',
    [adminProfile]
  )
  const [form] = Form.useForm()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printingAction, setPrintingAction] = useState('')
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateField, setDateField] = useState('order_date')
  const [dateRange, setDateRange] = useState([null, null])
  const [sortValue, setSortValue] = useState('updated_at:desc')
  const [pagination, setPagination] = useState(
    DEFAULT_OUTSOURCING_ORDER_PAGINATION
  )
  const [selectedRow, setSelectedRow] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const orderAttachmentRef = useRef(null)
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [processes, setProcesses] = useState([])
  const [units, setUnits] = useState([])

  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        value: item.id,
        label: supplierLabel(item),
        item,
      })),
    [suppliers]
  )

  const productOptions = useMemo(
    () =>
      products.map((item) => ({
        value: item.id,
        label: productLabel(item),
        item,
      })),
    [products]
  )

  const processOptions = useMemo(
    () =>
      processes
        .filter((item) => item.outsourcing_enabled === true)
        .map((item) => ({
          value: item.id,
          label: processLabel(item),
          item,
        })),
    [processes]
  )

  const unitOptions = useMemo(
    () =>
      units.map((item) => ({
        value: item.id,
        label: unitLabel(item),
        precision:
          Number.isInteger(Number(item.precision)) &&
          Number(item.precision) >= 0
            ? Number(item.precision)
            : undefined,
        item,
      })),
    [units]
  )

  const unitByID = useMemo(
    () => new Map(units.map((item) => [item.id, item])),
    [units]
  )

  const loadReferenceData = useCallback(async () => {
    try {
      const [supplierData, productData, processData, unitData] =
        await Promise.all([
          listSuppliers({ active_only: true, limit: 200 }),
          listProducts({ active_only: true, limit: 200 }),
          listProcesses({ active_only: true, limit: 200 }),
          listUnits({ limit: 200 }),
        ])
      setSuppliers(supplierData?.suppliers || [])
      setProducts(productData?.products || [])
      setProcesses(processData?.processes || [])
      setUnits(unitData?.units || [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载委外基础资料失败'))
    }
  }, [])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { sortBy, sortDirection } =
        parseOutsourcingOrderSortValue(sortValue)
      const data = await listOutsourcingOrders({
        keyword,
        supplier_id: supplierFilter || undefined,
        lifecycle_status: statusFilter,
        date_field: dateField,
        date_from: dateRange?.[0] || undefined,
        date_to: dateRange?.[1] || undefined,
        sort_by: sortBy,
        sort_direction: sortDirection,
        limit: pagination.pageSize,
        offset: (pagination.current - 1) * pagination.pageSize,
      })
      const nextRows = data?.outsourcing_orders || []
      setRows(nextRows)
      setTotal(Number(data?.total || 0))
      setSelectedRow((prev) =>
        prev ? nextRows.find((item) => item.id === prev.id) || null : null
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载委外订单失败'))
    } finally {
      setLoading(false)
    }
  }, [
    dateField,
    dateRange,
    keyword,
    pagination,
    sortValue,
    statusFilter,
    supplierFilter,
  ])

  const loadOrderItems = useCallback(async (order) => {
    if (!order?.id) return []
    const data = await listOutsourcingOrderItems({
      outsourcing_order_id: order.id,
      limit: 200,
    })
    return data?.outsourcing_order_items || []
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const canCreate = hasActionPermission(
    adminProfile,
    'outsourcing.order.create'
  )
  const canUpdate = hasActionPermission(
    adminProfile,
    'outsourcing.order.update'
  )
  const canReadWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.read'
  )
  const canUpdateWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.update'
  )
  const canCompleteWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.complete'
  )
  const processingPrintTemplateDefaults = useMemo(
    () =>
      getEffectivePrintTemplateDefaults(
        adminProfile,
        PROCESSING_CONTRACT_TEMPLATE_KEY
      ),
    [adminProfile]
  )

  const openCreate = () => {
    orderAttachmentRef.current?.clearPendingAttachments()
    setEditingRow(null)
    form.setFieldsValue({
      outsourcing_order_no: buildSequentialDraftCode(rows, {
        prefix: 'OUT',
        field: 'outsourcing_order_no',
      }),
      supplier_id: undefined,
      source_order_no: '',
      order_date: todayInputValue(),
      expected_return_date: '',
      contract_party_snapshot: contractPartySnapshotFromPrintTemplateDefaults(
        processingPrintTemplateDefaults,
        PROCESSING_CONTRACT_TEMPLATE_KEY
      ),
      note: '',
      items: [createBlankOutsourcingLine(1)],
    })
    setModalOpen(true)
  }

  const openEdit = async (record) => {
    if (!record) return
    orderAttachmentRef.current?.clearPendingAttachments()
    setSaving(true)
    try {
      const items = await loadOrderItems(record)
      setEditingRow(record)
      form.setFieldsValue({
        ...record,
        order_date: unixToDateInputValue(record.order_date),
        expected_return_date: unixToDateInputValue(record.expected_return_date),
        contract_party_snapshot:
          record.contract_party_snapshot &&
          typeof record.contract_party_snapshot === 'object'
            ? record.contract_party_snapshot
            : contractPartySnapshotFromPrintTemplateDefaults(
                processingPrintTemplateDefaults,
                PROCESSING_CONTRACT_TEMPLATE_KEY
              ),
        items:
          items.length > 0
            ? items.map((item) => normalizeOutsourcingLineFormValue(item))
            : [createBlankOutsourcingLine(1)],
      })
      setModalOpen(true)
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载加工合同明细失败'))
    } finally {
      setSaving(false)
    }
  }

  const closeModal = () => {
    orderAttachmentRef.current?.clearPendingAttachments()
    setModalOpen(false)
    setEditingRow(null)
    form.resetFields()
  }

  const loadWorkflowTasks = useCallback(async () => {
    if (!canReadWorkflowTasks) {
      setWorkflowTasks([])
      return
    }
    try {
      const data = await listWorkflowTasks({
        source_type: OUTSOURCING_ORDERS_MODULE_KEY,
        limit: 200,
      })
      setWorkflowTasks(data?.tasks || [])
    } catch (error) {
      setWorkflowTasks([])
      message.error(getActionErrorMessage(error, '加载委外协同任务失败'))
    }
  }, [canReadWorkflowTasks])

  useEffect(() => {
    loadWorkflowTasks()
  }, [loadWorkflowTasks])

  const refreshPageData = useCallback(async () => {
    await Promise.all([loadOrders(), loadWorkflowTasks()])
  }, [loadOrders, loadWorkflowTasks])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  const handleProductChange = (fieldName, productID) => {
    const product = products.find((item) => item.id === productID)
    if (!product) return
    const unit = unitByID.get(product.default_unit_id)
    form.setFieldValue(
      ['items', fieldName, 'product_no_snapshot'],
      product.code
    )
    form.setFieldValue(
      ['items', fieldName, 'product_name_snapshot'],
      product.name
    )
    form.setFieldValue(['items', fieldName, 'unit_id'], product.default_unit_id)
    form.setFieldValue(
      ['items', fieldName, 'unit_name_snapshot'],
      unit?.name || ''
    )
  }

  const handleProcessChange = (fieldName, processID) => {
    const process = processes.find((item) => item.id === processID)
    if (!process) return
    form.setFieldValue(
      ['items', fieldName, 'process_name_snapshot'],
      process.name
    )
    form.setFieldValue(
      ['items', fieldName, 'process_category_snapshot'],
      process.category || ''
    )
  }

  const handleUnitChange = (fieldName, unitID) => {
    const unit = unitByID.get(unitID)
    form.setFieldValue(
      ['items', fieldName, 'unit_name_snapshot'],
      unit?.name || ''
    )
  }

  const resolveSupplierSnapshot = useCallback(
    async (supplier, options = {}) => {
      const baseSnapshot = buildSupplierSnapshot(supplier)
      if (!supplier?.id) {
        return baseSnapshot
      }
      try {
        const data = await listContactsByOwner({
          owner_type: SUPPLIER_CONTACT_OWNER_TYPE,
          owner_id: supplier.id,
          active_only: true,
          limit: 50,
        })
        return buildSupplierSnapshotWithContacts(supplier, data?.contacts || [])
      } catch (error) {
        if (options.notifyOnError) {
          message.warning(
            `${getActionErrorMessage(error, '加载加工厂联系人')}，将仅保存加工厂基本信息`
          )
        }
        return baseSnapshot
      }
    },
    []
  )

  const handleSupplierChange = (supplierID) => {
    const supplier = suppliers.find((item) => item.id === supplierID)
    form.setFieldValue('supplier_snapshot', buildSupplierSnapshot(supplier))
    resolveSupplierSnapshot(supplier).then((snapshot) => {
      if (
        String(form.getFieldValue('supplier_id') ?? '') !==
        String(supplierID ?? '')
      ) {
        return
      }
      form.setFieldValue('supplier_snapshot', snapshot)
    })
  }

  const submitForm = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const supplier = suppliers.find((item) => item.id === values.supplier_id)
      const supplierSnapshot = await resolveSupplierSnapshot(supplier, {
        notifyOnError: true,
      })
      const payload = buildOutsourcingOrderParams(
        {
          ...values,
          supplier_snapshot: supplierSnapshot,
        },
        {
          id: editingRow?.id || undefined,
          items: (values.items || []).map((item, index) =>
            buildOutsourcingOrderItemParams(item, {
              line_no: index + 1,
            })
          ),
        }
      )
      const saved = await saveOutsourcingOrderWithItems(payload)
      const savedOrder = saved?.outsourcing_order || null
      const attachmentSaved =
        (await orderAttachmentRef.current?.flushPendingAttachments(
          savedOrder?.id
        )) !== false
      setSelectedRow(savedOrder)
      message.success(
        attachmentSaved
          ? editingRow
            ? '加工合同已更新'
            : '加工合同已创建'
          : '加工合同已保存，未上传的附件请重新选择'
      )
      closeModal()
      await Promise.all([loadOrders(), loadWorkflowTasks()])
    } catch (error) {
      if (error?.errorFields) return
      message.error(getActionErrorMessage(error, '保存加工合同失败'))
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action) => {
    if (!selectedRow) return
    const execute = async () => {
      setSaving(true)
      try {
        const updated = await action.run({ id: selectedRow.id })
        setSelectedRow(updated)
        message.success(`${action.label}成功`)
        await Promise.all([loadOrders(), loadWorkflowTasks()])
      } catch (error) {
        message.error(getActionErrorMessage(error, `${action.label}失败`))
      } finally {
        setSaving(false)
      }
    }

    if (action.confirmTitle) {
      modal.confirm({
        title: action.confirmTitle,
        content: action.confirmContent,
        okText: action.okText || '确认',
        cancelText: '取消',
        okButtonProps: { danger: action.danger },
        onOk: execute,
      })
      return
    }
    await execute()
  }

  const openProcessingContractPrint = async () => {
    if (!selectedRow) return
    setPrintingAction(PROCESSING_CONTRACT_TEMPLATE_KEY)
    try {
      const items = await loadOrderItems(selectedRow)
      const supplier = suppliers.find(
        (item) => item.id === selectedRow.supplier_id
      )
      const liveSupplierSnapshot =
        typeof resolveSupplierSnapshot === 'function' && supplier
          ? await resolveSupplierSnapshot(supplier)
          : {}
      const printRecord = {
        ...selectedRow,
        supplier_snapshot: mergeSnapshotMissingFields(
          selectedRow.supplier_snapshot,
          liveSupplierSnapshot
        ),
      }
      const initialDraft = completeProcessingContractDraft(
        buildProcessingContractDraftFromOutsourcingOrder(printRecord, items, {
          printTemplateDefaults: processingPrintTemplateDefaults,
        })
      )
      if (initialDraft.lines.length === 0) {
        message.warning('当前委外订单没有可打印的明细')
        return
      }
      openPrintWorkspaceWindow(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
      })
      message.success('已打开加工合同打印模板')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开加工合同打印失败'))
    } finally {
      setPrintingAction('')
    }
  }

  const openWorkInstructionPrint = async () => {
    if (!selectedRow) return
    setPrintingAction(WORK_INSTRUCTION_TEMPLATE_KEY)
    try {
      const items = await loadOrderItems(selectedRow)
      const activeItems = (Array.isArray(items) ? items : []).filter((item) => {
        const status = String(item?.line_status || '')
          .trim()
          .toLowerCase()
        return status !== 'canceled' && status !== 'cancelled'
      })
      if (activeItems.length === 0) {
        message.warning('当前委外订单没有可带入作业指导书的明细')
        return
      }
      const initialDraft = buildWorkInstructionDraftFromOutsourcingOrder(
        selectedRow,
        activeItems,
        {
          companyName: resolveRuntimeCustomerPrintCompanyName(),
        }
      )
      openPrintWorkspaceWindow(WORK_INSTRUCTION_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
      })
      message.success('已打开作业指导书打印模板')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开作业指导书打印失败'))
    } finally {
      setPrintingAction('')
    }
  }

  const {
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    urgeOutsourcingWorkflowTask,
  } = useOutsourcingOrderWorkflowActions({ loadWorkflowTasks })

  const pageStats = buildOutsourcingOrderStats({
    rows,
    total,
  })

  const resolveSupplierName = useCallback(
    (record = {}) =>
      record?.supplier_snapshot?.short_name ||
      record?.supplier_snapshot?.name ||
      suppliers.find((item) => item.id === record.supplier_id)?.short_name ||
      suppliers.find((item) => item.id === record.supplier_id)?.name ||
      '未指定加工厂',
    [suppliers]
  )

  const selectedLabel = selectedRow
    ? `${getOutsourcingOrderDisplayNo(selectedRow)} / ${resolveSupplierName(
        selectedRow
      )}`
    : '请先选择一份加工合同'

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(OUTSOURCING_ORDERS_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: OUTSOURCING_ORDERS_MODULE_KEY,
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
    [outletContext]
  )

  const dataColumns = useMemo(
    () => buildOutsourcingOrderColumns({ resolveSupplierName }),
    [resolveSupplierName]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: OUTSOURCING_ORDERS_MODULE_KEY,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns]
  )

  const visibleDataColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [dataColumns, preferredColumnOrder]
  )

  const columns = useMemo(
    () =>
      visibleDataColumns.map((column) => ({
        ...column,
        title: (
          <ColumnOrderHeaderMenu
            column={column}
            columns={dataColumns}
            order={preferredColumnOrder}
            saving={columnOrderSaving}
            onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
            onOpenPanel={() => setColumnOrderOpen(true)}
          />
        ),
      })),
    [
      columnOrderSaving,
      dataColumns,
      persistColumnOrder,
      preferredColumnOrder,
      visibleDataColumns,
    ]
  )

  const exportOrders = useCallback(() => {
    if (rows.length === 0) return
    downloadBusinessCSV({
      filename: `outsourcing-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleDataColumns,
      rows,
    })
  }, [rows, visibleDataColumns])

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      supplierFilter ||
      dateRange?.[0] ||
      dateRange?.[1]
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setSupplierFilter('')
    setDateField('order_date')
    setDateRange([null, null])
    setPagination((current) => ({ ...current, current: 1 }))
  }, [])

  const selectedWorkflowTasks = useMemo(
    () =>
      selectedRow?.id
        ? filterBusinessCollaborationTasksBySource({
            tasks: workflowTasks,
            sourceType: OUTSOURCING_ORDERS_MODULE_KEY,
            sourceIDs: [selectedRow.id],
          })
        : [],
    [selectedRow, workflowTasks]
  )

  const selectedItems = selectedRow
    ? [
        {
          key: selectedRow.id,
          label: getOutsourcingOrderDisplayNo(selectedRow),
          title: `${resolveSupplierName(selectedRow)} / ${statusText(
            selectedRow.lifecycle_status,
            OUTSOURCING_ORDER_STATUS_LABELS,
            '委外订单状态'
          )}`,
        },
      ]
    : []
  const visibleLifecycleActions = selectedRow
    ? OUTSOURCING_ORDER_LIFECYCLE_ACTIONS.filter(
        (action) =>
          hasActionPermission(adminProfile, action.permission) &&
          canRunOutsourcingOrderLifecycleAction(
            selectedRow.lifecycle_status,
            action.nextStatus
          )
      )
    : []
  const primaryLifecycleAction =
    visibleLifecycleActions.find((action) => action.key !== 'cancel') || null
  const secondaryLifecycleActions = visibleLifecycleActions.filter(
    (action) => action.key !== primaryLifecycleAction?.key
  )
  const lifecycleMenuItems =
    secondaryLifecycleActions.length > 0
      ? [
          {
            key: 'status-transitions',
            label: '状态变更',
            type: 'group',
            children: secondaryLifecycleActions.map((action) => ({
              key: action.key,
              label: action.label,
              danger: action.danger,
            })),
          },
        ]
      : []

  return (
    <BusinessPageLayout className="erp-v1-outsourcing-orders-page">
      <PageHeaderCard
        compact
        title="委外订单"
        description="维护加工合同源单、工序明细、加工厂承诺和打印快照；查货只作为可选工序，查货结果、发料、回货、质检、应付仍由对应后端事实规则承接。"
        tags={[
          <Tag color="blue" key="source">
            源单：加工合同
          </Tag>,
          <Tag color="green" key="process">
            工序来自加工环节字典
          </Tag>,
          <Tag color="purple" key="checking">
            查货只是工序候选
          </Tag>,
          <Tag color="gold" key="fact">
            不直接写质检 / 库存 / 应付
          </Tag>,
        ]}
        stats={pageStats}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索合同"
              searchHint="可搜索：合同号、来源订单"
              onChange={(event) => {
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
                setKeyword(event.target.value)
              }}
              onPressEnter={() => {
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
                loadOrders()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={OUTSOURCING_ORDER_STATUS_OPTIONS}
              onChange={(value) => {
                setStatusFilter(value)
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={supplierFilter}
              options={[{ label: '全部加工厂', value: '' }, ...supplierOptions]}
              placeholder="全部加工厂"
              showSearch
              optionFilterProp="label"
              onChange={(value) => {
                setSupplierFilter(value || '')
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
            <DateRangeFilter
              options={OUTSOURCING_ORDER_DATE_FILTER_OPTIONS}
              value={dateField}
              onTypeChange={(value) => {
                setDateField(value || 'order_date')
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
              startValue={dateRange?.[0] || ''}
              endValue={dateRange?.[1] || ''}
              onStartChange={(value) => {
                setDateRange((current) => [value, current?.[1] || ''])
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
              onEndChange={(value) => {
                setDateRange((current) => [current?.[0] || '', value])
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--sort"
              value={sortValue}
              options={OUTSOURCING_ORDER_SORT_OPTIONS}
              onChange={(value) => {
                setSortValue(value)
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={rows.length === 0}
              onClick={exportOrders}
            >
              导出筛选结果
            </ToolbarButton>
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
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建加工合同
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedLabel}
          selectedItems={selectedItems}
          boundaryText="加工合同只表达委外承诺和打印快照；查货只作为工序候选，判定结果回质检模块；确认下单不自动写库存、质检、应付或 Workflow 完成。"
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空
          </Button>
          {selectedRow
            ? renderOutsourcingOrderStatusTag(selectedRow.lifecycle_status)
            : null}
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={
              !selectedRow ||
              !canUpdate ||
              !canEditOutsourcingOrder(selectedRow)
            }
            onClick={() => openEdit(selectedRow)}
          >
            编辑
          </Button>
          {primaryLifecycleAction ? (
            <Button
              size="small"
              type="primary"
              danger={primaryLifecycleAction.danger}
              icon={
                primaryLifecycleAction.danger ? (
                  <CloseCircleOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
              disabled={!selectedRow || saving}
              loading={saving}
              onClick={() => runLifecycleAction(primaryLifecycleAction)}
            >
              {primaryLifecycleAction.label}
            </Button>
          ) : null}
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={!selectedRow || printingAction !== ''}
            loading={printingAction === PROCESSING_CONTRACT_TEMPLATE_KEY}
            onClick={openProcessingContractPrint}
          >
            加工合同打印
          </Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={!selectedRow || printingAction !== ''}
            loading={printingAction === WORK_INSTRUCTION_TEMPLATE_KEY}
            onClick={openWorkInstructionPrint}
          >
            作业指导书打印
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            getPopupContainer={(triggerNode) =>
              triggerNode.parentElement || document.body
            }
            disabled={
              !selectedRow || saving || secondaryLifecycleActions.length === 0
            }
            menu={{
              items: lifecycleMenuItems,
              onClick: ({ key }) => {
                const action = secondaryLifecycleActions.find(
                  (item) => item.key === key
                )
                if (action) runLifecycleAction(action)
              },
            }}
          >
            <Button
              size="small"
              aria-label="更多操作"
              disabled={
                !selectedRow || saving || secondaryLifecycleActions.length === 0
              }
            >
              更多 <DownOutlined />
            </Button>
          </Dropdown>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRow ? [selectedRow.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedRow(selectedRows[0] || null),
        }}
        rowClassName={(record) =>
          record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedRow(record),
          onDoubleClick: () => openEdit(record),
        })}
        emptyDescription="暂无加工合同"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
          showTotal: (nextTotal, range) =>
            `第 ${range[0]}-${range[1]} 条 / 共 ${nextTotal} 条`,
        }}
        scroll={{ x: 1220 }}
      />

      <CollaborationTaskPanel
        tasks={workflowTasks}
        selectedTasks={selectedWorkflowTasks}
        selectedRecordLabel={
          selectedRow ? getOutsourcingOrderDisplayNo(selectedRow) : ''
        }
        adminProfile={adminProfile}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onRejectTask={canUpdateWorkflowTasks ? rejectWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgeOutsourcingWorkflowTask : undefined
        }
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="委外订单列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <BusinessFormModal
        icon={<FileTextOutlined />}
        title={editingRow ? '编辑加工合同' : '新建加工合同'}
        description="只维护委外源单和工序明细；查货、手工、车缝、包装都只是加工环节，结果判定、库存和应付由后续事实模块处理。"
        open={modalOpen}
        onCancel={closeModal}
        onOk={submitForm}
        confirmLoading={saving}
        forceRender
      >
        <OutsourcingOrderForm
          form={form}
          supplierOptions={supplierOptions}
          onSupplierChange={handleSupplierChange}
          productOptions={productOptions}
          processOptions={processOptions}
          unitOptions={unitOptions}
          onProductChange={handleProductChange}
          onProcessChange={handleProcessChange}
          onUnitChange={handleUnitChange}
          attachmentPanel={
            <BusinessAttachmentPanel
              ref={orderAttachmentRef}
              ownerType="outsourcing_order"
              ownerId={editingRow?.id}
              title="加工合同附件"
              description="上传纸样、图纸、签回合同、加工要求或报价结算依据；附件不写库存、质检或应付事实。"
              canUpload={canUpdate || canCreate}
              canDelete={canUpdate}
              variant="inline"
            />
          }
        />
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
