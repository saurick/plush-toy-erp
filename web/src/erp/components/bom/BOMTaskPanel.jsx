import React, { useCallback, useEffect, useId, useState } from 'react'
import { Alert, Button, Select, Space, Tag } from 'antd'
import Pagination from '@/common/components/pagination/AppPagination'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { getBOMVersion } from '../../api/bomApi.mjs'
import { listSalesOrders } from '../../api/masterDataOrderApi.mjs'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'
import {
  hasActionPermission,
  SALES_ORDER_STATUS_COLORS,
  SALES_ORDER_STATUS_LABELS,
} from '../../utils/masterDataOrderView.mjs'
import BusinessTaskActions from '../workflow/BusinessTaskActions.jsx'

const PAGE_SIZE = 10

// Tasks belong to the selected order. Resolve its BOM relation from saved
// order items, including historical orders, rather than printable source text.
export default function BOMTaskPanel({ context, onContextChange, adminProfile }) {
  const navigate = useBusinessNavigate()
  const selectID = useId()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const bomID = context?.bomID
  const page = context?.page || 1
  const canReadOrders = hasActionPermission(adminProfile, PermissionCode.SALES_ORDER_READ)
  const canReadTasks = hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_READ)
  const key = `${adminProfile?.id}:${bomID}:${page}:${canReadOrders}:${canReadTasks}`
  const current = result?.key === key ? result : null
  const orders = current?.orders || []
  const total = current?.total || 0
  const selected = orders.find((order) => order.id === context?.orderID)
    || (total === 1 ? orders[0] : null)
  const renderOrderMenu = useCallback((menu) => <>{menu}{total > PAGE_SIZE ? <div className="business-task-panel__order-pagination"><Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={(nextPage) => onContextChange({ bomID, page: nextPage })} /></div> : null}</>, [total, page, bomID, onContextChange])

  useEffect(() => {
    if (!bomID || !canReadOrders || !canReadTasks) return undefined
    const controller = new AbortController()
    setLoading(true)
    setResult(null)
    Promise.all([
      getBOMVersion({ id: bomID }, { signal: controller.signal }),
      listSalesOrders({ sample_bom_id: bomID, lifecycle_scope: 'all', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, { signal: controller.signal }),
    ]).then(([bom, data]) => {
      if (controller.signal.aborted) return
      if (bom?.id !== bomID || !Array.isArray(data?.sales_orders) || !Number.isSafeInteger(data.total) || data.total < 0) {
        throw new Error('关联订单读取不完整')
      }
      setResult({ key, bom, orders: data.sales_orders, total: data.total })
    }).catch((error) => {
      if (!controller.signal.aborted && !isRpcAbortError(error)) {
        setResult({ key, error: getActionErrorMessage(error, '读取 BOM 关联订单') })
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [key, bomID, page, canReadOrders, canReadTasks, revision])

  const emptyText = !canReadOrders
    ? '当前账号不能查看关联销售订单'
    : current?.error
      ? '暂未读取关联订单'
      : total > 0
        ? '请选择关联销售订单，查看该订单的任务'
        : '此 BOM 尚未在销售订单的工程与打样中关联。'

  return (
    <BusinessTaskActions
      sourceType="sales_order"
      record={selected}
      adminProfile={adminProfile}
      panelOpen={Boolean(bomID && canReadTasks)}
      onPanelClose={() => onContextChange(null)}
      sourceLoading={Boolean(bomID && canReadOrders && canReadTasks && (loading || !current))}
      sourceEmptyText={emptyText}
      renderSourceContext={() => (
        <>
          <div className="business-task-panel__source"><span>BOM 版本</span><strong>{current?.bom?.version || (loading ? '正在读取' : '未读取')}</strong></div>
          {!canReadOrders ? (
            <Alert type="info" showIcon message="当前账号没有查看关联销售订单的权限，请联系管理员核对岗位授权。" />
          ) : current?.error ? (
            <Alert type="error" showIcon message={current.error} action={<Button onClick={() => setRevision((value) => value + 1)}>重新读取</Button>} />
          ) : (
            <div className="business-task-panel__order">
              <label htmlFor={selectID}>关联销售订单</label>
              <Select
                id={selectID}
                aria-label="关联销售订单"
                value={selected?.id}
                placeholder={total > 0 ? '请选择关联销售订单' : '暂无关联销售订单'}
                loading={loading}
                disabled={loading || orders.length === 0}
                options={orders.map((order) => ({ value: order.id, label: order.order_no }))}
                onChange={(orderID) => onContextChange({ bomID, page, orderID })}
                popupRender={renderOrderMenu}
              />
              {selected ? <Tag color={SALES_ORDER_STATUS_COLORS[selected.lifecycle_status]}>{SALES_ORDER_STATUS_LABELS[selected.lifecycle_status] || '订单状态'}</Tag> : null}
            </div>
          )}
          {current && !current.error && total === 0 ? (
            <Space wrap><Button onClick={() => navigate('/erp/sales/project-orders/sales-orders')}>打开销售订单</Button><Button onClick={() => navigate('/erp/task-board?role=engineering')}>查看工程任务</Button></Space>
          ) : null}
        </>
      )}
    />
  )
}
