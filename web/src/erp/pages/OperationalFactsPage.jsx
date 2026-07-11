import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  LinkOutlined,
  PrinterOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Popconfirm, Tabs, Tag } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  compactParams,
  trimOptional,
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
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  downloadBusinessListCSV,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessAttachmentModalButton from '../components/business-list/BusinessAttachmentModalButton.jsx'
import {
  routeWithQuery,
  searchParamPositiveIntText,
  searchParamText,
} from '../utils/routeQuery.mjs'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'
import { buildProcessingContractDraftFromOutsourcingFact } from '../data/processingContractTemplate.mjs'
import {
  hasAnyPermission,
  selectedLabelForKey,
  sourceRouteFor,
} from '../components/operational-facts/OperationalFactForms.jsx'
import {
  DEFAULT_OPERATIONAL_FACT_PAGINATION,
  DEFAULT_OPERATIONAL_FACT_SUMMARY,
  EMPTY_VIEW_OVERRIDES,
  OCCURRED_DATE_FILTER_OPTIONS,
  STATUS_OPTIONS,
  buildOperationalFactColumns,
  buildOperationalFactRelatedMenuItems,
  buildOperationalFactStats,
  buildOperationalFactViewConfigs,
  getOperationalFactAttachmentOwnerType,
  sourceTypeLabel,
} from '../components/operational-facts/operationalFactPageConfig.mjs'

