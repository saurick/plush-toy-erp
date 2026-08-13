import {
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
    successMessage: '销售订单已提交，已进入审批流程',
  },
  {
    key: 'normal_close',
    label: '正常关闭',
    permission: 'sales_order.close',
    nextStatus: 'closed',
    sourceLifecycle: true,
    sourceType: 'sales_order',
    commandKey: 'close',
    closeMode: 'normal',
    confirmTitle: '确认正常关闭销售订单',
    confirmContent:
      '正常关闭只结清销售订单本身；所有订单行须已足量出货，且不能有待处理的出货草稿、库存预留或生产单。不会自动改变已经生成的出货、库存、财务记录或相关任务。',
    okText: '确认正常关闭',
    run: closeSalesOrder,
  },
  {
    key: 'short_close',
    label: '提前关闭',
    permission: 'sales_order.close',
    nextStatus: 'closed',
    sourceLifecycle: true,
    sourceType: 'sales_order',
    commandKey: 'close',
    closeMode: 'short',
    requiresReason: true,
    confirmTitle: '确认提前关闭销售订单',
    confirmContent:
      '提前关闭会结清尚未履行的销售订单行；已有待处理的出货草稿、库存预留或生产单时仍会被阻止。不会自动取消或撤销已经生成的出货、库存、财务记录或相关任务。',
    reasonPlaceholder: '请填写未履完即关闭的业务原因',
    okText: '确认提前关闭',
    run: closeSalesOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'sales_order.cancel',
    nextStatus: 'canceled',
    sourceLifecycle: true,
    sourceType: 'sales_order',
    commandKey: 'cancel',
    requiresReason: true,
    danger: true,
    confirmTitle: '确认取消销售订单',
    confirmContent:
      '取消只终止销售订单本身；系统会同步结清可安全终止的审批流程，已有未取消的出货、有效库存预留或生产单时会阻止取消。不会自动取消或撤销已经生成的出货、库存、财务记录或相关任务。',
    reasonPlaceholder: '请填写取消销售订单的业务原因',
    okText: '确认取消',
    run: cancelSalesOrder,
  },
]

export const SALES_ORDERS_MODULE_KEY = 'sales-orders'
export const SALES_ORDER_ITEMS_MODULE_KEY = 'sales-order-items'
export const OPEN_SALES_ORDER_LINE_STATUS = 'open'
