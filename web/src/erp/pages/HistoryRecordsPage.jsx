import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Space, Tag, Typography } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'

import { message } from '@/common/utils/antdApp'
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
  SelectFilter,
} from '../components/business-list/BusinessListLayout.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import {
  buildHistoryListParams,
  getAvailableHistorySources,
  normalizeHistoryRecords,
} from '../utils/historyRecordCatalog.mjs'
import { buildHistorySourceSelectOptions } from '../utils/historySourceSelectOptions.mjs'

const { Text } = Typography

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
  const [sourceKey, setSourceKey] = useState(
    () => searchParams.get('source') || ''
  )
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [detailRecord, setDetailRecord] = useState(null)

  const activeSource = useMemo(
    () => availableSources.find((source) => source.key === sourceKey) || null,
    [availableSources, sourceKey]
  )
  const sourceOptions = useMemo(
    () => buildHistorySourceSelectOptions(availableSources),
    [availableSources]
  )

  useEffect(() => {
    if (activeSource || availableSources.length === 0) return
    const nextSource = availableSources[0]
    setSourceKey(nextSource.key)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('source', nextSource.key)
    setSearchParams(nextParams, { replace: true })
  }, [activeSource, availableSources, searchParams, setSearchParams])

  const loadRecords = useCallback(async () => {
    if (!activeSource) {
      setRecords([])
      setTotal(0)
      setLoading(false)
      return true
    }
    const loader = HISTORY_SOURCE_LOADERS[activeSource.key]
    if (typeof loader !== 'function') {
      setRecords([])
      setTotal(0)
      return false
    }
    const request = beginLatestRequest('history-records')
    setLoading(true)
    try {
      const data = await loader(
        {
          ...buildHistoryListParams(activeSource, { keyword, status }),
          limit: pagination.pageSize,
          offset: (pagination.current - 1) * pagination.pageSize,
        },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return false
      const sourceRows = Array.isArray(data?.[activeSource.responseKey])
        ? data[activeSource.responseKey]
        : []
      setRecords(normalizeHistoryRecords(activeSource, sourceRows))
      setTotal(Number(data?.total || sourceRows.length || 0))
      setDetailRecord(null)
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return false
      setRecords([])
      setTotal(0)
      message.error(getActionErrorMessage(error, `加载${activeSource.label}`))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [activeSource, beginLatestRequest, keyword, pagination, status])

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
      { title: '编号 / 名称', dataIndex: 'primary', width: 180 },
      { title: '名称 / 往来方', dataIndex: 'secondary', width: 180 },
      {
        title: '历史状态',
        dataIndex: 'status',
        width: 120,
        render: (value) => <Tag color="default">{value}</Tag>,
      },
      { title: '摘要', dataIndex: 'summary', width: 260 },
      {
        title: '最后更新',
        dataIndex: 'updatedAt',
        width: 180,
        render: formatHistoryTime,
      },
      {
        title: '操作',
        key: 'actions',
        detailHidden: true,
        width: 160,
        fixed: 'right',
        render: (_, record) => (
          <Space size={4}>
            <Button type="link" onClick={() => setDetailRecord(record)}>
              查看详情
            </Button>
            <Button type="link" onClick={() => navigate(record.link)}>
              前往模块
            </Button>
          </Space>
        ),
      },
    ],
    [navigate]
  )

  const hasActiveFilters = Boolean(keyword.trim() || status)

  return (
    <BusinessPageLayout className="erp-history-records-page">
      <PageHeaderCard
        compact
        title="历史记录中心"
        description="只读汇总你有权查看的已关闭、已取消、已归档和已停用记录；原业务台账、审计记录和事实数据仍保留在所属模块。"
        tags={
          <>
            <Tag color="blue">只读查询</Tag>
            <Tag>不改变业务状态</Tag>
          </>
        }
        stats={[
          { key: 'sources', label: '可查类型', value: availableSources.length },
          { key: 'total', label: '当前类型记录', value: total },
        ]}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={() => {
          setKeyword('')
          setStatus('')
          setPagination((current) => ({ ...current, current: 1 }))
        }}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SelectFilter
              aria-label="历史记录类型"
              value={activeSource?.key}
              options={sourceOptions}
              placeholder="选择记录类型"
              onChange={(nextSourceKey) => {
                setSourceKey(nextSourceKey)
                setKeyword('')
                setStatus('')
                setPagination((current) => ({ ...current, current: 1 }))
                const nextParams = new URLSearchParams(searchParams)
                nextParams.set('source', nextSourceKey)
                setSearchParams(nextParams, { replace: true })
              }}
            />
            <SearchInput
              value={keyword}
              placeholder="搜索历史记录"
              searchHint="按当前记录类型支持的编号、名称或业务摘要搜索"
              onChange={(event) => {
                setKeyword(event.target.value)
                setPagination((current) => ({ ...current, current: 1 }))
              }}
              onPressEnter={loadRecords}
            />
            {activeSource?.historyStatusOptions?.length > 1 ? (
              <SelectFilter
                aria-label="历史状态"
                value={status}
                options={activeSource.historyStatusOptions}
                onChange={(nextStatus) => {
                  setStatus(nextStatus || '')
                  setPagination((current) => ({ ...current, current: 1 }))
                }}
              />
            ) : null}
          </>
        }
      >
        <Text type="secondary">
          历史中心只负责查找与跳转；重新启用、重开等后续办理，仍由所属模块按对象规则处理。
        </Text>
      </BusinessOperationPanel>

      <BusinessDataTable
        loading={loading}
        rowKey="key"
        columns={columns}
        dataSource={records}
        scroll={{ x: 1120 }}
        onOpenRecord={setDetailRecord}
        emptyDescription={
          availableSources.length === 0
            ? '当前账号没有可查询的历史记录类型'
            : '当前筛选没有匹配的历史记录'
        }
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        }}
      />

      <BusinessRecordDetailsModal
        open={Boolean(detailRecord)}
        record={detailRecord}
        columns={columns}
        title={`${detailRecord?.sourceLabel || '历史记录'}详情`}
        description="这里只展示便于识别和追溯的业务字段，不提供跨对象归档、恢复或删除操作。"
        onClose={() => setDetailRecord(null)}
      >
        {detailRecord?.link ? (
          <Button type="primary" onClick={() => navigate(detailRecord.link)}>
            前往所属模块查看完整记录
          </Button>
        ) : null}
      </BusinessRecordDetailsModal>
    </BusinessPageLayout>
  )
}
