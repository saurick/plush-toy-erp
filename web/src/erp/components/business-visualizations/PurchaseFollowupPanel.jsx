import React, { useCallback } from 'react'
import {
  DownloadOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Button } from 'antd'
import dayjs from 'dayjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import { moveBusinessDate } from '../../utils/businessVisualizationModels.mjs'
import {
  PURCHASE_FOLLOWUP_LABELS,
  PURCHASE_FOLLOWUP_NEXT_ACTIONS,
  purchaseFollowupPageChange,
} from '../../utils/purchaseFollowup.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  SearchInput,
  SelectFilter,
} from '../business-list/BusinessListLayout.jsx'
import { DateInput } from '../business-list/BusinessDateInputs.jsx'
import useBusinessListExport from '../../hooks/useBusinessListExport.js'
import { listAllPurchaseFollowups } from '../../api/masterDataOrderApi.mjs'
import {
  BusinessVisualizationFrame,
  VisualizationState,
} from './BusinessVisualizationFrame.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import RemoteReferenceSelect from '../RemoteReferenceSelect.jsx'

const dateSourceLabel = {
  line: '明细交期',
  confirmed: '供应商已确认',
  expected: '整单预计',
}
const columns = [
  { title: '来源单号', dataIndex: 'source_no', width: 190, copyable: true },
  { title: '供应商', dataIndex: 'supplier_name', width: 170, copyable: true },
  {
    title: '材料',
    key: 'material',
    width: 210,
    render: (_, row) =>
      [row.material_code, row.material_name].filter(Boolean).join(' · ') ||
      '整张收货单',
    exportValue: (row) =>
      [row.material_code, row.material_name].filter(Boolean).join(' · '),
  },
  {
    title: '待办数量',
    key: 'quantity',
    width: 120,
    render: (_, row) =>
      row.quantity ? `${row.quantity} ${row.unit_name}` : '—',
    exportValue: (row) =>
      row.quantity ? `${row.quantity} ${row.unit_name}` : '',
  },
  {
    title: '交期',
    dataIndex: 'due_date',
    width: 140,
    render: (date, row) => (
      <span className="erp-arrival-calendar__date">
        <span>{date || '—'}</span>
        {date && <small>{dateSourceLabel[row.date_source]}</small>}
      </span>
    ),
  },
  {
    title: '需跟进事项',
    dataIndex: 'kind',
    width: 130,
    render: (kind) => PURCHASE_FOLLOWUP_LABELS[kind],
    exportValue: (row) => PURCHASE_FOLLOWUP_LABELS[row.kind],
  },
  {
    title: '岗位与下一步',
    dataIndex: 'kind',
    key: 'next',
    width: 260,
    render: (kind) => PURCHASE_FOLLOWUP_NEXT_ACTIONS[kind],
    exportValue: (row) => PURCHASE_FOLLOWUP_NEXT_ACTIONS[row.kind],
  },
]

