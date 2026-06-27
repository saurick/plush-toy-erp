import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Form, Popconfirm, Tag, Typography } from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  addShipmentItem,
  cancelShipment,
  createShipmentWithItems,
  listShipments,
  shipShipment,
} from '../api/operationalFactApi.mjs'
import {
  listCustomers,
  listProductSKUs,
  listProducts,
  listSalesOrderItems,
  listSalesOrders,
  listUnits,
} from '../api/masterDataOrderApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  downloadBusinessListCSV,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import ShipmentBusinessModal, {
  salesOrderCustomerText,
  sourceLineProductText,
} from '../components/shipments/ShipmentBusinessModal.jsx'
import {
  buildShipmentColumns,
  SHIPMENT_DATE_FILTER_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
  SHIPMENTS_MODULE_KEY,
} from '../components/shipments/shipmentColumns.jsx'
import {
  compactParams,
  buildSequentialDraftCode,
  hasActionPermission,
  trimOptional,
} from '../utils/masterDataOrderView.mjs'
import {
  buildShipmentItemParams,
  buildShipmentSourceRows,
  createBlankShipmentItem,
  createShipmentItemFromSalesOrderItem,
  decimalNumber,
  formatQuantity,
  isBlankShipmentItem,
  positiveInt,
} from '../utils/businessLineItems.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  customerOption,
  inventoryLotOption,
  productOption,
  productSKUOption,
  salesOrderItemOption,
  salesOrderOption,
  shipmentOption,
  uniqueReferenceOptions,
  unitOption,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  searchParamPositiveIntText,
  searchParamText,
} from '../utils/routeQuery.mjs'

const { Text } = Typography

function hasPermission(adminProfile, permission) {
  return (
    adminProfile?.is_super_admin === true ||
    hasActionPermission(adminProfile, permission)
  )
}

function idempotencyKey(prefix) {
  return `${prefix}-${Date.now()}`
}

function buildShipmentParams(values = {}) {
  return compactParams({
    shipment_no: trimOptional(values.shipment_no),
    sales_order_id: positiveInt(values.sales_order_id),
    customer_id: positiveInt(values.customer_id),
    customer_snapshot: trimOptional(values.customer_snapshot),
    idempotency_key: trimOptional(values.idempotency_key),
    planned_ship_at: trimOptional(values.planned_ship_at),
    note: trimOptional(values.note),
  })
}

function buildShipmentWithItemsParams(values = {}) {
  return {
    ...buildShipmentParams(values),
    items: (values.items || []).map((item) => buildShipmentItemParams(item)),
  }
}

function shipmentFormValues(shipment = {}) {
  const plannedShipAt = Number(shipment.planned_ship_at || 0)
  return {
    shipment_no: shipment.shipment_no || '',
    sales_order_id: shipment.sales_order_id,
    customer_id: shipment.customer_id,
    customer_snapshot: shipment.customer_snapshot || '',
    idempotency_key: shipment.idempotency_key || '',
    planned_ship_at:
      plannedShipAt > 0
        ? new Date(plannedShipAt * 1000).toISOString().slice(0, 10)
        : '',
    note: shipment.note || '',
  }
}

