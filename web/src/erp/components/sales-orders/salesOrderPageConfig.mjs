import {
  activateSalesOrder,
  cancelSalesOrder,
  closeSalesOrder,
} from '../../api/masterDataOrderApi.mjs'
import { submitSalesOrderAcceptanceProcess } from '../../api/customerConfigApi.mjs'

export const SALES_ORDER_STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已生效', value: 'active' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

export const SALES_ORDER_DATE_FILTER_OPTIONS = [
  { label: '签约日期', value: 'order_date' },
  { label: '计划交付日期', value: 'planned_delivery_date' },
]

export const SALES_ORDER_SORT_FILTER_OPTIONS = [
  { label: '最新优先', value: 'updated_at:desc' },
  { label: '最早优先', value: 'updated_at:asc' },
  { label: '签约日期新到旧', value: 'order_date:desc' },
  { label: '签约日期旧到新', value: 'order_date:asc' },
  { label: '计划交付日期新到旧', value: 'planned_delivery_date:desc' },
  { label: '计划交付日期旧到新', value: 'planned_delivery_date:asc' },
]

export const SALES_ORDER_LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'sales_order.submit',
    nextStatus: 'submitted',
    run: submitSalesOrderAcceptanceProcess,
    returnsRecord: false,
    successMessage: '销售订单已提交，已进入老板审批',
  },
  {
    key: 'activate',
    label: '生效',
    permission: 'sales_order.activate',
    nextStatus: 'active',
    run: activateSalesOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'sales_order.close',
    nextStatus: 'closed',
    confirmTitle: '确认关闭销售订单',
    confirmContent:
      '关闭只会停止这张销售订单继续执行；已经生成的出货、库存、财务记录或相关任务不会自动改变。',
    okText: '确认关闭',
    run: closeSalesOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'sales_order.cancel',
    nextStatus: 'canceled',
    danger: true,
    confirmTitle: '确认取消销售订单',
    confirmContent:
      '取消只会终止这张销售订单本身；已经生成的出货、库存、财务记录或相关任务不会自动取消或撤销。',
    okText: '确认取消',
    run: cancelSalesOrder,
  },
]

export const SALES_ORDERS_MODULE_KEY = 'sales-orders'
export const SALES_ORDER_ITEMS_MODULE_KEY = 'sales-order-items'
export const OPEN_SALES_ORDER_LINE_STATUS = 'open'
