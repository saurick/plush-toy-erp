import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Tag } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  listCustomers,
  listMaterials,
  listOutsourcingOrders,
  listProductSKUs,
  listProducts,
  listProcesses,
  listPurchaseOrders,
  listSalesOrders,
  listSuppliers,
} from '../api/masterDataOrderApi.mjs'
import { listBOMVersions } from '../api/bomApi.mjs'
import { listProductionOrders } from '../api/productionOrderApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectionActionBar,
  SelectionClearAction,
  BusinessActionTooltip,
  SelectFilter,
} from '../components/business-list/BusinessListLayout.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import {
  buildHistoryListParams,
  getAvailableHistorySources,
  normalizeHistoryRecords,
} from '../utils/historyRecordCatalog.mjs'
import { buildHistorySourceSelectOptions } from '../utils/historySourceSelectOptions.mjs'

import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'
import { currentBusinessDate } from '../utils/businessDate.mjs'

const HISTORY_SOURCE_LOADERS = Object.freeze({
  customers: listCustomers,
  suppliers: listSuppliers,
  materials: listMaterials,
  products: listProducts,
  product_skus: listProductSKUs,
  processes: listProcesses,
  sales_orders: listSalesOrders,
  purchase_orders: listPurchaseOrders,
  outsourcing_orders: listOutsourcingOrders,
  production_orders: listProductionOrders,
  bom_versions: listBOMVersions,
})

function formatHistoryTime(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  return new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false })
}