export default function ShipmentsPage() {
  const outletContext = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = outletContext?.adminProfile || {}
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('planned_ship_at')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [shipmentModal, setShipmentModal] = useState(null)
  const [salesOrderSources, setSalesOrderSources] = useState([])
  const [salesOrderSourceItems, setSalesOrderSourceItems] = useState([])
  const [shipmentSourceRows, setShipmentSourceRows] = useState([])
  const [customers, setCustomers] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [products, setProducts] = useState([])
  const [productSKUs, setProductSKUs] = useState([])
  const [salesOrderItems, setSalesOrderItems] = useState([])
  const [salesOrders, setSalesOrders] = useState([])
  const [units, setUnits] = useState([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [salesOrderImportOpen, setSalesOrderImportOpen] = useState(false)
  const [shipmentForm] = Form.useForm()
  const shipmentAttachmentRef = useRef(null)
  const selectedSalesOrderID = Form.useWatch('sales_order_id', shipmentForm)
  const shipmentFormItems = Form.useWatch('items', shipmentForm)
  const routeSalesOrderID = searchParamPositiveIntText(
    searchParams,
    'sales_order_id'
  )
  const routeShipmentID =
    searchParamPositiveIntText(searchParams, 'shipment_id') ||
    (searchParamText(searchParams, 'source_type').toUpperCase() === 'SHIPMENT'
      ? searchParamPositiveIntText(searchParams, 'source_id')
      : '')

  const canCreate = hasPermission(adminProfile, 'shipment.create')
  const canShip = hasPermission(adminProfile, 'shipment.ship')
  const canCancel = hasPermission(adminProfile, 'shipment.cancel')
  const customerOptions = useMemo(
    () => uniqueReferenceOptions(customers, customerOption),
    [customers]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
    [products]
  )
  const productSKUOptions = useMemo(
    () => uniqueReferenceOptions(productSKUs, productSKUOption),
    [productSKUs]
  )
  const salesOrderOptions = useMemo(
    () => uniqueReferenceOptions(salesOrders, salesOrderOption),
    [salesOrders]
  )
  const salesOrdersByID = useMemo(
    () =>
      new Map(
        salesOrders
          .map((order) => [Number(order?.id || 0), order])
          .filter(([orderID]) => Number.isFinite(orderID) && orderID > 0)
      ),
    [salesOrders]
  )
  const salesOrderItemOptions = useMemo(
    () => uniqueReferenceOptions(salesOrderItems, salesOrderItemOption),
    [salesOrderItems]
  )
  const shipmentOptions = useMemo(
    () => uniqueReferenceOptions(rows, shipmentOption),
    [rows]
  )
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const warehouseOptions = useMemo(
    () =>
      uniqueReferenceOptions(
        [
          ...inventoryLots,
          ...rows.flatMap((shipment) =>
            Array.isArray(shipment?.items) ? shipment.items : []
          ),
        ],
        warehouseOptionFromRecord
      ),
    [inventoryLots, rows]
  )

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listShipments(
        compactParams({
          status: statusFilter,
          keyword: trimOptional(keyword) || routeShipmentID || undefined,
          customer_id: customerFilter || undefined,
          product_id: productFilter || undefined,
          warehouse_id: warehouseFilter || undefined,
          source_id: routeSalesOrderID || undefined,
          date_field: dateFilterField,
          date_from: dateFilterStart || undefined,
          date_to: dateFilterEnd || undefined,
          ...getBusinessPaginationParams(pagination),
        })
      )
      const nextRows = Array.isArray(data?.shipments) ? data.shipments : []
      setRows(nextRows)
      setSelectedRow((current) => {
        const routeSelectedID = Number(routeShipmentID || 0)
        if (routeSelectedID > 0) {
          return nextRows.find((item) => item.id === routeSelectedID) || null
        }
        return current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      })
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载出货单'))
    } finally {
      setLoading(false)
    }
  }, [
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    customerFilter,
    keyword,
    pagination,
    productFilter,
    routeSalesOrderID,
    routeShipmentID,
    statusFilter,
    warehouseFilter,
  ])

  const clearRouteContext = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('sales_order_id')
    nextParams.delete('shipment_id')
    nextParams.delete('source_type')
    nextParams.delete('source_id')
    setSearchParams(nextParams, { replace: true })
    resetBusinessPaginationCurrent(setPagination)
  }, [searchParams, setSearchParams])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const loadReferenceOptions = useCallback(async () => {
    try {
      const [
        customerResult,
        lotResult,
        productResult,
        skuResult,
        salesOrderResult,
        unitResult,
      ] = await Promise.all([
        listCustomers({ limit: 500, active_only: true }),
        listInventoryLots({ limit: 500 }),
        listProducts({ limit: 500, active_only: true }),
        listProductSKUs({ limit: 500, active_only: true }),
        listSalesOrders({ limit: 500 }),
        listUnits({ limit: 500 }),
      ])
      setCustomers(
        Array.isArray(customerResult?.customers) ? customerResult.customers : []
      )
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setProductSKUs(
        Array.isArray(skuResult?.product_skus) ? skuResult.product_skus : []
      )
      setSalesOrders(
        Array.isArray(salesOrderResult?.sales_orders)
          ? salesOrderResult.sales_orders
          : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载出货引用数据'))
      setCustomers([])
      setInventoryLots([])
      setProducts([])
      setProductSKUs([])
      setSalesOrders([])
      setUnits([])
    }
  }, [])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    if (!shipmentModal) {
      setSalesOrderItems([])
      return undefined
    }
    const salesOrderID = Number(selectedSalesOrderID || 0)
    if (!Number.isFinite(salesOrderID) || salesOrderID <= 0) {
      setSalesOrderItems([])
      return undefined
    }

    let cancelled = false
    listSalesOrderItems({
      sales_order_id: salesOrderID,
      line_status: 'open',
      limit: 200,
    })
      .then((data) => {
        if (cancelled) return
        setSalesOrderItems(
          Array.isArray(data?.sales_order_items) ? data.sales_order_items : []
        )
      })
      .catch((error) => {
        if (cancelled) return
        message.error(getActionErrorMessage(error, '加载销售订单明细'))
        setSalesOrderItems([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedSalesOrderID, shipmentModal])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  const modalSelectedShipment = useMemo(() => {
    const shipment = shipmentModal?.shipment
    if (!shipment?.id) return null
    return rows.find((item) => item.id === shipment.id) || shipment
  }, [rows, shipmentModal?.shipment])

  const shipmentModalMode = shipmentModal?.mode || ''
  const isCreateModal = shipmentModalMode === 'create'
  const isAppendModal = shipmentModalMode === 'append'
  const selectedSalesOrder = useMemo(
    () => salesOrdersByID.get(Number(selectedSalesOrderID || 0)) || null,
    [salesOrdersByID, selectedSalesOrderID]
  )
  const selectedSourceRows = useMemo(() => {
    const sourceItemIDs = new Set(
      (Array.isArray(shipmentFormItems) ? shipmentFormItems : [])
        .map((item) => Number(item?.sales_order_item_id || 0))
        .filter((itemID) => Number.isFinite(itemID) && itemID > 0)
    )
    return shipmentSourceRows.filter((row) => sourceItemIDs.has(Number(row.id)))
  }, [shipmentFormItems, shipmentSourceRows])
  const selectedSourceRemainingTotal = selectedSourceRows.reduce(
    (total, item) => total + decimalNumber(item.remainingQuantity),
    0
  )
  const salesOrderImportColumns = useMemo(
    () => [
      {
        title: '销售订单号',
        width: 160,
        render: (_, item) => {
          const order = salesOrdersByID.get(Number(item.sales_order_id || 0))
          return order?.order_no || order?.customer_order_no || '-'
        },
        searchText: (item) => {
          const order = salesOrdersByID.get(Number(item.sales_order_id || 0))
          return [
            order?.order_no,
            order?.customer_order_no,
            salesOrderCustomerText(order),
            item.line_no,
            item.product_name_snapshot,
          ].join(' ')
        },
      },
      {
        title: '来源行',
        dataIndex: 'line_no',
        width: 88,
        render: (value) => (value ? `第 ${value} 行` : '-'),
      },
      {
        title: '客户',
        width: 160,
        render: (_, item) =>
          salesOrderCustomerText(
            salesOrdersByID.get(Number(item.sales_order_id || 0))
          ) || '-',
      },
      {
        title: '产品 / SKU',
        width: 220,
        render: (_, item) =>
          sourceLineProductText(item, productOptions, productSKUOptions),
      },
      {
        title: '订单数量',
        dataIndex: 'orderedQuantity',
        width: 100,
        render: formatQuantity,
      },
      {
        title: '已生成出货',
        dataIndex: 'shippedQuantity',
        width: 100,
        render: formatQuantity,
      },
      {
        title: '剩余可出货',
        dataIndex: 'remainingQuantity',
        width: 120,
        render: (value) =>
          value > 0 ? (
            <Text strong>{formatQuantity(value)}</Text>
          ) : (
            <Text type="secondary">0</Text>
          ),
      },
      {
        title: '状态',
        dataIndex: 'line_status',
        width: 100,
      },
    ],
    [productOptions, productSKUOptions, salesOrdersByID]
  )

  const loadSalesOrderSources = useCallback(async () => {
    setSourceLoading(true)
    try {
      const [orderData, itemData, shipmentData] = await Promise.all([
        listSalesOrders({
          lifecycle_status: 'active',
          limit: 100,
        }),
        listSalesOrderItems({
          limit: 500,
        }),
        listShipments({
          limit: 500,
        }),
      ])
      const nextOrders = Array.isArray(orderData?.sales_orders)
        ? orderData.sales_orders
        : []
      const activeOrderIDs = new Set(
        nextOrders.map((order) => Number(order?.id)).filter(Boolean)
      )
      const nextItems = (
        Array.isArray(itemData?.sales_order_items)
          ? itemData.sales_order_items
          : []
      ).filter((item) => activeOrderIDs.has(Number(item?.sales_order_id)))
      const nextSourceRows = buildShipmentSourceRows({
        salesOrderItems: nextItems,
        shipments: Array.isArray(shipmentData?.shipments)
          ? shipmentData.shipments
          : [],
      })
      setSalesOrderSources(nextSourceRows)
      setSalesOrderSourceItems(nextItems)
      setShipmentSourceRows(nextSourceRows)
      setSalesOrders((currentOrders) => {
        const byID = new Map(
          currentOrders
            .map((order) => [Number(order?.id || 0), order])
            .filter(([orderID]) => Number.isFinite(orderID) && orderID > 0)
        )
        nextOrders.forEach((order) => {
          const orderID = Number(order?.id || 0)
          if (Number.isFinite(orderID) && orderID > 0) {
            byID.set(orderID, order)
          }
        })
        return [...byID.values()]
      })
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载销售订单来源'))
    } finally {
      setSourceLoading(false)
    }
  }, [])

  const openSalesOrderImport = () => {
    setSalesOrderImportOpen(true)
    loadSalesOrderSources()
  }

  const importSalesOrderToShipment = async (sourceItems = []) => {
    const importableItems = sourceItems.filter(
      (item) => !item.disabledReason && item.remainingQuantity > 0
    )
    if (importableItems.length === 0) {
      message.warning('请选择仍有剩余可出货数量的销售订单行')
      return
    }
    const sourceOrderIDs = new Set(
      importableItems.map((item) => Number(item.sales_order_id || 0))
    )
    if (sourceOrderIDs.size !== 1) {
      message.warning('一次出货草稿只能导入同一张销售订单的来源行')
      return
    }
    const sourceOrderID = [...sourceOrderIDs][0]
    const sourceOrder = salesOrdersByID.get(sourceOrderID)
    if (!sourceOrder?.id) return
    try {
      setSourceLoading(true)
      const sameOrderItems = salesOrderSourceItems.filter(
        (item) => Number(item.sales_order_id || 0) === sourceOrderID
      )
      setSalesOrderItems(sameOrderItems)
      shipmentForm.setFieldsValue({
        sales_order_id: sourceOrder.id,
        customer_id: sourceOrder.customer_id,
        customer_snapshot: salesOrderCustomerText(sourceOrder),
      })
      const currentItems = (shipmentForm.getFieldValue('items') || []).filter(
        (item) => !isBlankShipmentItem(item)
      )
      shipmentForm.setFieldsValue({
        items: [
          ...currentItems,
          ...importableItems.map((item) =>
            createShipmentItemFromSalesOrderItem(
              item,
              modalSelectedShipment?.id,
              { quantity: item.remainingQuantity }
            )
          ),
        ],
      })
      message.success('已导入销售订单来源行和剩余可出货数量')
      setSalesOrderImportOpen(false)
    } catch (error) {
      message.error(getActionErrorMessage(error, '导入销售订单来源'))
    } finally {
      setSourceLoading(false)
    }
  }

  const openCreate = () => {
    shipmentAttachmentRef.current?.clearPendingAttachments()
    shipmentForm.resetFields()
    shipmentForm.setFieldsValue({
      shipment_no: buildSequentialDraftCode(rows, {
        prefix: 'SHIP',
        field: 'shipment_no',
      }),
      idempotency_key: idempotencyKey('shipment'),
      planned_ship_at: new Date().toISOString().slice(0, 10),
      items: [createBlankShipmentItem()],
    })
    setShipmentModal({ mode: 'create', shipment: null })
  }

  const openAppendItems = (shipment) => {
    shipmentAttachmentRef.current?.clearPendingAttachments()
    shipmentForm.resetFields()
    shipmentForm.setFieldsValue({
      ...shipmentFormValues(shipment),
      items: [createBlankShipmentItem(shipment?.id)],
    })
    setShipmentModal({ mode: 'append', shipment })
  }

  const closeShipmentModal = () => {
    shipmentAttachmentRef.current?.clearPendingAttachments()
    setSalesOrderImportOpen(false)
    setShipmentModal(null)
    shipmentForm.resetFields()
  }

  const addShipmentItems = async (shipmentID, items = []) => {
    if (!positiveInt(shipmentID)) {
      throw new Error('缺少出货单，无法保存出货明细')
    }
    const normalizedItems = items.map((item) =>
      buildShipmentItemParams({ ...item, shipment_id: shipmentID })
    )
    for (const item of normalizedItems) {
      await addShipmentItem(item)
    }
  }

  const submitShipmentModal = async () => {
    try {
      const values = await shipmentForm.validateFields()
      setSaving(true)
      let savedShipment = modalSelectedShipment
      if (isCreateModal) {
        savedShipment = await createShipmentWithItems(
          buildShipmentWithItemsParams(values)
        )
      } else if (isAppendModal) {
        await addShipmentItems(modalSelectedShipment?.id, values.items || [])
      }
      const attachmentSaved =
        (await shipmentAttachmentRef.current?.flushPendingAttachments(
          savedShipment?.id
        )) !== false
      message.success(
        attachmentSaved
          ? isCreateModal
            ? '出货单草稿和明细已保存'
            : '出货明细已保存'
          : '出货单已保存，未上传的附件请重新选择'
      )
      closeShipmentModal()
      await loadRows()
    } catch (error) {
      if (error?.errorFields) {
        return
      }
      message.error(getActionErrorMessage(error, '保存出货单'))
    } finally {
      setSaving(false)
    }
  }

  const runShipmentAction = async (shipment, action, actionLabel) => {
    if (!shipment?.id) {
      return
    }
    try {
      setSaving(true)
      await action({ id: shipment.id })
      message.success(`${actionLabel}已完成`)
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, actionLabel))
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo(
    () => buildShipmentColumns({ salesOrdersByID }),
    [salesOrdersByID]
  )
  const { tableColumns, visibleColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: SHIPMENTS_MODULE_KEY,
      moduleTitle: '出货单',
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: 'shipments.csv',
      columns: visibleColumns,
      rows,
    })
  }, [rows, visibleColumns])
  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      customerFilter ||
      productFilter ||
      warehouseFilter ||
      dateFilterStart ||
      dateFilterEnd ||
      routeSalesOrderID ||
      routeShipmentID
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setCustomerFilter('')
    setProductFilter('')
    setWarehouseFilter('')
    setDateFilterField('planned_ship_at')
    setDateFilterStart('')
    setDateFilterEnd('')
    clearRouteContext()
  }, [clearRouteContext])
  const selectedRowLabel = selectedRow
    ? `${selectedRow.shipment_no || '已登记出货单'} / ${
        selectedRow.customer_snapshot ||
        (selectedRow.customer_id ? '客户已关联' : '未指定客户')
      }`
    : '请先选择一张出货单'

  return (
    <BusinessPageLayout className="erp-v1-shipments-page">
      <PageHeaderCard
        compact
        title="出货单"
        description="出货单对应 shipments / shipment_items；只有确认出货后的 SHIPPED 才是真实出货事实，并由后端写 inventory_txns.OUT。"
        tags={[
          <Tag color="gold" key="release">
            出货放行：可发货
          </Tag>,
          <Tag color="blue" key="shipment">
            出货单：已出货事实
          </Tag>,
          <Tag color="green" key="inventory">
            出库管理：库存出库事实
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总出货单', value: total },
          { key: 'current', label: '当前结果', value: rows.length },
          {
            key: 'draft',
            label: '草稿',
            value: rows.filter((item) => item.status === 'DRAFT').length,
          },
        ]}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索出货"
              searchHint="可搜索：出货单号、客户、销售订单"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={SHIPMENT_STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={customerFilter}
              options={[{ label: '全部客户', value: '' }, ...customerOptions]}
              placeholder="全部客户"
              showSearch
              optionFilterProp="label"
              onChange={(nextCustomer) => {
                setCustomerFilter(nextCustomer || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={productFilter}
              options={[{ label: '全部产品', value: '' }, ...productOptions]}
              placeholder="全部产品"
              showSearch
              optionFilterProp="label"
              onChange={(nextProduct) => {
                setProductFilter(nextProduct || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={warehouseFilter}
              options={[{ label: '全部仓库', value: '' }, ...warehouseOptions]}
              placeholder="全部仓库"
              showSearch
              optionFilterProp="label"
              onChange={(nextWarehouse) => {
                setWarehouseFilter(nextWarehouse || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={SHIPMENT_DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(value) => {
                setDateFilterField(value || 'planned_ship_at')
                resetBusinessPaginationCurrent(setPagination)
              }}
              startValue={dateFilterStart}
              endValue={dateFilterEnd}
              onStartChange={(nextStart) => {
                setDateFilterStart(nextStart)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onEndChange={(nextEnd) => {
                setDateFilterEnd(nextEnd)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            {routeSalesOrderID ? (
              <Tag closable color="blue" onClose={clearRouteContext}>
                已按销售订单筛选
              </Tag>
            ) : null}
            {routeShipmentID ? (
              <Tag closable color="blue" onClose={clearRouteContext}>
                已按出货单筛选
              </Tag>
            ) : null}
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle="出货单"
            onExport={exportRows}
            exportDisabled={rows.length === 0}
            onOpenColumnOrder={openColumnOrder}
          />
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建草稿
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空已选
          </Button>
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'DRAFT' ||
              !canCreate ||
              saving
            }
            onClick={() => openAppendItems(selectedRow)}
          >
            维护明细
          </Button>
          <Popconfirm
            title="确认出货并写库存 OUT？"
            onConfirm={() =>
              runShipmentAction(selectedRow, shipShipment, '确认出货')
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'DRAFT' ||
                !canShip ||
                saving
              }
            >
              确认出货
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认取消并写出库冲正？"
            onConfirm={() =>
              runShipmentAction(selectedRow, cancelShipment, '取消出货')
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'SHIPPED' ||
                !canCancel ||
                saving
              }
            >
              取消出货
            </Button>
          </Popconfirm>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={tableColumns}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        emptyDescription="暂无出货单"
        scroll={{ x: 1320 }}
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
        })}
      />
      {columnOrderModal}

      <ShipmentBusinessModal
        canCreate={canCreate}
        canShip={canShip}
        customerOptions={customerOptions}
        form={shipmentForm}
        importSalesOrderToShipment={importSalesOrderToShipment}
        inventoryLotOptions={inventoryLotOptions}
        isAppendModal={isAppendModal}
        isCreateModal={isCreateModal}
        modalSelectedShipment={modalSelectedShipment}
        onCancel={closeShipmentModal}
        onOk={submitShipmentModal}
        onOpenSalesOrderImport={openSalesOrderImport}
        productOptions={productOptions}
        productSKUOptions={productSKUOptions}
        salesOrderImportColumns={salesOrderImportColumns}
        salesOrderImportOpen={salesOrderImportOpen}
        salesOrderItemOptions={salesOrderItemOptions}
        salesOrderOptions={salesOrderOptions}
        salesOrderSources={salesOrderSources}
        saving={saving}
        selectedSalesOrder={selectedSalesOrder}
        selectedSourceRemainingTotal={selectedSourceRemainingTotal}
        selectedSourceRows={selectedSourceRows}
        setSalesOrderImportOpen={setSalesOrderImportOpen}
        shipmentAttachmentRef={shipmentAttachmentRef}
        shipmentFormItems={shipmentFormItems}
        shipmentOptions={shipmentOptions}
        sourceLoading={sourceLoading}
        unitOptions={unitOptions}
        warehouseOptions={warehouseOptions}
      />
    </BusinessPageLayout>
  )
}
