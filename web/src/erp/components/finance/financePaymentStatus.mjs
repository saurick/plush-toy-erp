import { FinancePaymentStatus } from '../../../common/consts/statuses.generated.mjs'

export const PAYMENT_STATUS_META = Object.freeze({
  [FinancePaymentStatus.DRAFT]: ['待审批', 'blue'],
  [FinancePaymentStatus.APPROVED]: ['已批准待入账', 'gold'],
  [FinancePaymentStatus.REJECTED]: ['已退回', 'red'],
  [FinancePaymentStatus.CANCELLED]: ['已取消', 'default'],
  [FinancePaymentStatus.POSTED]: ['已入账', 'green'],
  [FinancePaymentStatus.REVERSED]: ['已冲销', 'magenta'],
})
