import React, { useRef, useState } from 'react'
import { Alert, Button } from 'antd'
import { useOutletContext } from 'react-router-dom'
import useBusinessSearchParams from '../hooks/useBusinessSearchParams.js'

import WorkflowSourceProgressButton from '../components/workflow/WorkflowSourceProgressButton.jsx'
import {
  FinanceAllocationStatus,
  FinancePaymentKind,
  FinancePaymentStatus,
} from '../../common/consts/statuses.generated.mjs'

import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

import useBusinessPageState from '../hooks/useBusinessPageState.js'

import BusinessStatusFilter from '../components/business-list/BusinessStatusFilter.jsx'
import Tabs from '@/common/components/navigation/SlidingTabs'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'

import { getFinancePaymentApprovalProcess } from '../api/customerConfigApi.mjs'

import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SelectFilter,
  SearchInput,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'

import ExceptionProcessRecoveryButton from '../components/workflow/ExceptionProcessRecoveryButton.jsx'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { createBusinessTablePagination } from '../utils/businessPagination.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'

import { createSourceBusinessActionAttemptStore } from '../utils/sourceBusinessAction.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../utils/numeric20Scale6.mjs'

import { resolveFinancePaymentActionAvailability } from '../utils/operationalActionAvailability.mjs'
import {
  PAYMENT_STORAGE_PREFIX,
  FINANCE_PAYMENT_COLUMN_ORDER_KEY,
  FINANCE_CREDIT_NOTE_COLUMN_ORDER_KEY,
  PAYMENT_STATUS_META,
  PAYMENT_STATUS_OPTIONS,
  PAYMENT_DIRECTION_OPTIONS,
  CREDIT_STATUS_OPTIONS,
  FINANCE_VIEW_ITEMS,
} from '../components/finance/financePaymentPresentation.jsx'
import useFinancePaymentCreation from '../components/finance/useFinancePaymentCreation.mjs'
import useFinancePaymentAllocation from '../components/finance/useFinancePaymentAllocation.mjs'
import useFinancePaymentAdjustments from '../components/finance/useFinancePaymentAdjustments.mjs'
import useFinanceCreditActions from '../components/finance/useFinanceCreditActions.mjs'
import useFinancePaymentColumns from '../components/finance/useFinancePaymentColumns.jsx'
import useFinancePaymentExports from '../components/finance/useFinancePaymentExports.mjs'
import useFinancePaymentRecords from '../components/finance/useFinancePaymentRecords.mjs'
import { FinancePaymentEditor } from '../components/finance/FinancePaymentEditor.jsx'
import { FinanceAllocationEditor } from '../components/finance/FinanceAllocationEditor.jsx'
import {
  FinanceAllocationReversalModal,
  FinancePaymentCancelModal,
  FinancePaymentReversalModal,
} from '../components/finance/FinancePaymentAdjustmentModals.jsx'
import { FinanceCreditEditor } from '../components/finance/FinanceCreditEditor.jsx'
import { FinancePaymentDetails } from '../components/finance/FinancePaymentDetails.jsx'