export default function HistoryRecordsPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const beginLatestRequest = useLatestRequestCoordinator()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const visibleMenuPaths = useMemo(
    () => outletContext?.visibleMenuPaths || [],
    [outletContext?.visibleMenuPaths]
  )
  const availableSources = useMemo(
    () =>
      getAvailableHistorySources({
        visibleMenuPaths,
        canReadPermission: (permission) =>
          hasActionPermission(adminProfile, permission),
      }),
    [adminProfile, visibleMenuPaths]
  )
  const sourceKey = searchParams.get('source') || ''
  const keyword = searchParams.get('keyword') || ''
  const status = searchParams.get('status') || ''
  const pageValue = Number(searchParams.get('page'))
  const sizeValue = Number(searchParams.get('size'))
  const currentPage =
    Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1
  const pageSize = [10, 20, 50, 100].includes(sizeValue) ? sizeValue : 20
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedKey, setSelectedKey] = useState(null)
  const [detailRecord, setDetailRecord] = useState(null)
  const selectedRecord =
    records.find((record) => record.key === selectedKey) || null
  const activeSource = useMemo(
    () =>
      availableSources.find((source) => source.key === sourceKey) ||
      availableSources[0] ||
      null,
    [availableSources, sourceKey]
  )
  const updateQuery = useCallback(
    (values) => {
      setSelectedKey(null)
      setDetailRecord(null)
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          Object.entries(values).forEach(([key, value]) => {
            if (value === '' || value === null) next.delete(key)
            else next.set(key, String(value))
          })
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )
  const sourceOptions = useMemo(
    () => buildHistorySourceSelectOptions(availableSources),
    [availableSources]
  )

  useEffect(() => {
    if (activeSource && activeSource.key !== sourceKey) {
      updateQuery({ source: activeSource.key, status: '', page: '' })
    }
  }, [activeSource, sourceKey, updateQuery])

  const listParams = useMemo(
    () => buildHistoryListParams(activeSource, { keyword, status }),
    [activeSource, keyword, status]
  )
  const loadRecords = useCallback(async () => {
    const request = beginLatestRequest('history-records')
    setLoading(true)
    setLoadError('')
    setRecords([])
    setTotal(0)
    setSelectedKey(null)
    setDetailRecord(null)
    try {
      if (!activeSource || activeSource.key !== sourceKey) return false
      const loader = HISTORY_SOURCE_LOADERS[activeSource.key]
      const data = await loader(
        {
          ...listParams,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return false
      const sourceRows = Array.isArray(data?.[activeSource.responseKey])
        ? data[activeSource.responseKey]
        : []
      setRecords(normalizeHistoryRecords(activeSource, sourceRows))
      setTotal(Number(data?.total ?? sourceRows.length))
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return false
      setLoadError(getActionErrorMessage(error, `加载${activeSource.label}`))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    activeSource,
    beginLatestRequest,
    currentPage,
    listParams,
    pageSize,
    sourceKey,
  ])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  useEffect(
    () => outletContext?.registerPageRefresh?.(loadRecords),
    [loadRecords, outletContext]
  )

  const columns = useMemo(
    () => [
      {
        title: '记录类型',
        dataIndex: 'sourceLabel',
        width: 120,
        render: (value) => <Tag>{value}</Tag>,
      },
      {
        align: 'left',
        title: '编号 / 名称',
        dataIndex: 'primary',
        copyable: { label: '编号或名称' },
        width: 180,
      },
      {
        align: 'left',
        title: '名称 / 往来方',
        dataIndex: 'secondary',
        copyable: { label: '名称或往来方' },
        width: 180,
      },
      {
        title: '历史状态',
        dataIndex: 'status',
        width: 120,
        render: (value) => <Tag color="default">{value}</Tag>,
      },
      { align: 'left', title: '摘要', dataIndex: 'summary', width: 260 },
      {
        title: '最后更新',
        dataIndex: 'updatedAt',
        width: 180,
        render: formatHistoryTime,
        exportValue: (record) => formatHistoryTime(record.updatedAt),
      },
    ],
    []
  )
  const { tableColumns, exportColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: 'history-records',
      moduleTitle: '历史记录中心',
      columns,
    })
  const loadExportRows = useCallback(
    async ({ signal }) => {
      if (!activeSource) return []
      const result = await listAllPaginatedRecords(
        HISTORY_SOURCE_LOADERS[activeSource.key],
        listParams,
        activeSource.responseKey,
        { signal }
      )
      return normalizeHistoryRecords(
        activeSource,
        result[activeSource.responseKey]
      )
    },
    [activeSource, listParams]
  )
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: 'history-records-export',
    loadRows: loadExportRows,
    filename: `${activeSource?.label || '历史记录'}-历史记录-${currentBusinessDate()}.csv`,
    columns: exportColumns,
    recordLabel: '历史记录',
  })
  const openDetail = (record) => {
    setSelectedKey(record.key)
    setDetailRecord(record)
  }

  const hasActiveFilters = Boolean(keyword.trim() || status)

  return (
    <BusinessPageLayout className="erp-history-records-page">
      <PageHeaderCard
        compact
        title="历史记录中心"
        viewSwitch={
          <SelectFilter
            aria-label="历史记录类型"
            value={activeSource?.key}
            options={sourceOptions}
            placeholder="选择记录类型"
            disabled={!availableSources.length}
            onChange={(nextSourceKey) =>
              updateQuery({
                source: nextSourceKey,
                keyword: '',
                status: '',
                page: '',
              })
            }
          />
        }
        stats={[{ key: 'total', label: '当前类型记录', value: total }]}
      />
      <BusinessOperationPanel
        compact
        onClearFilters={() =>
          updateQuery({ keyword: '', status: '', page: '' })
        }
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索历史记录"
              searchHint="按当前记录类型支持的编号、名称或业务摘要搜索"
              onChange={(event) =>
                updateQuery({ keyword: event.target.value, page: '' })
              }
              onPressEnter={loadRecords}
            />
            {activeSource?.historyStatusOptions?.length > 1 ? (
              <SelectFilter
                inline
                aria-label="历史状态"
                value={status}
                options={activeSource.historyStatusOptions}
                onChange={(nextStatus) =>
                  updateQuery({ status: nextStatus || '', page: '' })
                }
              />
            ) : null}
          </>
        }
        actions={
          <BusinessListToolbarActions
            onExport={exportRows}
            exportDisabled={loading || exporting || !total}
            onOpenColumnOrder={openColumnOrder}
          />
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRecord ? 1 : 0}
          selectedLabel={selectedRecord?.primary}
        >
          <SelectionClearAction onClick={() => setSelectedKey(null)} />
          <BusinessActionTooltip
            disabled={!selectedRecord || loading}
            disabledReason="请先选择一条历史记录"
          >
            <Button
              size="small"
              disabled={!selectedRecord || loading}
              data-business-action-key="history-view-detail"
              onClick={() => openDetail(selectedRecord)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          <BusinessActionTooltip
            disabled={!selectedRecord || loading}
            disabledReason="请先选择一条历史记录"
          >
            <Button
              size="small"
              disabled={!selectedRecord || loading}
              data-business-action-key="history-source-module"
              onClick={() => navigate(selectedRecord.link)}
            >
              前往所属模块
            </Button>
          </BusinessActionTooltip>
        </SelectionActionBar>
      </BusinessOperationPanel>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="历史记录加载失败"
          description={loadError}
          action={
            <Button size="small" onClick={loadRecords} disabled={loading}>
              重新加载
            </Button>
          }
        />
      ) : null}
      <BusinessDataTable
        loading={loading}
        rowKey="key"
        columns={tableColumns}
        dataSource={records}
        onOpenRecord={openDetail}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRecord ? [selectedRecord.key] : [],
          onChange: (_keys, rows) => setSelectedKey(rows[0]?.key || null),
        }}
        onRow={(record) => ({ onClick: () => setSelectedKey(record.key) })}
        emptyDescription={
          !availableSources.length
            ? '当前账号没有可查询的历史记录类型'
            : loadError
              ? '历史记录读取失败，请重新加载'
              : '当前筛选没有匹配的历史记录'
        }
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (current, size) => updateQuery({ page: current, size }),
        }}
      />
      {columnOrderModal}
      <BusinessDetailsModal
        open={Boolean(detailRecord)}
        record={detailRecord}
        columns={columns}
        title={`${detailRecord?.sourceLabel || '历史记录'}详情`}
        onClose={() => setDetailRecord(null)}
        extraActions={
          detailRecord?.link ? (
            <Button type="primary" onClick={() => navigate(detailRecord.link)}>
              前往所属模块查看完整记录
            </Button>
          ) : null
        }
      />
    </BusinessPageLayout>
  )
}
