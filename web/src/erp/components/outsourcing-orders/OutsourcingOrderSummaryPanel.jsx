import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Alert, Button, Space, Tag } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  listOutsourcingOrderSummary,
  listAllOutsourcingOrderSummary,
} from '../../api/masterDataOrderApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  DateRangeFilter,
  SearchInput,
  SelectFilter,
} from '../business-list/BusinessListLayout.jsx'
import useBusinessListExport from '../../hooks/useBusinessListExport.js'
import {
  hasActionPermission,
  OUTSOURCING_ORDER_STATUS_LABELS,
} from '../../utils/masterDataOrderView.mjs'
import {
  currentBusinessDate,
  unixSecondsToBusinessDate,
} from '../../utils/businessDate.mjs'
import {
  readOutsourcingSummaryFilters,
  updateOutsourcingSummarySearch,
  outsourcingSummarySubjectCode,
  outsourcingSummarySubjectName,
  outsourcingSummaryStatus,
} from '../../utils/outsourcingOrderSummary.mjs'

const valueOrDash = (value) =>
  value === undefined || value === null || value === '' ? '—' : value
const dateLabel = (value) => unixSecondsToBusinessDate(value) || '—'

export default forwardRef((
  { adminProfile, supplierOptions, processOptions, onOpenContract },
  ref
) => {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readOutsourcingSummaryFilters(params), [params])
  const requestKey = JSON.stringify(filters)
  const [draftKeyword, setDraftKeyword] = useState(filters.keyword)
  const [result, setResult] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestRef = useRef(null)
  const update = (values) =>
    setParams(updateOutsourcingSummarySearch(params, values), { replace: true })
  useEffect(() => setDraftKeyword(filters.keyword), [filters.keyword])

  const loadRows = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    setResult({ items: [], total: 0 })
    try {
      const data = await listOutsourcingOrderSummary(JSON.parse(requestKey), {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return false
      setResult(data)
      return true
    } catch (cause) {
      if (!controller.signal.aborted)
        { setError(getActionErrorMessage(cause, '读取加工明细')) }
      return false
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [requestKey])
  useEffect(() => {
    loadRows()
    return () => requestRef.current?.abort()
  }, [loadRows])
  useImperativeHandle(ref, () => ({ refresh: loadRows }), [loadRows])

  const columns = [
    {
      title: '加工合同号',
      dataIndex: 'outsourcing_order_no',
      width: 175,
      render: (value, row) => (
        <Button type="link" onClick={() => onOpenContract(row)}>
          {value}
        </Button>
      ),
    },
    {
      title: '产品订单编号',
      dataIndex: 'product_order_no_snapshot',
      width: 165,
      render: valueOrDash,
    },
    {
      title: '产品 / 材料编号',
      key: 'subject_code',
      width: 155,
      render: (_, row) => valueOrDash(outsourcingSummarySubjectCode(row)),
      exportValue: outsourcingSummarySubjectCode,
    },
    {
      align: 'left',
      title: '产品 / 材料名称',
      key: 'subject_name',
      width: 210,
      render: (_, row) => valueOrDash(outsourcingSummarySubjectName(row)),
      exportValue: outsourcingSummarySubjectName,
    },
    {
      align: 'left',
      title: '加工项目',
      dataIndex: 'processing_item',
      width: 190,
      render: valueOrDash,
    },
    {
      align: 'left',
      title: '厂家名称',
      dataIndex: 'supplier_name',
      width: 170,
      render: valueOrDash,
    },
    {
      title: '工序',
      dataIndex: 'process_name_snapshot',
      width: 115,
      render: valueOrDash,
    },
    {
      title: '单位',
      dataIndex: 'unit_name_snapshot',
      width: 80,
      render: valueOrDash,
    },
    ...(hasActionPermission(adminProfile, 'field.procurement_commercial.read')
      ? [
          {
            title: '单价',
            dataIndex: 'unit_price',
            width: 100,
            align: 'right',
            render: valueOrDash,
          },
        ]
      : []),
    {
      title: '加工数量',
      dataIndex: 'outsourcing_quantity',
      width: 120,
      align: 'right',
      render: valueOrDash,
    },
    ...(hasActionPermission(adminProfile, 'field.procurement_commercial.read')
      ? [
          {
            title: '加工金额',
            dataIndex: 'amount',
            width: 120,
            align: 'right',
            render: valueOrDash,
          },
        ]
      : []),
    ...(hasActionPermission(adminProfile, 'field.finance_settlement.read')
      ? [{ title: '币种', dataIndex: 'currency', width: 80 }]
      : []),
    {
      align: 'left',
      title: '行备注',
      dataIndex: 'note',
      width: 200,
      render: valueOrDash,
    },
    {
      title: '委托人',
      dataIndex: 'buyer_contact',
      width: 120,
      render: valueOrDash,
    },
    ...(hasActionPermission(adminProfile, 'field.party_private.read')
      ? [
          {
            title: '委托方电话',
            dataIndex: 'buyer_phone',
            width: 150,
            render: valueOrDash,
          },
        ]
      : []),
    {
      title: '预计回货日期',
      dataIndex: 'expected_return_date',
      width: 140,
      render: dateLabel,
      exportValue: (row) => dateLabel(row.expected_return_date),
    },
    {
      title: '下单日期',
      dataIndex: 'order_date',
      width: 120,
      render: dateLabel,
      exportValue: (row) => dateLabel(row.order_date),
    },
    {
      title: '加工品类',
      dataIndex: 'subject_type',
      width: 120,
      render: (value) => (value === 'MATERIAL' ? '材料' : '产品 / 半成品'),
      exportValue: (row) =>
        row.subject_type === 'MATERIAL' ? '材料' : '产品 / 半成品',
    },
    {
      title: '产品规格',
      dataIndex: 'sku_code_snapshot',
      width: 160,
      render: valueOrDash,
    },
    {
      title: '合同状态',
      key: 'status',
      width: 160,
      render: (_, row) => <Tag>{outsourcingSummaryStatus(row)}</Tag>,
      exportValue: outsourcingSummaryStatus,
    },
  ]
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: `outsourcing-summary:${requestKey}`,
    loadRows: async (options) =>
      (await listAllOutsourcingOrderSummary(filters, options)).items,
    filename: () => `委外加工明细-${currentBusinessDate()}.csv`,
    columns,
    recordLabel: '加工明细',
  })
  return (
    <section aria-label="委外加工明细汇总">
      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              aria-label="搜索加工明细"
              placeholder="合同、产品订单、产品或加工项目"
              allowClear
              maxLength={100}
              value={draftKeyword}
              onChange={(event) => {
                setDraftKeyword(event.target.value)
                if (!event.target.value) update({ q: '' })
              }}
              onPressEnter={() => update({ q: draftKeyword.trim() })}
            />
            <SelectFilter
              aria-label="明细加工厂"
              showSearch
              optionFilterProp="label"
              value={filters.supplier_id || ''}
              options={[{ value: '', label: '全部加工厂' }, ...supplierOptions]}
              onChange={(supplier) => update({ supplier })}
            />
            <SelectFilter
              aria-label="明细工序"
              showSearch
              optionFilterProp="label"
              value={filters.process_id || ''}
              options={[{ value: '', label: '全部工序' }, ...processOptions]}
              onChange={(process) => update({ process })}
            />
            <SelectFilter
              aria-label="明细合同状态"
              value={filters.lifecycle_status}
              options={[
                { value: '', label: '全部合同状态' },
                ...Object.entries(OUTSOURCING_ORDER_STATUS_LABELS).map(
                  ([value, label]) => ({ value, label })
                ),
              ]}
              onChange={(status) => update({ status })}
            />
            <DateRangeFilter
              value={filters.date_field}
              options={[
                { value: 'order_date', label: '下单日期' },
                { value: 'expected_return_date', label: '预计回货日期' },
              ]}
              onTypeChange={(date) => update({ date })}
              startValue={filters.date_from?.slice(0, 10) || ''}
              endValue={filters.date_to?.slice(0, 10) || ''}
              onStartChange={(from) => update({ from })}
              onEndChange={(to) => update({ to })}
            />
          </>
        }
        onClearFilters={() =>
          update({
            q: '',
            supplier: '',
            process: '',
            status: '',
            date: '',
            from: '',
            to: '',
          })
        }
        actions={
          <Space wrap>
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={loading}
              onClick={loadRows}
            >
              刷新明细
            </Button>
            <Button
              icon={<DownloadOutlined aria-hidden="true" />}
              loading={exporting}
              disabled={loading || Boolean(error) || result.total === 0}
              onClick={exportRows}
            >
              导出加工明细
            </Button>
          </Space>
        }
      />
      <p className="erp-outsourcing-summary__note">
        每行是一项加工内容，可跨合同、跨厂家查找。回货日期优先采用本行日期，未单独填写时沿用合同日期。
      </p>
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button onClick={loadRows}>重新加载</Button>}
        />
      ) : (
        <BusinessDataTable
          rowKey="id"
          columns={columns}
          dataSource={result.items}
          loading={loading}
          emptyDescription="暂无符合条件的加工明细"
          scroll={{ x: columns.reduce((total, col) => total + col.width, 0) }}
          pagination={{
            current: filters.offset / filters.limit + 1,
            pageSize: filters.limit,
            total: result.total,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条加工明细`,
            onChange: (page) => update({ page }),
          }}
        />
      )}
    </section>
  )
})
