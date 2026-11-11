import React, { useMemo, useState } from 'react'
import { Button } from 'antd'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { FinanceAllocationStatus } from '../../../common/consts/statuses.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { BUSINESS_SEARCH_SCOPES } from '../../utils/businessSearchScopes.mjs'
import { createBusinessTablePagination } from '../../utils/businessPagination.mjs'
import { applyBusinessServerColumnSorters, readBusinessServerTableSort } from '../../utils/moduleTableColumns.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  SearchInput,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../business-list/BusinessListLayout.jsx'
import BusinessStatusFilter from '../business-list/BusinessStatusFilter.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../business-list/BusinessListToolbarActions.jsx'
import BusinessDetailsModal from '../business-list/BusinessDetailsModal.jsx'
import {
  CREDIT_STATUS_OPTIONS,
  FINANCE_CREDIT_NOTE_COLUMN_ORDER_KEY,
} from './financePaymentPresentation.jsx'
import useFinancePaymentRecords from './useFinancePaymentRecords.mjs'
import useFinancePaymentColumns from './useFinancePaymentColumns.jsx'
import useFinancePaymentExports from './useFinancePaymentExports.mjs'
import useFinanceCreditActions from './useFinanceCreditActions.mjs'
import { FinanceCreditEditor } from './FinanceCreditEditor.jsx'

const EMPTY_PARTIES = []
const CREDIT_SORT_FIELDS = { credit_note_no: 'credit_note_no', amount: 'amount' }

