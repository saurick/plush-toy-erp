import { useCallback, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { downloadBusinessListCSV } from '../components/business-list/BusinessListToolbarActions.jsx'
import useLatestRequestCoordinator from './useLatestRequestCoordinator.js'

function invalidExportRowsResponse() {
  const error = new Error('服务器返回的导出列表不完整，请刷新后重试')
  error.isInvalidResponse = true
  return error
}

export default function useBusinessListExport({
  requestKey,
  loadRows,
  filename,
  columns,
  recordLabel = '记录',
}) {
  const beginLatestRequest = useLatestRequestCoordinator()
  const exportInFlightRef = useRef(false)
  const [exporting, setExporting] = useState(false)

  const exportRows = useCallback(async () => {
    if (exportInFlightRef.current || typeof loadRows !== 'function') return
    exportInFlightRef.current = true
    setExporting(true)
    const request = beginLatestRequest(requestKey || 'business-list-export')
    try {
      const rows = await loadRows({ signal: request.signal })
      if (!request.isCurrent()) return
      if (!Array.isArray(rows)) {
        throw invalidExportRowsResponse()
      }
      if (rows.length === 0) {
        message.info(`当前筛选没有可导出的${recordLabel}`)
        return
      }
      downloadBusinessListCSV({
        filename:
          typeof filename === 'function' ? filename() : String(filename || ''),
        columns,
        rows,
      })
      message.success(`已导出 ${rows.length} 条${recordLabel}`)
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, `导出${recordLabel}`))
    } finally {
      if (request.isCurrent()) setExporting(false)
      exportInFlightRef.current = false
      request.finish()
    }
  }, [
    beginLatestRequest,
    columns,
    filename,
    loadRows,
    recordLabel,
    requestKey,
  ])

  return { exporting, exportRows }
}
