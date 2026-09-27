import React, { useEffect, useState } from 'react'
import { Alert, Button, Tag } from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { BUSINESS_SEARCH_SCOPES } from '../../utils/businessSearchScopes.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import useLiveSearch from '@/common/hooks/useLiveSearch'
import { listEngineeringMaterialRequests } from '../../api/masterDataOrderApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  SearchInput,
  SelectFilter,
} from '../business-list/BusinessListLayout.jsx'
import EngineeringMaterialRequestModal from '../sales-orders/EngineeringMaterialRequestModal.jsx'
import {
  canListEngineeringMaterial,
  ENGINEERING_MATERIAL_STATUS,
  getEngineeringMaterialPermissions,
} from '../../utils/engineeringMaterialTask.mjs'
import {
  summaryPage,
  updateSummarySearch,
} from '../../utils/workbenchSummary.mjs'

const STATUS_OPTIONS = [
  { value: '', label: '全部审批状态' },
  ...Object.entries(ENGINEERING_MATERIAL_STATUS)
    .filter(([key]) => key !== 'PREVIEW')
    .map(([value, label]) => ({ value, label })),
]
const formatTime = (value) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false })

export default function EngineeringMaterialSummaryPanel({
  refreshRevision = 0,
}) {
  const { adminProfile } = useOutletContext() || {}
  const [params, setParams] = useSearchParams()
  const keyword = (params.get('materials.q') || '').slice(0, 100)
  const status = STATUS_OPTIONS.some(
    ({ value }) => value === params.get('materials.status')
  )
    ? params.get('materials.status')
    : ''
  const page = summaryPage(params.get('materials.page'))
  const [result, setResult] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState(null)
  const canRead = canListEngineeringMaterial(adminProfile)

  useEffect(() => {
    const controller = new AbortController()
    setResult({ items: [], total: 0 })
    setError('')
    setLoading(canRead)
    if (canRead) {
      listEngineeringMaterialRequests(
        { keyword, status, page, limit: 20 },
        { signal: controller.signal }
      )
        .then((value) => {
          if (!controller.signal.aborted) setResult(value)
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setError(getActionErrorMessage(cause, '读取材料汇总清单'))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }
    return () => controller.abort()
  }, [canRead, keyword, status, page, reload, refreshRevision, adminProfile])

  const updateFilter = (key, value) => {
    setParams(updateSummarySearch(params, 'materials', { [key]: value }), {
      replace: true,
    })
  }
  const search = useLiveSearch({
    value: keyword,
    onSearch: (value) => updateFilter('q', value),
  })

  const statusTag = (record) => (
    <span>
      <Tag
        color={
          record.status === 'APPROVED'
            ? 'green'
            : record.status === 'REJECTED'
              ? 'red'
              : 'blue'
        }
      >
        {ENGINEERING_MATERIAL_STATUS[record.status] || '状态待确认'}
      </Tag>
      {record.order_status !== 'active' ? <Tag>订单已结束</Tag> : null}
    </span>
  )
  const filters = (
    <>
      <SearchInput
        type="search"
        aria-label={BUSINESS_SEARCH_SCOPES.engineering.searchHint}
        {...BUSINESS_SEARCH_SCOPES.engineering}
        value={search.value}
        allowClear
        maxLength={100}
        onChange={search.onChange}
        onCompositionStart={search.onCompositionStart}
        onCompositionEnd={search.onCompositionEnd}
        onPressEnter={search.onPressEnter}
      />
      <SelectFilter
        aria-label="审批状态"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(value) => updateFilter('status', value)}
      />
    </>
  )
  const accessError = !canRead ? '当前账号未开放材料汇总查看权限' : error
  const modal =
    canRead && selected ? (
      <EngineeringMaterialRequestModal
        key={selected.id}
        orderID={selected.sales_order_id}
        requestID={selected.id}
        readOnly
        permissions={getEngineeringMaterialPermissions(adminProfile)}
        onCancel={() => setSelected(null)}
      />
    ) : null

  return (
    <>
      <BusinessOperationPanel compact filters={filters} />
      {accessError ? (
        <Alert
          type="error"
          showIcon
          message={accessError}
          action={
            canRead ? (
              <Button onClick={() => setReload((value) => value + 1)}>
                重新加载
              </Button>
            ) : null
          }
        />
      ) : (
        <BusinessDataTable
          loading={loading}
          rowKey="id"
          dataSource={result.items}
          onOpenRecord={setSelected}
          columns={[
            {
              title: '订单号',
              dataIndex: 'order_no',
              width: 220,
              render: (value, record) => (
                <Button type="link" onClick={() => setSelected(record)}>
                  {value}
                </Button>
              ),
            },
            {
              align: 'left',
              title: '产品',
              dataIndex: 'products',
              width: 240,
              render: (value) => value.join('、') || '未填写产品名称',
            },
            {
              title: '审批状态',
              width: 190,
              render: (_, record) => statusTag(record),
            },
            {
              title: '提交时间',
              dataIndex: 'submitted_at',
              width: 180,
              render: formatTime,
            },
            {
              align: 'center',
              title: '操作',
              width: 150,
              render: (_, record) => (
                <Button onClick={() => setSelected(record)}>
                  查看材料汇总
                </Button>
              ),
            },
          ]}
          emptyDescription="暂无符合条件的材料汇总"
          pagination={{
            current: page,
            pageSize: 20,
            total: result.total,
            showSizeChanger: false,
            onChange: (value) => updateFilter('page', value),
          }}
        />
      )}
      {modal}
    </>
  )
}