export default function FinanceCreditNotesPanel({ attemptsRef }) {
  const outletContext = useBusinessPageContext()
  const adminProfile = outletContext?.adminProfile || {}
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const [loading, setLoading] = useState(false)
  const [creditDetail, setCreditDetail] = useState(null)
  const beginLatestRequest = useLatestRequestCoordinator()
  const canReadReceivables = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_RECEIVABLE_READ
  )
  const canReadPayables = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_PAYABLE_READ
  )
  const financeFactTypes = useMemo(
    () => [
      ...(canReadReceivables ? ['RECEIVABLE'] : []),
      ...(canReadPayables ? ['PAYABLE'] : []),
    ],
    [canReadReceivables, canReadPayables]
  )
  const canCreateCredit =
    hasActionPermission(
      adminProfile,
      PermissionCode.FINANCE_CREDIT_NOTE_CREATE
    ) && financeFactTypes.length > 0
  const canReverseCredit = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_CREDIT_NOTE_REVERSE
  )
  const {
    recordSort,
    displayedSort,
    changeRecordSort,
    currentCredit,
    setCurrentCredit,
    creditNotes,
    financeFacts,
    tableLoading,
    referenceLoading,
    creditTotal,
    creditStatusCounts,
    creditPagination,
    setCreditPagination,
    creditKeyword,
    setCreditKeyword,
    creditStatusFilter,
    setCreditStatusFilter,
    loadFinanceFactReferences,
    loadReferences,
  } = useFinancePaymentRecords({
    outletContext,
    beginLatestRequest,
    recordType: 'credits',
    financeFactTypes,
  })
  const { creditColumns } = useFinancePaymentColumns({
    customers: EMPTY_PARTIES,
    suppliers: EMPTY_PARTIES,
  })
  const {
    tableColumns: creditTableColumns,
    exportColumns: creditExportColumns,
    openColumnOrder: openCreditColumnOrder,
    columnOrderModal: creditColumnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: FINANCE_CREDIT_NOTE_COLUMN_ORDER_KEY,
    moduleTitle: '账款调整',
    columns: creditColumns,
  })
  const sortedCreditColumns = useMemo(
    () => applyBusinessServerColumnSorters(creditTableColumns, CREDIT_SORT_FIELDS, displayedSort),
    [creditTableColumns, displayedSort]
  )
  const handleTableChange = (_pagination, _filters, sorter, { action }) => {
    if (action === 'sort') changeRecordSort(readBusinessServerTableSort(sorter, CREDIT_SORT_FIELDS))
  }
  const { exportingTab, exportCreditRows } = useFinancePaymentExports({
    recordSort,
    creditKeyword,
    creditStatusFilter,
    beginLatestRequest,
    creditExportColumns,
  })
  const { creditOpen, setCreditOpen, creditForm, submitCredit, openCredit } =
    useFinanceCreditActions({
      customerKey,
      currentCredit,
      setCurrentCredit,
      financeFacts,
      setLoading,
      attemptsRef,
      loadFinanceFactReferences,
      loadReferences,
    })
  const currentCreditHasReversal =
    Boolean(currentCredit?.id) &&
    creditNotes.some(
      (item) =>
        Number(item?.reversal_of_credit_note_id) === Number(currentCredit.id)
    )
  const currentCreditCanReverse =
    Boolean(currentCredit) &&
    currentCredit.status === FinanceAllocationStatus.POSTED &&
    !currentCredit.reversal_of_credit_note_id &&
    !currentCreditHasReversal

  return (
    <BusinessPageLayout className="erp-finance-credit-notes-panel" inWorkspace>
      <BusinessOperationPanel
        inWorkspace
        compact
        filters={
          <>
            <SearchInput
              {...BUSINESS_SEARCH_SCOPES.credit}
              value={creditKeyword}
              onSearch={(value) => {
                setCreditKeyword(value)
                setCreditPagination((current) => ({
                  ...current,
                  current: 1,
                }))
              }}
            />
            <BusinessStatusFilter
              inline
              aria-label="账款调整状态"
              counts={creditStatusCounts}
              loading={tableLoading.credits}
              className="erp-business-filter-control--status"
              value={creditStatusFilter}
              options={CREDIT_STATUS_OPTIONS}
              onChange={(value) => {
                setCreditStatusFilter(value || '')
                setCreditPagination((current) => ({
                  ...current,
                  current: 1,
                }))
              }}
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            onExport={exportCreditRows}
            exportDisabled={
              tableLoading.credits || creditTotal === 0 || Boolean(exportingTab)
            }
            exportDisabledReason={
              exportingTab
                ? '正在准备导出，请稍候'
                : tableLoading.credits
                  ? '调整记录加载完成后可导出'
                  : creditTotal === 0
                    ? '当前筛选没有可导出的调整记录'
                    : ''
            }
            onOpenColumnOrder={openCreditColumnOrder}
          />
        }
        primaryAction={
          canCreateCredit ? (
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              loading={referenceLoading}
              onClick={() => openCredit(false)}
            >
              登记红冲
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={currentCredit ? 1 : 0}
          selectedLabel={
            currentCredit
              ? `${currentCredit.credit_note_no || '调整已登记'} / ${
                  currentCredit.status === FinanceAllocationStatus.REVERSED
                    ? '冲销记录'
                    : '已调整'
                }`
              : '请选择一条调整记录'
          }
          boundaryText="账款调整保留原金额、来源和独立审计；采购差额可调增或调减，人工红冲只调减。"
        >
          <SelectionClearAction
            selectedCount={currentCredit ? 1 : 0}
            selectionLabel="调整记录"
            onClear={() => setCurrentCredit(null)}
          />
          <BusinessActionTooltip
            disabled={!currentCredit}
            disabledReason="请先选择一条红冲记录"
          >
            <Button
              data-business-action-key="credit-details"
              data-business-action-group="query"
              disabled={!currentCredit}
              onClick={() => setCreditDetail(currentCredit)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {canReverseCredit ? (
            <BusinessActionTooltip
              visible={!currentCredit || currentCreditCanReverse}
              disabled={!currentCreditCanReverse || loading}
              disabledReason={
                !currentCredit
                  ? '请先选择一条红冲记录'
                  : currentCredit.reversal_of_credit_note_id
                    ? '冲销记录不能再次冲销'
                    : currentCredit.status !== FinanceAllocationStatus.POSTED
                      ? '只有已生效调整可以冲销'
                      : currentCreditHasReversal
                        ? '当前调整已经完成冲销'
                        : '当前操作完成后可冲销'
              }
            >
              <Button
                danger
                className="erp-business-module-status-action"
                data-business-action-key="credit-reverse"
                data-business-action-group="lifecycle"
                disabled={!currentCreditCanReverse || loading}
                onClick={() => {
                  if (!currentCreditCanReverse || loading) return
                  openCredit(true)
                }}
              >
                冲回当前调整
              </Button>
            </BusinessActionTooltip>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>
      <BusinessDataTable
        rowKey="id"
        loading={tableLoading.credits}
        dataSource={creditNotes}
        columns={sortedCreditColumns}
        onChange={handleTableChange}
        pagination={createBusinessTablePagination({
          pagination: creditPagination,
          total: creditTotal,
          onChange: (current, pageSize) =>
            setCreditPagination({ current, pageSize }),
        })}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: currentCredit?.id ? [currentCredit.id] : [],
          onChange: (_, rows) => setCurrentCredit(rows[0] || null),
        }}
        onRow={(record) => ({
          onClick: () => setCurrentCredit(record),
        })}
        onOpenRecord={(record) => setCreditDetail(record)}
        scroll={{ x: 1450 }}
        emptyDescription="暂无账款调整"
      />
      {creditColumnOrderModal}
      <p className="erp-business-inline-note">
        这里保留应收与应付的全部账款调整，来源类型见列表。登记红冲时只可选择有权查看的账款。
      </p>
      <FinanceCreditEditor
        financeFacts={financeFacts}
        loading={loading}
        referenceLoading={referenceLoading}
        creditOpen={creditOpen}
        setCreditOpen={setCreditOpen}
        creditForm={creditForm}
        submitCredit={submitCredit}
      />
      <BusinessDetailsModal
        open={Boolean(creditDetail)}
        title="账款调整详情"
        description="调整保留来源应收或应付、原金额、调整方向和当前未核销金额。"
        record={creditDetail}
        columns={creditColumns}
        onClose={() => setCreditDetail(null)}
      />
    </BusinessPageLayout>
  )
}