export function OperationalFactWorkspace({
  pageTitle = '业务记录处理',
  pageSummary = DEFAULT_OPERATIONAL_FACT_SUMMARY,
  toolbarModuleKey = 'operational-facts',
  initialActiveKey = 'production',
  enabledViews,
  viewOverrides = EMPTY_VIEW_OVERRIDES,
  showTabs = true,
}) {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = outletContext?.adminProfile || {}
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''
  const [activeKey, setActiveKey] = useState(initialActiveKey)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFieldByKey, setDateFieldByKey] = useState({})
  const [dateRangeByKey, setDateRangeByKey] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowsByKey, setRowsByKey] = useState({})
  const [totalByKey, setTotalByKey] = useState({})
  const [paginationByKey, setPaginationByKey] = useState({})
  const [selectedByKey, setSelectedByKey] = useState({})
  const listRequestVersionRef = useRef(0)
  const mountedRef = useRef(false)
  const routeSalesOrderID = searchParamPositiveIntText(
    searchParams,
    'sales_order_id'
  )
  const routeSourceID = searchParamPositiveIntText(searchParams, 'source_id')
  const routeSourceType = searchParamText(searchParams, 'source_type')
  const routeView = searchParamText(searchParams, 'view')

  const baseConfigs = useMemo(() => buildOperationalFactViewConfigs(), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      listRequestVersionRef.current += 1
    }
  }, [])

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

  useEffect(() => {
    if (routeView && configs[routeView] && routeView !== activeKey) {
      setActiveKey(routeView)
    }
  }, [activeKey, configs, routeView])

  const fallbackActiveKey =
    enabledViewKeys.find((key) => configs[key]) || 'production'
  const currentActiveKey = configs[activeKey] ? activeKey : fallbackActiveKey
  const activeConfig = configs[currentActiveKey] || configs[fallbackActiveKey]
  const activeRows = useMemo(
    () => rowsByKey[currentActiveKey] || [],
    [currentActiveKey, rowsByKey]
  )
  const activeTotal = totalByKey[currentActiveKey] || 0
  const activeSelectedRow = selectedByKey[currentActiveKey] || null
  const activePagination =
    paginationByKey[currentActiveKey] || DEFAULT_OPERATIONAL_FACT_PAGINATION
  const activeDateField =
    dateFieldByKey[currentActiveKey] ||
    activeConfig.defaultDateField ||
    'occurred_at'
  const activeDateRange = dateRangeByKey[currentActiveKey] || ['', '']
  const canWriteActive = hasAnyPermission(
    adminProfile,
    activeConfig.writePermissions
  )

  const resetPaginationForKey = useCallback(
    (key = currentActiveKey) => {
      setPaginationByKey((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || DEFAULT_OPERATIONAL_FACT_PAGINATION),
          current: 1,
        },
      }))
    },
    [currentActiveKey]
  )

  const routeListParamsForKey = useCallback(
    (key) => {
      if (['shipments', 'reservations'].includes(key) && routeSalesOrderID) {
        return { source_id: routeSalesOrderID }
      }
      if (key === 'finance' && routeSourceType && routeSourceID) {
        return {
          source_type: routeSourceType,
          source_id: routeSourceID,
        }
      }
      return {}
    },
    [routeSalesOrderID, routeSourceID, routeSourceType]
  )

  const loadRows = useCallback(
    async (key = currentActiveKey) => {
      const config = configs[key]
      if (!config) {
        return
      }
      const requestVersion = listRequestVersionRef.current + 1
      listRequestVersionRef.current = requestVersion
      const shouldApplyRequest = () =>
        mountedRef.current && requestVersion === listRequestVersionRef.current
      setLoading(true)
      try {
        const pagination = paginationByKey[key] || activePagination
        const data = await config.list(
          compactParams({
            status: statusFilter,
            keyword: trimOptional(keyword),
            date_field: dateFieldByKey[key] || config.defaultDateField,
            date_from: dateRangeByKey[key]?.[0] || undefined,
            date_to: dateRangeByKey[key]?.[1] || undefined,
            ...(config.listParams || {}),
            ...routeListParamsForKey(key),
            ...getBusinessPaginationParams(pagination),
          })
        )
        const nextRows = Array.isArray(data?.[config.listKey])
          ? data[config.listKey]
          : []
        if (!shouldApplyRequest()) {
          return
        }
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
        if (shouldApplyRequest()) {
          message.error(getActionErrorMessage(error, `加载${config.title}`))
        }
      } finally {
        if (shouldApplyRequest()) {
          setLoading(false)
        }
      }
    },
    [
      activePagination,
      configs,
      currentActiveKey,
      dateFieldByKey,
      dateRangeByKey,
      keyword,
      paginationByKey,
      routeListParamsForKey,
      statusFilter,
    ]
  )

  useEffect(() => {
    loadRows(currentActiveKey)
  }, [currentActiveKey, loadRows])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(() =>
      loadRows(currentActiveKey)
    )
  }, [currentActiveKey, loadRows, outletContext])

  const runRowAction = async (config, row, actionKey, actionLabel) => {
    const action = config[actionKey]
    if (!action || !row?.id) {
      return
    }
    try {
      setSaving(true)
      await action({ id: row.id })
      message.success(`${actionLabel}已完成`)
      await loadRows(currentActiveKey)
    } catch (error) {
      message.error(getActionErrorMessage(error, actionLabel))
    } finally {
      setSaving(false)
    }
  }

  const clearActiveSelection = () => {
    setSelectedByKey((prev) => ({ ...prev, [currentActiveKey]: null }))
  }

  const openProcessingContractPrint = () => {
    try {
      const initialDraft =
        buildProcessingContractDraftFromOutsourcingFact(activeSelectedRow)
      openPrintWorkspaceWindow(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
      })
      message.success('已打开加工合同打印模板，可在窗口补齐工序和明细')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开加工合同打印模板'))
    }
  }

  const columns = applyBusinessColumnSorters(
    buildOperationalFactColumns(currentActiveKey)
  )
  const activeBoundaryText =
    activeConfig.selectionBoundaryText ||
    '当前操作由后端业务规则校验和过账；前端不会直接修改库存、出货、财务记录或协同任务。'
  const { tableColumns, visibleColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: `${toolbarModuleKey}-${currentActiveKey}`,
      moduleTitle: `${pageTitle} / ${activeConfig.title}`,
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: `${toolbarModuleKey}-${currentActiveKey}.csv`,
      columns: visibleColumns,
      rows: activeRows,
    })
  }, [activeRows, currentActiveKey, toolbarModuleKey, visibleColumns])
  const canConfirmActive = hasAnyPermission(
    adminProfile,
    activeConfig.confirmPermissions || activeConfig.writePermissions
  )
  const selectedLabel = selectedLabelForKey(currentActiveKey, activeSelectedRow)
  const activeAttachmentOwnerType =
    getOperationalFactAttachmentOwnerType(currentActiveKey)
  const relatedMenuItems = useMemo(
    () =>
      buildOperationalFactRelatedMenuItems({
        activeKey: currentActiveKey,
        activeSelectedRow,
      }),
    [currentActiveKey, activeSelectedRow]
  )

  const openRelatedTable = ({ key }) => {
    if (!activeSelectedRow) return
    const pathByKey = {
      'sales-order': routeWithQuery(V1_ROUTE_PATHS.salesOrders, {
        sales_order_id: activeSelectedRow.sales_order_id,
      }),
      inventory: routeWithQuery(V1_ROUTE_PATHS.inventory, {
        source_type:
          currentActiveKey === 'shipments'
            ? 'SHIPMENT'
            : activeSelectedRow.source_type || undefined,
        source_id:
          currentActiveKey === 'shipments'
            ? activeSelectedRow.id
            : activeSelectedRow.source_id || undefined,
        sales_order_id: activeSelectedRow.sales_order_id,
        view: 'txns',
      }),
      receivables: routeWithQuery(V1_ROUTE_PATHS.receivables, {
        source_type: 'SHIPMENT',
        source_id: activeSelectedRow.id,
      }),
      invoices: routeWithQuery(V1_ROUTE_PATHS.invoices, {
        source_type: 'SHIPMENT',
        source_id: activeSelectedRow.id,
      }),
    }
    if (key === 'source') {
      const targetPath = sourceRouteFor(activeSelectedRow.source_type)
      if (targetPath) {
        navigate(
          routeWithQuery(targetPath, {
            source_type: activeSelectedRow.source_type,
            source_id: activeSelectedRow.source_id,
          })
        )
      }
      return
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }
  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = new URLSearchParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : ['sales_order_id', 'source_type', 'source_id']
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetPaginationForKey()
    },
    [resetPaginationForKey, searchParams, setSearchParams]
  )
  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      activeDateRange[0] ||
      activeDateRange[1] ||
      routeSalesOrderID ||
      routeSourceType ||
      routeSourceID
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setDateFieldByKey((prev) => ({
      ...prev,
      [currentActiveKey]: activeConfig.defaultDateField || 'occurred_at',
    }))
    setDateRangeByKey((prev) => ({
      ...prev,
      [currentActiveKey]: ['', ''],
    }))
    clearRouteContext()
  }, [activeConfig.defaultDateField, clearRouteContext, currentActiveKey])
  const pageStats = buildOperationalFactStats({
    activeRows,
    activeTotal,
  })
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
            正式业务记录
          </Tag>,
          <Tag color="green" key="backend">
            后端过账 / 冲正
          </Tag>,
          <Tag color="gold" key="boundary">
            协同完成不等于过账
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
              placeholder="搜索单号"
              searchHint="可搜索：单号、来源、备注"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetPaginationForKey()
              }}
              onPressEnter={() => loadRows(currentActiveKey)}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetPaginationForKey()
              }}
            />
            <DateRangeFilter
              options={activeConfig.dateOptions || OCCURRED_DATE_FILTER_OPTIONS}
              value={activeDateField}
              onTypeChange={(nextField) => {
                setDateFieldByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]:
                    nextField || activeConfig.defaultDateField,
                }))
                resetPaginationForKey()
              }}
              startValue={activeDateRange[0] || ''}
              endValue={activeDateRange[1] || ''}
              onStartChange={(nextStart) => {
                setDateRangeByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]: [
                    nextStart,
                    prev[currentActiveKey]?.[1] || '',
                  ],
                }))
                resetPaginationForKey()
              }}
              onEndChange={(nextEnd) => {
                setDateRangeByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]: [
                    prev[currentActiveKey]?.[0] || '',
                    nextEnd,
                  ],
                }))
                resetPaginationForKey()
              }}
            />
            {routeSalesOrderID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['sales_order_id'])}
              >
                已按销售订单筛选
              </Tag>
            ) : null}
            {routeSourceType && routeSourceID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['source_type', 'source_id'])}
              >
                已按{sourceTypeLabel(routeSourceType)}筛选
              </Tag>
            ) : null}
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle={pageTitle}
            onExport={exportRows}
            exportDisabled={activeRows.length === 0}
            onOpenColumnOrder={openColumnOrder}
          />
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
              相关单据 <DownOutlined />
            </Button>
          </Dropdown>
          {['production', 'outsourcing', 'finance'].includes(
            currentActiveKey
          ) ? (
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
          {currentActiveKey === 'outsourcing' ? (
            <Button
              size="small"
              icon={<PrinterOutlined />}
              disabled={!activeSelectedRow}
              onClick={openProcessingContractPrint}
            >
              加工合同打印
            </Button>
          ) : null}
          {activeAttachmentOwnerType ? (
            <BusinessAttachmentModalButton
              ownerType={activeAttachmentOwnerType}
              ownerId={activeSelectedRow?.id}
              modalTitle={`${activeConfig.title}附件`}
              panelTitle={`${activeConfig.title}附件`}
              description="上传与当前记录相关的图片、票据、对账或确认资料；附件只作为证据，不改变业务事实状态。"
              canUpload={canWriteActive || canConfirmActive}
              canDelete={canWriteActive || canConfirmActive}
              disabled={!activeSelectedRow}
              disabledReason="请先选择一条记录"
            />
          ) : null}
          {currentActiveKey === 'shipments' ? (
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
          {currentActiveKey === 'reservations' ? (
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
          ) : null}
          {currentActiveKey === 'finance' ? (
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
          {['production', 'outsourcing', 'finance'].includes(
            currentActiveKey
          ) ? (
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
          {currentActiveKey === 'shipments' ? (
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
        tableHeader={
          showTabs && tabItems.length > 1 ? (
            <Tabs
              className="erp-business-view-tabs"
              activeKey={currentActiveKey}
              onChange={setActiveKey}
              items={tabItems}
            />
          ) : null
        }
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
              [currentActiveKey]: selectedRows[0] || null,
            })),
        }}
        rowClassName={(record) =>
          record.id === activeSelectedRow?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () =>
            setSelectedByKey((prev) => ({
              ...prev,
              [currentActiveKey]: record,
            })),
        })}
        emptyDescription="暂无业务事实记录"
        pagination={createBusinessTablePagination({
          pagination: activePagination,
          total: activeTotal,
          onChange: (current, pageSize) =>
            setPaginationByKey((prev) => ({
              ...prev,
              [currentActiveKey]: { current, pageSize },
            })),
        })}
        scroll={{ x: 1320 }}
      />

      {columnOrderModal}
    </BusinessPageLayout>
  )
}

export default function OperationalFactsPage() {
  return <OperationalFactWorkspace />
}