export default function PurchaseFollowupPanel({
  board,
  loading,
  error,
  onRetry,
  onOpen,
  viewState = {},
  onViewStateChange,
  keyword = '',
  onKeywordChange,
  supplierFilter = '',
  supplierOptions = [],
  onSupplierChange,
  queryParams,
}) {
  const calendarOpen = Boolean(viewState.calendarOpen)
  const today = board?.as_of_date || currentBusinessDate()
  const startDate = viewState.startDate || today
  const endDate = moveBusinessDate(startDate, 13)
  const filter = viewState.filter || 'all'
  const confirmation = viewState.confirmation || 'all'
  const change = (patch) =>
    onViewStateChange?.(purchaseFollowupPageChange(viewState, patch))
  const counts = board?.counts || {}
  const rows = board?.rows || []
  const loadExportRows = useCallback(
    async ({ signal }) => {
      const result = await listAllPurchaseFollowups(queryParams, { signal })
      return result.rows
    },
    [queryParams]
  )
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: 'purchase-followups-export',
    loadRows: loadExportRows,
    filename: `采购跟进_${today}.csv`,
    columns,
    recordLabel: '采购跟进事项',
  })
  const kinds = [
    'overdue',
    'due_soon',
    'unscheduled',
    ...(board?.access?.quality ? ['rejected'] : []),
    ...(board?.access?.commercial ? ['missing_price'] : []),
    'scheduled',
    ...(board?.access?.quality ? ['pending_inspection', 'ready_inbound'] : []),
    ...(board?.access?.finance ? ['unsettled'] : []),
  ]
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const actionColumns = [
    ...columns,
    {
      title: '办理入口',
      key: 'action',
      fixed: 'right',
      width: 125,
      render: (_, row) => (
        <Button type="link" onClick={() => onOpen?.(row)}>
          {row.source_type === 'purchase_order' ? '打开采购单' : '打开收货单'}
        </Button>
      ),
    },
  ]
  return (
    <>
      <BusinessOperationPanel
        inWorkspace
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜单号、供应商、材料"
              searchHint="可搜索：单号、供应商、材料"
              aria-label="搜索单号、供应商或材料"
              onSearch={(value) => {
                change({})
                onKeywordChange?.(value)
              }}
            />
            <RemoteReferenceSelect
              referenceType="suppliers"
              component={SelectFilter}
              aria-label="跟进供应商"
              value={supplierFilter}
              options={[{ label: '全部供应商', value: '' }, ...supplierOptions]}
              placeholder="供应商"
              showSearch
              onChange={(value) => {
                change({})
                onSupplierChange?.(value || '')
              }}
            />
          </>
        }
      />
      <BusinessVisualizationFrame
        title="采购跟进"
        className="erp-arrival-calendar"
        loading={loading}
        error={error}
        metricsLabel="跟进事项"
        toolbar={
          <Button
            aria-expanded={calendarOpen}
            aria-controls="purchase-followup-calendar"
            onClick={() => change({ calendarOpen: !calendarOpen })}
          >
            {calendarOpen ? '收起日历' : '到货日历'}
          </Button>
        }
        countUnit="项"
        metrics={[
          { key: 'all', label: '全部', value: total },
          ...kinds.map((key) => ({
            key,
            label: PURCHASE_FOLLOWUP_LABELS[key],
            value: counts[key] || 0,
            tone:
              key === 'overdue' || key === 'rejected' ? 'danger' : 'neutral',
          })),
        ].map((metric) => ({
          ...metric,
          selected: filter === metric.key,
          onClick: () => change({ filter: metric.key, selectedDate: '' }),
        }))}
      >
        {calendarOpen && (
          <div
            id="purchase-followup-calendar"
            className="erp-arrival-calendar__toolbar"
          >
            <div className="erp-arrival-calendar__period">
              <Button
                aria-label="前 14 天"
                icon={<LeftOutlined />}
                onClick={() =>
                  change({
                    startDate: moveBusinessDate(startDate, -14),
                    filter: 'period',
                    selectedDate: '',
                  })
                }
              />
              <strong>
                {startDate} — {endDate}
              </strong>
              <Button
                aria-label="后 14 天"
                icon={<RightOutlined />}
                onClick={() =>
                  change({
                    startDate: moveBusinessDate(startDate, 14),
                    filter: 'period',
                    selectedDate: '',
                  })
                }
              />
              <Button
                onClick={() =>
                  change({
                    startDate: today,
                    selectedDate: today,
                    filter: 'date',
                  })
                }
              >
                今天
              </Button>
            </div>
            <div className="erp-arrival-calendar__filters">
              <div className="erp-arrival-calendar__date-jump">
                <DateInput
                  aria-label="跳转到货日期"
                  placeholder="跳转日期"
                  value={viewState.selectedDate || ''}
                  onChange={(date) =>
                    change({
                      startDate: date || today,
                      selectedDate: date || '',
                      filter: date ? 'date' : 'all',
                    })
                  }
                />
              </div>
              <FilterSelect
                emptyValue="all"
                label="交期来源"
                placeholder="交期来源"
                aria-label="交期来源"
                value={confirmation}
                onChange={(value) => change({ confirmation: value })}
                options={[
                  { value: 'all', label: '全部交期来源' },
                  { value: 'confirmed', label: '供应商确认交期' },
                  { value: 'unconfirmed', label: '明细或整单预计' },
                ]}
              />
              <Button
                onClick={() =>
                  change({
                    filter: 'all',
                    confirmation: 'all',
                    selectedDate: '',
                    startDate: today,
                  })
                }
              >
                重置到货筛选
              </Button>
            </div>
          </div>
        )}
        <VisualizationState loading={loading} error={error} onRetry={onRetry} />
        {!loading && !error && (
          <>
            {calendarOpen && (
              <div className="erp-arrival-calendar__calendar">
                <div
                  className="erp-arrival-calendar__days"
                  aria-label="14 天到货安排"
                >
                  {Array.from({ length: 14 }, (_, index) =>
                    moveBusinessDate(startDate, index)
                  ).map((date) => (
                    <button
                      key={date}
                      type="button"
                      aria-label={`${date}，${board?.days?.[date] || 0} 条待到货明细`}
                      aria-current={date === today ? 'date' : undefined}
                      aria-pressed={
                        filter === 'date' && viewState.selectedDate === date
                      }
                      className={`erp-arrival-calendar__day ${date === today ? 'erp-arrival-calendar__day--today' : ''} ${viewState.selectedDate === date ? 'erp-arrival-calendar__day--selected' : ''}`}
                      onClick={() =>
                        change({ selectedDate: date, filter: 'date' })
                      }
                    >
                      <span className="erp-arrival-calendar__day-label">
                        <span className="erp-arrival-calendar__day-number">
                          {dayjs(date).format('MM-DD')}
                        </span>
                        <small>周{'日一二三四五六'[dayjs(date).day()]}</small>
                      </span>
                      <strong>
                        {board?.days?.[date] || 0} <small>条</small>
                      </strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="erp-arrival-calendar__detail">
              <div className="erp-arrival-calendar__detail-head">
                <strong>
                  {filter === 'date'
                    ? viewState.selectedDate
                    : PURCHASE_FOLLOWUP_LABELS[filter] || '全部跟进事项'}{' '}
                  · {board?.total || 0} 项
                </strong>
                <Button
                  icon={<DownloadOutlined aria-hidden="true" />}
                  disabled={!board?.total || exporting}
                  loading={exporting}
                  onClick={exportRows}
                >
                  导出当前结果
                </Button>
              </div>
              <BusinessDataTable
                rowKey="key"
                columns={actionColumns}
                dataSource={rows}
                onOpenRecord={onOpen}
                pagination={{
                  current: Math.max(1, Number(viewState.page) || 1),
                  pageSize: 25,
                  total: board?.total || 0,
                  showSizeChanger: false,
                  onChange: (page) => change({ page }),
                }}
                emptyDescription="当前范围没有需要跟进的事项"
              />
              <p className="erp-arrival-calendar__note">
                同一明细可有多项跟进事项，按所列岗位办理。到货日历只计尚需到货的明细；待核对应付仍须核对结算条件。
              </p>
            </div>
          </>
        )}
      </BusinessVisualizationFrame>
    </>
  )
}
