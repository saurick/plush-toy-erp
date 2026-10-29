import { useCallback, useEffect, useMemo, useState } from 'react'
import { financePaymentFilterParams } from '../../utils/financePaymentFilters.mjs'

import { showPageLoadError } from '../PageLoadFeedback.jsx'

import { OperationalFactStatus } from '../../../common/consts/statuses.generated.mjs'

import useBusinessPageState from '../../hooks/useBusinessPageState.js'
import { resolveBusinessStatusCounts } from '../../utils/businessStatusCounts.mjs'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  getFinancePayment,
  listAllFinanceFacts,
  listFinanceCreditNotes,
  listFinancePayments,
} from '../../api/operationalFactApi.mjs'

import {
  listAllCustomers,
  listAllSuppliers,
} from '../../api/masterDataOrderApi.mjs'

import { DEFAULT_BUSINESS_PAGE_SIZE, getBusinessPaginationParams } from '../../utils/businessPagination.mjs'

import { compactParams } from '../../utils/sourceDocumentValues.mjs'

import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'

export default function useFinancePaymentRecords({
  outletContext,
  storageKey,
  linkedFinancePaymentID,
  setActiveTab,
  beginLatestRequest,
}) {
  const [currentPayment, setCurrentPayment] = useState(null)
  const [paymentRecovery, setPaymentRecovery] = useState(null)

  const [currentCredit, setCurrentCredit] = useState(null)

  const [payments, setPayments] = useState([])

  const [creditNotes, setCreditNotes] = useState([])

  const [financeFacts, setFinanceFacts] = useState([])

  const [customers, setCustomers] = useState([])

  const [suppliers, setSuppliers] = useState([])

  const [tableLoading, setTableLoading] = useState({
    payments: false,
    credits: false,
  })

  const [referenceLoading, setReferenceLoading] = useState(false)

  const [paymentTotal, setPaymentTotal] = useState(0)
  const [paymentTotals, setPaymentTotals] = useState([])
  const [paymentFilters, setPaymentFilters] = useBusinessPageState('paymentFilters', {})

  const [paymentStatusCounts, setPaymentStatusCounts] = useState(null)

  const [creditTotal, setCreditTotal] = useState(0)

  const [creditStatusCounts, setCreditStatusCounts] = useState(null)

  const [paymentPagination, setPaymentPagination] = useBusinessPageState(
    'paymentPagination',
    { current: 1, pageSize: DEFAULT_BUSINESS_PAGE_SIZE }
  )

  const [creditPagination, setCreditPagination] = useBusinessPageState(
    'creditPagination',
    { current: 1, pageSize: DEFAULT_BUSINESS_PAGE_SIZE }
  )

  const [paymentKeyword, setPaymentKeyword] = useBusinessPageState(
    'paymentKeyword',
    ''
  )

  const [creditKeyword, setCreditKeyword] = useBusinessPageState(
    'creditKeyword',
    ''
  )

  const [paymentStatusFilter, setPaymentStatusFilter] = useBusinessPageState(
    'paymentStatusFilter',
    ''
  )

  const [paymentDirectionFilter, setPaymentDirectionFilter] =
    useBusinessPageState('paymentDirectionFilter', '')

  const [creditStatusFilter, setCreditStatusFilter] = useBusinessPageState(
    'creditStatusFilter',
    ''
  )

  const rememberPayment = useCallback(
    (payment) => {
      setCurrentPayment(payment || null)
      if (storageKey && payment?.id) {
        window.sessionStorage.setItem(storageKey, String(payment.id))
      }
    },
    [storageKey]
  )

  const clearPaymentSelection = useCallback(() => {
    setCurrentPayment(null)
    if (storageKey) window.sessionStorage.removeItem(storageKey)
  }, [storageKey])

  const recoverPayment = useCallback(
    async (id, quiet = false) => {
      try {
        const payment = await getFinancePayment({ id: Number(id) })
        if (!payment?.id) {
          throw new Error('收付款回执不完整')
        }
        rememberPayment(payment)
        setPaymentRecovery((current) => current?.id === Number(id) ? null : current)
        return payment
      } catch (error) {
        setPaymentRecovery({ id: Number(id), message: getActionErrorMessage(error, '读取收付款最新结果') })
        if (!quiet) {
          message.error(getActionErrorMessage(error, '恢复收付款记录'))
        }
        return null
      }
    },
    [rememberPayment]
  )

  const loadPaymentRows = useCallback(async () => {
    const request = beginLatestRequest('finance-payment-list')
    setTableLoading((current) => ({ ...current, payments: true }))
    setPaymentStatusCounts(null)
    setPaymentTotals([])
    try {
      const result = await listFinancePayments(
        compactParams({
          include_status_counts: true,
          include_totals: true,
          ...financePaymentFilterParams(paymentFilters),
          status: paymentStatusFilter,
          keyword: paymentKeyword.trim(),
          direction: paymentDirectionFilter,
          ...getBusinessPaginationParams(paymentPagination),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const nextRows = Array.isArray(result?.payments) ? result.payments : []
      setPayments(nextRows)
      setPaymentTotal(Number(result?.total || 0))
      setPaymentTotals(Array.isArray(result?.totals) ? result.totals : [])
      setPaymentStatusCounts(resolveBusinessStatusCounts(result))
      setCurrentPayment((current) =>
        current?.id
          ? nextRows.find((item) => Number(item.id) === Number(current.id)) ||
            current
          : null
      )
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      setPayments([])
      setPaymentTotal(0)
      showPageLoadError(error, '加载收付款记录')
    } finally {
      if (request.isCurrent()) {
        setTableLoading((current) => ({ ...current, payments: false }))
      }
      request.finish()
    }
  }, [
    beginLatestRequest,
    paymentDirectionFilter,
    paymentFilters,
    paymentPagination,
    paymentStatusFilter,
    paymentKeyword,
  ])

  const loadCreditRows = useCallback(async () => {
    const request = beginLatestRequest('finance-credit-list')
    setTableLoading((current) => ({ ...current, credits: true }))
    setCreditStatusCounts(null)
    try {
      const result = await listFinanceCreditNotes(
        compactParams({
          include_status_counts: true,
          status: creditStatusFilter,
          keyword: creditKeyword.trim(),
          ...getBusinessPaginationParams(creditPagination),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const nextRows = Array.isArray(result?.credit_notes)
        ? result.credit_notes
        : []
      setCreditNotes(nextRows)
      setCreditTotal(Number(result?.total || 0))
      setCreditStatusCounts(resolveBusinessStatusCounts(result))
      setCurrentCredit((current) =>
        current?.id
          ? nextRows.find((item) => Number(item.id) === Number(current.id)) ||
            current
          : null
      )
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      showPageLoadError(error, '加载红冲记录')
    } finally {
      if (request.isCurrent()) {
        setTableLoading((current) => ({ ...current, credits: false }))
      }
      request.finish()
    }
  }, [beginLatestRequest, creditPagination, creditStatusFilter, creditKeyword])

  const loadPartyReferences = useCallback(async () => {
    const request = beginLatestRequest('finance-party-references')
    setReferenceLoading(true)
    try {
      const [customerResult, supplierResult] = await Promise.allSettled([
        listAllCustomers({ active_only: true }, { signal: request.signal }),
        listAllSuppliers({ active_only: true }, { signal: request.signal }),
      ])
      if (!request.isCurrent()) return
      if (customerResult.status === 'fulfilled') {
        setCustomers(
          Array.isArray(customerResult.value?.customers)
            ? customerResult.value.customers
            : []
        )
      }
      if (supplierResult.status === 'fulfilled') {
        setSuppliers(
          Array.isArray(supplierResult.value?.suppliers)
            ? supplierResult.value.suppliers
            : []
        )
      }
      const errorResult = [customerResult, supplierResult].find(
        (result) =>
          result.status === 'rejected' && !isRpcAbortError(result.reason)
      )
      if (errorResult) {
        message.warning(
          getActionErrorMessage(
            errorResult.reason,
            '部分客户或供应商资料暂未加载'
          )
        )
      }
    } finally {
      if (request.isCurrent()) setReferenceLoading(false)
      request.finish()
    }
  }, [beginLatestRequest])

  const loadFinanceFactReferences = useCallback(
    async ({ factType, counterpartyID, currency } = {}) => {
      const request = beginLatestRequest('finance-fact-references')
      setReferenceLoading(true)
      const factTypes = factType ? [factType] : ['RECEIVABLE', 'PAYABLE']
      try {
        const results = await Promise.all(
          factTypes.map((currentFactType) =>
            listAllFinanceFacts(
              compactParams({
                fact_type: currentFactType,
                status: OperationalFactStatus.POSTED,
                counterparty_id: counterpartyID,
              }),
              { signal: request.signal }
            )
          )
        )
        if (!request.isCurrent()) return null
        const rows = results.flatMap((result) =>
          Array.isArray(result?.finance_facts) ? result.finance_facts : []
        )
        const scopedRows = currency
          ? rows.filter((item) => item?.currency === currency)
          : rows
        setFinanceFacts(scopedRows)
        return scopedRows
      } catch (error) {
        if (request.isCurrent() && !isRpcAbortError(error)) {
          showPageLoadError(error, '加载可核销财务记录')
        }
        return null
      } finally {
        if (request.isCurrent()) setReferenceLoading(false)
        request.finish()
      }
    },
    [beginLatestRequest]
  )

  const loadReferences = useCallback(
    () =>
      Promise.allSettled([
        loadPaymentRows(),
        loadCreditRows(),
        loadPartyReferences(),
      ]),
    [loadCreditRows, loadPartyReferences, loadPaymentRows]
  )

  useEffect(() => {
    loadPaymentRows()
  }, [loadPaymentRows])

  useEffect(() => {
    loadCreditRows()
  }, [loadCreditRows])

  useEffect(() => {
    loadPartyReferences()
  }, [loadPartyReferences])

  useEffect(() => {
    if (
      Number.isSafeInteger(linkedFinancePaymentID) &&
      linkedFinancePaymentID > 0
    ) {
      setActiveTab('payments')
      recoverPayment(linkedFinancePaymentID)
    } else if (storageKey) {
      const paymentID = Number(window.sessionStorage.getItem(storageKey) || 0)
      if (paymentID > 0) recoverPayment(paymentID, true)
    }
  }, [linkedFinancePaymentID, recoverPayment, setActiveTab, storageKey])

  useEffect(
    () => outletContext?.registerPageRefresh?.(loadReferences),
    [loadReferences, outletContext]
  )

  const allocationCandidates = useMemo(() => {
    if (!currentPayment) return []
    const factType =
      currentPayment.direction === 'RECEIPT' ? 'RECEIVABLE' : 'PAYABLE'
    return financeFacts.filter(
      (fact) =>
        fact.fact_type === factType &&
        fact.status === OperationalFactStatus.POSTED &&
        Number(fact.counterparty_id || 0) ===
          Number(currentPayment.counterparty_id || 0) &&
        fact.currency === currentPayment.currency &&
        isPositiveNumeric20Scale6Units(
          numeric20Scale6Units(fact.outstanding_amount)
        )
    )
  }, [currentPayment, financeFacts])

  return {
    paymentRecovery,
    currentPayment,
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
    paymentTotals,
    paymentFilters,
    setPaymentFilters,
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
  }
}
