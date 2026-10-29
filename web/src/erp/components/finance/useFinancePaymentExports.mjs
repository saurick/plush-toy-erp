import { useCallback, useRef, useState } from 'react'
import { financePaymentFilterParams } from '../../utils/financePaymentFilters.mjs'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  listAllFinanceCreditNotes,
  listAllFinancePayments,
} from '../../api/operationalFactApi.mjs'

import { downloadBusinessListCSV } from '../business-list/BusinessListToolbarActions.jsx'

import { compactParams } from '../../utils/sourceDocumentValues.mjs'

import { currentBusinessDate } from '../../utils/businessDate.mjs'

export default function useFinancePaymentExports({
  paymentKeyword,
  paymentFilters,
  creditKeyword,
  paymentStatusFilter,
  paymentDirectionFilter,
  creditStatusFilter,
  beginLatestRequest,
  paymentExportColumns,
  creditExportColumns,
}) {
  const [exportingTab, setExportingTab] = useState('')

  const exportInFlightRef = useRef(false)

  const exportPaymentRows = useCallback(async () => {
    if (exportInFlightRef.current) return
    exportInFlightRef.current = true
    setExportingTab('payments')
    const request = beginLatestRequest('finance-payment-export')
    try {
      const result = await listAllFinancePayments(
        compactParams({
          ...financePaymentFilterParams(paymentFilters),
          status: paymentStatusFilter,
          keyword: paymentKeyword.trim(),
          direction: paymentDirectionFilter,
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const rows = Array.isArray(result?.payments) ? result.payments : []
      if (rows.length === 0) {
        message.info('当前筛选没有可导出的收付款记录')
        return
      }
      downloadBusinessListCSV({
        filename: `收付款记录-${currentBusinessDate()}.csv`,
        columns: paymentExportColumns,
        rows,
      })
      message.success(`已导出 ${rows.length} 条收付款记录`)
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, '导出收付款记录'))
    } finally {
      if (request.isCurrent()) setExportingTab('')
      exportInFlightRef.current = false
      request.finish()
    }
  }, [
    beginLatestRequest,
    paymentDirectionFilter,
    paymentFilters,
    paymentExportColumns,
    paymentStatusFilter,
    paymentKeyword,
  ])

  const exportCreditRows = useCallback(async () => {
    if (exportInFlightRef.current) return
    exportInFlightRef.current = true
    setExportingTab('credits')
    const request = beginLatestRequest('finance-credit-export')
    try {
      const result = await listAllFinanceCreditNotes(
        compactParams({
          status: creditStatusFilter,
          keyword: creditKeyword.trim(),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const rows = Array.isArray(result?.credit_notes)
        ? result.credit_notes
        : []
      if (rows.length === 0) {
        message.info('当前筛选没有可导出的账款调整记录')
        return
      }
      downloadBusinessListCSV({
        filename: `账款调整记录-${currentBusinessDate()}.csv`,
        columns: creditExportColumns,
        rows,
      })
      message.success(`已导出 ${rows.length} 条账款调整记录`)
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, '导出账款调整记录'))
    } finally {
      if (request.isCurrent()) setExportingTab('')
      exportInFlightRef.current = false
      request.finish()
    }
  }, [
    beginLatestRequest,
    creditExportColumns,
    creditStatusFilter,
    creditKeyword,
  ])

  return { exportingTab, exportPaymentRows, exportCreditRows }
}