export default function FinancePaymentsPage() {
  const [searchParams] = useBusinessSearchParams()
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const adminID = Number(adminProfile?.id || 0)
  const storageKey = adminID
    ? `${PAYMENT_STORAGE_PREFIX}${adminID}:${customerKey || 'default'}`
    : ''
  const linkedFinancePaymentID = Number(
    searchParams.get('finance_payment_id') || 0
  )
  const [activeTab, setActiveTab] = useBusinessPageState(
    'activeTab',
    'payments'
  )

  const [loading, setLoading] = useState(false)

  const [paymentDetail, setPaymentDetail] = useState(null)
  const [creditDetail, setCreditDetail] = useState(null)

  // 未确认的提交尝试归页面持有，关闭表单或切换页签后仍可恢复。
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())

  const beginLatestRequest = useLatestRequestCoordinator()

  const canCreatePayment = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_PAYMENT_CREATE
  )
  const canPostPayment = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_PAYMENT_POST
  )
  const canCancelPayment = canCreatePayment
  const canReversePayment = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_PAYMENT_REVERSE
  )
  const canCreateCredit = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_CREDIT_NOTE_CREATE
  )
  const canReverseCredit = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_CREDIT_NOTE_REVERSE
  )
  const canRecoverProcess = hasActionPermission(
    adminProfile,
    PermissionCode.PROCESS_RUNTIME_RECOVER
  )

  const {
    currentPayment,
    paymentRecovery,
    currentCredit,
    setCurrentCredit,
    payments,
    creditNotes,
    financeFacts,
    setFinanceFacts,
    customers,
    suppliers,
    tableLoading,
    referenceLoading,
    setReferenceLoading,
    paymentTotal,
    paymentStatusCounts,
    creditTotal,
    creditStatusCounts,
    paymentPagination,
    setPaymentPagination,
    creditPagination,
    setCreditPagination,
    paymentKeyword,
    setPaymentKeyword,
    creditKeyword,
    setCreditKeyword,
    paymentStatusFilter,
    setPaymentStatusFilter,
    paymentDirectionFilter,
    setPaymentDirectionFilter,
    creditStatusFilter,
    setCreditStatusFilter,
    rememberPayment,
    clearPaymentSelection,
    recoverPayment,
    loadFinanceFactReferences,
    loadReferences,
    allocationCandidates,
  } = useFinancePaymentRecords({
    outletContext,
    storageKey,
    linkedFinancePaymentID,
    setActiveTab,
    beginLatestRequest,
  })

  const {
    paymentOpen,
    setPaymentOpen,
    refundSource,
    paymentForm,
    paymentKind,
    partyIsCustomer,
    partyOptions,
    openPayment,
    createPayment,
    openRefund,
  } = useFinancePaymentCreation({
    customerKey,
    currentPayment,
    customers,
    suppliers,
    setLoading,
    attemptsRef,
    rememberPayment,
    loadReferences,
  })

  const {
    allocationOpen,
    setAllocationOpen,
    allocationForm,
    ensurePaymentApprovalProcess,
    openAllocation,
    initializeAllocationForm,
    postPayment,
  } = useFinancePaymentAllocation({
    customerKey,
    currentPayment,
    setFinanceFacts,
    setLoading,
    setReferenceLoading,
    attemptsRef,
    rememberPayment,
    recoverPayment,
    loadReferences,
    allocationCandidates,
  })

  const {
    unallocateOpen,
    setUnallocateOpen,
    unallocateForm,
    cancelOpen,
    setCancelOpen,
    reverseOpen,
    setReverseOpen,
    cancelForm,
    reverseForm,
    reverseAllocation,
    openCancel,
    cancelPayment,
    reversePayment,
  } = useFinancePaymentAdjustments({
    customerKey,
    currentPayment,
    setLoading,
    rememberPayment,
    recoverPayment,
    loadReferences,
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

  const { paymentColumns, creditColumns } = useFinancePaymentColumns({
    customers,
    suppliers,
  })

  const {
    tableColumns: paymentTableColumns,
    exportColumns: paymentExportColumns,
    openColumnOrder: openPaymentColumnOrder,
    columnOrderModal: paymentColumnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: FINANCE_PAYMENT_COLUMN_ORDER_KEY,
    moduleTitle: '收付款与核销 / 收付款记录',
    columns: paymentColumns,
  })
  const {
    tableColumns: creditTableColumns,
    exportColumns: creditExportColumns,
    openColumnOrder: openCreditColumnOrder,
    columnOrderModal: creditColumnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: FINANCE_CREDIT_NOTE_COLUMN_ORDER_KEY,
    moduleTitle: '收付款与核销 / 红冲记录',
    columns: creditColumns,
  })
  const { exportingTab, exportPaymentRows, exportCreditRows } =
    useFinancePaymentExports({
      paymentKeyword,
      creditKeyword,
      paymentStatusFilter,
      paymentDirectionFilter,
      creditStatusFilter,
      beginLatestRequest,
      paymentExportColumns,
      creditExportColumns,
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
  const financeViewTabs = (
    <Tabs
      activeKey={activeTab}
      items={FINANCE_VIEW_ITEMS}
      onChange={setActiveTab}
    />
  )
  const paymentActionAvailability = {
    allocation: resolveFinancePaymentActionAvailability({
      action: 'allocation',
      authorized: canPostPayment,
      payment: currentPayment,
      pendingAllocation: Boolean(
        attemptsRef.current.peek(`finance-allocation:${currentPayment?.id}`)
      ),
      busy: loading,
      referenceLoading,
    }),
    approval: resolveFinancePaymentActionAvailability({
      action: 'approval',
      authorized: canCreatePayment,
      payment: currentPayment,
      busy: loading,
    }),
    cancel: resolveFinancePaymentActionAvailability({
      action: 'cancel',
      authorized: canCancelPayment,
      payment: currentPayment,
      busy: loading,
    }),
    reverse: resolveFinancePaymentActionAvailability({
      action: 'reverse',
      authorized: canReversePayment,
      payment: currentPayment,
      busy: loading,
    }),
  }

  const retryPaymentRecovery = async () => {
    setLoading(true)
    try { await recoverPayment(paymentRecovery.id) } finally { setLoading(false) }
  }
  return (
    <BusinessPageLayout className="erp-finance-payments-page">
      <PageHeaderCard
        compact
        helpKey="finance-payments"
        title="收付款与核销"
        viewSwitch={financeViewTabs}
      />
      {activeTab === 'payments' ? (
        <>
          <BusinessOperationPanel
            compact
            activeFilterCount={Number(Boolean(paymentDirectionFilter))}
            onClearFilters={() => {
              setPaymentDirectionFilter('')
              setPaymentPagination((current) => ({ ...current, current: 1 }))
            }}
            filters={
              <>
                <SearchInput
                  {...BUSINESS_SEARCH_SCOPES.payment}
                  value={paymentKeyword}
                  onChange={(event) => {
                    setPaymentKeyword(event.target.value)
                    setPaymentPagination((current) => ({
                      ...current,
                      current: 1,
                    }))
                  }}
                />
                <BusinessStatusFilter
                  inline
                  aria-label="收付款状态"
                  counts={paymentStatusCounts}
                  loading={tableLoading.payments}
                  className="erp-business-filter-control--status"
                  value={paymentStatusFilter}
                  options={PAYMENT_STATUS_OPTIONS}
                  onChange={(value) => {
                    setPaymentStatusFilter(value || '')
                    setPaymentPagination((current) => ({
                      ...current,
                      current: 1,
                    }))
                  }}
                />
                <SelectFilter
                  aria-label="收付款方向"
                  className="erp-business-filter-control--status"
                  value={paymentDirectionFilter}
                  options={PAYMENT_DIRECTION_OPTIONS}
                  onChange={(value) => {
                    setPaymentDirectionFilter(value || '')
                    setPaymentPagination((current) => ({
                      ...current,
                      current: 1,
                    }))
                  }}
                />
              </>
            }
            actions={
              <BusinessListToolbarActions
                onExport={exportPaymentRows}
                exportDisabled={
                  tableLoading.payments ||
                  referenceLoading ||
                  paymentTotal === 0 ||
                  Boolean(exportingTab)
                }
                exportDisabledReason={
                  exportingTab
                    ? '正在准备导出，请稍候'
                    : tableLoading.payments
                      ? '收付款记录加载完成后可导出'
                      : referenceLoading
                        ? '往来方资料加载完成后可导出'
                        : paymentTotal === 0
                          ? '当前筛选没有可导出的收付款记录'
                          : ''
                }
                onOpenColumnOrder={openPaymentColumnOrder}
              />
            }
            primaryAction={
              canCreatePayment ? (
                <ToolbarButton
                  type="primary"
                  className="erp-business-list-toolbar__primary-action"
                  onClick={openPayment}
                >
                  登记收付款
                </ToolbarButton>
              ) : null
            }
          >
            <SelectionActionBar
              embedded
              selectedCount={currentPayment ? 1 : 0}
              selectedLabel={
                currentPayment
                  ? `${currentPayment.payment_no || '收付款已登记'} / ${
                      PAYMENT_STATUS_META[currentPayment.status]?.[0] ||
                      '状态待核对'
                    }`
                  : '请选择一条收付款记录'
              }
              boundaryText="审批通过后由财务确认实际收付；首款保留余额，后续抵扣同一订单账款；退款须另行审批。"
            >
              <SelectionClearAction
                selectedCount={currentPayment ? 1 : 0}
                selectionLabel="收付款记录"
                onClear={clearPaymentSelection}
              />
              <BusinessActionTooltip
                disabled={!currentPayment}
                disabledReason="请先选择一条收付款记录"
              >
                <Button
                  data-business-action-key="payment-details"
                  data-business-action-role="view"
                  disabled={!currentPayment}
                  onClick={() => setPaymentDetail(currentPayment)}
                >
                  查看详情
                </Button>
              </BusinessActionTooltip>
              <WorkflowSourceProgressButton
                sourceType="finance_payment"
                sourceID={currentPayment?.id}
                profile={adminProfile}
                disabled={loading}
              />
              {canPostPayment ? (
                <BusinessActionTooltip
                  visible={paymentActionAvailability.allocation.visible}
                  disabled={paymentActionAvailability.allocation.disabled}
                  disabledReason={
                    paymentActionAvailability.allocation.disabledReason
                  }
                >
                  <Button
                    type={
                      currentPayment?.status === FinancePaymentStatus.APPROVED
                        ? 'primary'
                        : 'default'
                    }
                    className="erp-business-module-status-action"
                    data-business-action-key="payment-allocation"
                    data-business-action-role="primary"
                    disabled={paymentActionAvailability.allocation.disabled}
                    onClick={() =>
                      currentPayment?.status ===
                        FinancePaymentStatus.APPROVED &&
                      [
                        FinancePaymentKind.ADVANCE,
                        FinancePaymentKind.REFUND,
                      ].includes(currentPayment?.kind)
                        ? postPayment(true)
                        : openAllocation()
                    }
                  >
                    {currentPayment?.status === FinancePaymentStatus.APPROVED &&
                    [
                      FinancePaymentKind.ADVANCE,
                      FinancePaymentKind.REFUND,
                    ].includes(currentPayment?.kind)
                      ? '确认实际收付'
                      : currentPayment?.status === FinancePaymentStatus.POSTED
                        ? '抵扣应收 / 应付'
                        : '选择应收 / 应付核销'}
                  </Button>
                </BusinessActionTooltip>
              ) : null}
              {canCreatePayment &&
              currentPayment?.status === FinancePaymentStatus.POSTED &&
              currentPayment?.kind !== FinancePaymentKind.REFUND ? (
                <Button
                  disabled={
                    loading ||
                    !isPositiveNumeric20Scale6Units(
                      numeric20Scale6Units(currentPayment.available_amount)
                    )
                  }
                  onClick={openRefund}
                >
                  登记实际退款
                </Button>
              ) : null}
              {canReversePayment &&
              currentPayment?.status === FinancePaymentStatus.POSTED &&
              currentPayment?.kind !== FinancePaymentKind.REFUND ? (
                <Button
                  disabled={
                    loading ||
                    !isPositiveNumeric20Scale6Units(
                      numeric20Scale6Units(currentPayment.allocated_amount)
                    )
                  }
                  onClick={() => {
                    unallocateForm.resetFields()
                    setUnallocateOpen(true)
                  }}
                >
                  撤销抵扣
                </Button>
              ) : null}
              {canCreatePayment ? (
                <BusinessActionTooltip
                  visible={paymentActionAvailability.approval.visible}
                  disabled={paymentActionAvailability.approval.disabled}
                  disabledReason={
                    paymentActionAvailability.approval.disabledReason
                  }
                >
                  <Button
                    data-business-action-key="payment-approval"
                    data-business-action-role="primary"
                    type="primary"
                    disabled={paymentActionAvailability.approval.disabled}
                    onClick={ensurePaymentApprovalProcess}
                  >
                    核对审批流
                  </Button>
                </BusinessActionTooltip>
              ) : null}
              {canCancelPayment ? (
                <BusinessActionTooltip
                  visible={paymentActionAvailability.cancel.visible}
                  disabled={paymentActionAvailability.cancel.disabled}
                  disabledReason={
                    paymentActionAvailability.cancel.disabledReason
                  }
                >
                  <Button
                    danger
                    data-business-action-key="payment-cancel"
                    data-business-action-role="danger"
                    disabled={paymentActionAvailability.cancel.disabled}
                    onClick={openCancel}
                  >
                    核对并取消
                  </Button>
                </BusinessActionTooltip>
              ) : null}
              {canReversePayment ? (
                <BusinessActionTooltip
                  visible={paymentActionAvailability.reverse.visible}
                  disabled={paymentActionAvailability.reverse.disabled}
                  disabledReason={
                    paymentActionAvailability.reverse.disabledReason
                  }
                >
                  <Button
                    danger
                    className="erp-business-module-status-action"
                    data-business-action-key="payment-reverse"
                    data-business-action-role="danger"
                    disabled={paymentActionAvailability.reverse.disabled}
                    onClick={() => {
                      if (paymentActionAvailability.reverse.disabled) return
                      reverseForm.resetFields()
                      setReverseOpen(true)
                    }}
                  >
                    冲销收付款
                  </Button>
                </BusinessActionTooltip>
              ) : null}
              {canRecoverProcess ? (
                <ExceptionProcessRecoveryButton
                  canRecover={canRecoverProcess}
                  disabled={!currentPayment || loading}
                  disabledReason="请先选择一条收付款记录"
                  loadProcess={() =>
                    getFinancePaymentApprovalProcess({
                      ...(customerKey ? { customer_key: customerKey } : {}),
                      finance_payment_id: currentPayment.id,
                    })
                  }
                  onRecovered={async () => {
                    await recoverPayment(currentPayment.id)
                    await loadReferences()
                  }}
                />
              ) : null}
              <BusinessActionTooltip
                disabled={!currentPayment || loading}
                disabledReason={
                  loading
                    ? '当前操作完成后可重新读取'
                    : '请先选择一条收付款记录'
                }
              >
                <Button
                  data-business-action-key="payment-reload"
                  data-business-action-role="recovery"
                  disabled={!currentPayment || loading}
                  onClick={() => recoverPayment(currentPayment?.id)}
                >
                  重新读取
                </Button>
              </BusinessActionTooltip>
            </SelectionActionBar>
          </BusinessOperationPanel>
          {paymentRecovery && (!currentPayment || currentPayment.id === paymentRecovery.id) ? (
            <Alert
              type="error"
              showIcon
              message="尚未核对收付款最新结果"
              description={paymentRecovery.message}
              action={<Button loading={loading} onClick={retryPaymentRecovery}>重新读取</Button>}
            />
          ) : null}
          <BusinessDataTable
            rowKey="id"
            loading={tableLoading.payments}
            columns={paymentTableColumns}
            dataSource={payments}
            pagination={createBusinessTablePagination({
              pagination: paymentPagination,
              total: paymentTotal,
              onChange: (current, pageSize) =>
                setPaymentPagination({ current, pageSize }),
            })}
            scroll={{ x: 1450 }}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: currentPayment?.id ? [currentPayment.id] : [],
              onChange: (_, rows) => rememberPayment(rows[0] || null),
            }}
            onRow={(record) => ({
              onClick: () => rememberPayment(record),
            })}
            onOpenRecord={(record) => setPaymentDetail(record)}
            emptyDescription="暂无收付款记录"
          />
        </>
      ) : (
        <>
          <BusinessOperationPanel
            compact
            filters={
              <>
                <SearchInput
                  {...BUSINESS_SEARCH_SCOPES.credit}
                  value={creditKeyword}
                  onChange={(event) => {
                    setCreditKeyword(event.target.value)
                    setCreditPagination((current) => ({
                      ...current,
                      current: 1,
                    }))
                  }}
                />
                <BusinessStatusFilter
                  inline
                  aria-label="红冲状态"
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
                  tableLoading.credits ||
                  creditTotal === 0 ||
                  Boolean(exportingTab)
                }
                exportDisabledReason={
                  exportingTab
                    ? '正在准备导出，请稍候'
                    : tableLoading.credits
                      ? '红冲记录加载完成后可导出'
                      : creditTotal === 0
                        ? '当前筛选没有可导出的红冲记录'
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
                  ? `${currentCredit.credit_note_no || '红冲已登记'} / ${
                      currentCredit.status === FinanceAllocationStatus.REVERSED
                        ? '冲销记录'
                        : '已红冲'
                    }`
                  : '请选择一条红冲记录'
              }
              boundaryText="红冲只调整应收、应付未核销金额并保留独立审计；不删除原记录，也不替代总账凭证或税控处理。"
            >
              <SelectionClearAction
                selectedCount={currentCredit ? 1 : 0}
                selectionLabel="红冲记录"
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
                        : currentCredit.status !==
                            FinanceAllocationStatus.POSTED
                          ? '只有已红冲记录可以冲销'
                          : currentCreditHasReversal
                            ? '当前红冲记录已经完成冲销'
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
                    冲销当前红冲
                  </Button>
                </BusinessActionTooltip>
              ) : null}
            </SelectionActionBar>
          </BusinessOperationPanel>
          <BusinessDataTable
            rowKey="id"
            loading={tableLoading.credits}
            dataSource={creditNotes}
            columns={creditTableColumns}
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
            emptyDescription="暂无红冲记录"
          />
        </>
      )}

      {paymentColumnOrderModal}
      {creditColumnOrderModal}

      <FinancePaymentEditor
        adminProfile={adminProfile}
        customerKey={customerKey}
        loading={loading}
        referenceLoading={referenceLoading}
        paymentOpen={paymentOpen}
        setPaymentOpen={setPaymentOpen}
        refundSource={refundSource}
        paymentForm={paymentForm}
        paymentKind={paymentKind}
        partyIsCustomer={partyIsCustomer}
        partyOptions={partyOptions}
        createPayment={createPayment}
      />

      <FinanceAllocationReversalModal
        currentPayment={currentPayment}
        loading={loading}
        unallocateOpen={unallocateOpen}
        setUnallocateOpen={setUnallocateOpen}
        unallocateForm={unallocateForm}
        reverseAllocation={reverseAllocation}
      />

      <FinanceAllocationEditor
        currentPayment={currentPayment}
        loading={loading}
        allocationOpen={allocationOpen}
        setAllocationOpen={setAllocationOpen}
        allocationForm={allocationForm}
        attemptsRef={attemptsRef}
        allocationCandidates={allocationCandidates}
        initializeAllocationForm={initializeAllocationForm}
        postPayment={postPayment}
      />

      <FinancePaymentCancelModal
        loading={loading}
        cancelOpen={cancelOpen}
        setCancelOpen={setCancelOpen}
        cancelForm={cancelForm}
        cancelPayment={cancelPayment}
      />

      <FinancePaymentReversalModal
        loading={loading}
        reverseOpen={reverseOpen}
        setReverseOpen={setReverseOpen}
        reverseForm={reverseForm}
        reversePayment={reversePayment}
      />

      <FinanceCreditEditor
        financeFacts={financeFacts}
        loading={loading}
        referenceLoading={referenceLoading}
        creditOpen={creditOpen}
        setCreditOpen={setCreditOpen}
        creditForm={creditForm}
        submitCredit={submitCredit}
      />
      <FinancePaymentDetails
        paymentDetail={paymentDetail}
        setPaymentDetail={setPaymentDetail}
        creditDetail={creditDetail}
        setCreditDetail={setCreditDetail}
        paymentColumns={paymentColumns}
        creditColumns={creditColumns}
      />
    </BusinessPageLayout>
  )
}
